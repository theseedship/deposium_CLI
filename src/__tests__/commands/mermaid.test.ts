/**
 * Integration tests for `mermaid` command (parse, generate, query).
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

import { mermaidCommand } from '../../commands/mermaid';

describe('mermaid command', () => {
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
    expect(mermaidCommand.name()).toBe('mermaid');
    expect(mermaidCommand.description()).toBeTruthy();
  });

  it('registers parse + generate + query', () => {
    const names = mermaidCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['parse', 'generate', 'query']));
  });

  it('parse subcommand calls mermaid_parse', async () => {
    mockCallTool.mockResolvedValue({ content: [], isError: false });
    await mermaidCommand.parseAsync(['node', 'test', 'parse', '--silent']);
    expect(mockCallTool).toHaveBeenCalledWith(
      'mermaid_parse',
      expect.objectContaining({
        tenant_id: 't1',
        space_id: 's1',
      }),
      expect.any(Object)
    );
  });

  it('handles isError gracefully', async () => {
    mockCallTool.mockResolvedValue({ content: 'failed', isError: true });
    await mermaidCommand.parseAsync(['node', 'test', 'parse', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));
    await mermaidCommand.parseAsync(['node', 'test', 'parse', '--silent']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
