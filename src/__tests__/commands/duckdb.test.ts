/**
 * Integration tests for `duckdb` command (serve, connect, federate, expose, query, status).
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

import { duckdbCommand } from '../../commands/duckdb';

describe('duckdb command', () => {
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
    expect(duckdbCommand.name()).toBe('duckdb');
    expect(duckdbCommand.description()).toBeTruthy();
  });

  it('registers all 6 subcommands', () => {
    const names = duckdbCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['serve', 'connect', 'federate', 'expose', 'query', 'status'])
    );
  });

  it('status subcommand calls duckdb_mcp_status with no args', async () => {
    mockCallTool.mockResolvedValue({ content: { running: true }, isError: false });
    await duckdbCommand.parseAsync(['node', 'test', 'status', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith('duckdb_mcp_status', {}, expect.any(Object));
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await duckdbCommand.parseAsync(['node', 'test', 'status', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await duckdbCommand.parseAsync(['node', 'test', 'status', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
