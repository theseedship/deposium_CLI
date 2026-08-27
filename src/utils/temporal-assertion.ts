/**
 * `temporal-assertion/v1` — the CLI side of the LOT 10 oracle.
 *
 * A SECOND, INDEPENDENT implementation of the shape rules, the checksum, the chain
 * verdicts and the AT / AS OF snapshot that the MCPs contract documents in its header
 * (`src/contracts/temporal-assertion.ts`: invariants 1-11, amendments 2 and 4).
 * Written from the documented rules, not from the reference code — the point of the
 * oracle is that two implementations land on the same snapshot and the same hash.
 * No network, no MCP client, `node:crypto` only.
 *
 * Rules recomputed here:
 *   - INSTANTS: every bound is a REAL calendar instant at MILLISECOND precision. At most
 *     three fractional digits (the oracle orders epoch milliseconds, and a contract that
 *     accepted nanoseconds it then truncated would be lying); month 1-12, day inside that
 *     month with the Gregorian leap rule, hour 0-23, minute and second 0-59, offset up to
 *     23:59. Nothing is ever normalised: `2026-02-29` is refused, never moved to March.
 *     A reduced-precision bound still names the FIRST instant of its period, on UTC.
 *   - CHECKSUM: SHA-256 over the 34 fields in the documented order, joined by the ASCII
 *     unit separator (`\x1f`). Strings raw; `null` or absent as the NUL byte; every
 *     NON-string value (number, boolean, object, list) as the STX byte (`\x02`) followed
 *     by its canonical JSON (keys sorted at every level, no whitespace), so that `1987`
 *     and `"1987"` cannot collide. A raw-hashed string must carry no control character
 *     (the separator would stop separating) and no lone surrogate (UTF-8 turns one into
 *     U+FFFD, so two envelopes would share a checksum): the encoder REFUSES to hash one,
 *     and `validateEnvelope` reports it long before that. A non-string value must be
 *     JSON-safe — canonical JSON THROWS on `NaN`, `Infinity`, `undefined` in a list, a
 *     `Date`, a `Map`, a bigint or a cycle rather than emitting a lossy `null` or `{}`.
 *     `integrity.checksum` itself is the only field out.
 *   - CLOSED SHAPE: at every level, a member the contract does not name is a violation.
 *     The checksum reads a fixed field list; a member it does not read would be editable
 *     under a valid checksum.
 *   - CHAIN, per `claim_stream_id` in `sequence_no` order: an edited line is
 *     `checksum_mismatch`; a removed line is `sequence_gap` on its successor, which also
 *     gets `previous_checksum_mismatch` because it names a checksum no longer there.
 *     `previous_checksum` is compared with the predecessor's DECLARED checksum, so an
 *     edited predecessor is reported once, on its own line. A `duplicate_sequence_no`
 *     never advances the chain head and its checksum is STILL recomputed. Every
 *     withdrawal names an assertion that is on the ledger (`unresolved_target`) and in
 *     its own stream (`cross_stream_target`, invariant 4). A removed TAIL is the one
 *     deletion a chain cannot see by itself, so `verifyLedgerChain` accepts the committed
 *     `heads` (last `sequence_no` and DECLARED checksum per stream, held outside the
 *     stream) and reports `stream_head_mismatch` / `stream_absent` against them.
 *   - SNAPSHOT: on the transaction axis an assertion is held when `recorded_at <= as_of`
 *     and withdrawn when the earliest retraction targeting it, or assertion superseding
 *     it, was recorded at or before `as_of`; a withdrawal from ANOTHER stream closes
 *     nothing (invariant 4: two authorities are not a conflict to resolve), and at equal
 *     `recorded_at` a retraction closes before a supersession so the same ledger read in
 *     another order gives the same answer. Retractions are never in scope. On the valid
 *     axis, bounds are read on the UTC timeline, the end bound is EXCLUSIVE, `'open'`
 *     covers, `'unknown'` leaves the assertion undecided. Results are sorted by
 *     `assertion_id`; the hash is SHA-256 of the three lists joined by the record
 *     separator (`\x1e`).
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

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ============================================================================
// Instants — invariant 11: first instant of the period, UTC timeline, calendar-strict
// ============================================================================

/** At most THREE fractional digits: the oracle compares epoch milliseconds. */
const BOUND_SHAPE =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/** A COMPLETE instant: date, clock and an explicit offset. What `recorded_at` must be. */
const INSTANT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The Gregorian rule spelled out: `2024-02-29` exists, `2026-02-29` does not. */
function daysInMonth(year: number, month: number): number {
  if (month !== 2) {
    return MONTH_LENGTHS[month - 1];
  }
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

/**
 * Epoch milliseconds of an ISO 8601 bound. `"1998"` is 1998-01-01T00:00:00Z, `"1998-03"`
 * is the first of March, an instant without offset is read as UTC, an offset is applied
 * (the bound is moved onto the UTC timeline).
 *
 * Every component is range-checked, and an out-of-range one THROWS: `Date` would silently
 * turn `2026-02-29` into the first of March and `T24:00:00` into the next midnight, and a
 * normalised instant is a moved fact.
 */
export function instantOf(bound: string): number {
  const parts = BOUND_SHAPE.exec(bound);
  if (parts === null) {
    throw new RangeError(`not an ISO 8601 bound: ${JSON.stringify(bound)}`);
  }
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', fraction = '', offset = 'Z'] =
    parts;
  const fields: CalendarFields = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: Number(s),
  };
  assertCalendar(fields, bound);
  const date = new Date(0);
  date.setUTCFullYear(fields.year, fields.month - 1, fields.day);
  date.setUTCHours(fields.hour, fields.minute, fields.second, Number(fraction.padEnd(3, '0')));
  return date.getTime() - offsetMillis(offset, bound);
}

