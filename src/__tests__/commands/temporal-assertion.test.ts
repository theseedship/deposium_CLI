/**
 * Tests for `deposium temporal-assertion verify` — the LOT 10 oracle.
 *
 * Every expected value here is derived BY HAND from the rules documented in the MCPs
 * contract header (invariants 9-11, checksum amendment 4, snapshot amendment 2), never
 * from the reference implementation:
 *   - the pre-hash string of a tiny envelope is spelled out field by field, and its
 *     SHA-256 was computed with `sha256sum` on those exact bytes;
 *   - the snapshots of a 3-envelope ledger (a retroactive fact, a supersession, a
 *     retraction) are reasoned through query by query, two of their hashes pinned the
 *     same way;
 *   - the negative control: an empty or absent fixtures dir prints `0 PASS` and exits 1.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

import {
  canonicalJson,
  checksumOf,
  checksumPreimage,
  computeSnapshot,
  encodeField,
  instantOf,
  snapshotPreimage,
  verifyLedgerChain,
  type Envelope,
  type ValidTime,
} from '../../utils/temporal-assertion';
import {
  renderReport,
  runVerify,
  temporalAssertionCommand,
} from '../../commands/temporal-assertion';

// ============================================================================
// Fixtures
// ============================================================================

const UTC = (iso: string): number => Date.parse(iso);

/** The tiny envelope whose pre-hash string is written out by hand below. */
const TINY: Envelope = {
  schema_version: 'temporal-assertion/v1',
  assertion_id: 'a1',
  claim_stream_id: 's1',
  operation: 'assert',
  scope: { tenant_id: 't', space_id: 'sp' },
  statement: { subject: 'acme', predicate: 'ceo', object: 'jane' },
  valid_time: { from: '1998', from_kind: 'bounded', to: null, to_kind: 'open', precision: 'year' },
  recorded_at: '2026-01-02T03:04:05Z',
  evidence_refs: [],
  semantics: {},
  integrity: { sequence_no: 1, checksum: '', previous_checksum: null },
};

/**
 * The 34 fields of TINY in the documented order, US (\x1f) between them, NUL (\x00) for
 * every null or absent field, STX (\x02) + canonical JSON for every non-string one:
 *
 *   1 schema_version            temporal-assertion/v1
 *   2 assertion_id              a1
 *   3 claim_stream_id           s1
 *   4 operation                 assert
 *   5 target_assertion_id       NUL  (absent)
 *   6 supersedes_assertion_id   NUL  (absent)
 *   7 scope.tenant_id           t
 *   8 scope.space_id            sp
 *   9 scope.dataset_id          NUL  (absent)
 *  10 statement.subject         acme
 *  11 statement.predicate       ceo
 *  12 statement.object          jane (a string: raw, not JSON-quoted)
 *  13 statement.object_datatype NUL
 *  14 valid_time.from           1998
 *  15 valid_time.from_kind      bounded
 *  16 valid_time.to             NUL  (null)
 *  17 valid_time.to_kind        open
 *  18 valid_time.precision      year
 *  19-23 source_expression, resolution_anchor, timezone, calendar, confidence: NUL x5
 *  24 recorded_at               2026-01-02T03:04:05Z
 *  25 source_times              NUL  (absent)
 *  26 evidence_refs             STX[]  (STX + canonical JSON of the empty array)
 *  27 semantics                 STX{}  (STX + canonical JSON of the empty object)
 *  28-32 derivation.kind, producer, producer_version, input_assertion_ids, proof_ref: NUL x5
 *  33 integrity.sequence_no     STX1   (a number: STX + its JSON, never the raw digit)
 *  34 integrity.previous_checksum NUL (null on the first line)
 *
 * 142 characters. Those exact bytes | sha256sum =
 * 2e8fa2cb688dd192f587fb9768e757b86453c99c23c42f9ce10771f5268a962c
 */
const TINY_PREIMAGE =
  'temporal-assertion/v1\x1fa1\x1fs1\x1fassert\x1f\x00\x1f\x00\x1ft\x1fsp\x1f\x00' +
  '\x1facme\x1fceo\x1fjane\x1f\x00' +
  '\x1f1998\x1fbounded\x1f\x00\x1fopen\x1fyear\x1f\x00\x1f\x00\x1f\x00\x1f\x00\x1f\x00' +
  '\x1f2026-01-02T03:04:05Z\x1f\x00\x1f\x02[]\x1f\x02{}' +
  '\x1f\x00\x1f\x00\x1f\x00\x1f\x00\x1f\x00' +
  '\x1f\x021\x1f\x00';
