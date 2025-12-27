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
});
