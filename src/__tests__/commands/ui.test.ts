/**
 * Integration tests for `ui` command (5 dashboard launchers).
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

import { uiCommand } from '../../commands/ui';

describe('ui command', () => {
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
    expect(uiCommand.name()).toBe('ui');
    expect(uiCommand.description()).toMatch(/UI|dashboard/i);
  });

  it('registers all 5 subcommands', () => {
    const names = uiCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'dashboard',
        'search-ui',
        'health-monitor',
        'tools-explorer',
        'embeddings-monitor',
      ])
    );
  });

  it('dashboard subcommand calls ui_show_dashboard with port', async () => {
    mockCallTool.mockResolvedValue({ content: 'http://localhost:8080', isError: false });
    await uiCommand.parseAsync(['node', 'test', 'dashboard', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'ui_show_dashboard',
      { port: 8080 },
      expect.any(Object)
    );
  });

  it('passes custom port', async () => {
    mockCallTool.mockResolvedValue({ content: 'ok', isError: false });
    await uiCommand.parseAsync(['node', 'test', 'dashboard', '--port', '9000', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'ui_show_dashboard',
      { port: 9000 },
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await uiCommand.parseAsync(['node', 'test', 'dashboard', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await uiCommand.parseAsync(['node', 'test', 'dashboard', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