const TINY_SHA256 = '2e8fa2cb688dd192f587fb9768e757b86453c99c23c42f9ce10771f5268a962c';

const UNKNOWN_VALIDITY: ValidTime = {
  from: null,
  from_kind: 'unknown',
  to: null,
  to_kind: 'unknown',
  precision: 'unknown',
};

function envelope(overrides: Partial<Envelope> & Pick<Envelope, 'assertion_id'>): Envelope {
  return {
    schema_version: 'temporal-assertion/v1',
    claim_stream_id: 's1',
    operation: 'assert',
    scope: { tenant_id: 't', space_id: 'sp' },
    valid_time: {
      from: '2010',
      from_kind: 'bounded',
      to: '2012',
      to_kind: 'bounded',
      precision: 'year',
    },
    recorded_at: '2026-03-01T00:00:00Z',
    evidence_refs: [],
    semantics: {},
    ...overrides,
  };
}

/** Chains the integrity blocks stream by stream, in list order, with the CLI's own checksum. */
function seal(list: readonly Envelope[]): Envelope[] {
  const heads = new Map<string, { seq: number; checksum: string }>();
  return list.map((e) => {
    const head = heads.get(e.claim_stream_id);
    const draft: Envelope = {
      ...e,
      integrity: {
        sequence_no: (head?.seq ?? 0) + 1,
        checksum: '',
        previous_checksum: head?.checksum ?? null,
      },
    };
    const checksum = checksumOf(draft);
    const sealed = { ...draft, integrity: { ...draft.integrity!, checksum } };
    heads.set(e.claim_stream_id, { seq: sealed.integrity!.sequence_no, checksum });
    return sealed;
  });
}

/**
 * The 3-envelope ledger, one stream:
 *   A1 — a RETROACTIVE fact: true for the calendar years 2010-2011 (`to: "2012"` is the
 *        exclusive 2012-01-01T00:00:00Z), recorded on the ledger only on 2026-03-01.
 *   A2 — a SUPERSESSION of A1 (the correction widens validity to 2010-2012), recorded 2026-03-10.
 *   R1 — a RETRACTION of A2, recorded 2026-03-20.
 */
const LEDGER: Envelope[] = seal([
  envelope({
    assertion_id: 'A1',
    statement: { subject: 'acme', predicate: 'ceo', object: 'jane' },
  }),
  envelope({
    assertion_id: 'A2',
    supersedes_assertion_id: 'A1',
    statement: { subject: 'acme', predicate: 'ceo', object: 'jane doe' },
    valid_time: {
      from: '2010',
      from_kind: 'bounded',
      to: '2013',
      to_kind: 'bounded',
      precision: 'year',
    },
    recorded_at: '2026-03-10T00:00:00Z',
  }),
  envelope({
    assertion_id: 'R1',
    operation: 'retract',
    target_assertion_id: 'A2',
    valid_time: UNKNOWN_VALIDITY,
    recorded_at: '2026-03-20T00:00:00Z',
  }),
]);

const pairs = (list: ReadonlyArray<{ assertion_id: string; reason: string }>): string[] =>
  list.map((x) => `${x.assertion_id}=${x.reason}`);

// ============================================================================
// Instants — invariant 11
// ============================================================================

describe('instantOf', () => {
  test('a reduced-precision bound is the FIRST instant of its period, on the UTC timeline', () => {
    expect(instantOf('1998')).toBe(UTC('1998-01-01T00:00:00Z'));
    expect(instantOf('1998-03')).toBe(UTC('1998-03-01T00:00:00Z'));
    expect(instantOf('1998-03-15')).toBe(UTC('1998-03-15T00:00:00Z'));
    expect(instantOf('1998-03-15T10:20:30')).toBe(UTC('1998-03-15T10:20:30Z'));
    expect(instantOf('1998-03-15T10:20:30.5Z')).toBe(UTC('1998-03-15T10:20:30.500Z'));
  });

  test('an offset moves the bound onto the UTC timeline', () => {
    expect(instantOf('2026-01-01T00:00:00+02:00')).toBe(UTC('2025-12-31T22:00:00Z'));
    expect(instantOf('2026-01-01T00:00:00-05:30')).toBe(UTC('2026-01-01T05:30:00Z'));
  });

  test('refuses what is not an ISO 8601 bound', () => {
    expect(() => instantOf('yesterday')).toThrow(/not an ISO 8601 bound/);
    expect(() => instantOf('2026-02-30')).toThrow(/not a calendar date/);
    expect(() => instantOf('')).toThrow();
  });
});

// ============================================================================
// Checksum — amendment 4
// ============================================================================

