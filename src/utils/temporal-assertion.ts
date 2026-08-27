/**
 * `temporal-assertion/v1` — the CLI side of the LOT 10 oracle.
 *
 * A SECOND, INDEPENDENT implementation of the checksum, the chain verdicts and the
 * AT / AS OF snapshot that the MCPs contract documents in its header
 * (`src/contracts/temporal-assertion.ts`: invariants 1-11, amendments 2 and 4).
 * Written from the documented rules, not from the reference code — the point of the
 * oracle is that two implementations land on the same snapshot and the same hash.
 * No network, no MCP client, `node:crypto` only.
 *
 * Rules recomputed here:
 *   - CHECKSUM: SHA-256 over the 34 fields in the documented order, joined by the ASCII
 *     unit separator (`\x1f`). Strings raw; `null` or absent as the NUL byte; every
 *     NON-string value (number, boolean, object, list) as the STX byte (`\x02`) followed
 *     by its canonical JSON (keys sorted at every level, no whitespace), so that `1987`
 *     and `"1987"` cannot collide — a hashed string never starts with a control byte,
 *     the contract refuses them. `integrity.checksum` itself is the only field out.
 *   - CHAIN, per `claim_stream_id` in `sequence_no` order: an edited line is
 *     `checksum_mismatch`; a removed line is `sequence_gap` on its successor, which also
 *     gets `previous_checksum_mismatch` because it names a checksum no longer there.
 *     `previous_checksum` is compared with the predecessor's DECLARED checksum, so an
 *     edited predecessor is reported once, on its own line. `duplicate_sequence_no` and
 *     `missing_integrity` complete the verdicts.
 *   - SNAPSHOT: on the transaction axis an assertion is held when `recorded_at <= as_of`
 *     and withdrawn when the earliest retraction targeting it, or assertion superseding
 *     it, was recorded at or before `as_of`; retractions are never in scope. On the valid
 *     axis, bounds are read on the UTC timeline, a reduced-precision bound is the FIRST
 *     instant of its period, the end bound is EXCLUSIVE, `'open'` covers, `'unknown'`
 *     leaves the assertion undecided. Results are sorted by `assertion_id`; the hash is
 *     SHA-256 of the three lists joined by the record separator (`\x1e`).
 *
 * Precedence between reasons is not spelled out by the header; the order used here
 * (and flagged in the command's assumptions) is: is_retraction, not_yet_recorded,
 * retracted / superseded, not_yet_valid, no_longer_valid, valid_from_unknown,
 * valid_to_unknown. A bounded bound that excludes wins over an unknown other bound.
 *
 * @module utils/temporal-assertion
 */

import { createHash } from 'node:crypto';

export const TEMPORAL_ASSERTION_SCHEMA = 'temporal-assertion/v1';

export type BoundKind = 'bounded' | 'open' | 'unknown';
export type Operation = 'assert' | 'retract';
export type TimeAxis = 'valid' | 'transaction' | 'both';

export interface ValidTime {
  from: string | null;
  from_kind: BoundKind;
  to: string | null;
  to_kind: BoundKind;
  precision: string;
  source_expression?: string;
  resolution_anchor?: string;
  timezone?: string;
  calendar?: string;
  confidence?: number;
}

export interface Integrity {
  sequence_no: number;
  checksum: string;
  previous_checksum: string | null;
}

export interface Envelope {
  schema_version: string;
  assertion_id: string;
  claim_stream_id: string;
  operation: Operation;
  target_assertion_id?: string;
  supersedes_assertion_id?: string;
  scope: { tenant_id: string; space_id: string; dataset_id?: string };
  statement?: { subject: string; predicate: string; object: unknown; object_datatype?: string };
  valid_time: ValidTime;
  recorded_at: string;
  source_times?: Record<string, string | undefined>;
  evidence_refs: unknown[];
  semantics: Record<string, unknown>;
  derivation?: {
    kind: string;
    producer: string;
    producer_version: string;
    input_assertion_ids?: string[];
    proof_ref?: string;
  };
  integrity?: Integrity;
}

// ============================================================================
// Instants — invariant 11: first instant of the period, UTC timeline
// ============================================================================

const BOUND_SHAPE =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/**
 * Epoch milliseconds of an ISO 8601 bound. `"1998"` is 1998-01-01T00:00:00Z, `"1998-03"`
 * is the first of March, an instant without offset is read as UTC, an offset is applied
 * (the bound is moved onto the UTC timeline). Sub-millisecond digits are truncated.
 */
