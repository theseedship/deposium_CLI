/**
 * Tests for src/utils/config.ts
 *
 * Tests configuration management, environment variable handling,
 * and URL security validation.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    yellow: (s: string) => s,
    white: (s: string) => s,
    gray: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

// Store for mock conf values - defined inside factory to avoid hoisting issues
const confStore: Record<string, unknown> = {};

vi.mock('conf', () => ({
  default: class MockConf {
    get(key: string, defaultValue?: unknown) {
      return confStore[key] !== undefined ? confStore[key] : defaultValue;
    }
    set(key: string, value: unknown) {
      confStore[key] = value;
    }
    delete(key: string) {
      delete confStore[key];
    }
    clear() {
      Object.keys(confStore).forEach((key) => delete confStore[key]);
    }
    path = '/mock/path/config.json';
  },
}));

// Now import the module under test
import {
  validateUrlSecurity,
  getConfig,
  getBaseUrl,
  setConfig,
  getConfigPath,
} from '../utils/config';

describe('config.ts', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear the mock store
    Object.keys(confStore).forEach((key) => delete confStore[key]);
  });

  afterEach(() => {
    // Restore env vars
    process.env = { ...originalEnv };
  });

  describe('validateUrlSecurity', () => {
    test('should not warn for localhost URLs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateUrlSecurity('http://localhost:3000');
      validateUrlSecurity('http://127.0.0.1:3000');
      validateUrlSecurity('http://0.0.0.0:3000');
      validateUrlSecurity('http://myapp.local:3000');
      validateUrlSecurity('http://dev.localhost:3000');

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('should warn for non-localhost HTTP URLs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateUrlSecurity('http://api.example.com');

      expect(warnSpy).toHaveBeenCalled();
      const warning = warnSpy.mock.calls[0]?.[0] as string;
      expect(warning).toContain('Security Warning');
      warnSpy.mockRestore();
    });

    test('should not warn for HTTPS URLs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateUrlSecurity('https://api.example.com');

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('should respect silent option', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateUrlSecurity('http://api.example.com', true); // silent = true

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('should handle invalid URLs gracefully', () => {
      expect(() => validateUrlSecurity('not-a-valid-url')).not.toThrow();
      expect(() => validateUrlSecurity('')).not.toThrow();
    });
  });

  describe('getConfig', () => {
    test('should return default values when nothing is configured', () => {
      // Clear env vars
      delete process.env.DEPOSIUM_URL;
      delete process.env.DEPOSIUM_MCP_URL;
      delete process.env.DEPOSIUM_API_KEY;
      delete process.env.DEPOSIUM_TENANT;
      delete process.env.DEPOSIUM_SPACE;
      delete process.env.DEPOSIUM_OUTPUT;
      delete process.env.DEPOSIUM_SILENT;

      const config = getConfig();

      expect(config.outputFormat).toBe('table');
      expect(config.silentMode).toBe(false);
    });

    test('should prioritize environment variables over config file', () => {
      process.env.DEPOSIUM_URL = 'https://env-url.example.com';
      process.env.DEPOSIUM_API_KEY = 'env-api-key';
      process.env.DEPOSIUM_TENANT = 'env-tenant';
      process.env.DEPOSIUM_SPACE = 'env-space';
      process.env.DEPOSIUM_OUTPUT = 'json';
      process.env.DEPOSIUM_SILENT = 'true';

      // Set config file values
      confStore['deposiumUrl'] = 'https://config-url.example.com';
      confStore['apiKey'] = 'config-api-key';

      const config = getConfig();

      expect(config.deposiumUrl).toBe('https://env-url.example.com');
      expect(config.apiKey).toBe('env-api-key');
      expect(config.defaultTenant).toBe('env-tenant');
      expect(config.defaultSpace).toBe('env-space');
      expect(config.outputFormat).toBe('json');
      expect(config.silentMode).toBe(true);
    });

    test('should fall back to config file when env vars not set', () => {
      delete process.env.DEPOSIUM_URL;
      delete process.env.DEPOSIUM_API_KEY;

      // Set config file values
      confStore['deposiumUrl'] = 'https://config-url.example.com';
      confStore['apiKey'] = 'config-api-key';

      const config = getConfig();

      expect(config.deposiumUrl).toBe('https://config-url.example.com');
      expect(config.apiKey).toBe('config-api-key');
    });
  });

  describe('getBaseUrl', () => {
    beforeEach(() => {
      delete process.env.DEPOSIUM_URL;
      delete process.env.DEPOSIUM_MCP_URL;
    });

    test('should return default localhost URL when nothing configured', () => {
      const url = getBaseUrl(undefined, { validateSecurity: false });
      expect(url).toBe('http://localhost:3003');
    });

    test('should prioritize deposiumUrl over mcpUrl', () => {
      const config = {
        deposiumUrl: 'https://new.example.com',
        mcpUrl: 'https://old.example.com',
      };

      const url = getBaseUrl(config, { validateSecurity: false });
      expect(url).toBe('https://new.example.com');
    });

    test('should fall back to mcpUrl when deposiumUrl not set', () => {
      const config = {
        mcpUrl: 'https://old.example.com',
      };

      const url = getBaseUrl(config, { validateSecurity: false });
      expect(url).toBe('https://old.example.com');
    });

    test('should validate security by default', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = { deposiumUrl: 'http://production.example.com' };
      getBaseUrl(config); // validateSecurity defaults to true

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('should skip validation when validateSecurity is false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = { deposiumUrl: 'http://production.example.com' };
      getBaseUrl(config, { validateSecurity: false });

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('setConfig', () => {
    test('should store config value', () => {
      setConfig('apiKey', 'test-key');
      expect(confStore['apiKey']).toBe('test-key');
    });
  });

  describe('getConfigPath', () => {
    test('should return the config file path', () => {
      const path = getConfigPath();
      expect(path).toBe('/mock/path/config.json');
    });
  });
});
