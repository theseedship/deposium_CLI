import { describe, expect, test } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { throwForKnownAxiosError } from '../client/http-errors';

function forbidden(data: unknown, headers: Record<string, string> = {}): AxiosError {
  const error = new AxiosError('Request failed with status code 403');
  error.response = {
    status: 403,
    statusText: 'Forbidden',
    data,
    headers: new AxiosHeaders(headers),
  } as AxiosResponse;
  return error;
}

describe('HTTP 403 errors', () => {
  test('explains a server-confirmed feature lock without guessing the required plan', () => {
    const error = forbidden({
      code: 'FEATURE_LOCKED',
      error: 'Fonctionnalite "api_access" non disponible dans votre plan.',
    });

    expect(() =>
      throwForKnownAxiosError(error, 'https://app.deposium.ai', '/api/v1/documents/')
    ).toThrow(/Feature unavailable \(403\).*api_access.*Check your Deposium plan/s);
  });

  test('identifies a Cloudflare challenge separately from a plan denial', () => {
    const error = forbidden('<html>challenge</html>', { 'cf-mitigated': 'challenge' });

    expect(() =>
      throwForKnownAxiosError(error, 'https://app.deposium.ai', '/api/v1/documents/')
    ).toThrow(/Cloudflare browser challenge.*CLI requests cannot complete browser challenges/s);
  });

  test('preserves a generic permission reason and code without calling it a plan lock', () => {
    const error = forbidden({
      code: 'insufficient_api_key_scope',
      error: 'Missing required API key scope: read',
    });

    expect(() =>
      throwForKnownAxiosError(error, 'https://app.deposium.ai', '/api/v1/documents/')
    ).toThrow(
      /Access denied \(403\).*Missing required API key scope: read.*insufficient_api_key_scope/s
    );
  });

  test('gives an actionable generic message when the 403 body is not JSON', () => {
    const error = forbidden('<html>Forbidden</html>');

    expect(() =>
      throwForKnownAxiosError(error, 'https://app.deposium.ai', '/api/v1/documents/')
    ).toThrow(/Access denied \(403\).*Check your API key scopes and account permissions/s);
  });
});
