/**
 * Internal helpers shared by the MCP client (request IDs, retry classification,
 * sleep, error sanitization, axios error → tool result mapping).
 *
 * Not part of the public API — `mcp-client.ts` consumes these internally.
 *
 * @module client/internals
 */

import type { AxiosError } from 'axios';
import type { MCPToolResult } from './types';
import { buildAuthError } from './auth-error';

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `cli-${timestamp}-${random}`;
}

/**
 * Check if an error is retryable (transient network/server errors)
 */
export function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response received)
  if (!error.response) {
    return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';
  }

  // Server errors that are typically transient
  const status = error.response.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize error data to remove stack traces
 */
export function sanitizeErrorData(
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
