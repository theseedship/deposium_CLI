/**
 * Type-safe option parsers — turn CLI string inputs into typed numbers
 * with actionable client-side errors instead of pushing `NaN` to the
 * server.
 *
 * Pair these with the existing `safeParseJSON` (in `utils/formatter.ts`)
 * for the JSON case.
 *
 * @module utils/parsers
 */

/**
 * Parse a CLI integer option. Throws with the option name on
 * non-numeric input or empty string. Commander already enforces "a
 * value is present" for `--opt <number>` so the empty check is purely
 * defensive.
 *
 * @param input  Raw string from commander (or `undefined` if the option
 *               wasn't provided AND no default was set — in that case
 *               the caller must guard before calling this helper).
 * @param optionName  Flag name for error messages (e.g. `--top-k`).
 *
 * @example
 *   const topK = parseIntOrThrow(options.topK, '--top-k');
 *   //   options.topK === 'abc' → throws
 *   //   options.topK === '10'  → 10
 */
export function parseIntOrThrow(input: string | undefined, optionName: string): number {
  if (input === undefined || input === '') {
    throw new Error(`${optionName} requires an integer value.`);
  }
  // Reject trailing garbage — `Number.parseInt('100GB', 10)` silently
  // returns 100, which is almost always a typo. Use a strict integer
  // pattern so `--limit=100GB` errors out instead.
  if (!/^-?\d+$/.test(input.trim())) {
    throw new Error(`${optionName} must be an integer (got: ${JSON.stringify(input)}).`);
  }
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${optionName} must be an integer (got: ${JSON.stringify(input)}).`);
  }
  return parsed;
}

/**
 * `parseIntOrThrow` variant for optional integers — returns `undefined`
 * when the input is `undefined`, throws on a present-but-invalid value.
 */
export function parseOptionalInt(
  input: string | undefined,
  optionName: string
): number | undefined {
  if (input === undefined) return undefined;
  return parseIntOrThrow(input, optionName);
}

/**
 * Parse a CLI float option (e.g. confidence threshold, evaluation
 * score). Throws on non-numeric input.
 */
export function parseFloatOrThrow(input: string | undefined, optionName: string): number {
  if (input === undefined || input === '') {
    throw new Error(`${optionName} requires a numeric value.`);
  }
  const parsed = Number.parseFloat(input);
  if (Number.isNaN(parsed)) {
    throw new Error(`${optionName} must be a number (got: ${JSON.stringify(input)}).`);
  }
  return parsed;
}
