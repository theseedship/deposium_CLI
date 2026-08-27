/**
 * Fixture reading for `deposium temporal-assertion verify`: JSONL ledgers under
 * `scenarios/`, case files under `cases/`.
 *
 * Canonical layout (the one MCPs `tests/fixtures/temporal-assertion` writes, logs nothing):
 *   scenarios/<name>.jsonl   one `temporal-assertion/v1` envelope per line
 *   cases/<name>.json        { scenario: "<name>",
 *                              chain: { findings: [{ claim_stream_id, sequence_no,
 *                                                     assertion_id, verdict }],
 *                                       envelopes?, streams? },
 *                              cases: [{ name, query: { time_axis, valid_at?, as_of? },
 *                                        expected: { in_scope, excluded, undecided, hash } }] }
 * Other spellings are accepted (`queries`/`id`/`expected_verdicts`/`expect`, …) and every
 * non-canonical name read is pushed to `notes` so the command prints what it assumed.
 * No network, no configuration.
 *
 * @module utils/temporal-assertion-fixtures
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { TEMPORAL_ASSERTION_SCHEMA, type Envelope, type SnapshotQuery } from './temporal-assertion';

// ============================================================================
// Types
// ============================================================================

export interface LoadedScenario {
  name: string;
  file: string;
  envelopes: Envelope[];
  errors: string[];
}

export interface ExpectedSnapshot {
  in_scope?: string[];
  excluded?: string[];
  undecided?: string[];
  hash?: string;
}

export interface QueryCase {
  id: string;
  query: SnapshotQuery;
  expected: ExpectedSnapshot | null;
}

export interface ExpectedVerdict {
  claim_stream_id: string;
  sequence_no: number | null;
  assertion_id: string | null;
  verdict: string;
}

export interface CaseFile {
  name: string;
  file: string;
  scenario: string;
  queries: QueryCase[];
  /** `null` when the case file carries no chain block: the chain is then expected clean. */
  chain: ExpectedVerdict[] | null;
  /** `chain.envelopes` / `chain.streams` when the case file states them (a ChainReport). */
  chainCounts: { envelopes: number | null; streams: number | null };
  problems: string[];
}

type Json = Record<string, unknown>;

// ============================================================================
// Tolerant reading of the case files
// ============================================================================

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the first alias present on `record`. Accepting a non-canonical name is logged as
 * an assumption so the other side of the fixtures can be told which key was read.
 */
function pick(record: Json, aliases: readonly string[], where: string, notes: string[]): unknown {
  for (const alias of aliases) {
    if (record[alias] !== undefined) {
      if (alias !== aliases[0]) {
        notes.push(`${where}: read key '${alias}' as '${aliases[0]}'`);
      }
      return record[alias];
    }
  }
  return undefined;
}

/** `{ assertion_id, reason }` objects or `"id=reason"` strings, both to `"id=reason"`. */
function toPairs(value: unknown, where: string, problems: string[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    problems.push(`${where}: expected an array`);
    return undefined;
  }
  const pairs: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      pairs.push(entry);
    } else if (isRecord(entry)) {
      pairs.push(`${String(entry.assertion_id ?? entry.id ?? '')}=${String(entry.reason ?? '')}`);
    } else {
      problems.push(`${where}: entry ${JSON.stringify(entry)} is neither a pair nor a string`);
    }
  }
  return pairs;
}

function readExpected(raw: unknown, where: string, notes: string[], problems: string[]) {
  if (!isRecord(raw)) {
    return null;
  }
  // The expected block may be a whole SnapshotResult, or nest the lists under `snapshot`.
  const block =
    raw.in_scope === undefined && raw.hash === undefined && isRecord(raw.snapshot)
      ? (notes.push(`${where}: read nested 'snapshot' as the expected block`), raw.snapshot)
      : raw;
  const inScope = pick(block, ['in_scope', 'inScope', 'in'], where, notes);
  const expected: ExpectedSnapshot = {
    in_scope: Array.isArray(inScope) ? inScope.map(String) : undefined,
    excluded: toPairs(
      pick(block, ['excluded', 'out'], where, notes),
      `${where}.excluded`,
      problems
    ),
    undecided: toPairs(pick(block, ['undecided'], where, notes), `${where}.undecided`, problems),
    hash: (() => {
      const hash = pick(block, ['hash', 'snapshot_hash'], where, notes);
      return typeof hash === 'string' ? hash : undefined;
    })(),
  };
  if (Object.values(expected).every((v) => v === undefined)) {
    problems.push(`${where}: expected block carries none of in_scope/excluded/undecided/hash`);
  }
  return expected;
}