interface CalendarFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Every component in range, or a RangeError. Nothing here is ever rolled over. */
function assertCalendar(f: CalendarFields, bound: string): void {
  if (f.month < 1 || f.month > 12 || f.day < 1 || f.day > daysInMonth(f.year, f.month)) {
    throw new RangeError(`not a calendar date: ${JSON.stringify(bound)}`);
  }
  if (f.hour > 23 || f.minute > 59 || f.second > 59) {
    throw new RangeError(`not a calendar clock: ${JSON.stringify(bound)}`);
  }
}

function offsetMillis(offset: string, bound: string): number {
  if (offset === 'Z') {
    return 0;
  }
  const sign = offset.startsWith('-') ? -1 : 1;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(4, 6));
  if (hours > 23 || minutes > 59) {
    throw new RangeError(`not a calendar offset: ${JSON.stringify(bound)}`);
  }
  return sign * (hours * 60 + minutes) * 60_000;
}

/** True when `instantOf` reads the bound without normalising anything. */
export function isReadableBound(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    instantOf(value);
    return true;
  } catch {
    return false;
  }
}

/** True for a COMPLETE calendar instant with an offset — `recorded_at`, `source_times.*`. */
export function isInstant(value: unknown): value is string {
  return typeof value === 'string' && INSTANT_SHAPE.test(value) && isReadableBound(value);
}

// ============================================================================
// The strings the checksum may read RAW
// ============================================================================

/** 0x00-0x1f and 0x7f: the bytes that would make a raw-hashed string ambiguous. */
export function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit <= 0x1f || unit === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * No unpaired UTF-16 surrogate. The UTF-8 encoder replaces a lone one by U+FFFD, so two
 * envelopes differing only by which lone surrogate they carry would share a checksum.
 */
export function isWellFormedText(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false; // a trailing surrogate with no leading one before it
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      i += 1; // a well-formed pair: step over its trailing half
    }
  }
  return true;
}

/** A string the checksum may read RAW: no control character, well-formed Unicode. */
export function isRawHashable(value: unknown): value is string {
  return typeof value === 'string' && !hasControlCharacter(value) && isWellFormedText(value);
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

/**
 * Canonical JSON: keys sorted at every level (code-unit order), no whitespace,
 * `undefined` MEMBERS of an object dropped exactly as JSON drops them.
 *
 * THROWS on every value JSON cannot carry faithfully instead of emitting a marker:
 * `NaN` and `Infinity` would both become `null`, a `Date` and a `Map` both `{}`, an
 * `undefined` in a list `null` — a checksum over a lossy serialisation would let two
 * different envelopes share it.
 */
export function canonicalJson(value: unknown): string {
  return writeCanonical(value, []);
}

function describeUncarriable(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const named = (value as { constructor?: { name?: string } }).constructor;
    return `a ${named?.name ?? 'non-plain object'}`;
  }
  return `a ${typeof value}`;
}

