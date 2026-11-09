import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const state = vi.hoisted(() => ({
  key: undefined as string | undefined,
  setKey: vi.fn(),
  prompt: vi.fn(),
  callTool: vi.fn(),
  listTools: vi.fn(),
  health: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
}));

// Keep initializeCommand and ensureAuthenticated real: auth diagnostics must be
// covered alongside command output, not replaced with a silent mock.
vi.mock('../../utils/config', () => ({
  getConfig: () => ({ defaultSpace: 'fixture-space' }),
  getBaseUrl: () => 'https://example.invalid',
  isInsecureMode: () => false,
  hasApiKey: () => Boolean(state.key),
  getApiKey: () => state.key,
  setApiKey: state.setKey,
}));
vi.mock('inquirer', () => ({ default: { prompt: state.prompt } }));
vi.mock('../../client/mcp-client', () => ({
  MCPClient: class {
    callTool = state.callTool;
    listTools = state.listTools;
    health = state.health;
    listDocuments = state.listDocuments;
    getDocument = state.getDocument;
  },
}));

import { searchCommand } from '../../commands/search';
import { toolsCommand } from '../../commands/tools';
import { healthCommand } from '../../commands/health';
import { filesCommand } from '../../commands/files';

const commands = [
  { name: 'search', command: searchCommand, args: ['question', '--format', 'JSON'] },
  { name: 'tools', command: toolsCommand, args: ['--json'] },
  { name: 'health', command: healthCommand, args: ['--format', 'JSON'] },
  { name: 'files list', command: filesCommand, args: ['list', '--format', 'JSON'] },
  { name: 'files show', command: filesCommand, args: ['show', '42', '--format', 'JSON'] },
  { name: 'files check', command: filesCommand, args: ['check', '42', '--format', 'JSON'] },
];

describe.each(commands)('$name JSON with real authentication', ({ command, args }) => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEPOSIUM_API_KEY', '');
    state.key = 'fixture-stored-key';
    state.callTool.mockResolvedValue({ content: [], isError: false });
    state.listTools.mockResolvedValue([]);
    state.health.mockResolvedValue({ status: 'healthy', services: [] });
    state.listDocuments.mockResolvedValue({ items: [] });
    state.getDocument.mockResolvedValue({ id: 42, file_name: 'fixture.pdf' });
    stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit:1');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function run() {
    const program = new Command().addCommand(command);
    await program.parseAsync(['node', 'test', command.name(), ...args]);
  }

  function expectNoCredentialMutation() {
    expect(state.prompt).not.toHaveBeenCalled();
    expect(state.setKey).not.toHaveBeenCalled();
  }

  it('emits one parseable JSON value with a valid stored key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"valid":true}')));
    await run();
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(() => JSON.parse(String(stdout.mock.calls[0]?.[0]))).not.toThrow();
    expect(stderr).not.toHaveBeenCalled();
    expectNoCredentialMutation();
  });

  it.each([
    { label: 'missing key', missing: true, status: 200 },
    { label: 'refused stored key', missing: false, status: 401 },
    { label: 'validation server failure', missing: false, status: 503 },
  ])('fails without stdout or a prompt on $label', async ({ missing, status }) => {
    if (missing) state.key = undefined;
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(run()).rejects.toThrow('exit:1');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join(' ')).toContain('deposium auth login');
    expectNoCredentialMutation();
    expect(state.callTool).not.toHaveBeenCalled();
    expect(state.listTools).not.toHaveBeenCalled();
    expect(state.health).not.toHaveBeenCalled();
    expect(state.listDocuments).not.toHaveBeenCalled();
    expect(state.getDocument).not.toHaveBeenCalled();
    if (missing) expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps offline-friendly stored-key fallback diagnostics on stderr', async () => {
    const offline = Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(offline));
    await run();
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(() => JSON.parse(String(stdout.mock.calls[0]?.[0]))).not.toThrow();
    expect(stderr.mock.calls.flat().join(' ')).toContain('offline-friendly');
    expectNoCredentialMutation();
  });

  it('rejects service credentials before transport without stdout', async () => {
    vi.stubEnv('DEPOSIUM_API_KEY', 'dep_svc_fixture_only');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(run()).rejects.toThrow('exit:1');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join(' ')).toContain('service-key');
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoCredentialMutation();
  });
});
