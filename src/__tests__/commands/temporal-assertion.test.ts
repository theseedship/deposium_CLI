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
 *
 * Each test name says which mutation of the oracle it turns red.
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
    cyan: (s: string) => s,
  },
}));

/**
 * `utils/config` is kept real (the rest of the CLI loads it at import time) except for the
 * two functions the preflight calls: the point of those tests is WHETHER they are called.
 */
const configMock = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({}) as Record<string, unknown>),
  getBaseUrl: vi.fn(() => 'https://api.example.com'),
}));
vi.mock('../../utils/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/config')>();
  return { ...actual, getConfig: configMock.getConfig, getBaseUrl: configMock.getBaseUrl };
});

import {
  canonicalJson,
  checksumOf,
  checksumPreimage,
  computeSnapshot,
  encodeField,
  instantOf,
  isWellFormedText,
  snapshotPreimage,
  validateEnvelope,
  verifyLedgerChain,
  type Envelope,
  type SnapshotQuery,
  type StreamHead,
  type ValidTime,
} from '../../utils/temporal-assertion';
import {
  renderReport,
  runVerify,
  temporalAssertionCommand,
} from '../../commands/temporal-assertion';
import { runPreflight, usesApi } from '../../utils/cli-preflight';

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

/**
 * A contract-VALID envelope. Every default is one the closed shape accepts, so a ledger
 * built from this helper is one the oracle agrees to read (and to hash).
 */
function envelope(overrides: Partial<Envelope> & Pick<Envelope, 'assertion_id'>): Envelope {
  return {
    schema_version: 'temporal-assertion/v1',
    claim_stream_id: 's1',
    operation: 'assert',
    scope: { tenant_id: 't', space_id: 'sp' },
    statement: { subject: 'acme', predicate: 'ceo', object: 'jane' },
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

/** The committed heads of a sealed ledger: last sequence_no and DECLARED checksum per stream. */
function headsOf(list: readonly Envelope[]): Record<string, StreamHead> {
  const heads: Record<string, StreamHead> = {};
  for (const e of list) {
    if (e.integrity === undefined) {
      continue;
    }
    const current = heads[e.claim_stream_id];
    if (current === undefined || e.integrity.sequence_no > current.sequence_no) {
      heads[e.claim_stream_id] = {
        sequence_no: e.integrity.sequence_no,
        checksum: e.integrity.checksum,
      };
    }
  }
  return heads;
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
    statement: undefined,
    valid_time: UNKNOWN_VALIDITY,
    recorded_at: '2026-03-20T00:00:00Z',
  }),
]);

/**
 * Three plain assertions in one stream, nothing withdrawn: removing a line here leaves no
 * dangling target, so `sequence_gap` can be read on its own.
 */
const PLAIN: Envelope[] = seal([
  envelope({ assertion_id: 'P1', claim_stream_id: 's3' }),
  envelope({ assertion_id: 'P2', claim_stream_id: 's3', recorded_at: '2026-03-02T00:00:00Z' }),
  envelope({ assertion_id: 'P3', claim_stream_id: 's3', recorded_at: '2026-03-03T00:00:00Z' }),
]);

const pairs = (list: ReadonlyArray<{ assertion_id: string; reason: string }>): string[] =>
  list.map((x) => `${x.assertion_id}=${x.reason}`);

const verdictsOf = (findings: ReadonlyArray<{ sequence_no: number | null; verdict: string }>) =>
  findings.map((f) => [f.sequence_no, f.verdict]);