describe('checksum encoding', () => {
  test('the pre-hash string of the tiny envelope is exactly the one written by hand', () => {
    expect(TINY_PREIMAGE).toHaveLength(142);
    expect(TINY_PREIMAGE.split('\x1f')).toHaveLength(34);
    expect(checksumPreimage(TINY)).toBe(TINY_PREIMAGE);
  });

  test('its SHA-256 is the one sha256sum gives on those bytes', () => {
    expect(checksumOf(TINY)).toBe(TINY_SHA256);
  });

  test('integrity.checksum is the only field left out of its own hash', () => {
    const other = { ...TINY, integrity: { ...TINY.integrity!, checksum: 'f'.repeat(64) } };
    expect(checksumOf(other)).toBe(TINY_SHA256);
  });

  test('strings are raw: ("ab","c") and ("a","bc") do not collide because of the separator', () => {
    const left = checksumOf({ ...TINY, assertion_id: 'ab', claim_stream_id: 'c' });
    const right = checksumOf({ ...TINY, assertion_id: 'a', claim_stream_id: 'bc' });
    expect(left).not.toBe(right);
  });

  test('null, absent, empty string and the text "null" are four different things', () => {
    expect(encodeField(null)).toBe('\x00');
    expect(encodeField(undefined)).toBe('\x00');
    expect(encodeField('')).toBe('');
    expect(encodeField('null')).toBe('null');
    expect(encodeField(0.5)).toBe('\x020.5');
    expect(encodeField(true)).toBe('\x02true');
  });

  test('structured values are canonical JSON: keys sorted at every level, no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: null }], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[2,{"y":null,"z":1}]},"b":1}'
    );
    expect(encodeField([{ source_id: 's', evidence_id: 'e' }])).toBe(
      '\x02[{"evidence_id":"e","source_id":"s"}]'
    );
  });

  test('a non-string statement.object is STX + JSON, a string one raw', () => {
    const asNumber = checksumPreimage({
      ...TINY,
      statement: { subject: 'acme', predicate: 'headcount', object: 12 },
    });
    expect(asNumber.split('\x1f')[11]).toBe('\x0212');
    const asObject = checksumPreimage({
      ...TINY,
      statement: { subject: 'acme', predicate: 'hq', object: { lon: 2.35, lat: 48.85 } },
    });
    expect(asObject.split('\x1f')[11]).toBe('\x02{"lat":48.85,"lon":2.35}');
  });

  test('the number 1987 and the string "1987" do not collide (the STX prefix)', () => {
    const asNumber = { ...TINY, statement: { subject: 'x', predicate: 'year', object: 1987 } };
    const asString = { ...TINY, statement: { subject: 'x', predicate: 'year', object: '1987' } };
    expect(checksumPreimage(asNumber).split('\x1f')[11]).toBe('\x021987');
    expect(checksumPreimage(asString).split('\x1f')[11]).toBe('1987');
    expect(checksumOf(asNumber)).not.toBe(checksumOf(asString));
    const asBoolean = { ...TINY, statement: { subject: 'x', predicate: 'flag', object: true } };
    const asText = { ...TINY, statement: { subject: 'x', predicate: 'flag', object: 'true' } };
    expect(checksumOf(asBoolean)).not.toBe(checksumOf(asText));
  });
});

// ============================================================================
// Chain — "edited" is not "removed"
// ============================================================================

describe('verifyLedgerChain', () => {
  test('a sealed ledger has no finding', () => {
    const report = verifyLedgerChain(LEDGER);
    expect(report).toEqual({ envelopes: 3, streams: 1, findings: [] });
  });

  test('an edited line is checksum_mismatch on that line ONLY (previous_checksum is compared with the DECLARED one)', () => {
    const edited = LEDGER.map((e) =>
      e.assertion_id === 'A2'
        ? { ...e, statement: { subject: 'acme', predicate: 'ceo', object: 'john doe' } }
        : e
    );
    const verdicts = verifyLedgerChain(edited).findings.map((f) => [f.sequence_no, f.verdict]);
    expect(verdicts).toEqual([[2, 'checksum_mismatch']]);
  });

  test('a removed line is sequence_gap + previous_checksum_mismatch on its successor', () => {
    const removed = LEDGER.filter((e) => e.assertion_id !== 'A2');
    const verdicts = verifyLedgerChain(removed).findings.map((f) => [f.sequence_no, f.verdict]);
    expect(verdicts).toEqual([
      [3, 'sequence_gap'],
      [3, 'previous_checksum_mismatch'],
    ]);
  });

  test('a duplicated sequence_no is reported on the duplicate, the chain goes on from the first', () => {
    const duplicated = [...LEDGER.slice(0, 2), LEDGER[1], LEDGER[2]];
    const verdicts = verifyLedgerChain(duplicated).findings.map((f) => [f.sequence_no, f.verdict]);
    expect(verdicts).toEqual([[2, 'duplicate_sequence_no']]);
  });

  test('an envelope without integrity block is missing_integrity, sequence_no null', () => {
    const { integrity: _dropped, ...bare } = LEDGER[2];
    const report = verifyLedgerChain([LEDGER[0], LEDGER[1], bare]);
    expect(report.findings).toEqual([
      expect.objectContaining({
        claim_stream_id: 's1',
        sequence_no: null,
        assertion_id: 'R1',
        verdict: 'missing_integrity',
      }),
    ]);
  });

  test('streams are audited independently', () => {
    const other = seal([envelope({ assertion_id: 'B1', claim_stream_id: 's2' })]);
    const report = verifyLedgerChain([...LEDGER, ...other]);
    expect(report.streams).toBe(2);
    expect(report.findings).toEqual([]);
  });
});

