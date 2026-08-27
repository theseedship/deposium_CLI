/**
 * `deposium temporal-assertion verify --fixtures <dir>` — the LOT 10 oracle.
 *
 * Recomputes, with the CLI's own implementation (`utils/temporal-assertion`), the
 * checksum of every envelope, the chain verdicts per `claim_stream_id` and the snapshot
 * of every query found in a fixtures directory, then compares them with what the fixtures
 * expect. Self-contained: no network, no MCP client, no configuration read.
 *
 * Canonical fixture layout (what MCPs `tests/fixtures/temporal-assertion` writes; the
 * CLI vendors a byte-for-byte copy under `src/__tests__/fixtures/temporal-assertion`):
 *   <dir>/scenarios/<name>.jsonl   one `temporal-assertion/v1` envelope per line
 *   <dir>/cases/<name>.json        { scenario: "<name>",
 *                                    chain: { findings: [...], envelopes?, streams? },
 *                                    cases: [{ name, query, expected: { in_scope,
 *                                              excluded, undecided, hash } }] }
 * Other spellings are read tolerantly (`queries`, `id`, `expected_verdicts`, …); every
 * non-canonical name that was accepted is listed under "assumptions" in the output.
 *
 * Output: one `PASS <scenario>/<query id>` or `FAIL … (diff)` line per query, one
 * `CHAIN PASS|FAIL <scenario>` line per case file, a summary. Exit 1 on any FAIL.
 *
 * HOUSE RULE — negative control: with an empty or absent fixtures directory the command
 * prints an explicit empty state with `0 PASS` and exits 1. A bench that runs against
 * nothing is not green.
 *
 * @module commands/temporal-assertion
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { join, resolve } from 'node:path';
import { withErrorHandling } from '../utils/command-helpers';
import {
  computeSnapshot,
  verifyLedgerChain,
  type ChainFinding,
  type ReasonedId,
  type Snapshot,
} from '../utils/temporal-assertion';
import {
  listFiles,
  loadCaseFile,
  loadScenario,
  type CaseFile,
  type ExpectedSnapshot,
  type ExpectedVerdict,
  type LoadedScenario,
} from '../utils/temporal-assertion-fixtures';

// ============================================================================
// Result types
// ============================================================================

export interface QueryResult {
  scenario: string;
  id: string;
  status: 'PASS' | 'FAIL';
  diff: string[];
}

export interface ChainResult {
  scenario: string;
  caseFile: string;
  status: 'PASS' | 'FAIL';
  envelopes: number;
  streams: number;
  findings: number;
  diff: string[];
}

export interface VerifyReport {
  fixturesDir: string;
  scenarios: string[];
  caseFiles: string[];
  queries: QueryResult[];
  chains: ChainResult[];
  /** Scenarios no case file refers to: loaded, never checked. */
  unchecked: string[];
  assumptions: string[];
  totals: { pass: number; fail: number };
  empty: boolean;
  ok: boolean;
}

function unset(value: unknown): boolean {
  return value === undefined || value === null;
}

// ============================================================================
// Comparison
// ============================================================================

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function diffList(label: string, expected: readonly string[], actual: readonly string[]): string[] {
  if (sameList(expected, actual)) {
    return [];
  }
  const missing = expected.filter((x) => !actual.includes(x));
  const extra = actual.filter((x) => !expected.includes(x));
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing ${JSON.stringify(missing)}`);
  }
  if (extra.length > 0) {
    parts.push(`unexpected ${JSON.stringify(extra)}`);
  }
  if (parts.length === 0) {
    parts.push(`same members, different order (got ${JSON.stringify(actual)})`);
  }
  return [`${label}: ${parts.join('; ')}`];
}

function pairStrings(entries: readonly ReasonedId<string>[]): string[] {
  return entries.map((e) => `${e.assertion_id}=${e.reason}`);
}

function compareSnapshot(actual: Snapshot, expected: ExpectedSnapshot): string[] {
  const diff: string[] = [];
  if (expected.in_scope !== undefined) {
    diff.push(...diffList('in_scope', expected.in_scope, actual.in_scope));
  }
  if (expected.excluded !== undefined) {
    diff.push(...diffList('excluded', expected.excluded, pairStrings(actual.excluded)));
  }
  if (expected.undecided !== undefined) {
    diff.push(...diffList('undecided', expected.undecided, pairStrings(actual.undecided)));
  }
  if (expected.hash !== undefined && expected.hash !== actual.hash) {
    diff.push(`hash: expected ${expected.hash} got ${actual.hash}`);
  }
  return diff;
}

function describeFinding(f: {
  claim_stream_id: string;
  sequence_no: number | null;
  assertion_id: string | null;
  verdict: string;
}): string {
  const seq = f.sequence_no === null ? '?' : String(f.sequence_no);
  const id = f.assertion_id === null ? '' : ` ${f.assertion_id}`;
  return `${f.claim_stream_id}#${seq}${id} ${f.verdict}`;
}

