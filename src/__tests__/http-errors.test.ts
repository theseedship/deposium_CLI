import { afterEach, describe, expect, test, vi } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { throwForKnownAxiosError } from '../client/http-errors';
import { postSSE } from '../client/sse-stream';

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

  test('preserves the original Axios response and server code for SDK callers', () => {
    const error = forbidden({ code: 'FEATURE_LOCKED', error: 'API access is locked' });
    let caught: unknown;
    try {
      throwForKnownAxiosError(error, 'https://app.deposium.ai', '/api/v1/documents/');
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
    expect(error.response?.status).toBe(403);
    expect((error.response?.data as { code: string }).code).toBe('FEATURE_LOCKED');
    expect(error.message).toMatch(/Feature unavailable \(403\)/);
  });
});

describe('SSE HTTP 403 errors', () => {
  afterEach(() => vi.restoreAllMocks());

  const context = { baseUrl: 'https://app.deposium.ai', userAgent: 'test-cli' };

  test('classifies a feature lock and retains structured status and code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'FEATURE_LOCKED', error: 'Chat is locked' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      postSSE('https://edge.deposium.ai/chat-stream', '{}', context, 'Chat stream')
    ).rejects.toMatchObject({
      status: 403,
      code: 'FEATURE_LOCKED',
      response: { status: 403, data: { code: 'FEATURE_LOCKED' } },
      message: expect.stringMatching(/Feature unavailable \(403\).*Chat is locked/s),
    });
  });

  test('classifies a Cloudflare HTML challenge without echoing its body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>private challenge token</html>', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge' },
      })
    );

    const caught = await postSSE(
      'https://edge.deposium.ai/chat-stream',
      '{}',
      context,
      'Chat stream'
    ).catch((error: unknown) => error);
    expect(caught).toMatchObject({
      status: 403,
      message: expect.stringMatching(/Cloudflare browser challenge/),
    });
    expect((caught as Error).message).not.toContain('private challenge token');
  });
});