function writeCanonical(value: unknown, seen: readonly object[]): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonical JSON cannot carry ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    if (!isWellFormedText(value)) {
      throw new TypeError('canonical JSON cannot carry a lone surrogate');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${walk(value, seen).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${members(value, seen).join(',')}}`;
  }
  throw new TypeError(`canonical JSON cannot carry ${describeUncarriable(value)}`);
}

function walk(list: readonly unknown[], seen: readonly object[]): string[] {
  if (seen.includes(list)) {
    throw new TypeError('canonical JSON cannot carry a cycle');
  }
  const inner = [...seen, list];
  return list.map((item) => {
    if (item === undefined) {
      // A list has no way to say "absent": JSON would write `null` and lose the difference.
      throw new TypeError('canonical JSON cannot carry undefined inside a list');
    }
    return writeCanonical(item, inner);
  });
}

function members(node: Json, seen: readonly object[]): string[] {
  if (seen.includes(node)) {
    throw new TypeError('canonical JSON cannot carry a cycle');
  }
  const inner = [...seen, node];
  return Object.keys(node)
    .sort()
    .filter((key) => node[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${writeCanonical(node[key], inner)}`);
}

/**
 * One field of the pre-hash string: NUL, a raw string, or STX + canonical JSON.
 *
 * Refuses a string the separator could not separate — a control character or a lone
 * surrogate. `validateEnvelope` reports both long before the hash, so reaching this throw
 * means an envelope was hashed without being validated.
 */
