/**
 * Error Handling Utilities
 *
 * Type-safe error message extraction and formatting.
 * This file has no dependencies to avoid circular imports.
 */

/**
 * Extract error message from unknown error type
 *
 * Handles:
 * - Error objects (returns .message)
 * - Strings (returns as-is)
 * - Objects with message property
 * - Everything else (stringified)
 *
 * @param error - Unknown error to extract message from
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Check if error is an Error instance with a specific code
 */
export function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code
  );
}

/**
 * Check if error has a cause with a specific code (Node.js fetch errors)
 */
export function hasErrorCauseWithCode(error: unknown, code: string): boolean {
  if (error && typeof error === 'object' && 'cause' in error) {
    const cause = (error as { cause: unknown }).cause;
    if (cause && typeof cause === 'object' && 'code' in cause) {
      return (cause as { code: string }).code === code;
    }
  }
  return false;
}
