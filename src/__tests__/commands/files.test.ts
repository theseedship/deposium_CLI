/**
 * Integration tests for `files` command (list, show, check, rm).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockListDocuments = vi.fn();
const mockGetDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockCallTool = vi.fn();

vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    listDocuments = mockListDocuments;
    getDocument = mockGetDocument;
    deleteDocument = mockDeleteDocument;
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

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

import { filesCommand } from '../../commands/files';
import inquirer from 'inquirer';

const SAMPLE_DOCS = [
  {
    id: 2461,
    file_name: 'web-search.json',
    mime_type: 'application/x-connector',
    size: 0,
    doc_type: 'connector',
    doc_status: 'ready',
    num_pages: 0,
    characters_count: 0,
    is_private: true,
    space_id: null,
    folder_id: 'a904a406-6f6f-438d-bf90-1d32ff7f0e8b',
    created_at: '2026-04-22T21:03:35.710823+00:00',
    updated_at: '2026-04-22T21:03:35.710823+00:00',
  },
  {
    id: 2459,
    file_name: 'report.pdf',
    mime_type: 'application/pdf',
    size: 199382,
    doc_type: 'document',
    doc_status: 'completed',
    num_pages: 8,
    characters_count: 11934,
    is_private: true,
    space_id: null,
    folder_id: '2634f0e9-e591-4388-baeb-d02e4c0c2038',
    created_at: '2026-04-13T13:27:00.820728+00:00',
    updated_at: '2026-04-14T22:16:16.25572+00:00',
  },
];

describe('files command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockListDocuments.mockClear();
    mockGetDocument.mockClear();
    mockDeleteDocument.mockClear();
    mockCallTool.mockClear();
    vi.mocked(inquirer.prompt).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('configures parent command', () => {
    expect(filesCommand.name()).toBe('files');
    expect(filesCommand.description()).toMatch(/document|file/i);
  });

  it('registers list + show + check + rm subcommands', () => {
    const names = filesCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['list', 'show', 'check', 'rm']));
  });

  // ============================================================================
  // list
  // ============================================================================
  describe('list', () => {
    it('calls listDocuments with no filter by default', async () => {
      mockListDocuments.mockResolvedValue({ items: SAMPLE_DOCS });
      await filesCommand.parseAsync(['node', 'test', 'list', '--silent']);
      expect(mockListDocuments).toHaveBeenCalledWith({
        spaceId: undefined,
        limit: undefined,
        offset: 0,
      });
    });

    it('passes --space filter', async () => {
      mockListDocuments.mockResolvedValue({
        items: [],
        pagination: { total: 0, limit: 50, offset: 0, has_more: false },
      });
      await filesCommand.parseAsync(['node', 'test', 'list', '--space', 'space-uuid', '--silent']);
      expect(mockListDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'space-uuid' })
      );
    });

    it('passes --limit', async () => {
      mockListDocuments.mockResolvedValue({ items: [] });
      await filesCommand.parseAsync(['node', 'test', 'list', '--limit', '10', '--silent']);
      expect(mockListDocuments).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });

    it('warns when no documents exist', async () => {
      mockListDocuments.mockResolvedValue({ items: [] });
      await filesCommand.parseAsync(['node', 'test', 'list', '--silent']);
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('No documents found');
    });

    it('handles network errors gracefully', async () => {
      mockListDocuments.mockRejectedValue(new Error('Network error'));
      await filesCommand.parseAsync(['node', 'test', 'list', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `ls`', async () => {
      mockListDocuments.mockResolvedValue({ items: SAMPLE_DOCS });
      await filesCommand.parseAsync(['node', 'test', 'ls', '--silent']);
      expect(mockListDocuments).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // show
  // ============================================================================
  describe('show', () => {
    it('calls getDocument and prints details', async () => {
      mockGetDocument.mockResolvedValue({
        ...SAMPLE_DOCS[1],
        _access: { type: 'owner', can_edit: true, can_delete: true },
      });
      await filesCommand.parseAsync([
        'node',
        'test',
        'show',
        '2459',
        '--silent',
        '--format',
        'json',
      ]);
      expect(mockGetDocument).toHaveBeenCalledWith('2459');
    });

    it('handles not-found gracefully', async () => {
      mockGetDocument.mockRejectedValue(new Error('Not found (404)'));
      await filesCommand.parseAsync(['node', 'test', 'show', '99999', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `info`', async () => {
      mockGetDocument.mockResolvedValue(SAMPLE_DOCS[1]);
      await filesCommand.parseAsync(['node', 'test', 'info', '2459', '--silent']);
      expect(mockGetDocument).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // check
  // ============================================================================
  describe('check', () => {
    it('calls check_file MCP tool with document_id', async () => {
      mockCallTool.mockResolvedValue({ content: { valid: true, checksum: 'abc' }, isError: false });
      await filesCommand.parseAsync(['node', 'test', 'check', '2459', '--silent']);
      expect(mockCallTool).toHaveBeenCalledWith(
        'check_file',
        { document_id: '2459' },
        expect.any(Object)
      );
    });

    it('handles isError gracefully', async () => {
      mockCallTool.mockResolvedValue({ content: 'corrupt', isError: true });
      await filesCommand.parseAsync(['node', 'test', 'check', '2459', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `validate`', async () => {
      mockCallTool.mockResolvedValue({ content: { valid: true }, isError: false });
      await filesCommand.parseAsync(['node', 'test', 'validate', '2459', '--silent']);
      expect(mockCallTool).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // rm
  // ============================================================================
  describe('rm', () => {
    it('with --yes skips prompt and deletes', async () => {
      mockDeleteDocument.mockResolvedValue({ ok: true });
      await filesCommand.parseAsync(['node', 'test', 'rm', '2459', '--yes', '--silent']);
      expect(mockGetDocument).not.toHaveBeenCalled();
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mockDeleteDocument).toHaveBeenCalledWith('2459');
    });

    it('without --yes shows preview + prompts and proceeds when confirmed', async () => {
      mockGetDocument.mockResolvedValue(SAMPLE_DOCS[1]);
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ confirmed: true });
      mockDeleteDocument.mockResolvedValue({ ok: true });
      await filesCommand.parseAsync(['node', 'test', 'rm', '2459', '--silent']);
      expect(mockGetDocument).toHaveBeenCalledWith('2459');
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockDeleteDocument).toHaveBeenCalledWith('2459');
    });

    it('without --yes cancels when user says no', async () => {
      mockGetDocument.mockResolvedValue(SAMPLE_DOCS[1]);
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ confirmed: false });
      await filesCommand.parseAsync(['node', 'test', 'rm', '2459']);
      expect(mockDeleteDocument).not.toHaveBeenCalled();
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('Cancelled');
    });

    it('handles delete errors gracefully', async () => {
      mockDeleteDocument.mockRejectedValue(new Error('Permission denied'));
      await filesCommand.parseAsync(['node', 'test', 'rm', '2459', '--yes', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `delete`', async () => {
      mockDeleteDocument.mockResolvedValue({ ok: true });
      await filesCommand.parseAsync(['node', 'test', 'delete', '2459', '--yes', '--silent']);
      expect(mockDeleteDocument).toHaveBeenCalled();
    });
  });
});