export function encodeField(value: unknown): string {
  if (value === null || value === undefined) {
    return NULL_MARKER;
  }
  if (typeof value === 'string') {
    if (!isRawHashable(value)) {
      throw new TypeError(
        `refusing to hash raw a string with a control character or a lone surrogate: ${JSON.stringify(value)}`
      );
    }
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
// Closed shape — every invariant a lone envelope can break
// ============================================================================

export interface Violation {
  invariant: number | 'shape';
  path: string;
  message: string;
}

/**
 * The only members the contract names, level by level. Anything else is a violation: the
 * checksum reads a fixed list, so a member it does not read would be editable under a
 * checksum that still verifies.
 */
const MEMBERS = {
  envelope: [
    'schema_version',
    'assertion_id',
    'claim_stream_id',
    'operation',
    'target_assertion_id',
    'supersedes_assertion_id',
    'scope',
    'statement',
    'valid_time',
    'recorded_at',
    'source_times',
    'evidence_refs',
    'semantics',
    'derivation',
    'integrity',
  ],
  scope: ['tenant_id', 'space_id', 'dataset_id'],
  statement: ['subject', 'predicate', 'object', 'object_datatype'],
  valid_time: [
    'from',
    'from_kind',
    'to',
    'to_kind',
    'precision',
    'source_expression',
    'resolution_anchor',
    'timezone',
    'calendar',
    'confidence',
  ],
  source_times: ['observed_at', 'issued_at', 'published_at', 'received_at', 'processed_at'],
  evidence_ref: [
    'evidence_id',
    'source_id',
    'document_id',
    'page',
    'chunk_id',
    'locator',
    'passage_hash',
  ],
  semantics: ['ontology_id', 'ontology_version', 'ontology_hash', 'mapping_version'],
  derivation: ['kind', 'producer', 'producer_version', 'input_assertion_ids', 'proof_ref'],
  integrity: ['sequence_no', 'checksum', 'previous_checksum'],
} as const;

const BOUND_KINDS: readonly string[] = ['bounded', 'open', 'unknown'];
const PRECISIONS: readonly string[] = ['instant', 'day', 'month', 'year', 'unknown'];
const OPERATIONS: readonly string[] = ['assert', 'retract'];
const DERIVATION_KINDS: readonly string[] = ['extracted', 'computed', 'inferred', 'human'];
const HEX_SHA256 = /^[a-f0-9]{64}$/;

/** A non-empty string the checksum may read raw. */
function isName(value: unknown): value is string {
  return isRawHashable(value) && value.length > 0;
}

/** The reporting surface every level of the validator shares. */
class ShapeReport {
  readonly violations: Violation[] = [];

  fail(invariant: number | 'shape', path: string, message: string): void {
    this.violations.push({ invariant, path, message });
  }

  /** Refuses every member the contract does not name at this level. */
  closed(node: Json, members: readonly string[], prefix: string): void {
    for (const key of Object.keys(node)) {
      if (!members.includes(key)) {
        this.fail(
          'shape',
          prefix === '' ? key : `${prefix}.${key}`,
          `not a member of ${TEMPORAL_ASSERTION_SCHEMA}`
        );
      }
    }
  }

  name(node: Json, field: string, prefix: string, invariant: number | 'shape' = 'shape'): void {
    if (!isName(node[field])) {
      this.fail(
        invariant,
        prefix === '' ? field : `${prefix}.${field}`,
        'must be a non-empty string, free of control characters and of lone surrogates'
      );
    }
  }

  optionalName(
    node: Json,
    field: string,
    prefix: string,
    invariant: number | 'shape' = 'shape'
  ): void {
    if (node[field] !== undefined) {
      this.name(node, field, prefix, invariant);
    }
  }
}

/** `null` when the value is JSON-safe; the encoder's own refusal otherwise. */
function jsonSafetyProblem(value: unknown): string | null {
  try {
    canonicalJson(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function checkOperation(env: Json, report: ShapeReport): void {
  if (!OPERATIONS.includes(env.operation as string)) {
    report.fail('shape', 'operation', `must be one of ${OPERATIONS.join(', ')}`);
  }
  if (env.operation === 'retract') {
    if (!isName(env.target_assertion_id)) {
      report.fail(3, 'target_assertion_id', 'a retraction targets one precise assertion');
    }
    if (env.supersedes_assertion_id !== undefined) {
      report.fail(
        2,
        'supersedes_assertion_id',
        'only a correction supersedes; a retraction targets'
      );
    }
  }
  if (env.operation === 'assert') {
    if (env.target_assertion_id !== undefined) {
      report.fail(3, 'target_assertion_id', 'only a retraction carries a target');
    }
    if (env.statement === undefined) {
      report.fail(
        'shape',
        'statement',
        'an assertion states something; only a retraction may omit it'
      );
    }
  }
  report.optionalName(env, 'supersedes_assertion_id', '', 2);
  if (
    env.supersedes_assertion_id !== undefined &&
    env.supersedes_assertion_id === env.assertion_id
  ) {
    report.fail(2, 'supersedes_assertion_id', 'an assertion cannot supersede itself');
  }
  if (env.target_assertion_id !== undefined && env.target_assertion_id === env.assertion_id) {
    report.fail(3, 'target_assertion_id', 'an assertion cannot retract itself');
  }
}

function checkScope(scope: unknown, report: ShapeReport): void {
  if (!isPlainObject(scope)) {
    report.fail('shape', 'scope', 'must be an object');
    return;
  }
  report.closed(scope, MEMBERS.scope, 'scope');
  report.name(scope, 'tenant_id', 'scope');
  report.name(scope, 'space_id', 'scope');
  report.optionalName(scope, 'dataset_id', 'scope');
}

function checkStatement(statement: unknown, report: ShapeReport): void {
  if (statement === undefined) {
    return;
  }
  if (!isPlainObject(statement)) {
    report.fail('shape', 'statement', 'must be an object when present');
    return;
  }
  report.closed(statement, MEMBERS.statement, 'statement');
  report.name(statement, 'subject', 'statement');
  report.name(statement, 'predicate', 'statement');
  report.optionalName(statement, 'object_datatype', 'statement');
  const object = statement.object;
  if (object === undefined) {
    report.fail('shape', 'statement.object', 'a statement carries an object (null is a value)');
    return;
  }
  if (typeof object === 'string') {
    // Hashed RAW: a control character or a lone surrogate here makes the checksum input
    // ambiguous, so the oracle refuses the envelope rather than hashing it.
    if (!isRawHashable(object)) {
      report.fail(
        'shape',
        'statement.object',
        'a string object must be well-formed and free of control characters'
      );
    }
    return;
  }
  const problem = jsonSafetyProblem(object);
  if (problem !== null) {
    report.fail('shape', 'statement.object', `must be a JSON-safe value: ${problem}`);
  }
}

function checkBound(vt: Json, side: 'from' | 'to', report: ShapeReport): void {
  const kind = vt[`${side}_kind`];
  const value = vt[side];
  if (!BOUND_KINDS.includes(kind as string)) {
    report.fail(10, `valid_time.${side}_kind`, `must be one of ${BOUND_KINDS.join(', ')}`);
    return;
  }
  if (kind !== 'bounded') {
    if (value !== null) {
      report.fail(10, `valid_time.${side}`, `must be null when ${side}_kind is '${String(kind)}'`);
    }
    return;
  }
  if (!isReadableBound(value)) {
    report.fail(
      10,
      `valid_time.${side}`,
      'a bounded bound carries a calendar ISO 8601 date or instant (at most 3 fractional digits)'
    );
  }
}

function checkValidTime(vt: unknown, report: ShapeReport): void {
  if (!isPlainObject(vt)) {
    report.fail('shape', 'valid_time', 'must be an object');
    return;
  }
  report.closed(vt, MEMBERS.valid_time, 'valid_time');
  checkBound(vt, 'from', report);
  checkBound(vt, 'to', report);
  if (!PRECISIONS.includes(vt.precision as string)) {
    report.fail('shape', 'valid_time.precision', `must be one of ${PRECISIONS.join(', ')}`);
  }
  if (
    vt.from_kind === 'bounded' &&
    vt.to_kind === 'bounded' &&
    isReadableBound(vt.from) &&
    isReadableBound(vt.to) &&
    instantOf(vt.to) <= instantOf(vt.from)
  ) {
    report.fail(11, 'valid_time.to', 'the exclusive end must be after the start');
  }
  for (const field of ['source_expression', 'resolution_anchor', 'timezone', 'calendar']) {
    report.optionalName(vt, field, 'valid_time');
  }
  const confidence = vt.confidence;
  if (
    confidence !== undefined &&
    (typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    report.fail(6, 'valid_time.confidence', 'must be a finite number in [0, 1]');
  }
}

function checkSourceTimes(sourceTimes: unknown, report: ShapeReport): void {
  if (sourceTimes === undefined) {
    return;
  }
  if (!isPlainObject(sourceTimes)) {
    report.fail('shape', 'source_times', 'must be an object when present');
    return;
  }
  report.closed(sourceTimes, MEMBERS.source_times, 'source_times');
  for (const field of MEMBERS.source_times) {
    if (sourceTimes[field] !== undefined && !isInstant(sourceTimes[field])) {
      report.fail(
        'shape',
        `source_times.${field}`,
        'must be a calendar ISO 8601 instant with an offset'
      );
    }
  }
}

function checkEvidence(refs: unknown, report: ShapeReport): void {
  if (!Array.isArray(refs)) {
    report.fail(7, 'evidence_refs', 'must be an array (empty when the assertion has no evidence)');
    return;
  }
  refs.forEach((ref: unknown, index) => {
    const prefix = `evidence_refs[${index}]`;
    if (!isPlainObject(ref)) {
      report.fail(7, prefix, 'must be an object');
      return;
    }
    report.closed(ref, MEMBERS.evidence_ref, prefix);
    report.name(ref, 'evidence_id', prefix, 7);
    report.name(ref, 'source_id', prefix, 7);
    for (const field of ['document_id', 'chunk_id', 'locator', 'passage_hash']) {
      report.optionalName(ref, field, prefix, 7);
    }
    if (ref.page !== undefined && (!Number.isInteger(ref.page) || (ref.page as number) < 1)) {
      report.fail(7, `${prefix}.page`, 'must be a positive integer when present');
    }
  });
}

function checkDerivation(derivation: unknown, report: ShapeReport): void {
  if (derivation === undefined) {
    return;
  }
  if (!isPlainObject(derivation)) {
    report.fail('shape', 'derivation', 'must be an object when present');
    return;
  }
  report.closed(derivation, MEMBERS.derivation, 'derivation');
  if (!DERIVATION_KINDS.includes(derivation.kind as string)) {
    report.fail('shape', 'derivation.kind', `must be one of ${DERIVATION_KINDS.join(', ')}`);
  }
  report.name(derivation, 'producer', 'derivation');
  report.name(derivation, 'producer_version', 'derivation');
  report.optionalName(derivation, 'proof_ref', 'derivation');
  const inputs = derivation.input_assertion_ids;
  if (inputs === undefined) {
    return;
  }
  if (!Array.isArray(inputs)) {
    report.fail('shape', 'derivation.input_assertion_ids', 'must be a list of assertion ids');
    return;
  }
  inputs.forEach((id: unknown, index) => {
    if (!isName(id)) {
      report.fail('shape', `derivation.input_assertion_ids[${index}]`, 'must name an assertion');
    }
  });
}

function checkIntegrity(integrity: unknown, report: ShapeReport): void {
  if (integrity === undefined) {
    return;
  }
  if (!isPlainObject(integrity)) {
    report.fail('shape', 'integrity', 'must be an object when present');
    return;
  }
  report.closed(integrity, MEMBERS.integrity, 'integrity');
  const sequenceNo = integrity.sequence_no;
  if (!Number.isInteger(sequenceNo) || (sequenceNo as number) < 1) {
    report.fail('shape', 'integrity.sequence_no', 'must be a positive integer');
  }
  if (typeof integrity.checksum !== 'string' || !HEX_SHA256.test(integrity.checksum)) {
    report.fail('shape', 'integrity.checksum', 'must be a lowercase hex SHA-256');
  }
  const previous = integrity.previous_checksum;
  if (previous !== null && (typeof previous !== 'string' || !HEX_SHA256.test(previous))) {
    report.fail('shape', 'integrity.previous_checksum', 'must be null or a lowercase hex SHA-256');
  } else if (sequenceNo === 1 && previous !== null) {
    report.fail(
      'shape',
      'integrity.previous_checksum',
      'the first line of a stream has no predecessor'
    );
  } else if (typeof sequenceNo === 'number' && sequenceNo > 1 && previous === null) {
    report.fail(
      'shape',
      'integrity.previous_checksum',
      'a line after the first names its predecessor'
    );
  }
}

/**
 * Every invariant one envelope can break on its own. The cross-envelope ones — the chain,
 * targets that exist and stay in their stream — belong to `verifyLedgerChain`.
 */
export function validateEnvelope(input: unknown): Violation[] {
  const report = new ShapeReport();
  if (!isPlainObject(input)) {
    report.fail('shape', '', 'an envelope is a plain object');
    return report.violations;
  }
  report.closed(input, MEMBERS.envelope, '');
  if (input.schema_version !== TEMPORAL_ASSERTION_SCHEMA) {
    report.fail('shape', 'schema_version', `must be ${TEMPORAL_ASSERTION_SCHEMA}`);
  }
  report.name(input, 'assertion_id', '');
  report.name(input, 'claim_stream_id', '');
  report.name(input, 'recorded_at', '');
  if (typeof input.recorded_at === 'string' && !isInstant(input.recorded_at)) {
    report.fail(
      9,
      'recorded_at',
      'the ingestion clock is a calendar ISO 8601 instant with an offset, at most 3 fractional digits'
    );
  }
  checkOperation(input, report);
  checkScope(input.scope, report);
  checkStatement(input.statement, report);
  checkValidTime(input.valid_time, report);
  checkSourceTimes(input.source_times, report);
  checkEvidence(input.evidence_refs, report);
  if (!isPlainObject(input.semantics)) {
    report.fail(7, 'semantics', 'must be an object (empty when nothing is pinned)');
  } else {
    report.closed(input.semantics, MEMBERS.semantics, 'semantics');
    for (const field of MEMBERS.semantics) {
      report.optionalName(input.semantics, field, 'semantics');
    }
  }
  checkDerivation(input.derivation, report);
  checkIntegrity(input.integrity, report);
  return report.violations;
}

// ============================================================================
// Chain verdicts — "edited" is not "removed", and a removed tail needs a head
// ============================================================================

export const CHAIN_VERDICTS = [
  'checksum_mismatch',
  'sequence_gap',
  'previous_checksum_mismatch',
  'duplicate_sequence_no',
  'missing_integrity',
  'unresolved_target',
  'cross_stream_target',
  'stream_head_mismatch',
  'stream_absent',
] as const;
export type ChainVerdict = (typeof CHAIN_VERDICTS)[number];

export interface ChainFinding {
  claim_stream_id: string;
  sequence_no: number | null;
  /** `null` for a finding about the stream itself rather than about one of its lines. */
  assertion_id: string | null;
  verdict: ChainVerdict;
  detail: string;
}

export interface ChainReport {
  envelopes: number;
  streams: number;
  findings: ChainFinding[];
}

/** The last line of a stream, as committed OUTSIDE the stream. */
export interface StreamHead {
  sequence_no: number;
  checksum: string;
}

export interface ChainOptions {
  /** Per `claim_stream_id`. A stream cut after its last line is invisible without this. */
  heads?: Readonly<Record<string, StreamHead>>;
}

type SealedEnvelope = Envelope & { integrity: Integrity };

/**
 * Every finding on the ledger, stream by stream. An empty list means the chain holds — and,
 * when `heads` are given, that no stream was cut after its last line.
 */
export function verifyLedgerChain(
  envelopes: readonly Envelope[],
  options: ChainOptions = {}
): ChainReport {
  const streams = new Map<string, Envelope[]>();
  const streamOfAssertion = new Map<string, string>();
  for (const envelope of envelopes) {
    const members = streams.get(envelope.claim_stream_id);
    if (members === undefined) {
      streams.set(envelope.claim_stream_id, [envelope]);
    } else {
      members.push(envelope);
    }
    streamOfAssertion.set(envelope.assertion_id, envelope.claim_stream_id);
  }
  const heads = options.heads ?? {};
  const findings: ChainFinding[] = [];
  for (const [streamId, members] of streams) {
    findings.push(...auditStream(streamId, members, streamOfAssertion, heads[streamId]));
  }
  // A head committed for a stream with no line at all: the whole stream was removed.
  for (const streamId of Object.keys(heads)) {
    if (!streams.has(streamId)) {
      findings.push({
        claim_stream_id: streamId,
        sequence_no: null,
        assertion_id: null,
        verdict: 'stream_absent',
        detail: 'a head is committed for this stream and no line of it is on the ledger',
      });
    }
  }
  return { envelopes: envelopes.length, streams: streams.size, findings };
}

function auditStream(
  streamId: string,
  members: readonly Envelope[],
  streamOfAssertion: ReadonlyMap<string, string>,
  head: StreamHead | undefined
): ChainFinding[] {
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
    findings.push(...auditWithdrawals(streamId, envelope, streamOfAssertion));
  }
  sealed.sort((a, b) => a.integrity.sequence_no - b.integrity.sequence_no);

  // `last` is the line accepted as the chain's current end; a duplicate never becomes it.
  let last: SealedEnvelope | null = null;
  for (const line of sealed) {
    const seq = line.integrity.sequence_no;
    // Recomputed BEFORE the duplicate is skipped: an edited twin must still be named edited.
    const edited = checksumOf(line) !== line.integrity.checksum;
    const editedDetail =
      'the recomputed checksum differs from the declared one: the line was edited';
    if (last !== null && last.integrity.sequence_no === seq) {
      report(line, 'duplicate_sequence_no', `sequence_no ${seq} appears twice`);
      if (edited) {
        report(line, 'checksum_mismatch', editedDetail);
      }
      continue;
    }
    const expectedSeq = last === null ? 1 : last.integrity.sequence_no + 1;
    if (seq !== expectedSeq) {
      report(
        line,
        'sequence_gap',
        `expected sequence_no ${expectedSeq}, found ${seq}: a line was removed`
      );
    }
    if (edited) {
      report(line, 'checksum_mismatch', editedDetail);
    }
    const predecessorDeclared = last === null ? null : last.integrity.checksum;
    if (line.integrity.previous_checksum !== predecessorDeclared) {
      report(
        line,
        'previous_checksum_mismatch',
        'previous_checksum does not name the predecessor actually on the ledger'
      );
    }
    last = line;
  }
  const headFinding = compareHead(streamId, last, head);
  return headFinding === null ? findings : [...findings, headFinding];
}

/** Invariants 3 and 4: a withdrawal names a line of the ledger, in its OWN stream. */
function auditWithdrawals(
  streamId: string,
  envelope: Envelope,
  streamOfAssertion: ReadonlyMap<string, string>
): ChainFinding[] {
  const findings: ChainFinding[] = [];
  const withdrawals: ReadonlyArray<readonly [string, string | undefined]> = [
    ['target_assertion_id', envelope.target_assertion_id],
    ['supersedes_assertion_id', envelope.supersedes_assertion_id],
  ];
  for (const [field, target] of withdrawals) {
    if (target === undefined) {
      continue;
    }
    const targetStream = streamOfAssertion.get(target);
    const base = {
      claim_stream_id: streamId,
      sequence_no: envelope.integrity?.sequence_no ?? null,
      assertion_id: envelope.assertion_id,
    };
    if (targetStream === undefined) {
      findings.push({
        ...base,
        verdict: 'unresolved_target',
        detail: `${field} names ${target}, which is not on the ledger`,
      });
    } else if (targetStream !== streamId) {
      findings.push({
        ...base,
        verdict: 'cross_stream_target',
        detail: `${field} names ${target} of stream ${targetStream}: a withdrawal stays in its own stream`,
      });
    }
  }
  return findings;
}

/**
 * The committed head against the last line actually accepted. This is the ONLY way a
 * removed tail shows: a stream cut after line n is a valid stream of n lines.
 */
function compareHead(
  streamId: string,
  last: SealedEnvelope | null,
  head: StreamHead | undefined
): ChainFinding | null {
  if (head === undefined) {
    return null;
  }
  const lastNo = last === null ? 0 : last.integrity.sequence_no;
  const lastChecksum = last === null ? null : last.integrity.checksum;
  if (head.sequence_no === lastNo && head.checksum === lastChecksum) {
    return null;
  }
  return {
    claim_stream_id: streamId,
    sequence_no: lastNo === 0 ? null : lastNo,
    assertion_id: null,
    verdict: 'stream_head_mismatch',
    detail:
      head.sequence_no === lastNo
        ? `the committed head is sequence_no ${head.sequence_no} with another checksum`
        : `the committed head is sequence_no ${head.sequence_no}; the stream ends at ${lastNo}: a tail was removed or appended`,
  };
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
  // `instantOf` throws on a bound that is not a calendar instant: a query instant is never
  // repaired, never rounded, never read as the nearest real date.
  return {
    validAt: onValidAxis ? instantOf(query.valid_at as string) : null,
    asOf: onTransactionAxis ? instantOf(query.as_of as string) : null,
  };
}

/**
 * The earliest retraction / supersession per target, among the envelopes the ledger holds.
 *
 * A withdrawal that names an assertion of ANOTHER stream closes nothing (invariant 4: two
 * authorities that disagree are two authorities, and resolving them is not this oracle's
 * job); the chain reports it as `cross_stream_target`. At equal `recorded_at` a retraction
 * closes before a supersession, so the same ledger in another input order reads the same.
 */
function collectClosures(
  held: readonly Envelope[],
  streamOfAssertion: ReadonlyMap<string, string>
): Map<string, Closure> {
  const closures = new Map<string, Closure>();
  const close = (target: string, from: string, reason: Closure['reason'], at: number): void => {
    if (streamOfAssertion.get(target) !== from) {
      return;
    }
    const prior = closures.get(target);
    if (prior === undefined || at < prior.at || winsTheTie(reason, at, prior)) {
      closures.set(target, { reason, at });
    }
  };
  for (const envelope of held) {
    const at = instantOf(envelope.recorded_at);
    if (envelope.operation === 'retract' && typeof envelope.target_assertion_id === 'string') {
      close(envelope.target_assertion_id, envelope.claim_stream_id, 'retracted', at);
    } else if (
      envelope.operation === 'assert' &&
      typeof envelope.supersedes_assertion_id === 'string'
    ) {
      close(envelope.supersedes_assertion_id, envelope.claim_stream_id, 'superseded', at);
    }
  }
  return closures;
}

/** At the SAME instant a retraction closes before a supersession. Ties must be decided. */
function winsTheTie(reason: Closure['reason'], at: number, prior: Closure): boolean {
  return at === prior.at && reason === 'retracted' && prior.reason === 'superseded';
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
  const streamOfAssertion = new Map<string, string>();
  for (const envelope of envelopes) {
    streamOfAssertion.set(envelope.assertion_id, envelope.claim_stream_id);
  }
  const isHeld = (envelope: Envelope): boolean =>
    asOf === null || instantOf(envelope.recorded_at) <= asOf;
  const closures = collectClosures(envelopes.filter(isHeld), streamOfAssertion);

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
