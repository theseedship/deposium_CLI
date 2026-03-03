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

// Mock node:fs to prevent migration and chmod side effects during tests
vi.mock('node:fs', () => ({
  default: {
    existsSync: () => false,
    readFileSync: () => '',
    renameSync: () => {},
    chmodSync: () => {},
  },
}));

// Use vi.hoisted to ensure confStore is initialized before vi.mock factories
// (avoids TDZ errors when migration code calls config.set() at module load)
const { confStore } = vi.hoisted(() => {
  const confStore: Record<string, unknown> = {};
  return { confStore };
});

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
  enforceUrlSecurity,
  isInsecureMode,
  deriveEncryptionKey,
  migrateIfPlaintext,
  getConfig,
  getBaseUrl,
  setConfig,
  getConfigPath,
  getApiKey,
  setApiKey,
  deleteApiKey,
  hasApiKey,
  getCredentialsPath,
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

  describe('enforceUrlSecurity', () => {
    test('should allow localhost HTTP URLs without throwing or warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => enforceUrlSecurity('http://localhost:3000')).not.toThrow();
      expect(() => enforceUrlSecurity('http://127.0.0.1:3000')).not.toThrow();
      expect(() => enforceUrlSecurity('http://0.0.0.0:3000')).not.toThrow();
      expect(() => enforceUrlSecurity('http://myapp.local:3000')).not.toThrow();
      expect(() => enforceUrlSecurity('http://dev.localhost:3000')).not.toThrow();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('should throw for non-localhost HTTP URLs', () => {
      expect(() => enforceUrlSecurity('http://api.example.com')).toThrow(
        'Insecure HTTP connection refused'
      );
    });

    test('should allow HTTPS URLs without throwing or warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => enforceUrlSecurity('https://api.example.com')).not.toThrow();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('should warn but not throw when insecure flag is set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => enforceUrlSecurity('http://api.example.com', { insecure: true })).not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
      const warning = warnSpy.mock.calls[0]?.[0] as string;
      expect(warning).toContain('Security Warning');
      warnSpy.mockRestore();
    });

    test('should read DEPOSIUM_INSECURE env var as fallback', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const originalEnv = process.env.DEPOSIUM_INSECURE;

      process.env.DEPOSIUM_INSECURE = 'true';

      expect(() => enforceUrlSecurity('http://api.example.com')).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();

      process.env.DEPOSIUM_INSECURE = originalEnv;
      warnSpy.mockRestore();
    });

    test('should handle invalid URLs gracefully', () => {
      expect(() => enforceUrlSecurity('not-a-valid-url')).not.toThrow();
      expect(() => enforceUrlSecurity('')).not.toThrow();
    });

    test('should include actionable message in error', () => {
      try {
        enforceUrlSecurity('http://api.example.com');
        expect.fail('Should have thrown');
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).toContain('--insecure');
        expect(msg).toContain('DEPOSIUM_INSECURE=true');
        expect(msg).toContain('https://');
      }
    });
  });

  describe('isInsecureMode', () => {
    test('should return false by default', () => {
      const original = process.env.DEPOSIUM_INSECURE;
      delete process.env.DEPOSIUM_INSECURE;
      expect(isInsecureMode()).toBe(false);
      process.env.DEPOSIUM_INSECURE = original;
    });

    test('should return true when DEPOSIUM_INSECURE=true', () => {
      const original = process.env.DEPOSIUM_INSECURE;
      process.env.DEPOSIUM_INSECURE = 'true';
      expect(isInsecureMode()).toBe(true);
      process.env.DEPOSIUM_INSECURE = original;
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

    test('should enforce TLS security by default', () => {
      const config = { deposiumUrl: 'http://production.example.com' };
      expect(() => getBaseUrl(config)).toThrow('Insecure HTTP connection refused');
    });

    test('should skip validation when validateSecurity is false', () => {
      const config = { deposiumUrl: 'http://production.example.com' };
      expect(() => getBaseUrl(config, { validateSecurity: false })).not.toThrow();
    });

    test('should allow HTTP with insecure flag', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = { deposiumUrl: 'http://production.example.com' };
      const url = getBaseUrl(config, { insecure: true });

      expect(url).toBe('http://production.example.com');
      expect(warnSpy).toHaveBeenCalled();
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

  describe('deriveEncryptionKey', () => {
    test('should return a 64-char hex string (256-bit key)', () => {
      const key = deriveEncryptionKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    test('should return the same key on repeated calls (deterministic)', () => {
      const key1 = deriveEncryptionKey();
      const key2 = deriveEncryptionKey();
      expect(key1).toBe(key2);
    });
  });

  describe('migrateIfPlaintext', () => {
    test('should return null when file does not exist', () => {
      // node:fs mock returns false for existsSync
      const result = migrateIfPlaintext('/nonexistent/path.json');
      expect(result).toBeNull();
    });
  });

  describe('API key credentials store', () => {
    beforeEach(() => {
      delete process.env.DEPOSIUM_API_KEY;
    });

    test('setApiKey should store in credentials', () => {
      setApiKey('my-secret-key');
      expect(getApiKey()).toBe('my-secret-key');
    });

    test('deleteApiKey should remove key', () => {
      setApiKey('temp-key');
      deleteApiKey();
      expect(getApiKey()).toBeUndefined();
    });

    test('hasApiKey should return false when no key set', () => {
      deleteApiKey();
      expect(hasApiKey()).toBe(false);
    });

    test('hasApiKey should return true when key is set', () => {
      setApiKey('exists');
      expect(hasApiKey()).toBe(true);
    });

    test('getConfig should include apiKey from credentials', () => {
      setApiKey('cred-key');
      const cfg = getConfig();
      expect(cfg.apiKey).toBe('cred-key');
    });

    test('env var DEPOSIUM_API_KEY should take priority over credentials', () => {
      setApiKey('stored-key');
      process.env.DEPOSIUM_API_KEY = 'env-key';
      const cfg = getConfig();
      expect(cfg.apiKey).toBe('env-key');
    });

    test('getCredentialsPath should return a path string', () => {
      const credPath = getCredentialsPath();
      expect(typeof credPath).toBe('string');
      expect(credPath.length).toBeGreaterThan(0);
    });
  });
});