// ============================================================================
// Snapshot — amendment 2
// ============================================================================

describe('computeSnapshot on the 3-envelope ledger', () => {
  test('AS OF before the retroactive fact was recorded: the ledger held nothing (invariant 9)', () => {
    const snap = computeSnapshot(LEDGER, { time_axis: 'transaction', as_of: '2026-02-01' });
    expect(snap.in_scope).toEqual([]);
    expect(pairs(snap.excluded)).toEqual([
      'A1=not_yet_recorded',
      'A2=not_yet_recorded',
      'R1=is_retraction',
    ]);
    expect(snap.undecided).toEqual([]);
    // '' RS 'A1=not_yet_recorded' US 'A2=not_yet_recorded' US 'R1=is_retraction' RS ''
    expect(snapshotPreimage(snap)).toBe(
      '\x1eA1=not_yet_recorded\x1fA2=not_yet_recorded\x1fR1=is_retraction\x1e'
    );
    expect(snap.hash).toBe('f57a11da8ee09abc1dd7180d97049d3337831c4bdb8975210aaee6783e086a31');
  });

  test('AS OF between the fact and its correction: A1 held, A2 not yet recorded', () => {
    const snap = computeSnapshot(LEDGER, { time_axis: 'transaction', as_of: '2026-03-05' });
    expect(snap.in_scope).toEqual(['A1']);
    expect(pairs(snap.excluded)).toEqual(['A2=not_yet_recorded', 'R1=is_retraction']);
    // 'A1' RS 'A2=not_yet_recorded' US 'R1=is_retraction' RS ''
    expect(snapshotPreimage(snap)).toBe('A1\x1eA2=not_yet_recorded\x1fR1=is_retraction\x1e');
    expect(snap.hash).toBe('ff3db191dec92d7f466ccad1163e16a24d79f701c00f5ff9c765157ea482478f');
  });

  test('AS OF the very instant of the supersession: held (recorded_at <= as_of), A1 superseded', () => {
    const snap = computeSnapshot(LEDGER, {
      time_axis: 'transaction',
      as_of: '2026-03-10T00:00:00Z',
    });
    expect(snap.in_scope).toEqual(['A2']);
    expect(pairs(snap.excluded)).toEqual(['A1=superseded', 'R1=is_retraction']);
  });

  test('AS OF after the retraction: A2 retracted, A1 stays superseded', () => {
    const snap = computeSnapshot(LEDGER, { time_axis: 'transaction', as_of: '2026-03-25' });
    expect(snap.in_scope).toEqual([]);
    expect(pairs(snap.excluded)).toEqual(['A1=superseded', 'A2=retracted', 'R1=is_retraction']);
  });

  test('valid axis alone reads the ledger as it stands: every withdrawal counts', () => {
    const snap = computeSnapshot(LEDGER, { time_axis: 'valid', valid_at: '2011-06' });
    expect(snap.in_scope).toEqual([]);
    expect(pairs(snap.excluded)).toEqual(['A1=superseded', 'A2=retracted', 'R1=is_retraction']);
  });

  test('both axes: the correction is in scope for 2012-06 once recorded and not yet retracted', () => {
    const snap = computeSnapshot(LEDGER, {
      time_axis: 'both',
      valid_at: '2012-06',
      as_of: '2026-03-15',
    });
    expect(snap.in_scope).toEqual(['A2']);
    expect(pairs(snap.excluded)).toEqual(['A1=superseded', 'R1=is_retraction']);
  });

  test('end bound is EXCLUSIVE: "2013" covers nothing of 2013, the last millisecond of 2012 is in', () => {
    const at2013 = computeSnapshot(LEDGER, {
      time_axis: 'both',
      valid_at: '2013',
      as_of: '2026-03-15',
    });
    expect(pairs(at2013.excluded)).toContain('A2=no_longer_valid');
    const lastMs = computeSnapshot(LEDGER, {
      time_axis: 'both',
      valid_at: '2012-12-31T23:59:59.999Z',
      as_of: '2026-03-15',
    });
    expect(lastMs.in_scope).toEqual(['A2']);
  });

  test('before the start: not_yet_valid', () => {
    const snap = computeSnapshot(LEDGER, {
      time_axis: 'both',
      valid_at: '2009-12-31T23:59:59Z',
      as_of: '2026-03-15',
    });
    expect(pairs(snap.excluded)).toEqual(['A1=superseded', 'A2=not_yet_valid', 'R1=is_retraction']);
  });

  test('transaction reasons come before valid reasons: A1 no_longer_valid, A2 not_yet_recorded', () => {
    const snap = computeSnapshot(LEDGER, {
      time_axis: 'both',
      valid_at: '2012-06',
      as_of: '2026-03-05',
    });
    expect(snap.in_scope).toEqual([]);
    expect(pairs(snap.excluded)).toEqual([
      'A1=no_longer_valid',
      'A2=not_yet_recorded',
      'R1=is_retraction',
    ]);
  });

  test('the earliest withdrawal closes: a supersession before a retraction reads superseded', () => {
    const ledger = seal([
      envelope({ assertion_id: 'X1' }),
      envelope({
        assertion_id: 'X3',
        operation: 'retract',
        target_assertion_id: 'X1',
        valid_time: UNKNOWN_VALIDITY,
        recorded_at: '2026-03-20T00:00:00Z',
      }),
      envelope({
        assertion_id: 'X2',
        supersedes_assertion_id: 'X1',
        recorded_at: '2026-03-15T00:00:00Z',
      }),
    ]);
    const snap = computeSnapshot(ledger, { time_axis: 'transaction', as_of: '2026-04-01' });
    expect(pairs(snap.excluded)).toEqual(['X1=superseded', 'X3=is_retraction']);
    expect(snap.in_scope).toEqual(['X2']);
  });

  test('a malformed query is refused, not guessed', () => {
    expect(() => computeSnapshot(LEDGER, { time_axis: 'valid' })).toThrow(
      /valid axis needs a valid_at/
    );
    expect(() => computeSnapshot(LEDGER, { time_axis: 'both', valid_at: '2012' })).toThrow(
      /both axis needs an as_of/
    );
    expect(() => computeSnapshot(LEDGER, { time_axis: 'now' as 'valid' })).toThrow(
      /unknown time_axis "now"/
    );
  });
});

