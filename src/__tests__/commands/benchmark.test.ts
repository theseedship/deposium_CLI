/**
 * Integration tests for `benchmark` command (list, run, corpus, compare).
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

import { benchmarkCommand } from '../../commands/benchmark';

describe('benchmark command', () => {
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

  it('configures parent command + alias', () => {
    expect(benchmarkCommand.name()).toBe('benchmark');
    expect(benchmarkCommand.aliases()).toContain('bench');
    expect(benchmarkCommand.description()).toBeTruthy();
  });

  it('registers all 4 subcommands', () => {
    const names = benchmarkCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['list', 'run', 'corpus', 'compare']));
  });

  it('list subcommand calls openbench_list', async () => {
    mockCallTool.mockResolvedValue({
      content: JSON.stringify({
        categories: {},
        providers: ['groq'],
        default_provider: 'groq',
        default_model: 'llama',
      }),
      isError: false,
    });
    await benchmarkCommand.parseAsync(['node', 'test', 'list', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'openbench_list',
      expect.objectContaining({ include_details: true }),
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await benchmarkCommand.parseAsync(['node', 'test', 'list', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await benchmarkCommand.parseAsync(['node', 'test', 'list', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
