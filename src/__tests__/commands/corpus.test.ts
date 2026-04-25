/**
 * Integration tests for `corpus` command (stats, evaluate, improve, realtime-eval, monitor, freshness, drift).
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

import { corpusCommand } from '../../commands/corpus';

describe('corpus command', () => {
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
    expect(corpusCommand.name()).toBe('corpus');
    expect(corpusCommand.description()).toBeTruthy();
  });

  it('registers all 7 subcommands', () => {
    const names = corpusCommand.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'stats',
        'evaluate',
        'improve',
        'realtime-eval',
        'monitor',
        'freshness',
        'drift',
      ])
    );
  });

  it('stats subcommand calls corpus_stats with tenant/space from config', async () => {
    mockCallTool.mockResolvedValue({ content: { documents: 100 }, isError: false });
    await corpusCommand.parseAsync(['node', 'test', 'stats']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'corpus_stats',
      { tenant_id: 't1', space_id: 's1' },
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await corpusCommand.parseAsync(['node', 'test', 'stats']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await corpusCommand.parseAsync(['node', 'test', 'stats']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