describe('computeSnapshot with unknown and open bounds (invariant 10)', () => {
  const ledger = seal([
    envelope({
      assertion_id: 'U1',
      claim_stream_id: 's2',
      valid_time: {
        from: null,
        from_kind: 'unknown',
        to: '2020',
        to_kind: 'bounded',
        precision: 'year',
      },
    }),
    envelope({
      assertion_id: 'U2',
      claim_stream_id: 's2',
      valid_time: {
        from: '2000',
        from_kind: 'bounded',
        to: null,
        to_kind: 'unknown',
        precision: 'year',
      },
    }),
    envelope({
      assertion_id: 'U3',
      claim_stream_id: 's2',
      valid_time: {
        from: null,
        from_kind: 'open',
        to: null,
        to_kind: 'open',
        precision: 'unknown',
      },
    }),
  ]);

  test('unknown is undecided, never coerced to open; open covers', () => {
    const snap = computeSnapshot(ledger, { time_axis: 'valid', valid_at: '2010' });
    expect(snap.in_scope).toEqual(['U3']);
    expect(snap.excluded).toEqual([]);
    expect(pairs(snap.undecided)).toEqual(['U1=valid_from_unknown', 'U2=valid_to_unknown']);
    // 'U3' RS '' RS 'U1=valid_from_unknown' US 'U2=valid_to_unknown'
    expect(snapshotPreimage(snap)).toBe('U3\x1e\x1eU1=valid_from_unknown\x1fU2=valid_to_unknown');
    expect(snap.hash).toBe('3592a70b0fa58cd5611a10602a63b43b0c31fc78956c7ee375cf232c9ed11e17');
  });

  test('a bounded bound that excludes decides even when the other bound is unknown', () => {
    const after = computeSnapshot(ledger, { time_axis: 'valid', valid_at: '2021' });
    expect(pairs(after.excluded)).toEqual(['U1=no_longer_valid']);
    expect(pairs(after.undecided)).toEqual(['U2=valid_to_unknown']);
    const before = computeSnapshot(ledger, { time_axis: 'valid', valid_at: '1999' });
    expect(pairs(before.excluded)).toEqual(['U2=not_yet_valid']);
    expect(pairs(before.undecided)).toEqual(['U1=valid_from_unknown']);
  });
});

