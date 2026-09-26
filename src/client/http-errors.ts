/**
 * Shared HTTP error helpers — error classification and friendly-message
 * construction reused by every code path that talks to the Deposium API
 * (axios + native fetch). Lives in its own module so:
 *   - There is ONE source of truth for the "Cannot connect" wording
 *     (previously duplicated in 5 places — diverged subtly over time).
 *   - `isNetworkDownError` in utils/auth.ts can keep matching this
 *     prefix even when one of those sites is refactored independently.
 *
 * @module client/http-errors
 */
import { AxiosHeaders, type AxiosError } from 'axios';
import { buildAuthError } from './auth-error';

/**
 * The canonical "server unreachable" error. Use this everywhere
 * ECONNREFUSED is classified at the HTTP layer (axios or native fetch).
 * The leading prefix `Cannot connect to Deposium API` is load-bearing —
 * `isNetworkDownError` in utils/auth.ts pattern-matches against it.
 */
export function connectionRefusedError(baseUrl: string): Error {
  return new Error(
    `Cannot connect to Deposium API at ${baseUrl}\n` + 'Make sure the Deposium server is running'
  );
}

function isCloudflareChallenge(error: AxiosError): boolean {
  const headers = error.response?.headers;
  const mitigation =
    headers instanceof AxiosHeaders
      ? headers.get('cf-mitigated')
      : Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === 'cf-mitigated')?.[1];
  return String(mitigation).toLowerCase() === 'challenge';
}

function forbiddenDetails(data: unknown): { code?: string; detail?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const body = data as Record<string, unknown>;
  return {
    code: typeof body.code === 'string' ? body.code : undefined,
    detail:
      typeof body.error === 'string'
        ? body.error
        : typeof body.message === 'string'
          ? body.message
          : undefined,
  };
}

function forbiddenError(error: AxiosError, baseUrl: string, path: string): Error {
  if (isCloudflareChallenge(error)) {
    return new Error(
      `Cloudflare browser challenge blocked the CLI request to ${baseUrl}${path} (403).\n` +
        'Contact Deposium support: CLI requests cannot complete browser challenges.'
    );
  }

  const { code, detail } = forbiddenDetails(error.response?.data);
  if (code === 'FEATURE_LOCKED') {
    return new Error(
      `Feature unavailable (403): ${detail ?? 'This feature is not enabled for your account.'}\n` +
        'Check your Deposium plan and enabled features.'
    );
  }

  return new Error(
    `Access denied (403) for ${path}${detail ? `: ${detail}` : ''}${code ? ` [${code}]` : ''}.\n` +
      'Check your API key scopes and account permissions, or contact Deposium support.'
  );
}

/**
 * Convert an axios error into a thrown domain error for the standard
 * cases (ECONNREFUSED, 401, 403, 404). Falls through (re-throws the
 * original) for unknown axios shapes; the caller handles the non-axios
 * path.
 *
 * Used by self-service HTTP methods. Endpoints with custom 404 wording
 * (e.g. `fetchValidateReport` saying "Report not found for run_id=...")
 * handle the 404 themselves and only delegate the ECONNREFUSED/401 cases.
 */
export function throwForKnownAxiosError(error: AxiosError, baseUrl: string, path: string): never {
  if (error.code === 'ECONNREFUSED') {
    throw connectionRefusedError(baseUrl);
  }
  if (error.response?.status === 401) {
    throw buildAuthError(error.response?.data);
  }
  if (error.response?.status === 403) {
    throw forbiddenError(error, baseUrl, path);
  }
  if (error.response?.status === 404) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    const detail = data?.error ?? data?.message ?? `Resource not found: ${path}`;
    throw new Error(`Not found (404): ${detail}`);
  }
  throw error;
}