export function instantOf(bound: string): number {
  const parts = BOUND_SHAPE.exec(bound);
  if (parts === null) {
    throw new RangeError(`not an ISO 8601 bound: ${JSON.stringify(bound)}`);
  }
  const [
    ,
    year,
    month = '1',
    day = '1',
    hour = '0',
    minute = '0',
    second = '0',
    fraction = '',
    offset = 'Z',
  ] = parts;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    throw new RangeError(`not a calendar date: ${JSON.stringify(bound)}`);
  }
  date.setUTCHours(
    Number(hour),
    Number(minute),
    Number(second),
    Number(fraction.padEnd(3, '0').slice(0, 3))
  );
  return date.getTime() - offsetMillis(offset);
}

function offsetMillis(offset: string): number {
  if (offset === 'Z') {
    return 0;
  }
  const sign = offset.startsWith('-') ? -1 : 1;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(4, 6));
  return sign * (hours * 60 + minutes) * 60_000;
}

// ============================================================================
// Checksum — amendment 4
// ============================================================================

/** ASCII unit separator between fields. */
export const FIELD_SEPARATOR = '\x1f';
/** ASCII record separator between the three lists of a snapshot. */
export const LIST_SEPARATOR = '\x1e';
/** NUL: the house marker for `null` and absent, distinct from `""` and from `"null"`. */
export const NULL_MARKER = '\x00';
/** STX: prefix of every non-string value, so a number never reads like a string of digits. */
export const TYPED_MARKER = '\x02';

/** Canonical JSON: keys sorted at every level (code-unit order), no whitespace. */
export function canonicalJson(value: unknown): string {
  const sortKeys = (_key: string, node: unknown): unknown => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      return node;
    }
    const record = node as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      ordered[key] = record[key];
    }
    return ordered;
  };
  return JSON.stringify(value, sortKeys) ?? NULL_MARKER;
}

/** One field of the pre-hash string: NUL, a raw string, or STX + canonical JSON. */
export function encodeField(value: unknown): string {
  if (value === null || value === undefined) {
    return NULL_MARKER;
  }
  if (typeof value === 'string') {
    return value;
  }
  return TYPED_MARKER + canonicalJson(value);
}

/** A sub-object of the envelope, or an empty one when absent: every leaf then reads as absent. */
function part<T extends object>(value: T | undefined | null): Partial<T> {
  return value ?? {};
}