// ============================================================================
// The command over a fixtures directory
// ============================================================================

const T2_CASE = {
  name: 't2',
  query: { time_axis: 'transaction', as_of: '2026-03-05' },
  expected: {
    in_scope: ['A1'],
    excluded: [
      { assertion_id: 'A2', reason: 'not_yet_recorded' },
      { assertion_id: 'R1', reason: 'is_retraction' },
    ],
    undecided: [],
    hash: 'ff3db191dec92d7f466ccad1163e16a24d79f701c00f5ff9c765157ea482478f',
  },
};

function writeFixtures(
  root: string,
  scenarios: Record<string, Envelope[]>,
  cases: Record<string, unknown>
): void {
  mkdirSync(join(root, 'scenarios'), { recursive: true });
  mkdirSync(join(root, 'cases'), { recursive: true });
  for (const [name, envelopes] of Object.entries(scenarios)) {
    writeFileSync(
      join(root, 'scenarios', `${name}.jsonl`),
      envelopes.map((e) => JSON.stringify(e)).join('\n') + '\n'
    );
  }
  for (const [name, body] of Object.entries(cases)) {
    writeFileSync(join(root, 'cases', `${name}.json`), JSON.stringify(body, null, 2));
  }
}

describe('runVerify / temporal-assertion verify', () => {
  let root: string;
  let logged: string[];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'temporal-assertion-oracle-'));
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  async function run(args: string[]): Promise<void> {
    await temporalAssertionCommand.parseAsync(['node', 'temporal-assertion', 'verify', ...args]);
  }

  test('NEGATIVE CONTROL: an empty fixtures dir is 0 PASS and exit 1', async () => {
    const report = runVerify(root);
    expect(report.empty).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.totals).toEqual({ pass: 0, fail: 0 });

    await run(['--fixtures', root]);
    expect(logged.some((l) => l.startsWith('EMPTY:'))).toBe(true);
    expect(logged.some((l) => /SUMMARY: 0 PASS, 0 FAIL/.test(l))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('NEGATIVE CONTROL: an absent fixtures dir is 0 PASS and exit 1', async () => {
    await run(['--fixtures', join(root, 'does-not-exist')]);
    expect(logged.some((l) => /SUMMARY: 0 PASS, 0 FAIL/.test(l))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('a scenario with a case file that expects the right snapshot and a clean chain passes', async () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      { basic: { scenario: 'basic', cases: [T2_CASE], chain: { findings: [] } } }
    );
    const report = runVerify(root);
    expect(report.queries).toEqual([{ scenario: 'basic', id: 't2', status: 'PASS', diff: [] }]);
    expect(report.chains[0]).toMatchObject({ scenario: 'basic', status: 'PASS', envelopes: 3 });
    expect(report.totals).toEqual({ pass: 2, fail: 0 });
    expect(report.ok).toBe(true);

    await run(['--fixtures', root]);
    expect(logged).toContain('PASS basic/t2');
    expect(logged.some((l) => l.startsWith('CHAIN PASS basic'))).toBe(true);
    expect(logged.some((l) => /SUMMARY: 2 PASS, 0 FAIL/.test(l))).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('a wrong expected hash is a FAIL line with the diff, exit 1', async () => {
    const wrong = { ...T2_CASE, expected: { ...T2_CASE.expected, hash: 'a'.repeat(64) } };
    writeFixtures(root, { basic: LEDGER }, { basic: { scenario: 'basic', cases: [wrong] } });
    await run(['--fixtures', root]);
    const failLine = logged.find((l) => l.startsWith('FAIL basic/t2'));
    expect(failLine).toMatch(/hash: expected a{64} got ff3db191/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('checksum_mismatch: an edited line is the expected chain verdict, and ONLY that one', () => {
    const edited = LEDGER.map((e) =>
      e.assertion_id === 'A2'
        ? { ...e, statement: { subject: 'acme', predicate: 'ceo', object: 'john doe' } }
        : e
    );
    writeFixtures(
      root,
      { edited },
      {
        edited: {
          scenario: 'edited',
          cases: [],
          chain: {
            findings: [
              {
                claim_stream_id: 's1',
                sequence_no: 2,
                assertion_id: 'A2',
                verdict: 'checksum_mismatch',
              },
              { claim_stream_id: 's1', sequence_no: 3, assertion_id: 'R1', verdict: 'ok' },
            ],
          },
        },
        'edited-expected-clean': {
          scenario: 'edited',
          cases: [],
          chain: { findings: [] },
        },
      }
    );
    const report = runVerify(root);
    const byCase = Object.fromEntries(report.chains.map((c) => [c.caseFile, c]));
    expect(byCase['edited']).toMatchObject({ status: 'PASS', findings: 1 });
    expect(byCase['edited-expected-clean'].status).toBe('FAIL');
    expect(byCase['edited-expected-clean'].diff[0]).toMatch(
      /unexpected: s1#2 A2 checksum_mismatch/
    );
    expect(report.ok).toBe(false);
  });

  test('sequence_gap: a removed line is reported on its successor, with previous_checksum_mismatch', () => {
    const removed = LEDGER.filter((e) => e.assertion_id !== 'A2');
    writeFixtures(
      root,
      { gap: removed },
      {
        gap: {
          scenario: 'gap',
          cases: [],
          chain: {
            findings: [
              { claim_stream_id: 's1', sequence_no: 3, verdict: 'sequence_gap' },
              { claim_stream_id: 's1', sequence_no: 3, verdict: 'previous_checksum_mismatch' },
            ],
          },
        },
      }
    );
    const report = runVerify(root);
    expect(report.chains[0]).toMatchObject({ status: 'PASS', envelopes: 2, findings: 2 });
    expect(report.ok).toBe(true);
  });

  test('tolerant case-file keys are accepted and reported as assumptions', () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      {
        basic: {
          queries: [
            {
              id: 't2',
              query: T2_CASE.query,
              expect: { in_scope: ['A1'], excluded: ['A2=not_yet_recorded', 'R1=is_retraction'] },
            },
          ],
          chain: { expected_verdicts: [] },
        },
      }
    );
    const report = runVerify(root);
    expect(report.queries).toEqual([{ scenario: 'basic', id: 't2', status: 'PASS', diff: [] }]);
    expect(report.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/no 'scenario' key, assumed scenario 'basic'/),
        expect.stringMatching(/read key 'queries' as 'cases'/),
        expect.stringMatching(/read key 'id' as 'name'/),
        expect.stringMatching(/read key 'expect' as 'expected'/),
        expect.stringMatching(/read key 'expected_verdicts' as 'findings'/),
      ])
    );
    expect(report.ok).toBe(true);
  });

  test('a case file naming a scenario that does not exist fails, an unreferenced scenario is flagged', () => {
    writeFixtures(
      root,
      { orphan: LEDGER },
      { ghost: { scenario: 'ghost', cases: [T2_CASE], chain: { findings: [] } } }
    );
    const report = runVerify(root);
    expect(report.queries[0]).toMatchObject({ status: 'FAIL' });
    expect(report.queries[0].diff[0]).toMatch(/no scenarios\/ghost\.jsonl/);
    expect(report.chains[0].status).toBe('FAIL');
    expect(report.unchecked).toEqual(['orphan']);
    expect(renderReport(report)).toContain(
      'UNCHECKED orphan: no case file refers to this scenario'
    );
  });

  test('--json prints the report', async () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      { basic: { scenario: 'basic', cases: [T2_CASE], chain: { findings: [] } } }
    );
    await run(['--fixtures', root, '--json']);
    const parsed = JSON.parse(logged.join('\n'));
    expect(parsed.ok).toBe(true);
    expect(parsed.totals).toEqual({ pass: 2, fail: 0 });
  });
});