function findingMatches(finding: ChainFinding, expected: ExpectedVerdict): boolean {
  return (
    finding.claim_stream_id === expected.claim_stream_id &&
    (unset(expected.sequence_no) || finding.sequence_no === expected.sequence_no) &&
    (unset(expected.assertion_id) || finding.assertion_id === expected.assertion_id)
  );
}

/**
 * Every expected verdict must be matched by one actual finding (stream + verdict, plus
 * sequence_no / assertion_id when the expectation names them); every actual finding must
 * be expected. An expected `ok` asserts that its line carries no finding at all.
 */
function compareChain(
  actual: readonly ChainFinding[],
  expected: readonly ExpectedVerdict[]
): string[] {
  const diff: string[] = [];
  const matched = new Set<number>();
  for (const exp of expected) {
    const onLine = actual.filter((f) => findingMatches(f, exp));
    if (exp.verdict === 'ok') {
      if (onLine.length > 0) {
        diff.push(
          `expected ok at ${describeFinding(exp)}, found ${onLine.map((f) => f.verdict).join(', ')}`
        );
      }
      continue;
    }
    const index = actual.findIndex(
      (f, i) => !matched.has(i) && f.verdict === exp.verdict && findingMatches(f, exp)
    );
    if (index === -1) {
      diff.push(`missing: ${describeFinding(exp)}`);
    } else {
      matched.add(index);
    }
  }
  actual.forEach((f, i) => {
    if (!matched.has(i)) {
      diff.push(`unexpected: ${describeFinding(f)} — ${f.detail}`);
    }
  });
  return diff;
}

// ============================================================================
// The verification itself
// ============================================================================

function checkQueries(scenario: LoadedScenario, caseFile: CaseFile): QueryResult[] {
  return caseFile.queries.map((q) => {
    let diff: string[];
    if (scenario.errors.length > 0) {
      diff = [`scenario not loadable: ${scenario.errors[0]}`];
    } else if (q.expected === null) {
      diff = ['no expected block'];
    } else {
      try {
        diff = compareSnapshot(computeSnapshot(scenario.envelopes, q.query), q.expected);
      } catch (error) {
        diff = [`snapshot error: ${error instanceof Error ? error.message : String(error)}`];
      }
    }
    return { scenario: scenario.name, id: q.id, status: diff.length === 0 ? 'PASS' : 'FAIL', diff };
  });
}

function checkChain(scenario: LoadedScenario, caseFile: CaseFile, notes: string[]): ChainResult {
  const base = {
    scenario: scenario.name,
    caseFile: caseFile.name,
    envelopes: 0,
    streams: 0,
    findings: 0,
  };
  if (scenario.errors.length > 0) {
    return {
      ...base,
      status: 'FAIL',
      diff: scenario.errors.map((e) => `scenario not loadable: ${e}`),
    };
  }
  const report = verifyLedgerChain(scenario.envelopes);
  let expected = caseFile.chain;
  if (expected === null) {
    notes.push(
      `${caseFile.name}.json — no chain block: assumed the chain of '${scenario.name}' is expected clean`
    );
    expected = [];
  }
  const diff = compareChain(report.findings, expected);
  for (const key of ['envelopes', 'streams'] as const) {
    const stated = caseFile.chainCounts[key];
    if (stated !== null && stated !== report[key]) {
      diff.push(`${key}: expected ${stated} got ${report[key]}`);
    }
  }
  return {
    ...base,
    envelopes: report.envelopes,
    streams: report.streams,
    findings: report.findings.length,
    status: diff.length === 0 ? 'PASS' : 'FAIL',
    diff,
  };
}

function missingScenario(caseFile: CaseFile): LoadedScenario {
  return {
    name: caseFile.scenario,
    file: '',
    envelopes: [],
    errors: [`no scenarios/${caseFile.scenario}.jsonl for case file ${caseFile.name}.json`],
  };
}

/** Runs the oracle over a fixtures directory. Pure: no console, no exit. */
export function runVerify(fixturesDir: string): VerifyReport {
  const dir = resolve(fixturesDir);
  const assumptions: string[] = [];
  const scenarioFiles = listFiles(join(dir, 'scenarios'), '.jsonl');
  const caseFilesPaths = listFiles(join(dir, 'cases'), '.json');
  const scenarios = new Map<string, LoadedScenario>();
  for (const file of scenarioFiles) {
    const loaded = loadScenario(file, assumptions);
    scenarios.set(loaded.name, loaded);
  }
  const caseFiles = caseFilesPaths.map((file) => loadCaseFile(file, assumptions));

  const queries: QueryResult[] = [];
  const chains: ChainResult[] = [];
  const referenced = new Set<string>();
  for (const caseFile of caseFiles) {
    referenced.add(caseFile.scenario);
    const scenario = scenarios.get(caseFile.scenario) ?? missingScenario(caseFile);
    for (const problem of caseFile.problems) {
      queries.push({
        scenario: scenario.name,
        id: `${caseFile.name}.json`,
        status: 'FAIL',
        diff: [problem],
      });
    }
    queries.push(...checkQueries(scenario, caseFile));
    chains.push(checkChain(scenario, caseFile, assumptions));
  }
  const unchecked = [...scenarios.keys()].filter((name) => !referenced.has(name));
  const results: Array<{ status: 'PASS' | 'FAIL' }> = [...queries, ...chains];
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.length - pass;
  const empty = scenarioFiles.length === 0 && caseFilesPaths.length === 0;
  return {
    fixturesDir: dir,
    scenarios: [...scenarios.keys()],
    caseFiles: caseFiles.map((c) => c.name),
    queries,
    chains,
    unchecked,
    assumptions: [...new Set(assumptions)],
    totals: { pass, fail },
    empty,
    ok: !empty && fail === 0 && pass > 0,
  };
}

