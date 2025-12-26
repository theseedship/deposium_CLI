/**
 * Tests for src/utils/auth.ts
 *
 * Tests API key validation and masking utilities.
 * Note: Interactive prompts are tested separately or mocked.
 */

import { describe, test, expect, afterEach, vi } from 'vitest';

// Mock the config module
vi.mock('../utils/config', () => ({
  getApiKey: vi.fn(() => undefined),
  setApiKey: vi.fn(() => {}),
  hasApiKey: vi.fn(() => false),
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    yellow: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(() => Promise.resolve({ apiKey: 'test-api-key-12345' })),
  },
}));

import { validateApiKeyWithServer, maskApiKey } from '../utils/auth';

describe('auth.ts', () => {
  describe('maskApiKey', () => {
    test('should mask long API keys showing first 8 chars', () => {
      const key = 'sk_live_1234567890abcdef';
      const masked = maskApiKey(key);
      expect(masked).toBe('sk_live_...');
    });

    test('should fully mask short API keys', () => {
      const key = 'short';
      const masked = maskApiKey(key);
      expect(masked).toBe('********');
    });

    test('should handle exactly 8 character keys', () => {
      const key = '12345678';
      const masked = maskApiKey(key);
      expect(masked).toBe('********');
    });

    test('should handle 9 character keys', () => {
      const key = '123456789';
      const masked = maskApiKey(key);
      expect(masked).toBe('12345678...');
    });
  });

  describe('validateApiKeyWithServer', () => {
    // Save original fetch
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test('should return true for valid API key', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true }),
        } as Response)
      );

      const result = await validateApiKeyWithServer('http://localhost:3000', 'valid-key');
      expect(result).toBe(true);
    });

    test('should return false for invalid API key (401)', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ valid: false }),
        } as Response)
      );

      const result = await validateApiKeyWithServer('http://localhost:3000', 'invalid-key');
      expect(result).toBe(false);
    });

    test('should throw on server error (500)', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        } as Response)
      );

      await expect(validateApiKeyWithServer('http://localhost:3000', 'some-key')).rejects.toThrow(
        'Validation failed'
      );
    });

    test('should return false when valid field is not true', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: false }),
        } as Response)
      );

      const result = await validateApiKeyWithServer('http://localhost:3000', 'key');
      expect(result).toBe(false);
    });

    test('should throw descriptive error on connection refused', async () => {
      const connectionError = new Error('fetch failed');
      (connectionError as NodeJS.ErrnoException).cause = { code: 'ECONNREFUSED' };

      globalThis.fetch = vi.fn(() => Promise.reject(connectionError));

      await expect(validateApiKeyWithServer('http://localhost:3000', 'key')).rejects.toThrow(
        'Cannot connect to Deposium API'
      );
    });

    test('should send correct headers', async () => {
      let capturedHeaders: HeadersInit | undefined;

      globalThis.fetch = vi.fn((url: string, options?: RequestInit) => {
        capturedHeaders = options?.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true }),
        } as Response);
      });

      await validateApiKeyWithServer('http://localhost:3000', 'test-key');

      expect(capturedHeaders).toBeDefined();
      const headers = capturedHeaders as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-API-Key']).toBe('test-key');
    });

    test('should call correct endpoint', async () => {
      let capturedUrl: string | undefined;

      globalThis.fetch = vi.fn((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true }),
        } as Response);
      });

      await validateApiKeyWithServer('https://api.example.com', 'key');

      expect(capturedUrl).toBe('https://api.example.com/api/auth/validate-key');
    });
  });
});
