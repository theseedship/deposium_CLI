/**
 * Integration tests for `leanrag` command (retrieve, aggregate, analyze).
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

import { leanragCommand } from '../../commands/leanrag';

describe('leanrag command', () => {
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
    expect(leanragCommand.name()).toBe('leanrag');
    expect(leanragCommand.description()).toBeTruthy();
  });

  it('registers retrieve + aggregate + analyze', () => {
    const names = leanragCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['retrieve', 'aggregate', 'analyze']));
  });

  it('retrieve subcommand calls leanrag_retrieve with tenant/space', async () => {
    mockCallTool.mockResolvedValue({ content: [], isError: false });
    await leanragCommand.parseAsync(['node', 'test', 'retrieve', 'machine learning', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'leanrag_retrieve',
      expect.objectContaining({
        query_text: 'machine learning',
        tenant_id: 't1',
        space_id: 's1',
      }),
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await leanragCommand.parseAsync(['node', 'test', 'retrieve', 'q', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await leanragCommand.parseAsync(['node', 'test', 'retrieve', 'q', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