// ============================================================================
// Rendering
// ============================================================================

const paint = {
  PASS: (line: string) => chalk.green(line),
  FAIL: (line: string) => chalk.red(line),
};

/** The human-readable lines, in output order. Exported for the tests. */
export function renderReport(report: VerifyReport): string[] {
  const lines: string[] = [];
  lines.push(chalk.bold(`temporal-assertion verify — fixtures: ${report.fixturesDir}`));
  if (report.empty) {
    lines.push(
      chalk.yellow(
        `EMPTY: no scenarios/*.jsonl and no cases/*.json under ${report.fixturesDir} — nothing to verify`
      )
    );
    lines.push(
      paint.FAIL(
        'SUMMARY: 0 PASS, 0 FAIL — a bench that runs against nothing is not green (exit 1)'
      )
    );
    return lines;
  }
  lines.push(
    chalk.gray(
      `scenarios: ${report.scenarios.length} (${report.scenarios.join(', ') || '-'}) · ` +
        `case files: ${report.caseFiles.length} (${report.caseFiles.join(', ') || '-'})`
    )
  );
  for (const q of report.queries) {
    const suffix = q.diff.length > 0 ? ` (${q.diff.join(' | ')})` : '';
    lines.push(paint[q.status](`${q.status} ${q.scenario}/${q.id}${suffix}`));
  }
  for (const c of report.chains) {
    const stats = `${c.envelopes} envelopes, ${c.streams} streams, ${c.findings} findings`;
    const suffix = c.diff.length > 0 ? ` (${c.diff.join(' | ')})` : '';
    lines.push(paint[c.status](`CHAIN ${c.status} ${c.scenario} [${stats}]${suffix}`));
  }
  for (const name of report.unchecked) {
    lines.push(chalk.yellow(`UNCHECKED ${name}: no case file refers to this scenario`));
  }
  if (report.assumptions.length > 0) {
    lines.push(chalk.gray('assumptions:'));
    for (const note of report.assumptions) {
      lines.push(chalk.gray(`  - ${note}`));
    }
  }
  const queryPass = report.queries.filter((q) => q.status === 'PASS').length;
  const chainPass = report.chains.filter((c) => c.status === 'PASS').length;
  const summary =
    `SUMMARY: ${report.totals.pass} PASS, ${report.totals.fail} FAIL ` +
    `(queries ${queryPass}/${report.queries.length}, chains ${chainPass}/${report.chains.length}` +
    `${report.unchecked.length > 0 ? `, ${report.unchecked.length} unchecked scenario(s)` : ''})`;
  lines.push(
    paint[report.ok ? 'PASS' : 'FAIL'](
      report.totals.pass === 0 ? `${summary} — nothing passed (exit 1)` : summary
    )
  );
  return lines;
}

// ============================================================================
// Command
// ============================================================================

interface VerifyOptions {
  fixtures: string;
  json?: boolean;
}

export const temporalAssertionCommand = new Command('temporal-assertion').description(
  'Oracle for the temporal-assertion/v1 register: recompute checksums, chain verdicts and snapshots'
);

temporalAssertionCommand
  .command('verify')
  .description(
    'Recompute every ledger under <dir>/scenarios and every case under <dir>/cases with the CLI implementation, and compare with what the cases expect'
  )
  .requiredOption('--fixtures <dir>', 'Fixtures directory (scenarios/*.jsonl, cases/*.json)')
  .option('--json', 'Print the full report as JSON instead of lines')
  .addHelpText(
    'after',
    `
Fixture layout (canonical, as written by MCPs tests/fixtures/temporal-assertion):
  <dir>/scenarios/<name>.jsonl   one temporal-assertion/v1 envelope per line
  <dir>/cases/<name>.json        {
    "scenario": "<name>",
    "chain": { "findings": [{ claim_stream_id, sequence_no, assertion_id, verdict }],
               "envelopes": n, "streams": n },
    "cases": [{ "name", "query": { time_axis, valid_at?, as_of? },
                "expected": { in_scope, excluded, undecided, hash } }]
  }
Output: PASS|FAIL <scenario>/<case name> per case, CHAIN PASS|FAIL per scenario, a summary.
Exit 1 on any FAIL, and on an empty or absent <dir> (0 PASS is never green).
`
  )
  .action(
    withErrorHandling(async (options: VerifyOptions) => {
      const report = runVerify(options.fixtures);
      if (options.json === true) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const line of renderReport(report)) {
          console.log(line);
        }
      }
      if (!report.ok) {
        process.exit(1);
      }
    })
  );
