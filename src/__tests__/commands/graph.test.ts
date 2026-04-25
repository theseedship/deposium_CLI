/**
 * Integration tests for `graph` command (search, analyze, path, multihop, variable-path, khop, components).
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
  getConfig: vi.fn().mockReturnValue({ defaultTenant: 't1', defaultSpace: 's1' }),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
  isInsecureMode: vi.fn().mockReturnValue(false),
}));

import { graphCommand } from '../../commands/graph';

describe('graph command', () => {
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
    expect(graphCommand.name()).toBe('graph');
    expect(graphCommand.description()).toBeTruthy();
  });

  it('registers all 7 subcommands', () => {
    const names = graphCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'search',
        'analyze',
        'path',
        'multihop',
        'variable-path',
        'khop',
        'components',
      ])
    );
  });

  it('search subcommand calls graph_search with pattern + tenant/space', async () => {
    mockCallTool.mockResolvedValue({ content: [], isError: false });
    await graphCommand.parseAsync(['node', 'test', 'search', 'Person']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'graph_search',
      { tenant_id: 't1', space_id: 's1', pattern: 'Person', limit: 50 },
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await graphCommand.parseAsync(['node', 'test', 'search', 'X']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await graphCommand.parseAsync(['node', 'test', 'search', 'X']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
