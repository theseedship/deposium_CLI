/**
 * Integration tests for `logs` command (view, stats, clear, search).
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

import { logsCommand } from '../../commands/logs';

describe('logs command', () => {
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
    expect(logsCommand.name()).toBe('logs');
    expect(logsCommand.description()).toBeTruthy();
  });

  it('registers view + stats + clear + search', () => {
    const names = logsCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['view', 'stats', 'clear', 'search']));
  });

  it('view subcommand calls view_logs with default level=info, limit=100', async () => {
    mockCallTool.mockResolvedValue({ content: [], isError: false });
    await logsCommand.parseAsync(['node', 'test', 'view', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'view_logs',
      expect.objectContaining({ level: 'info', limit: 100 }),
      expect.any(Object)
    );
  });

  it('clear subcommand calls clear_logs', async () => {
    mockCallTool.mockResolvedValue({ content: 'ok', isError: false });
    await logsCommand.parseAsync(['node', 'test', 'clear', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith('clear_logs', {}, expect.any(Object));
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await logsCommand.parseAsync(['node', 'test', 'view', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await logsCommand.parseAsync(['node', 'test', 'view', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
