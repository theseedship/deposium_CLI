/**
 * Integration tests for config command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config module
const mockSetConfig = vi.fn();
const mockDeleteConfig = vi.fn();
const mockResetConfig = vi.fn();
const mockGetConfigPath = vi.fn().mockReturnValue('/home/user/.deposium/config.json');
const mockGetBaseUrl = vi.fn().mockReturnValue('http://localhost:3003');
const mockGetConfig = vi.fn().mockReturnValue({
  apiKey: 'test-api-key-12345678',
  deposiumUrl: 'http://localhost:3003',
  mcpUrl: undefined,
  defaultTenant: 'default',
  defaultSpace: 'default',
  outputFormat: 'table',
  silentMode: false,
});

vi.mock('../../utils/config', () => ({
  getConfig: () => mockGetConfig(),
  getBaseUrl: (config: unknown) => mockGetBaseUrl(config),
  setConfig: (key: string, value: unknown) => mockSetConfig(key, value),
  deleteConfig: (key: string) => mockDeleteConfig(key),
  resetConfig: () => mockResetConfig(),
  getConfigPath: () => mockGetConfigPath(),
}));

import { configCommand } from '../../commands/config';

describe('config command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    mockSetConfig.mockClear();
    mockDeleteConfig.mockClear();
    mockResetConfig.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('command structure', () => {
    it('should have correct command name', () => {
      expect(configCommand.name()).toBe('config');
    });

    it('should have subcommands', () => {
      const subcommandNames = configCommand.commands.map((c) => c.name());
      expect(subcommandNames).toContain('set');
      expect(subcommandNames).toContain('get');
      expect(subcommandNames).toContain('delete');
      expect(subcommandNames).toContain('reset');
      expect(subcommandNames).toContain('path');
    });
  });

  describe('config set', () => {
    it('should set api-key value', async () => {
      await configCommand.parseAsync(['node', 'test', 'set', 'api-key', 'new-api-key']);

      expect(mockSetConfig).toHaveBeenCalledWith('apiKey', 'new-api-key');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should set deposium-url value', async () => {
      await configCommand.parseAsync([
        'node',
        'test',
        'set',
        'deposium-url',
        'https://api.deposium.io',
      ]);

      expect(mockSetConfig).toHaveBeenCalledWith('deposiumUrl', 'https://api.deposium.io');
    });

    it('should remove trailing slash from URLs', async () => {
      await configCommand.parseAsync([
        'node',
        'test',
        'set',
        'deposium-url',
        'https://api.deposium.io/',
      ]);

      expect(mockSetConfig).toHaveBeenCalledWith('deposiumUrl', 'https://api.deposium.io');
    });

    it('should parse boolean true', async () => {
      await configCommand.parseAsync(['node', 'test', 'set', 'silent-mode', 'true']);

      expect(mockSetConfig).toHaveBeenCalledWith('silentMode', true);
    });

    it('should parse boolean false', async () => {
      await configCommand.parseAsync(['node', 'test', 'set', 'silent-mode', 'false']);

      expect(mockSetConfig).toHaveBeenCalledWith('silentMode', false);
    });

    it('should reject invalid keys', async () => {
      // Make exit throw to prevent further execution
      exitSpy.mockImplementationOnce(() => {
        throw new Error('process.exit called');
      });

      await expect(
        configCommand.parseAsync(['node', 'test', 'set', 'invalid-key', 'value'])
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should set default-tenant', async () => {
      await configCommand.parseAsync(['node', 'test', 'set', 'default-tenant', 'my-tenant']);

      expect(mockSetConfig).toHaveBeenCalledWith('defaultTenant', 'my-tenant');
    });

    it('should set default-space', async () => {
      await configCommand.parseAsync(['node', 'test', 'set', 'default-space', 'my-space']);

      expect(mockSetConfig).toHaveBeenCalledWith('defaultSpace', 'my-space');
    });

    it('should set output-format', async () => {
      await configCommand.parseAsync(['node', 'test', 'set', 'output-format', 'json']);

      expect(mockSetConfig).toHaveBeenCalledWith('outputFormat', 'json');
    });
  });

  describe('config get', () => {
    it('should show all config when no key specified', async () => {
      await configCommand.parseAsync(['node', 'test', 'get']);

      expect(consoleSpy).toHaveBeenCalled();
      // Should mask API key
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('api-key');
    });

    it('should show specific key value', async () => {
      await configCommand.parseAsync(['node', 'test', 'get', 'default-tenant']);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should mask api-key in output', async () => {
      await configCommand.parseAsync(['node', 'test', 'get', 'api-key']);

      expect(consoleSpy).toHaveBeenCalled();
      // The API key should be masked (first 8 chars + ...)
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('test-api');
      expect(calls).toContain('...');
    });

    it('should show "not set" for undefined values', async () => {
      mockGetConfig.mockReturnValueOnce({
        apiKey: undefined,
      });

      await configCommand.parseAsync(['node', 'test', 'get', 'api-key']);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('config delete', () => {
    it('should delete specified key', async () => {
      await configCommand.parseAsync(['node', 'test', 'delete', 'default-tenant']);

      expect(mockDeleteConfig).toHaveBeenCalledWith('defaultTenant');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should convert kebab-case to camelCase', async () => {
      await configCommand.parseAsync(['node', 'test', 'delete', 'output-format']);

      expect(mockDeleteConfig).toHaveBeenCalledWith('outputFormat');
    });
  });

  describe('config reset', () => {
    it('should reset all configuration', async () => {
      await configCommand.parseAsync(['node', 'test', 'reset']);

      expect(mockResetConfig).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('config path', () => {
    it('should show config file path', async () => {
      await configCommand.parseAsync(['node', 'test', 'path']);

      expect(mockGetConfigPath).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('.deposium/config.json');
    });
  });
});