// ============================================================================
// The MCPs fixtures, vendored byte-for-byte — the cross-implementation agreement (R5)
// ============================================================================

const VENDORED_ROOT = join(process.cwd(), 'src', '__tests__', 'fixtures', 'temporal-assertion');

/**
 * SHA-256 of every vendored file, copied from MCPs `tests/fixtures/temporal-assertion`
 * (`generate.ts` left out). To refresh: re-copy README.md, scenarios/, cases/, source/,
 * then `find . -type f | sort | xargs sha256sum` from the vendored root.
 */
const FIXTURE_HASHES = {
  'README.md': 'bcd8696d936bb9ec61e973ab586a1cf6f1554762034df93c58335f147eef3dbd',
  'cases/01-simple-dated.json': '557f4b1776eeebe69b92ae447f019d8443ca5f1a9dcc94d3112c478145aadb31',
  'cases/02-correction.json': '5ce302e5b6c8ad91ca6626bd80ef5d52c2210451b80e4f0ca1a869a7c735dae7',
  'cases/03-retraction.json': 'e651e766cdcd2a9cec05c4556438bb0edb66e42489f7cc7569497180ee856dd4',
  'cases/04-retroactive.json': '7f9d5163242d0ee3b40920e00c27c66aa839808d3ab86a72439b47d0a61af9f9',
  'cases/05-open-vs-unknown.json':
    '213982ebace3ececeb89fb428f16fbecd4db5de98bf2beae83232c04935ed494',
  'cases/06-two-authorities.json':
    '96fa7682a081bd01f81c86e114409217e1d09b1fc4d09ad820e00f389090103f',
  'cases/07-kind-variations.json':
    '9ecd9c323a9ade866ac1c89d12424aa49969d557cc92eb53e16cf99fc982f16f',
  'scenarios/01-simple-dated.jsonl':
    'b7870c64aacf93aa1a94c6c1f1c500d2bb7ad3d4ed93efdbedc9dec85f748ea3',
  'scenarios/02-correction.jsonl':
    'd31761aa37233c78f0f7394c016ca72947730f72667c07f58b03927e42c81107',
  'scenarios/03-retraction.jsonl':
    '340f7795622f99c428e65ae672e3297f2237d99b469f77604f36531cf92721f9',
  'scenarios/04-retroactive.jsonl':
    '3a4eee56cb9fa392df787c108a85a68ae0bae9eb51d71a967a303242e831693d',
  'scenarios/05-open-vs-unknown.jsonl':
    'ff685adc37357d3b0d2e8af6b8090002db62907112623bb2e358da1573258bb7',
  'scenarios/06-two-authorities.jsonl':
    'dc23d38d53531d06443eb6fbea3bccdaba72615c012080d081389c59fc21ee8a',
  'scenarios/07-kind-variations.jsonl':
    '0281ea7a4bf8818f65744675a43392003304252dcbf48c71240dfc54a28b182a',
  'source/sample-space-582.json':
    '3d70ad8a3a90d74c0becef402405870000ca94cfba56543ed62fd24341b75e5c',
} as const;

