/**
 * MCP authentication error types and helpers.
 *
 * Re-exported from `mcp-client.ts` for backward-compat with existing imports.
 *
 * @module client/auth-error
 */

/**
 * Stable enum of MCP auth error codes returned by `/api/cli/mcp` (HTTP 401).
 *
 * Mirrors the server-side `ApiKeyErrorCode` enum in deposium_MCPs. Keys are
 * stable across server versions; `MCPAuthError.message` is human copy and
 * may change wording — switch on `errorCode`, not on `message`.
 */
export type MCPAuthErrorCode =
  | 'key_missing'
  | 'format_invalid'
  | 'key_invalid'
  | 'permission_denied'
  | 'rate_limited'
  | 'auth_unavailable'
  | 'auth_timeout'
  | 'auth_internal_error'
  | 'unknown';

/**
 * Auth-specific error thrown by `MCPClient` methods on HTTP 401 from
 * `/api/cli/mcp` (or any endpoint that proxies to MCP backend auth).
 *
 * Distinct from a plain `Error` so callers can do:
 *
 *   try { await client.callTool(...) }
 *   catch (e) {
 *     if (e instanceof MCPAuthError && e.errorCode === 'format_invalid') {...}
 *   }
 *
 * Falls back to a plain `Error` if the response doesn't match the structured
 * shape (older servers, non-CLI endpoints, etc.) — see `buildAuthError`.
 */
export class MCPAuthError extends Error {
  readonly errorCode: MCPAuthErrorCode;
  readonly hint?: string;
  readonly docsUrl?: string;

  constructor(input: { message: string; error_code?: string; hint?: string; docs?: string }) {
    const lines = [`Authentication failed (401): ${input.message}`];
    if (input.hint) lines.push(`💡 ${input.hint}`);
    if (input.docs) lines.push(`📖 ${input.docs}`);
    super(lines.join('\n'));
    this.name = 'MCPAuthError';
    this.errorCode = (input.error_code as MCPAuthErrorCode | undefined) ?? 'unknown';
    this.hint = input.hint;
    this.docsUrl = input.docs;
  }
}

/**
 * Map a 401 response body to a typed `MCPAuthError`.
 *
 * The /api/cli/mcp proxy returns structured errors of the form:
 *   { error: "MCP Auth Error", message, error_code, hint, docs, details }
 *
 * If the body matches that shape, return an `MCPAuthError`. Otherwise fall
 * back to a plain `Error` for legacy/non-MCP-Auth shapes.
 */
export function buildAuthError(responseData: unknown): Error {
  const body = (responseData ?? {}) as Partial<{
    error: string;
    message: string;
    error_code: string;
    hint: string;
    docs: string;
  }>;

  if (body.error_code) {
    return new MCPAuthError({
      message: body.message ?? 'Invalid or missing API key',
      error_code: body.error_code,
      hint: body.hint,
      docs: body.docs,
    });
  }

  return new Error(
    'Authentication failed (401)\n' + (body.message ?? 'Invalid or missing API key')
  );
}