function readQuery(
  raw: unknown,
  index: number,
  notes: string[],
  problems: string[]
): QueryCase | null {
  const where = `cases[${index}]`;
  if (!isRecord(raw)) {
    problems.push(`${where}: not an object`);
    return null;
  }
  const id = pick(raw, ['name', 'id', 'query_id'], where, notes);
  const query = pick(raw, ['query', 'params', 'input'], where, notes);
  const expected = pick(raw, ['expected', 'expect', 'want', 'result'], where, notes);
  if (!isRecord(query)) {
    problems.push(`${where}: no query object`);
    return null;
  }
  return {
    id: typeof id === 'string' ? id : `#${index + 1}`,
    query: query as unknown as SnapshotQuery,
    expected: readExpected(expected, `${where}.expected`, notes, problems),
  };
}

function readVerdicts(raw: unknown, notes: string[], problems: string[]): ExpectedVerdict[] | null {
  if (raw === undefined) {
    return null;
  }
  const list = isRecord(raw)
    ? pick(raw, ['findings', 'expected_verdicts', 'verdicts', 'expected'], 'chain', notes)
    : raw;
  if (!Array.isArray(list)) {
    problems.push('chain: no expected_verdicts array');
    return null;
  }
  const verdicts: ExpectedVerdict[] = [];
  list.forEach((entry, index) => {
    const where = `chain.expected_verdicts[${index}]`;
    if (!isRecord(entry)) {
      problems.push(`${where}: not an object`);
      return;
    }
    const stream = pick(entry, ['claim_stream_id', 'stream', 'claim_stream'], where, notes);
    const verdict = pick(entry, ['verdict', 'status'], where, notes);
    const seq = pick(entry, ['sequence_no', 'seq'], where, notes);
    const assertionId = pick(entry, ['assertion_id', 'id'], where, notes);
    if (typeof stream !== 'string' || typeof verdict !== 'string') {
      problems.push(`${where}: needs claim_stream_id and verdict`);
      return;
    }
    verdicts.push({
      claim_stream_id: stream,
      verdict,
      sequence_no: typeof seq === 'number' ? seq : null,
      assertion_id: typeof assertionId === 'string' ? assertionId : null,
    });
  });
  return verdicts;
}

export function loadCaseFile(file: string, notes: string[]): CaseFile {
  const name = basename(file, '.json');
  const problems: string[] = [];
  const localNotes: string[] = [];
  const empty: CaseFile = {
    name,
    file,
    scenario: name,
    queries: [],
    chain: null,
    chainCounts: { envelopes: null, streams: null },
    problems,
  };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`cannot parse: ${error instanceof Error ? error.message : String(error)}`);
    return empty;
  }
  if (!isRecord(raw)) {
    problems.push('top level is not an object');
    return empty;
  }
  const scenario = pick(raw, ['scenario', 'scenario_name', 'ledger'], name, localNotes);
  if (typeof scenario !== 'string') {
    localNotes.push(`${name}: no 'scenario' key, assumed scenario '${name}' (the file name)`);
  }
  const queries = pick(raw, ['cases', 'queries', 'snapshots'], name, localNotes);
  const chain = pick(raw, ['chain', 'expected_chain', 'chain_verdicts'], name, localNotes);
  const parsedQueries = Array.isArray(queries)
    ? queries.flatMap((q, i) => {
        const parsed = readQuery(q, i, localNotes, problems);
        return parsed === null ? [] : [parsed];
      })
    : [];
  if (!Array.isArray(queries)) {
    problems.push('no cases array');
  }
  // Read the chain block BEFORE copying the notes out: its aliases are assumptions too.
  const verdicts = readVerdicts(chain, localNotes, problems);
  notes.push(...localNotes.map((n) => `${name}.json — ${n}`));
  return {
    name,
    file,
    scenario: typeof scenario === 'string' ? scenario : name,
    queries: parsedQueries,
    chain: verdicts,
    chainCounts: {
      envelopes: isRecord(chain) && typeof chain.envelopes === 'number' ? chain.envelopes : null,
      streams: isRecord(chain) && typeof chain.streams === 'number' ? chain.streams : null,
    },
    problems,
  };
}

// ============================================================================
// Scenarios (JSONL ledgers)
// ============================================================================

export function loadScenario(file: string, notes: string[]): LoadedScenario {
  const name = basename(file, '.jsonl');
  const envelopes: Envelope[] = [];
  const errors: string[] = [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      errors.push(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!isRecord(parsed) || typeof parsed.assertion_id !== 'string') {
      errors.push(`line ${index + 1}: not an envelope (no assertion_id)`);
      return;
    }
    if (typeof parsed.claim_stream_id !== 'string' || typeof parsed.recorded_at !== 'string') {
      errors.push(`line ${index + 1}: envelope needs claim_stream_id and recorded_at`);
      return;
    }
    if (parsed.schema_version !== TEMPORAL_ASSERTION_SCHEMA) {
      notes.push(
        `${name}.jsonl line ${index + 1}: schema_version ${JSON.stringify(parsed.schema_version)}, ` +
          `rules of ${TEMPORAL_ASSERTION_SCHEMA} applied anyway`
      );
    }
    envelopes.push(parsed as unknown as Envelope);
  });
  return { name, file, envelopes, errors };
}

export function listFiles(dir: string, extension: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(extension))
    .sort()
    .map((entry) => join(dir, entry));
}
