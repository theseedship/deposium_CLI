/**
 * Integration tests for `dspy` command (route, analyze).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCallTool = vi.fn();

vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    callTool = mockCallTool;
  },
}));

vi.mock('../../utils/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue('test-api-key'),
}));

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn().mockReturnValue({}),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
  isInsecureMode: vi.fn().mockReturnValue(false),
}));

import { dspyCommand } from '../../commands/dspy';

describe('dspy command', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockCallTool.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('configures parent command', () => {
    expect(dspyCommand.name()).toBe('dspy');
    expect(dspyCommand.description()).toBeTruthy();
  });

  it('registers route + analyze subcommands', () => {
    const names = dspyCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['route', 'analyze']));
  });

  it('route refuses the internal tool locally without a network request', async () => {
    mockCallTool.mockResolvedValue({ content: { engine: 'fts' }, isError: false });
    await dspyCommand.parseAsync([
      'node',
      'test',
      'route',
      'find machine learning papers',
      '--silent',
    ]);
    expect(mockCallTool).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('server-internal')
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await dspyCommand.parseAsync(['node', 'test', 'route', 'q', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await dspyCommand.parseAsync(['node', 'test', 'route', 'q', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
