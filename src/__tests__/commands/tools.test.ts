/**
 * Integration tests for tools command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions
const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockHealth = vi.fn();

// Mock modules before importing command
vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    listTools = mockListTools;
    callTool = mockCallTool;
    health = mockHealth;
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

import { toolsCommand } from '../../commands/tools';

describe('tools command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockListTools.mockClear();
    mockCallTool.mockClear();
    mockHealth.mockClear();
    // Commander retains option values between parseAsync calls in this test process.
    for (const option of toolsCommand.options)
      toolsCommand.setOptionValue(option.attributeName(), option.defaultValue);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct command configuration', () => {
    expect(toolsCommand.name()).toBe('tools');
    expect(toolsCommand.description()).toContain('tool');
  });

  it('should have expected options', () => {
    const optionNames = toolsCommand.options.map((o) => o.long);
    expect(optionNames).toContain('--category');
    expect(optionNames).toContain('--search');
    expect(optionNames).toContain('--json');
  });

  it('should list all tools', async () => {
    mockListTools.mockResolvedValue([
      { name: 'search_hub', description: 'Search documents', category: 'search' },
      { name: 'graph_query', description: 'Query knowledge graph', category: 'graph' },
      { name: 'compound_analyze', description: 'AI analysis', category: 'compound' },
    ]);

    await toolsCommand.parseAsync(['node', 'test']);

    expect(mockListTools).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should filter by category', async () => {
    mockListTools.mockResolvedValue([
      { name: 'search_hub', description: 'Search documents', category: 'search' },
      { name: 'search_fts', description: 'Full-text search', category: 'search' },
      { name: 'graph_query', description: 'Query knowledge graph', category: 'graph' },
    ]);

    await toolsCommand.parseAsync(['node', 'test', '--category', 'search']);

    expect(mockListTools).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle empty tools list', async () => {
    mockListTools.mockResolvedValue([]);

    await toolsCommand.parseAsync(['node', 'test']);

    expect(mockListTools).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    mockListTools.mockRejectedValue(new Error('Failed to fetch tools'));

    await toolsCommand.parseAsync(['node', 'test']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should display tool count summary', async () => {
    mockListTools.mockResolvedValue([
      { name: 'tool1', description: 'Tool 1' },
      { name: 'tool2', description: 'Tool 2' },
      { name: 'tool3', description: 'Tool 3' },
    ]);

    await toolsCommand.parseAsync(['node', 'test']);

    expect(consoleSpy).toHaveBeenCalled();
    const calls = consoleSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('3');
  });

  it('JSON output is parseable without progress or summary text', async () => {
    const tools = [{ name: 'deposium_search', description: 'Search' }];
    mockListTools.mockResolvedValue(tools);
    await toolsCommand.parseAsync(['node', 'test', '--json']);
    expect(JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'))).toEqual(tools);
  });

  it('an empty JSON catalogue remains an empty array', async () => {
    mockListTools.mockResolvedValue([]);
    await toolsCommand.parseAsync(['node', 'test', '--json']);
    expect(JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'))).toEqual([]);
  });

  it('category filtering accepts current facade names', async () => {
    const search = { name: 'deposium_search', description: 'Search' };
    mockListTools.mockResolvedValue([search, { name: 'deposium_graph', description: 'Graph' }]);
    await toolsCommand.parseAsync(['node', 'test', '--category', 'search', '--json']);
    expect(JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'))).toEqual([search]);
  });

  it('shows one complete tool description and parameters without invoking it', async () => {
    const description = `${'Tool instructions. '.repeat(20)}LAST INSTRUCTION`;
    mockListTools.mockResolvedValue([
      {
        name: 'deposium_search',
        description,
        inputSchema: { properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ]);
    await toolsCommand.parseAsync(['node', 'test', '--show', 'deposium_search']);
    const output = consoleSpy.mock.calls.flat().join('\n');
    expect(output).toContain(description);
    expect(output).toContain('query — required (string)');
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('show JSON returns the original entry, including its full schema, with no progress text', async () => {
    const tool = {
      name: 'deposium_search',
      description: 'Search',
      inputSchema: { anyOf: [{ required: ['query'] }] },
    };
    mockListTools.mockResolvedValue([tool]);
    await toolsCommand.parseAsync(['node', 'test', '--show', 'deposium_search', '--json']);
    expect(JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'))).toEqual(tool);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('an exact tool name missing from the catalogue fails instead of claiming success', async () => {
    mockListTools.mockResolvedValue([]);
    await toolsCommand.parseAsync(['node', 'test', '--show', 'missing', '--json']);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain('Tool not found');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('does not silently ignore catalogue filters when inspecting an exact name', async () => {
    mockListTools.mockResolvedValue([{ name: 'deposium_search', description: 'Search' }]);
    await toolsCommand.parseAsync([
      'node',
      'test',
      '--show',
      'deposium_search',
      '--category',
      'graph',
      '--json',
    ]);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain('without --search or --category');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it.each(['', '   '])(
    'rejects an empty exact name %j without returning the whole catalogue',
    async (name) => {
      mockListTools.mockResolvedValue([{ name: 'deposium_search', description: 'Search' }]);
      await toolsCommand.parseAsync(['node', 'test', '--show', name, '--json']);
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain('non-empty exact tool name');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockCallTool).not.toHaveBeenCalled();
    }
  );
});
