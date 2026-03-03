/**
 * Integration tests for search command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions
const mockCallTool = vi.fn();
const mockHealth = vi.fn();

// Mock modules before importing command
vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    callTool = mockCallTool;
    health = mockHealth;
  },
}));

vi.mock('../../utils/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue('test-api-key'),
}));

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn().mockReturnValue({
    defaultTenant: 'test-tenant',
    defaultSpace: 'test-space',
  }),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
  isInsecureMode: vi.fn().mockReturnValue(false),
}));

import { searchCommand } from '../../commands/search';

describe('search command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockCallTool.mockClear();
    mockHealth.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct command configuration', () => {
    expect(searchCommand.name()).toBe('search');
    expect(searchCommand.description()).toContain('Search documents');
  });

  it('should accept query argument', () => {
    const args = searchCommand.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0].name()).toBe('query');
    expect(args[0].required).toBe(true);
  });

  it('should have all expected options', () => {
    const optionNames = searchCommand.options.map((o) => o.long);
    expect(optionNames).toContain('--tenant');
    expect(optionNames).toContain('--space');
    expect(optionNames).toContain('--top-k');
    expect(optionNames).toContain('--vector');
    expect(optionNames).toContain('--fts');
    expect(optionNames).toContain('--fuzzy');
    expect(optionNames).toContain('--graph');
    expect(optionNames).toContain('--format');
    expect(optionNames).toContain('--silent');
  });

  it('should call search_hub tool with correct parameters', async () => {
    mockCallTool.mockResolvedValue({
      content: [{ id: 1, title: 'Test Result', score: 0.95 }],
      isError: false,
    });

    await searchCommand.parseAsync(['node', 'test', 'test query', '--silent']);

    expect(mockCallTool).toHaveBeenCalledWith(
      'search_hub',
      expect.objectContaining({
        tenant_id: 'test-tenant',
        space_id: 'test-space',
        query_text: 'test query',
        use_vector_rel: true,
        use_fts: false,
        use_fuzzy: false,
        use_graph: false,
        top_k: 10,
      }),
      expect.any(Object)
    );
  });

  it('should pass FTS option when specified', async () => {
    mockCallTool.mockResolvedValue({
      content: [],
      isError: false,
    });

    await searchCommand.parseAsync(['node', 'test', 'test query', '--fts', '--silent']);

    expect(mockCallTool).toHaveBeenCalledWith(
      'search_hub',
      expect.objectContaining({
        use_fts: true,
      }),
      expect.any(Object)
    );
  });

  it('should pass custom top-k value', async () => {
    mockCallTool.mockResolvedValue({
      content: [],
      isError: false,
    });

    await searchCommand.parseAsync(['node', 'test', 'test query', '--top-k', '25', '--silent']);

    expect(mockCallTool).toHaveBeenCalledWith(
      'search_hub',
      expect.objectContaining({
        top_k: 25,
      }),
      expect.any(Object)
    );
  });

  it('should handle API errors gracefully', async () => {
    mockCallTool.mockResolvedValue({
      content: 'Search failed: index not found',
      isError: true,
    });

    await searchCommand.parseAsync(['node', 'test', 'test query', '--silent']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle network errors gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('Network error'));

    await searchCommand.parseAsync(['node', 'test', 'test query', '--silent']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should use custom tenant and space when specified', async () => {
    mockCallTool.mockResolvedValue({
      content: [],
      isError: false,
    });

    await searchCommand.parseAsync([
      'node',
      'test',
      'test query',
      '--tenant',
      'custom-tenant',
      '--space',
      'custom-space',
      '--silent',
    ]);

    expect(mockCallTool).toHaveBeenCalledWith(
      'search_hub',
      expect.objectContaining({
        tenant_id: 'custom-tenant',
        space_id: 'custom-space',
      }),
      expect.any(Object)
    );
  });
});
