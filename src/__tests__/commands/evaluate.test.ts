/**
 * Integration tests for `evaluate` command (metrics, dashboard, feedback, code, graph, quality).
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

import { evaluateCommand } from '../../commands/evaluate';

describe('evaluate command', () => {
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
    expect(evaluateCommand.name()).toBe('evaluate');
    expect(evaluateCommand.description()).toBeTruthy();
  });

  it('registers all 6 subcommands', () => {
    const names = evaluateCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['metrics', 'dashboard', 'feedback', 'code', 'graph', 'quality'])
    );
  });

  it('metrics subcommand calls eval_metrics', async () => {
    mockCallTool.mockResolvedValue({ content: { precision: 0.9 }, isError: false });
    await evaluateCommand.parseAsync(['node', 'test', 'metrics', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'eval_metrics',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await evaluateCommand.parseAsync(['node', 'test', 'metrics', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await evaluateCommand.parseAsync(['node', 'test', 'metrics', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
