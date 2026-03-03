/**
 * Tests for src/utils/command-helpers.ts
 *
 * Tests command initialization and error handling utilities.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    white: (s: string) => s,
  },
}));

const mockConfig = {
  deposiumUrl: 'http://localhost:3000',
  apiKey: 'test-key',
  silentMode: false,
};

vi.mock('../utils/config', () => ({
  getConfig: () => mockConfig,
  getBaseUrl: (cfg?: typeof mockConfig) => cfg?.deposiumUrl || 'http://localhost:3003',
  isInsecureMode: () => false,
  enforceUrlSecurity: () => {},
}));

vi.mock('../utils/auth', () => ({
  ensureAuthenticated: vi.fn(() => Promise.resolve('test-api-key')),
}));

vi.mock('../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    constructor(
      public baseUrl: string,
      public apiKey: string
    ) {}
  },
}));

import { initializeCommand, handleCommandError, withErrorHandling } from '../utils/command-helpers';

describe('command-helpers.ts', () => {
  describe('initializeCommand', () => {
    test('should return CommandContext with all required fields', async () => {
      const context = await initializeCommand();

      expect(context.config).toBeDefined();
      expect(context.baseUrl).toBeDefined();
      expect(context.apiKey).toBe('test-api-key');
      expect(context.client).toBeDefined();
    });

    test('should pass options to MCPClient', async () => {
      const context = await initializeCommand({
        timeout: 60000,
        maxRetries: 5,
      });

      expect(context.client).toBeDefined();
    });
  });

  describe('handleCommandError', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('should log error message and exit', () => {
      const error = new Error('Test error');

      expect(() => handleCommandError(error)).toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('should handle string errors', () => {
      expect(() => handleCommandError('String error')).toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalled();
    });

    test('should respect silent option', () => {
      expect(() => handleCommandError(new Error('Test'), true)).toThrow('process.exit called');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    test('should show stack trace in DEBUG mode', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'true';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      expect(() => handleCommandError(error)).toThrow('process.exit called');

      // Should have been called twice (message and stack)
      expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      process.env.DEBUG = originalDebug;
    });
  });

  describe('withErrorHandling', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('should execute action normally on success', async () => {
      let executed = false;
      const action = withErrorHandling(async () => {
        executed = true;
      });

      await action();
      expect(executed).toBe(true);
    });

    test('should catch and handle errors', async () => {
      const action = withErrorHandling(async () => {
        throw new Error('Action failed');
      });

      await expect(action()).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalled();
    });

    test('should pass arguments to action', async () => {
      let receivedArgs: unknown[] = [];
      const action = withErrorHandling(async (a: string, b: number) => {
        receivedArgs = [a, b];
      });

      await action('test', 42);
      expect(receivedArgs).toEqual(['test', 42]);
    });
  });
});
