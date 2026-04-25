/**
 * Integration tests for `space` command (list, show, create).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockListSpaces = vi.fn();
const mockCallTool = vi.fn();

vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    listSpaces = mockListSpaces;
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

import { spaceCommand } from '../../commands/space';

const SAMPLE_SPACES = [
  {
    id: '7a6af433-ac1d-4c76-ac99-ebc8c26d1fc6',
    tenant_id: 'default',
    name: 'BM25 Test Space',
    description: 'Space with BM25 indexed content',
    created_at: '2026-04-25T03:48:49.858Z',
  },
  {
    id: '254598ae-70c1-4933-b4cc-467a42ca1321',
    tenant_id: 'default',
    name: 'All available',
    created_at: '2026-04-25T03:48:49.858Z',
  },
];

describe('space command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockListSpaces.mockClear();
    mockCallTool.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('configures parent command', () => {
    expect(spaceCommand.name()).toBe('space');
    expect(spaceCommand.description()).toMatch(/workspace|space/i);
  });

  it('registers list + show + create subcommands', () => {
    const names = spaceCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['list', 'show', 'create']));
  });

  // ============================================================================
  // list
  // ============================================================================
  describe('list', () => {
    it('calls listSpaces and formats result', async () => {
      mockListSpaces.mockResolvedValue(SAMPLE_SPACES);
      await spaceCommand.parseAsync(['node', 'test', 'list', '--silent', '--format', 'json']);
      expect(mockListSpaces).toHaveBeenCalledTimes(1);
    });

    it('warns when no spaces exist', async () => {
      mockListSpaces.mockResolvedValue([]);
      await spaceCommand.parseAsync(['node', 'test', 'list', '--silent']);
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('No spaces found');
    });

    it('handles network errors gracefully', async () => {
      mockListSpaces.mockRejectedValue(new Error('Network error'));
      await spaceCommand.parseAsync(['node', 'test', 'list', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('supports --format json', async () => {
      mockListSpaces.mockResolvedValue(SAMPLE_SPACES);
      await spaceCommand.parseAsync(['node', 'test', 'list', '--format', 'json', '--silent']);
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('BM25 Test Space');
    });

    it('aliased as `ls`', async () => {
      mockListSpaces.mockResolvedValue(SAMPLE_SPACES);
      await spaceCommand.parseAsync(['node', 'test', 'ls', '--silent']);
      expect(mockListSpaces).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // show
  // ============================================================================
  describe('show', () => {
    it('finds space by ID and prints it', async () => {
      mockListSpaces.mockResolvedValue(SAMPLE_SPACES);
      await spaceCommand.parseAsync([
        'node',
        'test',
        'show',
        '7a6af433-ac1d-4c76-ac99-ebc8c26d1fc6',
        '--silent',
        '--format',
        'json',
      ]);
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('BM25 Test Space');
    });

    it('exits 1 with helpful message when space not found', async () => {
      mockListSpaces.mockResolvedValue(SAMPLE_SPACES);
      await spaceCommand.parseAsync(['node', 'test', 'show', 'nonexistent-uuid', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errors = consoleErrorSpy.mock.calls.flat().map(String).join('\n');
      expect(errors).toContain('Space not found');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `info`', async () => {
      mockListSpaces.mockResolvedValue(SAMPLE_SPACES);
      await spaceCommand.parseAsync([
        'node',
        'test',
        'info',
        '7a6af433-ac1d-4c76-ac99-ebc8c26d1fc6',
        '--silent',
      ]);
      expect(mockListSpaces).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe('create', () => {
    it('calls deposium_admin with operation=create_space', async () => {
      mockCallTool.mockResolvedValue({
        content: { id: 'new-uuid', name: 'My Space' },
        isError: false,
      });
      await spaceCommand.parseAsync([
        'node',
        'test',
        'create',
        'My Space',
        '--description',
        'Notes from 2026',
        '--silent',
      ]);
      expect(mockCallTool).toHaveBeenCalledWith(
        'deposium_admin',
        {
          operation: 'create_space',
          name: 'My Space',
          description: 'Notes from 2026',
        },
        expect.any(Object)
      );
    });

    it('passes description undefined when --description omitted', async () => {
      mockCallTool.mockResolvedValue({ content: { id: 'x' }, isError: false });
      await spaceCommand.parseAsync(['node', 'test', 'create', 'No Desc', '--silent']);
      expect(mockCallTool).toHaveBeenCalledWith(
        'deposium_admin',
        expect.objectContaining({ name: 'No Desc', description: undefined }),
        expect.any(Object)
      );
    });

    it('handles isError gracefully', async () => {
      mockCallTool.mockResolvedValue({ content: 'Permission denied', isError: true });
      await spaceCommand.parseAsync(['node', 'test', 'create', 'X', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `new`', async () => {
      mockCallTool.mockResolvedValue({ content: { id: 'x' }, isError: false });
      await spaceCommand.parseAsync(['node', 'test', 'new', 'Aliased', '--silent']);
      expect(mockCallTool).toHaveBeenCalled();
    });
  });
});
