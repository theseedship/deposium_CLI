/**
 * Tests for `utils/parsers.ts` — NaN-safe CLI option parsers.
 *
 * Regression coverage for M5 (audit) — raw `parseInt(options.X, 10)` used
 * to push NaN to the server on garbage input; the new helpers throw
 * actionable client-side errors instead.
 */
import { describe, test, expect } from 'vitest';
import { parseIntOrThrow, parseOptionalInt, parseFloatOrThrow } from '../utils/parsers';

describe('parseIntOrThrow', () => {
  test('valid integer string → number', () => {
    expect(parseIntOrThrow('42', '--limit')).toBe(42);
    expect(parseIntOrThrow('0', '--limit')).toBe(0);
    expect(parseIntOrThrow('-5', '--limit')).toBe(-5);
  });

  test('non-numeric input throws with option name + value', () => {
    expect(() => parseIntOrThrow('abc', '--top-k')).toThrow(/--top-k/);
    expect(() => parseIntOrThrow('abc', '--top-k')).toThrow(/"abc"/);
  });

  test('undefined and empty string throw', () => {
    expect(() => parseIntOrThrow(undefined, '--limit')).toThrow(/--limit requires/);
    expect(() => parseIntOrThrow('', '--limit')).toThrow(/--limit requires/);
  });

  test('partial-numeric strings throw rather than truncating to the prefix', () => {
    // Raw parseInt('10abc', 10) returns 10 silently — that's the footgun
    // we close. Reject any input that isn't a clean integer literal.
    expect(() => parseIntOrThrow('10abc', '--limit')).toThrow(/--limit must be an integer/);
    expect(() => parseIntOrThrow('100GB', '--limit')).toThrow(/--limit must be an integer/);
    expect(() => parseIntOrThrow('10.5', '--limit')).toThrow(/--limit must be an integer/);
    expect(() => parseIntOrThrow('10 ', '--limit')).not.toThrow(); // whitespace is trimmed
    expect(parseIntOrThrow(' -42 ', '--limit')).toBe(-42); // negatives and pad-whitespace OK
  });
});

describe('parseOptionalInt', () => {
  test('undefined → undefined (no throw)', () => {
    expect(parseOptionalInt(undefined, '--limit')).toBeUndefined();
  });

  test('present-but-invalid throws', () => {
    expect(() => parseOptionalInt('abc', '--limit')).toThrow(/--limit/);
  });

  test('valid → number', () => {
    expect(parseOptionalInt('100', '--limit')).toBe(100);
  });
});

describe('parseFloatOrThrow', () => {
  test('valid float → number', () => {
    expect(parseFloatOrThrow('0.5', '--score')).toBe(0.5);
    expect(parseFloatOrThrow('1', '--score')).toBe(1);
  });

  test('non-numeric throws', () => {
    expect(() => parseFloatOrThrow('high', '--score')).toThrow(/--score/);
  });

  test('undefined and empty string throw', () => {
    expect(() => parseFloatOrThrow(undefined, '--score')).toThrow(/--score requires/);
    expect(() => parseFloatOrThrow('', '--score')).toThrow(/--score requires/);
  });
});