/** The exact string that is hashed: 34 fields in the documented order. */
export function checksumPreimage(envelope: Envelope): string {
  const scope = part(envelope.scope);
  const statement = part(envelope.statement);
  const vt = part(envelope.valid_time);
  const derivation = part(envelope.derivation);
  const integrity = part(envelope.integrity);
  const fields: unknown[] = [
    envelope.schema_version,
    envelope.assertion_id,
    envelope.claim_stream_id,
    envelope.operation,
    envelope.target_assertion_id,
    envelope.supersedes_assertion_id,
    scope.tenant_id,
    scope.space_id,
    scope.dataset_id,
    statement.subject,
    statement.predicate,
    statement.object,
    statement.object_datatype,
    vt.from,
    vt.from_kind,
    vt.to,
    vt.to_kind,
    vt.precision,
    vt.source_expression,
    vt.resolution_anchor,
    vt.timezone,
    vt.calendar,
    vt.confidence,
    envelope.recorded_at,
    envelope.source_times,
    envelope.evidence_refs,
    envelope.semantics,
    derivation.kind,
    derivation.producer,
    derivation.producer_version,
    derivation.input_assertion_ids,
    derivation.proof_ref,
    integrity.sequence_no,
    integrity.previous_checksum,
  ];
  return fields.map(encodeField).join(FIELD_SEPARATOR);
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Hex SHA-256 of `checksumPreimage(envelope)`. */
export function checksumOf(envelope: Envelope): string {
  return sha256Hex(checksumPreimage(envelope));
}

// ============================================================================
// Chain verdicts — "edited" is not "removed"
// ============================================================================

export const CHAIN_VERDICTS = [
  'checksum_mismatch',
  'sequence_gap',
  'previous_checksum_mismatch',
  'duplicate_sequence_no',
  'missing_integrity',
] as const;
export type ChainVerdict = (typeof CHAIN_VERDICTS)[number];

export interface ChainFinding {
  claim_stream_id: string;
  sequence_no: number | null;
  assertion_id: string;
  verdict: ChainVerdict;
  detail: string;
}

export interface ChainReport {
  envelopes: number;
  streams: number;
  findings: ChainFinding[];
}

type SealedEnvelope = Envelope & { integrity: Integrity };

/** Every finding on the ledger, stream by stream. An empty list means the chain holds. */
export function verifyLedgerChain(envelopes: readonly Envelope[]): ChainReport {
  const streams = new Map<string, Envelope[]>();
  for (const envelope of envelopes) {
    const members = streams.get(envelope.claim_stream_id);
    if (members === undefined) {
      streams.set(envelope.claim_stream_id, [envelope]);
    } else {
      members.push(envelope);
    }
  }
  const findings: ChainFinding[] = [];
  for (const [streamId, members] of streams) {
    findings.push(...auditStream(streamId, members));
  }
  return { envelopes: envelopes.length, streams: streams.size, findings };
}

function auditStream(streamId: string, members: readonly Envelope[]): ChainFinding[] {
  const findings: ChainFinding[] = [];
  const report = (envelope: Envelope, verdict: ChainVerdict, detail: string): void => {
    findings.push({
      claim_stream_id: streamId,
      sequence_no: envelope.integrity?.sequence_no ?? null,
      assertion_id: envelope.assertion_id,
      verdict,
      detail,
    });
  };

  const sealed: SealedEnvelope[] = [];
  for (const envelope of members) {
    if (envelope.integrity === undefined || envelope.integrity === null) {
      report(envelope, 'missing_integrity', 'the envelope carries no integrity block');
    } else {
      sealed.push(envelope as SealedEnvelope);
    }
  }
  sealed.sort((a, b) => a.integrity.sequence_no - b.integrity.sequence_no);

  // `head` is the last line accepted as the chain's current end; duplicates never become it.
  let head: SealedEnvelope | null = null;
  for (const line of sealed) {
    const seq = line.integrity.sequence_no;
    if (head !== null && head.integrity.sequence_no === seq) {
      report(line, 'duplicate_sequence_no', `sequence_no ${seq} appears twice`);
      continue;
    }
    const expectedSeq = head === null ? 1 : head.integrity.sequence_no + 1;
    if (seq !== expectedSeq) {
      report(
        line,
        'sequence_gap',
        `expected sequence_no ${expectedSeq}, found ${seq}: a line was removed`
      );
    }
    if (checksumOf(line) !== line.integrity.checksum) {
      report(
        line,
        'checksum_mismatch',
        'the recomputed checksum differs from the declared one: the line was edited'
      );
    }
    const predecessorDeclared = head === null ? null : head.integrity.checksum;
    if (line.integrity.previous_checksum !== predecessorDeclared) {
      report(
        line,
        'previous_checksum_mismatch',
        'previous_checksum does not name the predecessor actually on the ledger'
      );
    }
    head = line;
  }
  return findings;
}

// ============================================================================
// Snapshot — amendment 2, AT / AS OF
// ============================================================================

export const EXCLUSION_REASONS = [
  'not_yet_valid',
  'no_longer_valid',
  'not_yet_recorded',
  'retracted',
  'superseded',
  'is_retraction',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export const UNDECIDED_REASONS = ['valid_from_unknown', 'valid_to_unknown'] as const;
export type UndecidedReason = (typeof UNDECIDED_REASONS)[number];

export interface SnapshotQuery {
  time_axis: TimeAxis;
  valid_at?: string;
  as_of?: string;
}

export interface ReasonedId<R extends string> {
  assertion_id: string;
  reason: R;
}

export interface Snapshot {
  in_scope: string[];
  excluded: ReasonedId<ExclusionReason>[];
  undecided: ReasonedId<UndecidedReason>[];
  hash: string;
}

type Verdict =
  | { kind: 'in' }
  | { kind: 'excluded'; reason: ExclusionReason }
  | { kind: 'undecided'; reason: UndecidedReason };

type Closure = { reason: 'retracted' | 'superseded'; at: number };

const TIME_AXES: readonly string[] = ['valid', 'transaction', 'both'];

function resolveQueryInstants(query: SnapshotQuery): {
  validAt: number | null;
  asOf: number | null;
} {
  if (!TIME_AXES.includes(query.time_axis)) {
    throw new RangeError(
      `unknown time_axis ${JSON.stringify(query.time_axis)}: expected ${TIME_AXES.join(' | ')}`
    );
  }
  const onValidAxis = query.time_axis !== 'transaction';
  const onTransactionAxis = query.time_axis !== 'valid';
  if (onValidAxis && typeof query.valid_at !== 'string') {
    throw new RangeError(`the ${query.time_axis} axis needs a valid_at bound`);
  }
  if (onTransactionAxis && typeof query.as_of !== 'string') {
    throw new RangeError(`the ${query.time_axis} axis needs an as_of bound`);
  }
  return {
    validAt: onValidAxis ? instantOf(query.valid_at as string) : null,
    asOf: onTransactionAxis ? instantOf(query.as_of as string) : null,
  };
}

/** Earliest retraction / supersession per target, among the envelopes the ledger holds. */
function collectClosures(held: readonly Envelope[]): Map<string, Closure> {
  const closures = new Map<string, Closure>();
  const close = (target: string, reason: Closure['reason'], at: number): void => {
    const prior = closures.get(target);
    if (prior === undefined || at < prior.at) {
      closures.set(target, { reason, at });
    }
  };
  for (const envelope of held) {
    const at = instantOf(envelope.recorded_at);
    if (envelope.operation === 'retract' && typeof envelope.target_assertion_id === 'string') {
      close(envelope.target_assertion_id, 'retracted', at);
    } else if (
      envelope.operation === 'assert' &&
      typeof envelope.supersedes_assertion_id === 'string'
    ) {
      close(envelope.supersedes_assertion_id, 'superseded', at);
    }
  }
  return closures;
}

function boundedInstant(bound: string | null, side: 'from' | 'to'): number {
  if (typeof bound !== 'string') {
    throw new RangeError(`valid_time.${side} is 'bounded' but carries no bound (invariant 10)`);
  }
  return instantOf(bound);
}

function judgeValidity(vt: ValidTime, at: number): Verdict {
  if (vt.from_kind === 'bounded' && at < boundedInstant(vt.from, 'from')) {
    return { kind: 'excluded', reason: 'not_yet_valid' };
  }
  if (vt.to_kind === 'bounded' && at >= boundedInstant(vt.to, 'to')) {
    return { kind: 'excluded', reason: 'no_longer_valid' };
  }
  if (vt.from_kind === 'unknown') {
    return { kind: 'undecided', reason: 'valid_from_unknown' };
  }
  if (vt.to_kind === 'unknown') {
    return { kind: 'undecided', reason: 'valid_to_unknown' };
  }
  return { kind: 'in' };
}

function judge(
  envelope: Envelope,
  held: boolean,
  closure: Closure | undefined,
  validAt: number | null
): Verdict {
  if (envelope.operation === 'retract') {
    return { kind: 'excluded', reason: 'is_retraction' };
  }
  if (!held) {
    return { kind: 'excluded', reason: 'not_yet_recorded' };
  }
  if (closure !== undefined) {
    return { kind: 'excluded', reason: closure.reason };
  }
  return validAt === null ? { kind: 'in' } : judgeValidity(envelope.valid_time, validAt);
}

function byAssertionId(a: Envelope, b: Envelope): number {
  if (a.assertion_id === b.assertion_id) {
    return 0;
  }
  return a.assertion_id < b.assertion_id ? -1 : 1;
}

/** The string hashed into `Snapshot.hash`: the three lists, `id=reason` pairs, US inside, RS between. */
export function snapshotPreimage(lists: Omit<Snapshot, 'hash'>): string {
  const pair = (entry: ReasonedId<string>): string => `${entry.assertion_id}=${entry.reason}`;
  return [
    lists.in_scope.join(FIELD_SEPARATOR),
    lists.excluded.map(pair).join(FIELD_SEPARATOR),
    lists.undecided.map(pair).join(FIELD_SEPARATOR),
  ].join(LIST_SEPARATOR);
}

/**
 * The oracle's snapshot. Throws on a malformed query or an unreadable bound; never
 * resolves a conflict between streams (invariant 4).
 */
export function computeSnapshot(envelopes: readonly Envelope[], query: SnapshotQuery): Snapshot {
  const { validAt, asOf } = resolveQueryInstants(query);
  const isHeld = (envelope: Envelope): boolean =>
    asOf === null || instantOf(envelope.recorded_at) <= asOf;
  const closures = collectClosures(envelopes.filter(isHeld));

  const in_scope: string[] = [];
  const excluded: ReasonedId<ExclusionReason>[] = [];
  const undecided: ReasonedId<UndecidedReason>[] = [];
  for (const envelope of [...envelopes].sort(byAssertionId)) {
    const verdict = judge(envelope, isHeld(envelope), closures.get(envelope.assertion_id), validAt);
    if (verdict.kind === 'in') {
      in_scope.push(envelope.assertion_id);
    } else if (verdict.kind === 'excluded') {
      excluded.push({ assertion_id: envelope.assertion_id, reason: verdict.reason });
    } else {
      undecided.push({ assertion_id: envelope.assertion_id, reason: verdict.reason });
    }
  }
  const lists = { in_scope, excluded, undecided };
  return { ...lists, hash: sha256Hex(snapshotPreimage(lists)) };
}
