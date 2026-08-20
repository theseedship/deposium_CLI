/**
 * Internal helpers shared by the MCP client (request IDs, retry classification,
 * sleep, error sanitization, axios error → tool result mapping).
 *
 * Not part of the public API — `mcp-client.ts` consumes these internally.
 *
 * @module client/internals
 */

import type { AxiosError } from 'axios';
import { randomUUID } from 'node:crypto';
import type { MCPToolResult } from './types';
import { buildAuthError } from './auth-error';

/**
 * Parse a single SSE event frame into `{ eventType, dataStr }`.
 *
 * Per the SSE spec (https://html.spec.whatwg.org/multipage/server-sent-events.html):
 *   - Multiple `data:` lines in one event are concatenated with `\n`
 *     (NOT overwritten — the previous bug).
 *   - The colon may or may not be followed by a single space; the spec
 *     strips one optional leading space from each line's content.
 *   - Lines starting with `:` are comments (heartbeats); ignore them.
 *   - Unknown field names are ignored.
 *
 * Returns empty strings when no event/data was found — caller decides
 * whether that's a skip-this-chunk or a noop.
 */
export function parseSSEEvent(part: string): { eventType: string; dataStr: string } {
  let eventType = '';
  const dataLines: string[] = [];
  for (const line of part.split('\n')) {
    if (line.startsWith(':')) continue; // SSE comment / heartbeat
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon);
    // Strip exactly one optional leading space from the value.
    const value = line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') eventType = value.trim();
    else if (field === 'data') dataLines.push(value);
  }
  return { eventType, dataStr: dataLines.join('\n') };
}

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Check if an error is retryable (transient network/server errors).
 * Internal — used only by `withRetry` below.
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response received)
  if (!error.response) {
    return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';
  }

  // Server errors that are typically transient
  const status = error.response.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Sleep for a specified duration. Internal — used by `withRetry`'s
 * exponential backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize error data to remove stack traces. Internal — used by
 * `createAxiosErrorResult` below.
 */
function sanitizeErrorData(
  errorData: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!errorData) return {};

  const result: Record<string, unknown> = {};

  // Use top-level message first, fallback to nested error.message
  if (errorData.message) {
    result.message = errorData.message;
  } else if ((errorData.error as Record<string, unknown>)?.message) {
    result.message = (errorData.error as Record<string, unknown>).message;
  }

  // Include safe error details (exclude stack traces)
  if (errorData.error && typeof errorData.error === 'object') {
    const { stack: _stack, ...safeError } = errorData.error as Record<string, unknown>;
    if (Object.keys(safeError).length > 0) {
      result.error = safeError;
    }
  }

  if (errorData.details) result.details = errorData.details;

  return result;
}

/**
 * Run an async operation with retry-on-transient-error and exponential
 * backoff. Used by `MCPClient.listTools`, `health`, `listSpaces`, and
 * the self-service path so the same shape doesn't have to be inlined
 * four times.
 *
 * The operation receives the `requestId` (so the caller can stamp the
 * `X-Request-ID` header). The optional `onRetry` callback fires before
 * the `sleep` so the caller can update a spinner or log.
 *
 * Throws the last error after all retries are exhausted; the caller is
 * responsible for mapping that to a domain message (`buildAuthError`,
 * `ECONNREFUSED` → friendly text, etc).
 */
export async function withRetry<T>(
  op: (requestId: string) => Promise<T>,
  config: {
    maxRetries: number;
    retryBaseDelay: number;
    requestId?: string;
    onRetry?: (attempt: number, delay: number) => void;
  }
): Promise<T> {
  const requestId = config.requestId ?? generateRequestId();
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await op(requestId);
    } catch (error) {
      lastError = error;
      const axiosError = error as AxiosError;
      const canRetry =
        // Only retry transient errors, and only while we have attempts left.
        // Beyond maxRetries we stop polling and surface the failure.
        // (axios.isAxiosError check lives inside `isRetryableError`'s
        // contract — it only inspects fields that exist on AxiosError.)
        attempt < config.maxRetries && isRetryableError(axiosError);
      if (!canRetry) throw error;

      const delay = config.retryBaseDelay * Math.pow(2, attempt);
      config.onRetry?.(attempt + 1, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create an error result from an Axios error
 */
export function createAxiosErrorResult(
  error: AxiosError,
  baseUrl: string,
  requestId: string
): { result: MCPToolResult; shouldThrow: boolean; errorToThrow?: Error } {
  if (error.code === 'ECONNREFUSED') {
    return {
      result: { content: null, isError: true },
      shouldThrow: true,
      errorToThrow: new Error(
        `Cannot connect to Deposium API at ${baseUrl}\nMake sure the Deposium server is running`
      ),
    };
  }

  if (error.response?.status === 401) {
    return {
      result: { content: null, isError: true },
      shouldThrow: true,
      errorToThrow: buildAuthError(error.response?.data),
    };
  }

  const errorData = error.response?.data as Record<string, unknown> | undefined;
  const sanitized = sanitizeErrorData(errorData);

  return {
    result: {
      content: {
        message: sanitized.message ?? error.message,
        status: error.response?.status,
        requestId,
        ...sanitized,
      },
      isError: true,
    },
    shouldThrow: false,
  };
}
