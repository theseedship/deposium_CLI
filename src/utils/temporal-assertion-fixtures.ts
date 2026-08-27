/**
 * Fixture reading for `deposium temporal-assertion verify`: JSONL ledgers under
 * `scenarios/`, case files under `cases/`.
 *
 * Canonical layout (the one MCPs `tests/fixtures/temporal-assertion` writes, logs nothing):
 *   scenarios/<name>.jsonl   one `temporal-assertion/v1` envelope per line
 *   cases/<name>.json        { scenario: "<name>",
 *                              ledger: "scenarios/<name>.jsonl",
 *                              heads: { "<claim_stream_id>": { sequence_no, checksum } },
 *                              chain: { findings: [{ claim_stream_id, sequence_no,
 *                                                     assertion_id, verdict }],
 *                                       envelopes?, streams? },
 *                              cases: [{ name, query: { time_axis, valid_at?, as_of? },
 *                                        expected: { in_scope, excluded, undecided, hash } }] }
 * Other spellings are accepted (`queries`/`id`/`expected_verdicts`/`expect`/`stream_heads`, …)
 * and every non-canonical name read is pushed to `notes` so the command prints what it
 * assumed. No network, no configuration.
 *
 * ABSENT IS NOT MALFORMED. A field the case file does not carry is simply not compared; a
 * field it DOES carry with the wrong type is a recorded problem, and the case fails. The
 * loader never turns `in_scope: "A1"` into "no expectation".
 *
 * A query instant is never normalised either: `valid_at: "2026-02-29"` is a problem, not
 * the first of March.
 *
 * @module utils/temporal-assertion-fixtures
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  isReadableBound,
  validateEnvelope,
  TEMPORAL_ASSERTION_SCHEMA,
  type Envelope,
  type SnapshotQuery,
  type StreamHead,
} from './temporal-assertion';

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
  /** The committed heads, or `null` when the file commits none (a removed tail is then invisible). */
  heads: Record<string, StreamHead> | null;
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

/** `"scenarios/07-kind-variations.jsonl"` and `"07-kind-variations"` name the same ledger. */
function scenarioKey(value: string): string {
  return basename(value).replace(/\.jsonl$/, '');
}

/** A list of assertion ids. Present-but-not-a-list is a problem, absent is `undefined`. */
function toIds(value: unknown, where: string, problems: string[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    problems.push(`${where}: present but not an array`);
    return undefined;
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      problems.push(`${where}: entry ${JSON.stringify(entry)} is not an assertion id`);
      continue;
    }
    ids.push(entry);
  }
  return ids;
}

/** `{ assertion_id, reason }` objects or `"id=reason"` strings, both to `"id=reason"`. */
function toPairs(value: unknown, where: string, problems: string[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    problems.push(`${where}: present but not an array`);
    return undefined;
  }
  const pairs: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      pairs.push(entry);
      continue;
    }
    if (!isRecord(entry)) {
      problems.push(`${where}: entry ${JSON.stringify(entry)} is neither a pair nor a string`);
      continue;
    }
    const id = entry.assertion_id ?? entry.id;
    const reason = entry.reason;
    if (typeof id !== 'string' || typeof reason !== 'string') {
      problems.push(
        `${where}: entry ${JSON.stringify(entry)} needs a string assertion_id and a string reason`
      );
      continue;
    }
    pairs.push(`${id}=${reason}`);
  }
  return pairs;
}

function readExpected(
  raw: unknown,
  where: string,
  notes: string[],
  problems: string[]
): ExpectedSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }
  const before = problems.length;
  // The expected block may be a whole SnapshotResult, or nest the lists under `snapshot`.
  const block =
    raw.in_scope === undefined && raw.hash === undefined && isRecord(raw.snapshot)
      ? (notes.push(`${where}: read nested 'snapshot' as the expected block`), raw.snapshot)
      : raw;
  const rawHash = pick(block, ['hash', 'snapshot_hash'], where, notes);
  if (rawHash !== undefined && typeof rawHash !== 'string') {
    problems.push(`${where}.hash: present but not a string`);
  }
  const expected: ExpectedSnapshot = {
    in_scope: toIds(
      pick(block, ['in_scope', 'inScope', 'in'], where, notes),
      `${where}.in_scope`,
      problems
    ),
    excluded: toPairs(
      pick(block, ['excluded', 'out'], where, notes),
      `${where}.excluded`,
      problems
    ),
    undecided: toPairs(pick(block, ['undecided'], where, notes), `${where}.undecided`, problems),
    hash: typeof rawHash === 'string' ? rawHash : undefined,
  };
  if (Object.values(expected).every((v) => v === undefined) && problems.length === before) {
    problems.push(`${where}: expected block carries none of in_scope/excluded/undecided/hash`);
  }
  return expected;
}

