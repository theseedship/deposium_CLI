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

import {
  initializeCommand,
  handleCommandError,
  withErrorHandling,
  runMcpTool,
} from '../utils/command-helpers';

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

  describe('runMcpTool', () => {
    type CallToolMock = ReturnType<typeof vi.fn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let callTool: CallToolMock;
    let mockClient: { callTool: CallToolMock };

    beforeEach(() => {
      callTool = vi.fn();
      mockClient = { callTool };
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('returns unwrapped content on success', async () => {
      callTool.mockResolvedValue({ isError: false, content: { rows: [1, 2, 3] } });
      const content = await runMcpTool(
        mockClient as never,
        'my_tool',
        { foo: 'bar' },
        { label: 'Search' }
      );
      expect(content).toEqual({ rows: [1, 2, 3] });
    });

    test('forwards toolName + args + spinner=true (default) to callTool', async () => {
      callTool.mockResolvedValue({ isError: false, content: 'ok' });
      await runMcpTool(mockClient as never, 'my_tool', { a: 1 }, { label: 'X' });
      expect(callTool).toHaveBeenCalledWith('my_tool', { a: 1 }, { spinner: true });
    });

    test('forwards spinner: false when caller opts out', async () => {
      callTool.mockResolvedValue({ isError: false, content: 'ok' });
      await runMcpTool(mockClient as never, 't', {}, { label: 'X', spinner: false });
      expect(callTool).toHaveBeenCalledWith('t', {}, { spinner: false });
    });

    test('on isError: emits "❌ <label> failed:" + content to stderr then exits 1', async () => {
      callTool.mockResolvedValue({ isError: true, content: 'tool boom' });
      await expect(
        runMcpTool(mockClient as never, 't', {}, { label: 'Evaluation' })
      ).rejects.toThrow('process.exit called');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Evaluation failed:'),
        'tool boom'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('on isError with object content: passes content through verbatim', async () => {
      // Some tools return a structured error envelope rather than a string;
      // the helper must not stringify it (callers like compound rely on
      // the raw object reaching the user's console).
      const errorContent = { error: 'BAD_REQUEST', message: 'missing dossier' };
      callTool.mockResolvedValue({ isError: true, content: errorContent });
      await expect(
        runMcpTool(mockClient as never, 't', {}, { label: 'Validation' })
      ).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(expect.any(String), errorContent);
    });
  });
});
