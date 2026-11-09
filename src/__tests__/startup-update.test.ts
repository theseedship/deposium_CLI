import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  exec: vi.fn(),
  spawn: vi.fn(),
  prompt: vi.fn(),
  exists: vi.fn(),
  read: vi.fn(),
  linked: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFile: state.exec, spawn: state.spawn }));
vi.mock('node:fs', () => ({
  existsSync: state.exists,
  readFileSync: state.read,
  lstatSync: () => ({ isSymbolicLink: state.linked }),
  realpathSync: (value: string) => value,
}));
vi.mock('inquirer', () => ({ default: { prompt: state.prompt } }));

import {
  forwardStartupUpdateSignal,
  offerStartupUpdate,
  type UpdateRuntime,
} from '../utils/startup-update';

const prefix = '/test/node';
const npm = `${prefix}/lib/node_modules/npm/bin/npm-cli.js`;
const entry = `${prefix}/lib/node_modules/@deposium/cli/dist/cli.js`;
const runtime: UpdateRuntime = {
  nodePath: `${prefix}/bin/node`,
  entryPoint: entry,
  platform: 'darwin',
  interactive: true,
  bun: false,
  env: { PATH: '/test/bin', DEPOSIUM_API_KEY: 'fixture-only' },
};

describe('interactive startup updates', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    state.exists.mockImplementation((candidate) => candidate === npm);
    state.linked.mockReturnValue(false);
    state.exec.mockImplementation((_file, _args, _options, callback) => callback(null, prefix));
    state.read.mockReturnValue(JSON.stringify({ name: '@deposium/cli', version: '1.6.0' }));
    state.prompt.mockResolvedValue({ update: true });
    state.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    });
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: '@deposium/cli', version: '1.6.0' })));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['--help'],
    ['--version'],
    ['search', 'question'],
    ['files', 'list', '--format', 'json'],
    ['temporal-assertion', 'verify'],
    ['chat', '--no-update'],
    ['chat', '--json'],
  ])('does no lookup, prompt or npm work for %j', async (...args) => {
    expect(await offerStartupUpdate('1.5.3', args, runtime)).toBeUndefined();
    expect(state.exec).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.prompt).not.toHaveBeenCalled();
  });

  it.each([
    { interactive: false },
    { bun: true },
    { env: { CI: 'true' } },
    { env: { DEPOSIUM_NO_UPDATE: '1' } },
    { env: { DEPOSIUM_SKIP_UPDATE_CHECK: '1' } },
  ])('skips unsupported or disabled execution: %j', async (overrides) => {
    expect(
      await offerStartupUpdate('1.5.3', ['chat'], { ...runtime, ...overrides })
    ).toBeUndefined();
    expect(state.exec).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never updates a checkout or npx installation', async () => {
    expect(
      await offerStartupUpdate('1.5.3', ['chat'], {
        ...runtime,
        entryPoint: '/checkout/dist/cli.js',
      })
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.spawn).not.toHaveBeenCalled();
  });

  it('leaves npm link installations and their source checkout untouched', async () => {
    state.linked.mockReturnValue(true);
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.spawn).not.toHaveBeenCalled();
  });

  it('continues when npm cannot be found or its prefix lookup fails', async () => {
    state.exists.mockReturnValue(false);
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    state.exists.mockReturnValue(true);
    state.exec.mockImplementation((_file, _args, _options, callback) =>
      callback(new Error('offline'))
    );
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('continues on a failed registry request without touching credentials', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    expect(state.prompt).not.toHaveBeenCalled();
    expect(state.spawn).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    expect(Object.keys(fetchMock.mock.calls[0]?.[1].headers)).toEqual(['Accept']);
  });

  it.each(['1.5.3', '1.5.2', '1.6.0-beta.1', '1.6.0;evil', 'unknown'])(
    'does not install %s',
    async (version) => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: '@deposium/cli', version })));
      expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
      expect(state.prompt).not.toHaveBeenCalled();
    }
  );

  it('requires the expected npm package identity', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ name: 'different-package', version: '99.0.0' }))
    );
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    expect(state.prompt).not.toHaveBeenCalled();
  });

  it('continues the current command when the user declines', async () => {
    state.prompt.mockResolvedValue({ update: false });
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    expect(state.spawn).not.toHaveBeenCalled();
  });

  it('respects cancellation rather than starting a chat after Ctrl+C', async () => {
    state.prompt.mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'ExitPromptError' })
    );
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBe(130);
    expect(state.spawn).not.toHaveBeenCalled();
  });

  it('installs the exact confirmed version into the current prefix then restarts with the same arguments', async () => {
    const args = ['chat', '--space', 'fixture-space'];
    expect(await offerStartupUpdate('1.5.3', args, runtime)).toBe(0);
    expect(state.spawn).toHaveBeenNthCalledWith(
      1,
      runtime.nodePath,
      [
        npm,
        'install',
        '--global',
        '--prefix',
        prefix,
        '@deposium/cli@1.6.0',
        '--registry=https://registry.npmjs.org',
        '--@deposium:registry=https://registry.npmjs.org',
        '--ignore-scripts',
        '--engine-strict',
      ],
      expect.objectContaining({ shell: false, stdio: 'inherit' })
    );
    expect(state.spawn).toHaveBeenNthCalledWith(
      2,
      runtime.nodePath,
      [entry, ...args],
      expect.objectContaining({ env: expect.objectContaining({ DEPOSIUM_SKIP_UPDATE_CHECK: '1' }) })
    );
  });

  it('never restarts after a failed install', async () => {
    state.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 1, null));
      return child;
    });
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBe(1);
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('verifies the installed version instead of trusting a successful npm exit', async () => {
    state.read.mockReturnValue(JSON.stringify({ name: '@deposium/cli', version: '1.5.3' }));
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBe(1);
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('propagates the restarted command exit status', async () => {
    state.spawn
      .mockImplementationOnce(() => {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
      })
      .mockImplementationOnce(() => {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 7, null));
        return child;
      });
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBe(7);
  });

  it('compares numeric version components, including a minor version above nine', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ name: '@deposium/cli', version: '1.10.0' }))
    );
    state.read.mockReturnValue(JSON.stringify({ name: '@deposium/cli', version: '1.10.0' }));
    expect(await offerStartupUpdate('1.9.9', ['i'], runtime)).toBe(0);
    expect(state.spawn.mock.calls[0]?.[1]).toContain('@deposium/cli@1.10.0');
  });

  it.each([new Response('{}', { status: 503 }), new Response('invalid-json')])(
    'continues on an unavailable or malformed registry response',
    async (response) => {
      fetchMock.mockResolvedValue(response);
      expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
      expect(state.prompt).not.toHaveBeenCalled();
    }
  );

  it('rejects relative and multi-line npm prefixes', async () => {
    for (const prefix of ['relative/path', '/root\n/unexpected']) {
      state.exec.mockImplementation((_file, _args, _options, callback) => callback(null, prefix));
      expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBeUndefined();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses Node plus npm-cli.js without a shell on Windows', async () => {
    const windowsPrefix = 'C:\\Node Install';
    const npmCli = `${windowsPrefix}\\node_modules\\npm\\bin\\npm-cli.js`;
    const windowsEntry = `${windowsPrefix}\\node_modules\\@deposium\\cli\\dist\\cli.js`;
    state.exists.mockImplementation((candidate) => candidate === npmCli);
    state.exec.mockImplementation((_file, _args, _options, callback) =>
      callback(null, windowsPrefix)
    );
    const windowsRuntime: UpdateRuntime = {
      ...runtime,
      platform: 'win32',
      nodePath: `${windowsPrefix}\\node.exe`,
      entryPoint: windowsEntry,
    };
    expect(await offerStartupUpdate('1.5.3', ['interactive'], windowsRuntime)).toBe(0);
    expect(state.spawn).toHaveBeenNthCalledWith(
      1,
      windowsRuntime.nodePath,
      expect.arrayContaining([npmCli, '--prefix', windowsPrefix, '@deposium/cli@1.6.0']),
      expect.objectContaining({ shell: false })
    );
    expect(state.spawn).toHaveBeenNthCalledWith(
      2,
      windowsRuntime.nodePath,
      [windowsEntry, 'interactive'],
      expect.objectContaining({ shell: false })
    );
  });

  it('uses the same global-prefix contract on Linux', async () => {
    expect(await offerStartupUpdate('1.5.3', ['chat'], { ...runtime, platform: 'linux' })).toBe(0);
    expect(state.spawn.mock.calls[1]?.[1]).toEqual([entry, 'chat']);
  });

  it('does not restart after a spawned installer error', async () => {
    state.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('cannot spawn')));
      return child;
    });
    expect(await offerStartupUpdate('1.5.3', ['chat'], runtime)).toBe(1);
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('forwards shutdown to the installer, waits for close and never restarts after cancellation', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), pid: 123 });
    state.spawn.mockReturnValue(child);
    let settled = false;
    const update = offerStartupUpdate('1.5.3', ['chat'], runtime).then((code) => {
      settled = true;
      return code;
    });
    await vi.waitFor(() => expect(state.spawn).toHaveBeenCalledTimes(1));
    expect(forwardStartupUpdateSignal('SIGTERM')).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(forwardStartupUpdateSignal('SIGTERM')).toBe(true);
    expect(child.kill).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit('close', 0, null); // even a graceful zero must not launch a new chat.
    expect(await update).toBe(143);
    expect(state.spawn).toHaveBeenCalledTimes(1);
    expect(forwardStartupUpdateSignal('SIGTERM')).toBe(false);
  });
});