// ============================================================================
// Instants — invariant 11, and a calendar that is never repaired
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
    expect(instantOf('2026-08-10T11:18:58.129+02:00')).toBe(UTC('2026-08-10T09:18:58.129Z'));
  });

  test('a real leap day is a real instant (mutation: leap rule dropped → red)', () => {
    expect(instantOf('2024-02-29')).toBe(UTC('2024-02-29T00:00:00Z'));
    expect(instantOf('2000-02-29')).toBe(UTC('2000-02-29T00:00:00Z'));
  });

  test('a date that does not exist is REFUSED, never moved to the next month', () => {
    // Date.parse('2026-02-29') is the first of March: a normalised instant is a moved fact.
    for (const bound of ['2026-02-29', '2026-04-31', '2026-02-30', '1900-02-29', '1988-13']) {
      expect(() => instantOf(bound), bound).toThrow(/not a calendar date/);
    }
  });

  test('a clock that does not exist is REFUSED (mutation: hour range check removed → red)', () => {
    for (const bound of ['2026-01-01T24:00:00Z', '2026-01-01T23:60:00Z', '2026-01-01T23:59:60Z']) {
      expect(() => instantOf(bound), bound).toThrow(/not a calendar clock/);
    }
  });

  test('an offset beyond 23:59 is REFUSED', () => {
    expect(() => instantOf('2026-01-01T00:00:00+24:00')).toThrow(/not a calendar offset/);
    expect(() => instantOf('2026-01-01T00:00:00+23:60')).toThrow(/not a calendar offset/);
    expect(() => instantOf('2026-01-01T00:00:00-24:00')).toThrow(/not a calendar offset/);
  });

  test('more than three fractional digits is not a millisecond instant', () => {
    expect(instantOf('2026-01-01T00:00:00.123Z')).toBe(UTC('2026-01-01T00:00:00.123Z'));
    expect(() => instantOf('2026-01-01T00:00:00.1234Z')).toThrow(/not an ISO 8601 bound/);
  });

  test('refuses what is not an ISO 8601 bound at all', () => {
    expect(() => instantOf('yesterday')).toThrow(/not an ISO 8601 bound/);
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

describe('the strings the checksum may read RAW', () => {
  test('a lone surrogate is ill-formed, a pair is not (mutation: lone surrogates accepted → red)', () => {
    expect(isWellFormedText('\ud800')).toBe(false);
    expect(isWellFormedText('\udc00')).toBe(false);
    expect(isWellFormedText('a\ud800b')).toBe(false);
    expect(isWellFormedText('🚀')).toBe(true);
    expect(isWellFormedText('🚀 rocket')).toBe(true);
  });

  test('the encoder REFUSES to hash raw a lone surrogate or a control character', () => {
    expect(() => encodeField('\ud800')).toThrow(/refusing to hash raw/);
    expect(() => encodeField('ab\x1fc')).toThrow(/refusing to hash raw/);
    expect(() => encodeField('tab\there')).toThrow(/refusing to hash raw/);
    // A paired surrogate is ordinary text: an emoji hashes like any other string.
    expect(encodeField('🚀 acme')).toBe('🚀 acme');
  });

  test('an envelope carrying a lone surrogate is a violation, not a checksum', () => {
    const broken = envelope({
      assertion_id: 'S1',
      statement: { subject: 'acme', predicate: 'name', object: 'jane\ud800' },
    });
    expect(validateEnvelope(broken)).toEqual([
      expect.objectContaining({ path: 'statement.object' }),
    ]);
    const control = envelope({
      assertion_id: 'S2',
      statement: { subject: 'acme', predicate: 'name', object: 'jane 🚀' },
    });
    expect(validateEnvelope(control)).toEqual([]);
    expect(checksumOf(control)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('canonicalJson refuses what JSON cannot carry faithfully', () => {
  test('it THROWS instead of returning a marker (mutation: `?? NULL_MARKER` → red)', () => {
    expect(() => canonicalJson(undefined)).toThrow(/undefined/);
    expect(() => canonicalJson(NaN)).toThrow(/NaN/);
    expect(() => canonicalJson(Infinity)).toThrow(/Infinity/);
    expect(() => canonicalJson(-Infinity)).toThrow(/Infinity/);
    expect(() => canonicalJson(1n)).toThrow(/bigint/);
    expect(() => canonicalJson(new Date(0))).toThrow(/Date/);
    expect(() => canonicalJson(new Map())).toThrow(/Map/);
    expect(() => canonicalJson(new Set())).toThrow(/Set/);
    expect(() => canonicalJson(() => 1)).toThrow(/function/);
    expect(() => canonicalJson([undefined])).toThrow(/undefined inside a list/);
    expect(() => canonicalJson([1, [2, NaN]])).toThrow(/NaN/);
  });

  test('a cycle is refused at any depth', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
    const list: unknown[] = [1];
    list.push(list);
    expect(() => canonicalJson(list)).toThrow(/cycle/);
  });

  test('an undefined MEMBER of an object is absent, exactly as JSON drops it', () => {
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1}');
    expect(canonicalJson({ nested: { gone: undefined, kept: null } })).toBe(
      '{"nested":{"kept":null}}'
    );
  });

  test('a non-finite number inside an envelope is a violation, never a silent null', () => {
    const broken = envelope({
      assertion_id: 'N1',
      statement: { subject: 'acme', predicate: 'headcount', object: Number.NaN },
    });
    expect(validateEnvelope(broken)).toEqual([
      expect.objectContaining({ path: 'statement.object' }),
    ]);
  });
});

// ============================================================================
// Closed shape
// ============================================================================

describe('validateEnvelope', () => {
  test('the helper builds a contract-valid envelope: 0 violations (the negative control)', () => {
    expect(validateEnvelope(envelope({ assertion_id: 'V1' }))).toEqual([]);
    for (const line of LEDGER) {
      expect(validateEnvelope(line), line.assertion_id).toEqual([]);
    }
  });

  test('a member the contract does not name is refused at every level', () => {
    const extra = { ...envelope({ assertion_id: 'C1' }), sequence_id: 7 };
    expect(validateEnvelope(extra)).toEqual([
      { invariant: 'shape', path: 'sequence_id', message: expect.stringMatching(/not a member/) },
    ]);
    const inScope = envelope({ assertion_id: 'C2' });
    (inScope.scope as Record<string, unknown>).region = 'eu';
    expect(validateEnvelope(inScope)).toEqual([expect.objectContaining({ path: 'scope.region' })]);
    const inIntegrity = {
      ...envelope({ assertion_id: 'C3' }),
      integrity: {
        sequence_no: 1,
        checksum: 'a'.repeat(64),
        previous_checksum: null,
        signature: 'x',
      },
    };
    expect(validateEnvelope(inIntegrity)).toEqual([
      expect.objectContaining({ path: 'integrity.signature' }),
    ]);
  });

  test('an assertion states something; a retraction targets and never supersedes', () => {
    const noStatement = envelope({ assertion_id: 'O1', statement: undefined });
    expect(validateEnvelope(noStatement)).toEqual([expect.objectContaining({ path: 'statement' })]);
    const retractAndSupersede = envelope({
      assertion_id: 'O2',
      operation: 'retract',
      target_assertion_id: 'O1',
      supersedes_assertion_id: 'O1',
    });
    expect(validateEnvelope(retractAndSupersede)).toEqual([
      { invariant: 2, path: 'supersedes_assertion_id', message: expect.any(String) },
    ]);
    const selfTarget = envelope({
      assertion_id: 'O3',
      operation: 'retract',
      target_assertion_id: 'O3',
    });
    expect(validateEnvelope(selfTarget)).toEqual([
      expect.objectContaining({ path: 'target_assertion_id' }),
    ]);
  });

  test('an instant that is not a calendar instant is a violation, on every time field', () => {
    expect(
      validateEnvelope(envelope({ assertion_id: 'I1', recorded_at: '2026-02-29T00:00:00Z' }))
    ).toEqual([expect.objectContaining({ invariant: 9, path: 'recorded_at' })]);
    // The real relation row of the fixtures: an instant WITHOUT an offset.
    expect(
      validateEnvelope(envelope({ assertion_id: 'I2', recorded_at: '2026-08-10 11:18:58.129510' }))
    ).toEqual([expect.objectContaining({ invariant: 9, path: 'recorded_at' })]);
    expect(
      validateEnvelope(
        envelope({
          assertion_id: 'I3',
          valid_time: {
            from: '2026-04-31',
            from_kind: 'bounded',
            to: null,
            to_kind: 'open',
            precision: 'day',
          },
        })
      )
    ).toEqual([expect.objectContaining({ invariant: 10, path: 'valid_time.from' })]);
    expect(
      validateEnvelope(
        envelope({ assertion_id: 'I4', source_times: { observed_at: '2026-01-01T24:00:00Z' } })
      )
    ).toEqual([expect.objectContaining({ path: 'source_times.observed_at' })]);
  });
});

// ============================================================================
// Chain — "edited" is not "removed", and a removed tail needs a head
// ============================================================================

describe('verifyLedgerChain', () => {
  test('a sealed ledger has no finding', () => {
    expect(verifyLedgerChain(LEDGER)).toEqual({ envelopes: 3, streams: 1, findings: [] });
    expect(verifyLedgerChain(PLAIN)).toEqual({ envelopes: 3, streams: 1, findings: [] });
  });

  test('an edited line is checksum_mismatch on that line ONLY (previous_checksum is compared with the DECLARED one)', () => {
    const edited = LEDGER.map((e) =>
      e.assertion_id === 'A2'
        ? { ...e, statement: { subject: 'acme', predicate: 'ceo', object: 'john doe' } }
        : e
    );
    expect(verdictsOf(verifyLedgerChain(edited).findings)).toEqual([[2, 'checksum_mismatch']]);
  });

  test('a removed line is sequence_gap + previous_checksum_mismatch on its successor', () => {
    const removed = PLAIN.filter((e) => e.assertion_id !== 'P2');
    expect(verdictsOf(verifyLedgerChain(removed).findings)).toEqual([
      [3, 'sequence_gap'],
      [3, 'previous_checksum_mismatch'],
    ]);
  });

  test('an exact duplicate is a duplicate ONLY; an EDITED duplicate is also checksum_mismatch (mutation: duplicate skipped before recomputation → red)', () => {
    const exact = [...LEDGER.slice(0, 2), LEDGER[1], LEDGER[2]];
    expect(verdictsOf(verifyLedgerChain(exact).findings)).toEqual([[2, 'duplicate_sequence_no']]);

    const twin: Envelope = {
      ...LEDGER[1],
      assertion_id: 'A2-twin',
      statement: { subject: 'acme', predicate: 'ceo', object: 'mallory' },
    };
    const tampered = [...LEDGER, twin];
    const onTwin = verifyLedgerChain(tampered).findings.filter((f) => f.assertion_id === 'A2-twin');
    expect(onTwin.map((f) => f.verdict)).toEqual(['duplicate_sequence_no', 'checksum_mismatch']);
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

  test('a withdrawal whose target is not on the ledger is unresolved_target', () => {
    const orphaned = LEDGER.filter((e) => e.assertion_id !== 'A2');
    const verdicts = verifyLedgerChain(orphaned).findings.map((f) => f.verdict);
    expect(verdicts).toContain('unresolved_target');
    expect(
      verifyLedgerChain(orphaned).findings.find((f) => f.verdict === 'unresolved_target')
    ).toMatchObject({ assertion_id: 'R1', claim_stream_id: 's1' });
  });

  test('a supersession that names another stream is cross_stream_target (mutation: global target map → red)', () => {
    const twoAuthorities = seal([
      envelope({ assertion_id: 'W1', claim_stream_id: 'sA' }),
      envelope({
        assertion_id: 'W2',
        claim_stream_id: 'sB',
        supersedes_assertion_id: 'W1',
        recorded_at: '2026-03-10T00:00:00Z',
      }),
    ]);
    const report = verifyLedgerChain(twoAuthorities);
    expect(report.streams).toBe(2);
    expect(report.findings).toEqual([
      expect.objectContaining({
        claim_stream_id: 'sB',
        assertion_id: 'W2',
        verdict: 'cross_stream_target',
      }),
    ]);
  });

  test('a removed TAIL is invisible without a head and stream_head_mismatch with one (mutation: heads ignored → red)', () => {
    const heads = headsOf(PLAIN);
    expect(verifyLedgerChain(PLAIN, { heads }).findings).toEqual([]);

    const cut = PLAIN.slice(0, 2);
    // The documented blind spot: a stream cut after line 2 is a valid stream of 2 lines.
    expect(verifyLedgerChain(cut).findings).toEqual([]);
    expect(verifyLedgerChain(cut, { heads }).findings).toEqual([
      expect.objectContaining({
        claim_stream_id: 's3',
        sequence_no: 2,
        assertion_id: null,
        verdict: 'stream_head_mismatch',
      }),
    ]);

    // A head whose checksum names a line that is no longer the one there.
    const forged = verifyLedgerChain(PLAIN, {
      heads: { s3: { sequence_no: 3, checksum: 'f'.repeat(64) } },
    });
    expect(forged.findings.map((f) => f.verdict)).toEqual(['stream_head_mismatch']);
    expect(forged.findings[0].detail).toContain('another checksum');
  });

  test('an envelope canonical JSON cannot carry is unhashable, and the verifier NEVER throws (mutation: guard removed → red)', () => {
    // A `Date` and a bigint: two values `validateEnvelope` refuses and `encodeField` cannot
    // hash. They cannot come from JSONL — they come from a caller who did not validate, and
    // a verifier that threw on the ledger it verifies would say nothing about the other lines.
    const ledger = vendoredLedger('02-correction').map((e) => ({
      ...e,
      statement: { ...e.statement! },
    }));
    ledger[0].statement.object = new Date(0);
    ledger[1].statement.object = BigInt(1);

    let report: ReturnType<typeof verifyLedgerChain> | undefined;
    expect(() => {
      report = verifyLedgerChain(ledger);
    }).not.toThrow();
    expect(report!.findings).toHaveLength(2);
    expect([...new Set(report!.findings.map((f) => f.verdict))]).toEqual(['unhashable']);
    expect(report!.findings.map((f) => f.sequence_no)).toEqual([1, 2]);
    expect(report!.findings[0].detail).toMatch(/^the envelope cannot be hashed: .*Date/);
    expect(report!.findings[1].detail).toMatch(/^the envelope cannot be hashed: .*bigint/);
    // Nothing was compared, so no checksum_mismatch; and the head still advanced on the
    // DECLARED checksums, so line 2's previous_checksum still resolves.
    expect(report!.findings.some((f) => f.verdict === 'checksum_mismatch')).toBe(false);
    expect(report!.findings.some((f) => f.verdict === 'previous_checksum_mismatch')).toBe(false);
    // The untouched ledger is clean: the two findings come from the two mutations alone.
    expect(verifyLedgerChain(vendoredLedger('02-correction')).findings).toEqual([]);

    // An unhashable line does not blind the verifier to what follows it: the chain head
    // advanced on its DECLARED checksum, so a clean successor and the committed head both
    // still resolve. Only the refusal is reported.
    const spec = vendoredCaseFiles().find((s) => s.scenario === '02-correction')!;
    const partly = vendoredLedger('02-correction').map((e) => ({
      ...e,
      statement: { ...e.statement! },
    }));
    partly[0].statement.object = new Date(0);
    const anchored = verifyLedgerChain(partly, { heads: spec.heads });
    expect(anchored.findings.map((f) => f.verdict)).toEqual(['unhashable']);
    expect(anchored.findings[0].sequence_no).toBe(1);
  });

  test('a whole stream removed under a committed head is stream_absent', () => {
    const other = seal([envelope({ assertion_id: 'B1', claim_stream_id: 's2' })]);
    const heads = headsOf([...PLAIN, ...other]);
    expect(verifyLedgerChain([...PLAIN, ...other], { heads }).findings).toEqual([]);
    const report = verifyLedgerChain(PLAIN, { heads });
    expect(report.findings).toEqual([
      expect.objectContaining({
        claim_stream_id: 's2',
        sequence_no: null,
        assertion_id: null,
        verdict: 'stream_absent',
      }),
    ]);
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
        statement: undefined,
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

  test('at EQUAL recorded_at the retraction closes, in any input order (mutation: strict < only → red)', () => {
    const fact = envelope({ assertion_id: 'T1' });
    const correction = envelope({
      assertion_id: 'T2',
      supersedes_assertion_id: 'T1',
      recorded_at: '2026-03-10T00:00:00Z',
    });
    const retraction = envelope({
      assertion_id: 'T3',
      operation: 'retract',
      target_assertion_id: 'T1',
      statement: undefined,
      valid_time: UNKNOWN_VALIDITY,
      recorded_at: '2026-03-10T00:00:00Z',
    });
    const query: SnapshotQuery = { time_axis: 'transaction', as_of: '2026-04-01' };
    // Three orders; in two of them the supersession is read BEFORE the retraction.
    const orders = [
      [fact, correction, retraction],
      [fact, retraction, correction],
      [retraction, correction, fact],
    ];
    const results = orders.map((order) => computeSnapshot(order, query));
    for (const result of results) {
      expect(pairs(result.excluded)).toContain('T1=retracted');
      expect(result.hash).toBe(results[0].hash);
    }
  });

  test('a withdrawal from ANOTHER stream closes nothing (mutation: cross-stream withdrawal closes → red)', () => {
    const ofA = envelope({ assertion_id: 'W1', claim_stream_id: 'sA' });
    const fromB = envelope({
      assertion_id: 'W2',
      claim_stream_id: 'sB',
      supersedes_assertion_id: 'W1',
      recorded_at: '2026-03-10T00:00:00Z',
    });
    const query: SnapshotQuery = { time_axis: 'transaction', as_of: '2026-04-01' };
    const across = computeSnapshot([ofA, fromB], query);
    expect(across.in_scope).toEqual(['W1', 'W2']);
    // Byte for byte the snapshot of the same ledger with no supersession at all: the
    // cross-stream reference is not merely tolerated, it changes nothing.
    const { supersedes_assertion_id: _dropped, ...plainB } = fromB;
    expect(across.hash).toBe(computeSnapshot([ofA, plainB], query).hash);

    // The same reference, from W1's OWN stream, does close it.
    const fromA = { ...fromB, assertion_id: 'W3', claim_stream_id: 'sA' };
    const within = computeSnapshot([ofA, fromA], query);
    expect(within.in_scope).toEqual(['W3']);
    expect(pairs(within.excluded)).toEqual(['W1=superseded']);

    // Same for a retraction across streams.
    const retractFromB = envelope({
      assertion_id: 'W4',
      claim_stream_id: 'sB',
      operation: 'retract',
      target_assertion_id: 'W1',
      statement: undefined,
      valid_time: UNKNOWN_VALIDITY,
      recorded_at: '2026-03-10T00:00:00Z',
    });
    const retracted = computeSnapshot([ofA, retractFromB], query);
    expect(retracted.in_scope).toEqual(['W1']);
    expect(pairs(retracted.excluded)).toEqual(['W4=is_retraction']);
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
    expect(() => computeSnapshot(LEDGER, { time_axis: 'valid', valid_at: '2026-02-29' })).toThrow(
      /not a calendar date/
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
      {
        basic: {
          scenario: 'basic',
          heads: headsOf(LEDGER),
          cases: [T2_CASE],
          chain: { findings: [] },
        },
      }
    );
    const report = runVerify(root);
    expect(report.queries).toEqual([{ scenario: 'basic', id: 't2', status: 'PASS', diff: [] }]);
    expect(report.chains[0]).toMatchObject({ scenario: 'basic', status: 'PASS', envelopes: 3 });
    expect(report.totals).toEqual({ pass: 2, fail: 0 });
    expect(report.assumptions).toEqual([]);
    expect(report.ok).toBe(true);

    await run(['--fixtures', root]);
    expect(logged).toContain('PASS basic/t2');
    expect(logged.some((l) => l.startsWith('CHAIN PASS basic'))).toBe(true);
    expect(logged.some((l) => /SUMMARY: 2 PASS, 0 FAIL/.test(l))).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('a case file without heads verifies the chain anyway, and says so', () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      { basic: { scenario: 'basic', cases: [T2_CASE], chain: { findings: [] } } }
    );
    const report = runVerify(root);
    expect(report.ok).toBe(true);
    expect(report.assumptions).toEqual(
      expect.arrayContaining([expect.stringMatching(/no 'heads' block/)])
    );
  });

  test('a committed head that no longer names the last line is a CHAIN FAIL', () => {
    const cut = LEDGER.slice(0, 2);
    writeFixtures(
      root,
      { cut },
      { cut: { scenario: 'cut', heads: headsOf(LEDGER), cases: [], chain: { findings: [] } } }
    );
    const report = runVerify(root);
    expect(report.chains[0].status).toBe('FAIL');
    expect(report.chains[0].diff[0]).toMatch(/stream_head_mismatch/);
    expect(report.ok).toBe(false);
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
    const removed = PLAIN.filter((e) => e.assertion_id !== 'P2');
    writeFixtures(
      root,
      { gap: removed },
      {
        gap: {
          scenario: 'gap',
          cases: [],
          chain: {
            findings: [
              { claim_stream_id: 's3', sequence_no: 3, verdict: 'sequence_gap' },
              { claim_stream_id: 's3', sequence_no: 3, verdict: 'previous_checksum_mismatch' },
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

  test('a case file naming its ledger by path resolves to the scenario basename', () => {
    writeFixtures(
      root,
      { aliased: LEDGER },
      {
        aliased: {
          ledger: 'scenarios/aliased.jsonl',
          heads: headsOf(LEDGER),
          cases: [T2_CASE],
          chain: { findings: [] },
        },
      }
    );
    const report = runVerify(root);
    expect(report.queries).toEqual([{ scenario: 'aliased', id: 't2', status: 'PASS', diff: [] }]);
    expect(report.unchecked).toEqual([]);
    expect(report.assumptions).toEqual(
      expect.arrayContaining([expect.stringMatching(/read key 'ledger' as 'scenario'/)])
    );
    expect(report.ok).toBe(true);
  });

  test('a case file naming a scenario that does not exist fails, and the orphan ledger is audited', () => {
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

  test('a scenario no case file refers to is a FAIL even when its chain is clean (mutation: unchecked ignored → red)', () => {
    writeFixtures(
      root,
      { checked: LEDGER, lonely: PLAIN },
      {
        checked: {
          scenario: 'checked',
          heads: headsOf(LEDGER),
          cases: [T2_CASE],
          chain: { findings: [] },
        },
      }
    );
    const report = runVerify(root);
    expect(report.unchecked).toEqual(['lonely']);
    const lonely = report.chains.find((c) => c.scenario === 'lonely');
    expect(lonely).toMatchObject({ caseFile: '(none)', status: 'FAIL', envelopes: 3, findings: 0 });
    expect(lonely?.diff[0]).toMatch(/no case file/);
    // Everything else passed: the run is red for the hole in the bench and nothing else.
    expect(report.totals).toEqual({ pass: 2, fail: 1 });
    expect(report.ok).toBe(false);
  });

  test('the chain of an orphan scenario is audited all the same: a tampered checksum surfaces', () => {
    const tampered = LEDGER.map((e) =>
      e.assertion_id === 'A2'
        ? { ...e, statement: { subject: 'acme', predicate: 'ceo', object: 'mallory' } }
        : e
    );
    writeFixtures(
      root,
      { checked: LEDGER, tampered },
      {
        checked: {
          scenario: 'checked',
          heads: headsOf(LEDGER),
          cases: [T2_CASE],
          chain: { findings: [] },
        },
      }
    );
    const report = runVerify(root);
    const orphan = report.chains.find((c) => c.scenario === 'tampered');
    expect(orphan?.status).toBe('FAIL');
    expect(orphan?.findings).toBe(1);
    expect(orphan?.diff.join(' | ')).toMatch(/checksum_mismatch/);
  });

  test('a PRESENT expected field of the wrong type is a recorded problem, not "absent"', () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      {
        basic: {
          scenario: 'basic',
          heads: headsOf(LEDGER),
          chain: { findings: [] },
          cases: [
            {
              name: 'malformed',
              query: T2_CASE.query,
              expected: {
                in_scope: 'A1',
                hash: 1,
                excluded: T2_CASE.expected.excluded,
                undecided: [],
              },
            },
          ],
        },
      }
    );
    const report = runVerify(root);
    // The two well-formed fields still match, so a loader that dropped the malformed ones
    // would report a fully green run: the problems are the only thing that fails it.
    expect(report.queries.find((q) => q.id === 'malformed')).toMatchObject({ status: 'PASS' });
    const problems = report.queries.filter((q) => q.id === 'basic.json').map((q) => q.diff[0]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/in_scope: present but not an array/),
        expect.stringMatching(/hash: present but not a string/),
      ])
    );
    expect(report.ok).toBe(false);
  });

  test('a malformed query instant is a recorded problem and is never normalised', () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      {
        basic: {
          scenario: 'basic',
          heads: headsOf(LEDGER),
          chain: { findings: [] },
          cases: [
            {
              name: 'leap',
              query: { time_axis: 'valid', valid_at: '2026-02-29' },
              expected: { in_scope: [], excluded: [], undecided: [] },
            },
          ],
        },
      }
    );
    const report = runVerify(root);
    const problems = report.queries.filter((q) => q.id === 'basic.json').map((q) => q.diff[0]);
    expect(problems).toEqual([
      expect.stringMatching(/valid_at: "2026-02-29" is not a calendar ISO 8601 bound/),
    ]);
    // And no snapshot was produced for it: a normalising parser would have answered for
    // 2026-03-01 instead of refusing.
    const leap = report.queries.find((q) => q.id === 'leap');
    expect(leap?.status).toBe('FAIL');
    expect(leap?.diff[0]).toMatch(/snapshot error: not a calendar date/);
    expect(report.ok).toBe(false);
  });

  test('an envelope of another schema_version is a scenario ERROR, never an assumption', () => {
    const foreign = LEDGER.map((e) => ({ ...e, schema_version: 'temporal-assertion/v2' }));
    writeFixtures(
      root,
      { foreign },
      { foreign: { scenario: 'foreign', cases: [T2_CASE], chain: { findings: [] } } }
    );
    const report = runVerify(root);
    expect(report.chains[0].status).toBe('FAIL');
    expect(report.chains[0].diff[0]).toMatch(
      /schema_version "temporal-assertion\/v2" is not temporal-assertion\/v1/
    );
    expect(report.queries[0].status).toBe('FAIL');
    expect(report.assumptions.some((a) => /schema_version/.test(a))).toBe(false);
    expect(report.ok).toBe(false);
  });

  test('an envelope the closed shape refuses is a scenario ERROR: the oracle never hashes it', () => {
    const broken = LEDGER.map((e) =>
      e.assertion_id === 'A1' ? { ...e, sequence_id: 7 } : e
    ) as unknown as Envelope[];
    writeFixtures(
      root,
      { broken },
      { broken: { scenario: 'broken', cases: [], chain: { findings: [] } } }
    );
    const report = runVerify(root);
    expect(report.chains[0].status).toBe('FAIL');
    expect(report.chains[0].diff[0]).toMatch(/sequence_id — not a member/);
    expect(report.ok).toBe(false);
  });

  test('--json prints the report', async () => {
    writeFixtures(
      root,
      { basic: LEDGER },
      {
        basic: {
          scenario: 'basic',
          heads: headsOf(LEDGER),
          cases: [T2_CASE],
          chain: { findings: [] },
        },
      }
    );
    await run(['--fixtures', root, '--json']);
    const parsed = JSON.parse(logged.join('\n'));
    expect(parsed.ok).toBe(true);
    expect(parsed.totals).toEqual({ pass: 2, fail: 0 });
  });
});

// ============================================================================
// The preAction preflight: the offline verifier resolves no base URL
// ============================================================================

describe('cli preflight', () => {
  const previousInsecure = process.env.DEPOSIUM_INSECURE;

  beforeEach(() => {
    configMock.getConfig.mockReset();
    configMock.getBaseUrl.mockReset();
    configMock.getConfig.mockImplementation(() => ({ deposiumUrl: 'https://api.example.com' }));
    configMock.getBaseUrl.mockImplementation(() => 'https://api.example.com');
    delete process.env.DEPOSIUM_INSECURE;
  });

  afterEach(() => {
    if (previousInsecure === undefined) {
      delete process.env.DEPOSIUM_INSECURE;
    } else {
      process.env.DEPOSIUM_INSECURE = previousInsecure;
    }
  });

  test('the offline commands are the ones that need no API', () => {
    expect(usesApi('temporal-assertion')).toBe(false);
    expect(usesApi('config')).toBe(false);
    expect(usesApi('auth')).toBe(false);
    expect(usesApi(undefined)).toBe(false);
    expect(usesApi('search')).toBe(true);
  });

  test('temporal-assertion reads NO configuration at all (mutation: getConfig before the list → red)', () => {
    runPreflight('temporal-assertion', {});
    expect(configMock.getConfig).not.toHaveBeenCalled();
    expect(configMock.getBaseUrl).not.toHaveBeenCalled();
    runPreflight('search', {});
    expect(configMock.getConfig).toHaveBeenCalledTimes(1);
    expect(configMock.getBaseUrl).toHaveBeenCalledTimes(1);
  });

  test('an http non-localhost URL without --insecure stops an API command, never the verifier', () => {
    configMock.getBaseUrl.mockImplementation(() => {
      throw new Error('Insecure HTTP connection refused for deposium.example.com');
    });
    expect(() => runPreflight('search', {})).toThrow(/Insecure HTTP connection refused/);
    expect(() => runPreflight('temporal-assertion', {})).not.toThrow();
    expect(() => runPreflight('config', {})).not.toThrow();
  });

  test('--insecure reaches the environment before the no-API list is consulted', () => {
    runPreflight('temporal-assertion', { insecure: true });
    expect(process.env.DEPOSIUM_INSECURE).toBe('true');
    expect(configMock.getConfig).not.toHaveBeenCalled();
  });

  test('an absent --insecure still lets DEPOSIUM_INSECURE decide for an API command', () => {
    process.env.DEPOSIUM_INSECURE = 'true';
    runPreflight('search', {});
    expect(configMock.getBaseUrl).toHaveBeenCalledWith(expect.anything(), { insecure: true });
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
  'README.md': '1ce1a330c1c2f32317bb25970fb5274a8dfe84c1504f1c008c61adcb8933309c',
  'cases/01-simple-dated.json': '3234b738759cc678113292da4b007a4b257b746b5f1d25026ef4ba9164858d29',
  'cases/02-correction.json': '4fde569063d97a340aedb96c811bedc397ce99f4416cfc35f1d087ee5715bd81',
  'cases/03-retraction.json': 'bca49283ed9293afc3d4a5f22d333f6045343941ad3eda3adcae2d65489584d0',
  'cases/04-retroactive.json': '8aa002a816eeb08076bf6309603964e9cf236f6b4398650479c6f79bc365edf0',
  'cases/05-open-vs-unknown.json':
    '92b5ec5dd1bb9e4e19fc5753c658e0ae189265574b86e43a4ef39239b9bdd065',
  'cases/06-two-authorities.json':
    'd10f3ac1fdc61b06eb97dfced4832801359981cdf2e50a08ad6d8fe2e543fa6a',
  'cases/07-kind-variations.json':
    'ec40b6a724c90c812453cd476b98bfb59fd326bfd30e1c0b2bea132551858af0',
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

interface VendoredCaseFile {
  scenario: string;
  ledger: string;
  heads: Record<string, StreamHead>;
  chain: { streams: number; envelopes: number; ok: boolean; findings: unknown[] };
  cases: Array<{
    name: string;
    query: SnapshotQuery;
    expected: {
      in_scope: string[];
      excluded: Array<{ assertion_id: string; reason: string }>;
      undecided: Array<{ assertion_id: string; reason: string }>;
      hash: string;
    };
  }>;
}

function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => statSync(join(root, entry)).isFile())
    .sort();
}

function vendoredCaseFiles(): VendoredCaseFile[] {
  return listFiles(join(VENDORED_ROOT, 'cases')).map(
    (name) =>
      JSON.parse(readFileSync(join(VENDORED_ROOT, 'cases', name), 'utf8')) as VendoredCaseFile
  );
}

function vendoredLedger(scenario: string): Envelope[] {
  return readFileSync(join(VENDORED_ROOT, 'scenarios', `${scenario}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Envelope);
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

  test('every vendored envelope passes the CLI closed-shape validation', () => {
    let checked = 0;
    for (const spec of vendoredCaseFiles()) {
      for (const line of vendoredLedger(spec.scenario)) {
        expect(validateEnvelope(line), `${spec.scenario} / ${line.assertion_id}`).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('every vendored ledger verifies against its committed heads (mutation: heads ignored → red on the cut)', () => {
    for (const spec of vendoredCaseFiles()) {
      const ledger = vendoredLedger(spec.scenario);
      const report = verifyLedgerChain(ledger, { heads: spec.heads });
      expect(report.findings, spec.scenario).toEqual([]);
      expect(report.envelopes).toBe(spec.chain.envelopes);
      expect(report.streams).toBe(spec.chain.streams);

      // Cut the tail of the longest stream: a shorter stream is a valid stream WITHOUT a
      // head, and the cut shows ONLY against the committed one.
      const stream = Object.keys(spec.heads).sort(
        (a, b) => spec.heads[b].sequence_no - spec.heads[a].sequence_no
      )[0];
      const lastNo = spec.heads[stream].sequence_no;
      const cut = ledger.filter(
        (e) => e.claim_stream_id !== stream || (e.integrity?.sequence_no ?? 0) < lastNo
      );
      expect(cut.length, spec.scenario).toBe(ledger.length - 1);
      const blind = verifyLedgerChain(cut).findings.filter(
        (f) => f.verdict !== 'unresolved_target'
      );
      expect(blind, `${spec.scenario} without heads`).toEqual([]);
      // A one-line stream cut to nothing is `stream_absent`; a longer one keeps its head.
      expect(
        verifyLedgerChain(cut, { heads: spec.heads }).findings.map((f) => f.verdict),
        spec.scenario
      ).toContain(lastNo === 1 ? 'stream_absent' : 'stream_head_mismatch');
    }
  });

  test('a whole vendored stream removed under its committed head is stream_absent', () => {
    const spec = vendoredCaseFiles().find((s) => Object.keys(s.heads).length > 1);
    expect(spec).toBeDefined();
    const streams = Object.keys(spec!.heads);
    const kept = vendoredLedger(spec!.scenario).filter((e) => e.claim_stream_id !== streams[0]);
    expect(verifyLedgerChain(kept).findings).toEqual([]);
    expect(verifyLedgerChain(kept, { heads: spec!.heads }).findings).toEqual([
      expect.objectContaining({ claim_stream_id: streams[0], verdict: 'stream_absent' }),
    ]);
  });

  test('cross-implementation agreement: the CLI snapshot hash equals every expected.hash MCPs wrote', () => {
    let compared = 0;
    for (const spec of vendoredCaseFiles()) {
      const ledger = vendoredLedger(spec.scenario);
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
