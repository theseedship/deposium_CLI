/**
 * Integration tests for `api-keys` command (list, create, delete, rotate, usage).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockListApiKeys = vi.fn();
const mockCreateApiKey = vi.fn();
const mockDeleteApiKey = vi.fn();
const mockRotateApiKey = vi.fn();
const mockGetApiKeyUsage = vi.fn();

vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    listApiKeys = mockListApiKeys;
    createApiKey = mockCreateApiKey;
    deleteApiKey = mockDeleteApiKey;
    rotateApiKey = mockRotateApiKey;
    getApiKeyUsage = mockGetApiKeyUsage;
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

import { apiKeysCommand } from '../../commands/api-keys';
import inquirer from 'inquirer';

const SAMPLE_KEYS = [
  {
    id: 'key-uuid-1',
    name: 'CI/CD',
    prefix: 'dep_live_abc',
    scopes: ['read', 'write'],
    rate_limit_tier: 'pro',
    created_at: '2026-04-01T10:00:00Z',
    last_used_at: '2026-04-25T03:00:00Z',
  },
];

describe('api-keys command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockListApiKeys.mockClear();
    mockCreateApiKey.mockClear();
    mockDeleteApiKey.mockClear();
    mockRotateApiKey.mockClear();
    mockGetApiKeyUsage.mockClear();
    vi.mocked(inquirer.prompt).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('configures parent command', () => {
    expect(apiKeysCommand.name()).toBe('api-keys');
  });

  it('registers list + create + delete + rotate + usage', () => {
    const names = apiKeysCommand.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['list', 'create', 'delete', 'rotate', 'usage']));
  });

  // ============================================================================
  // list
  // ============================================================================
  describe('list', () => {
    it('calls listApiKeys', async () => {
      mockListApiKeys.mockResolvedValue(SAMPLE_KEYS);
      await apiKeysCommand.parseAsync(['node', 'test', 'list', '--silent']);
      expect(mockListApiKeys).toHaveBeenCalled();
    });

    it('shows hint when none exist', async () => {
      mockListApiKeys.mockResolvedValue([]);
      await apiKeysCommand.parseAsync(['node', 'test', 'list']);
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('No API keys found');
    });

    it('handles errors gracefully', async () => {
      mockListApiKeys.mockRejectedValue(new Error('Network error'));
      await apiKeysCommand.parseAsync(['node', 'test', 'list', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `ls`', async () => {
      mockListApiKeys.mockResolvedValue(SAMPLE_KEYS);
      await apiKeysCommand.parseAsync(['node', 'test', 'ls', '--silent']);
      expect(mockListApiKeys).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe('create', () => {
    it('passes name + scopes (split by comma)', async () => {
      mockCreateApiKey.mockResolvedValue({
        id: 'k1',
        name: 'My Key',
        secret: 'dep_live_1234567890abcdef',
      });
      await apiKeysCommand.parseAsync([
        'node',
        'test',
        'create',
        '--name',
        'My Key',
        '--scopes',
        'read,write',
        '--silent',
      ]);
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: 'My Key',
        scopes: ['read', 'write'],
        rate_limit_tier: undefined,
      });
    });

    it('warns loudly when secret is shown', async () => {
      mockCreateApiKey.mockResolvedValue({ id: 'k', name: 'X', secret: 'dep_live_xyz' });
      await apiKeysCommand.parseAsync(['node', 'test', 'create', '--name', 'X', '--silent']);
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('Save this secret NOW');
      expect(logs).toContain('dep_live_xyz');
    });

    it('handles FEATURE_LOCKED gracefully', async () => {
      mockCreateApiKey.mockRejectedValue(new Error('FEATURE_LOCKED'));
      await apiKeysCommand.parseAsync(['node', 'test', 'create', '--name', 'X', '--silent']);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('aliased as `new`', async () => {
      mockCreateApiKey.mockResolvedValue({ id: 'k', name: 'X' });
      await apiKeysCommand.parseAsync(['node', 'test', 'new', '--name', 'X', '--silent']);
      expect(mockCreateApiKey).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // delete
  // ============================================================================
  describe('delete', () => {
    it('with --yes skips prompt', async () => {
      mockDeleteApiKey.mockResolvedValue({ ok: true });
      await apiKeysCommand.parseAsync(['node', 'test', 'delete', 'k1', '--yes', '--silent']);
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mockDeleteApiKey).toHaveBeenCalledWith('k1');
    });

    it('without --yes prompts', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ confirmed: true });
      mockDeleteApiKey.mockResolvedValue({ ok: true });
      await apiKeysCommand.parseAsync(['node', 'test', 'delete', 'k1', '--silent']);
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockDeleteApiKey).toHaveBeenCalledWith('k1');
    });

    it('cancels when user says no', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ confirmed: false });
      await apiKeysCommand.parseAsync(['node', 'test', 'delete', 'k1']);
      expect(mockDeleteApiKey).not.toHaveBeenCalled();
    });

    it('aliased as `rm`', async () => {
      mockDeleteApiKey.mockResolvedValue({ ok: true });
      await apiKeysCommand.parseAsync(['node', 'test', 'rm', 'k1', '--yes', '--silent']);
      expect(mockDeleteApiKey).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // rotate
  // ============================================================================
  describe('rotate', () => {
    it('with --yes calls rotate and prints new secret', async () => {
      mockRotateApiKey.mockResolvedValue({ id: 'k1', name: 'X', secret: 'dep_live_rotated' });
      await apiKeysCommand.parseAsync(['node', 'test', 'rotate', 'k1', '--yes', '--silent']);
      expect(mockRotateApiKey).toHaveBeenCalledWith('k1');
      const logs = consoleLogSpy.mock.calls.flat().map(String).join('\n');
      expect(logs).toContain('dep_live_rotated');
    });

    it('without --yes prompts', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ confirmed: true });
      mockRotateApiKey.mockResolvedValue({ id: 'k1', name: 'X', secret: 'new' });
      await apiKeysCommand.parseAsync(['node', 'test', 'rotate', 'k1', '--silent']);
      expect(inquirer.prompt).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // usage
  // ============================================================================
  describe('usage', () => {
    it('calls getApiKeyUsage', async () => {
      mockGetApiKeyUsage.mockResolvedValue({ requests_today: 42, requests_total: 12_345 });
      await apiKeysCommand.parseAsync(['node', 'test', 'usage', 'k1', '--silent']);
      expect(mockGetApiKeyUsage).toHaveBeenCalledWith('k1');
    });
  });
});
