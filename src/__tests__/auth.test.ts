/**
 * Tests for src/utils/auth.ts
 *
 * Tests API key validation and masking utilities.
 * Note: Interactive prompts are tested separately or mocked.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

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

import {
  validateApiKeyWithServer,
  maskApiKey,
  ensureAuthenticated,
  promptApiKey,
} from '../utils/auth';
import { getApiKey, setApiKey, hasApiKey } from '../utils/config';
import inquirer from 'inquirer';

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

  // ============================================================================
  // promptApiKey — interactive prompt + validate function
  // ============================================================================
  describe('promptApiKey', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    test('returns trimmed key from inquirer', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ apiKey: '  some-valid-key  ' });
      const key = await promptApiKey();
      expect(key).toBe('some-valid-key');
    });

    test('uses password input with mask=*', async () => {
      let captured: unknown;
      vi.mocked(inquirer.prompt).mockImplementationOnce(async (questions: unknown) => {
        captured = questions;
        return { apiKey: 'valid-key-12345' };
      });
      await promptApiKey();
      const q = (captured as Array<Record<string, unknown>>)[0];
      expect(q.type).toBe('password');
      expect(q.mask).toBe('*');
    });

    test('validate fn rejects empty key', async () => {
      let validate: ((s: string) => string | boolean) | undefined;
      vi.mocked(inquirer.prompt).mockImplementationOnce(async (questions: unknown) => {
        const q = (questions as Array<Record<string, unknown>>)[0];
        validate = q.validate as typeof validate;
        return { apiKey: 'valid-key-12345' };
      });
      await promptApiKey();
      expect(validate?.('')).toBe('API key cannot be empty');
      expect(validate?.('   ')).toBe('API key cannot be empty');
    });

    test('validate fn rejects short keys', async () => {
      let validate: ((s: string) => string | boolean) | undefined;
      vi.mocked(inquirer.prompt).mockImplementationOnce(async (questions: unknown) => {
        const q = (questions as Array<Record<string, unknown>>)[0];
        validate = q.validate as typeof validate;
        return { apiKey: 'valid-key-12345' };
      });
      await promptApiKey();
      expect(validate?.('short')).toBe('API key seems too short');
    });

    test('validate fn accepts well-formed keys', async () => {
      let validate: ((s: string) => string | boolean) | undefined;
      vi.mocked(inquirer.prompt).mockImplementationOnce(async (questions: unknown) => {
        const q = (questions as Array<Record<string, unknown>>)[0];
        validate = q.validate as typeof validate;
        return { apiKey: 'valid-key-12345' };
      });
      await promptApiKey();
      expect(validate?.('dep_live_xxxxxxxxxxxx')).toBe(true);
    });
  });

  // ============================================================================
  // ensureAuthenticated — orchestration of stored key + retry-prompt loop
  // ============================================================================
  describe('ensureAuthenticated', () => {
    const originalFetch = globalThis.fetch;

    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      logSpy.mockRestore();
      vi.restoreAllMocks();
    });

    function mockFetchResponse(status: number, body: unknown = {}) {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: status === 500 ? 'Internal Server Error' : 'OK',
          json: () => Promise.resolve(body),
        } as Response)
      );
    }

    test('stored key valid → returns it without prompting', async () => {
      vi.mocked(hasApiKey).mockReturnValue(true);
      vi.mocked(getApiKey).mockReturnValue('stored-valid-key');
      mockFetchResponse(200, { valid: true });

      const result = await ensureAuthenticated('http://localhost:3000');

      expect(result).toBe('stored-valid-key');
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(setApiKey).not.toHaveBeenCalled();
    });

    test('stored key invalid → falls through to prompt loop and saves new key', async () => {
      vi.mocked(hasApiKey).mockReturnValue(true);
      vi.mocked(getApiKey).mockReturnValue('stale-key');
      // first call (stored validation) returns 200 with valid:false → invalid
      // second call (prompted key validation) returns 200 with valid:true
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: false }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true }),
        } as Response);
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ apiKey: 'fresh-key-12345' });

      const result = await ensureAuthenticated('http://localhost:3000');

      expect(result).toBe('fresh-key-12345');
      expect(setApiKey).toHaveBeenCalledWith('fresh-key-12345');
    });

    test('stored key + connection error → returns stored key with warning', async () => {
      vi.mocked(hasApiKey).mockReturnValue(true);
      vi.mocked(getApiKey).mockReturnValue('offline-key');
      const connErr = new Error('fetch failed');
      (connErr as NodeJS.ErrnoException).cause = { code: 'ECONNREFUSED' };
      globalThis.fetch = vi.fn(() => Promise.reject(connErr));

      const result = await ensureAuthenticated('http://localhost:3000');

      expect(result).toBe('offline-key');
      expect(inquirer.prompt).not.toHaveBeenCalled();
      // warned the user
      const logs = logSpy.mock.calls.map((c) => String(c[0]));
      expect(logs.some((s) => s.includes('Could not validate'))).toBe(true);
    });

    test('no stored key → prompts, validates, saves', async () => {
      vi.mocked(hasApiKey).mockReturnValue(false);
      mockFetchResponse(200, { valid: true });
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ apiKey: 'new-key-12345' });

      const result = await ensureAuthenticated('http://localhost:3000');

      expect(result).toBe('new-key-12345');
      expect(setApiKey).toHaveBeenCalledWith('new-key-12345');
    });

    test('first attempt invalid, second succeeds (within retry loop)', async () => {
      vi.mocked(hasApiKey).mockReturnValue(false);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true }),
        } as Response);
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ apiKey: 'wrong-key-12345' })
        .mockResolvedValueOnce({ apiKey: 'right-key-12345' });

      const result = await ensureAuthenticated('http://localhost:3000');

      expect(result).toBe('right-key-12345');
      expect(setApiKey).toHaveBeenCalledWith('right-key-12345');
      expect(setApiKey).toHaveBeenCalledTimes(1);
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
    });

    test('all 3 attempts fail → process.exit(1)', async () => {
      vi.mocked(hasApiKey).mockReturnValue(false);
      // every fetch returns 401 (invalid key)
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
        } as Response)
      );

      vi.mocked(inquirer.prompt).mockResolvedValue({ apiKey: 'always-wrong-12345' });

      const exitError = new Error('__TEST_EXIT__');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw exitError;
      });

      await expect(ensureAuthenticated('http://localhost:3000')).rejects.toBe(exitError);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(inquirer.prompt).toHaveBeenCalledTimes(3);
      expect(setApiKey).not.toHaveBeenCalled();
    });

    test('all attempts throw on network errors → process.exit(1)', async () => {
      vi.mocked(hasApiKey).mockReturnValue(false);
      const connErr = new Error('fetch failed');
      (connErr as NodeJS.ErrnoException).cause = { code: 'ECONNREFUSED' };
      globalThis.fetch = vi.fn(() => Promise.reject(connErr));

      vi.mocked(inquirer.prompt).mockResolvedValue({ apiKey: 'doesnt-matter-12345' });

      const exitError = new Error('__TEST_EXIT__');
      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw exitError;
      });

      await expect(ensureAuthenticated('http://localhost:3000')).rejects.toBe(exitError);
      expect(inquirer.prompt).toHaveBeenCalledTimes(3);
    });
  });
});