/** A query instant is compared, never repaired: an unreadable one is a problem. */
function checkQueryInstants(query: Json, where: string, problems: string[]): void {
  for (const field of ['valid_at', 'as_of']) {
    const value = query[field];
    if (value === undefined) {
      continue;
    }
    if (!isReadableBound(value)) {
      problems.push(
        `${where}.query.${field}: ${JSON.stringify(value)} is not a calendar ISO 8601 bound — ` +
          'a query instant is never normalised'
      );
    }
  }
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
  checkQueryInstants(query, where, problems);
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

/**
 * The committed heads: per stream, the `sequence_no` and the DECLARED checksum of its last
 * line, held OUTSIDE the ledger. Without them a stream cut after its last line reads as a
 * valid shorter stream — that is the whole point of committing them.
 */
function readHeads(
  raw: Json,
  where: string,
  notes: string[],
  problems: string[]
): Record<string, StreamHead> | null {
  const block = pick(raw, ['heads', 'stream_heads', 'committed_heads'], where, notes);
  if (block === undefined) {
    notes.push(`${where}: no 'heads' block, assumed none committed — a removed tail is invisible`);
    return null;
  }
  if (!isRecord(block)) {
    problems.push('heads: present but not an object keyed by claim_stream_id');
    return null;
  }
  const heads: Record<string, StreamHead> = {};
  for (const [stream, value] of Object.entries(block)) {
    if (
      !isRecord(value) ||
      !Number.isInteger(value.sequence_no) ||
      typeof value.checksum !== 'string'
    ) {
      problems.push(
        `heads[${JSON.stringify(stream)}]: expected { sequence_no: integer, checksum: string }`
      );
      continue;
    }
    heads[stream] = { sequence_no: value.sequence_no as number, checksum: value.checksum };
  }
  return heads;
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
    heads: null,
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
  // Read the chain block and the heads BEFORE copying the notes out: their aliases are
  // assumptions too.
  const verdicts = readVerdicts(chain, localNotes, problems);
  const heads = readHeads(raw, name, localNotes, problems);
  notes.push(...localNotes.map((n) => `${name}.json — ${n}`));
  return {
    name,
    file,
    // A case file may name its ledger by path: `scenarios/x.jsonl` is the scenario `x`.
    scenario: typeof scenario === 'string' ? scenarioKey(scenario) : name,
    queries: parsedQueries,
    chain: verdicts,
    chainCounts: {
      envelopes: isRecord(chain) && typeof chain.envelopes === 'number' ? chain.envelopes : null,
      streams: isRecord(chain) && typeof chain.streams === 'number' ? chain.streams : null,
    },
    heads,
    problems,
  };
}

// ============================================================================
// Scenarios (JSONL ledgers)
// ============================================================================

/**
 * One ledger. A line the contract refuses — a foreign `schema_version`, a member the shape
 * does not name, an instant that is not a calendar instant, a string the checksum could not
 * read raw — is an ERROR, never an assumption: the oracle refuses to hash what it cannot
 * vouch for, and a scenario with errors fails every case that refers to it.
 */
export function loadScenario(file: string): LoadedScenario {
  const name = basename(file, '.jsonl');
  const envelopes: Envelope[] = [];
  const errors: string[] = [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    const where = `line ${index + 1}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      errors.push(`${where}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!isRecord(parsed) || typeof parsed.assertion_id !== 'string') {
      errors.push(`${where}: not an envelope (no assertion_id)`);
      return;
    }
    if (parsed.schema_version !== TEMPORAL_ASSERTION_SCHEMA) {
      errors.push(
        `${where}: schema_version ${JSON.stringify(parsed.schema_version)} is not ` +
          `${TEMPORAL_ASSERTION_SCHEMA} — the oracle verifies one contract, it does not guess`
      );
      return;
    }
    const violations = validateEnvelope(parsed);
    if (violations.length > 0) {
      for (const violation of violations) {
        errors.push(
          `${where}: ${violation.path === '' ? '<envelope>' : violation.path} — ` +
            `${violation.message} (invariant ${violation.invariant})`
        );
      }
      return;
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
