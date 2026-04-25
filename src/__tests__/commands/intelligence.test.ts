/**
 * Integration tests for `intelligence` command (analyze, suggest, summarize, elicit).
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

import { intelligenceCommand } from '../../commands/intelligence';

describe('intelligence command', () => {
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
    expect(intelligenceCommand.name()).toBe('intelligence');
    expect(intelligenceCommand.description()).toBeTruthy();
  });

  it('registers all 4 subcommands', () => {
    const names = intelligenceCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['analyze', 'suggest', 'summarize', 'elicit']));
  });

  it('analyze subcommand calls smart_analyze', async () => {
    mockCallTool.mockResolvedValue({ content: { intent: 'search' }, isError: false });
    await intelligenceCommand.parseAsync([
      'node',
      'test',
      'analyze',
      'find docs about TS',
      '--silent',
    ]);
    expect(mockCallTool).toHaveBeenCalledWith(
      'smart_analyze',
      expect.objectContaining({ query_text: 'find docs about TS' }),
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await intelligenceCommand.parseAsync(['node', 'test', 'analyze', 'q', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await intelligenceCommand.parseAsync(['node', 'test', 'analyze', 'q', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