function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => statSync(join(root, entry)).isFile())
    .sort();
}

describe('vendored MCPs fixtures (tests/fixtures/temporal-assertion)', () => {
  test('pins the complete vendored directory byte-for-byte', () => {
    expect(listFiles(VENDORED_ROOT)).toEqual(Object.keys(FIXTURE_HASHES).sort());
    for (const [fileName, expected] of Object.entries(FIXTURE_HASHES)) {
      const digest = createHash('sha256')
        .update(readFileSync(join(VENDORED_ROOT, fileName)))
        .digest('hex');
      expect(
        digest,
        `${fileName}: the CLI copy drifted from MCPs tests/fixtures/temporal-assertion — ` +
          're-vendor the directory and re-pin FIXTURE_HASHES'
      ).toBe(expected);
    }
  });

  test('runVerify: 50 query PASS, 7 chain PASS, 0 FAIL, and the canonical layout logs no assumption', () => {
    const report = runVerify(VENDORED_ROOT);
    expect(report.queries.filter((q) => q.status === 'PASS')).toHaveLength(50);
    expect(report.chains.filter((c) => c.status === 'PASS')).toHaveLength(7);
    expect(report.totals).toEqual({ pass: 57, fail: 0 });
    expect(report.unchecked).toEqual([]);
    expect(report.assumptions).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test('cross-implementation agreement: the CLI snapshot hash equals every expected.hash MCPs wrote', () => {
    let compared = 0;
    for (const caseFile of listFiles(join(VENDORED_ROOT, 'cases'))) {
      const spec = JSON.parse(readFileSync(join(VENDORED_ROOT, 'cases', caseFile), 'utf8'));
      const ledger = readFileSync(
        join(VENDORED_ROOT, 'scenarios', `${spec.scenario}.jsonl`),
        'utf8'
      )
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Envelope);
      expect(verifyLedgerChain(ledger).findings, spec.scenario).toEqual([]);
      for (const c of spec.cases) {
        const snap = computeSnapshot(ledger, c.query);
        expect(snap.hash, `${spec.scenario} / ${c.name}`).toBe(c.expected.hash);
        expect(snap.in_scope).toEqual(c.expected.in_scope);
        expect(pairs(snap.excluded)).toEqual(pairs(c.expected.excluded));
        expect(pairs(snap.undecided)).toEqual(pairs(c.expected.undecided));
        compared += 1;
      }
    }
    expect(compared).toBe(50);
  });
});
