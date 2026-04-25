/**
 * Integration tests for `query-history` command (log, export, retrieve, stats, cleanup).
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

import { queryHistoryCommand } from '../../commands/query-history';

describe('query-history command', () => {
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
    expect(queryHistoryCommand.name()).toBe('query-history');
    expect(queryHistoryCommand.description()).toBeTruthy();
  });

  it('registers all 5 subcommands', () => {
    const names = queryHistoryCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['log', 'export', 'retrieve', 'stats', 'cleanup'])
    );
  });

  it('stats subcommand calls query_stats with default time-range', async () => {
    mockCallTool.mockResolvedValue({ content: { total: 0 }, isError: false });
    await queryHistoryCommand.parseAsync(['node', 'test', 'stats', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'query_stats',
      expect.objectContaining({ time_range: '24h' }),
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await queryHistoryCommand.parseAsync(['node', 'test', 'stats', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await queryHistoryCommand.parseAsync(['node', 'test', 'stats', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
