import { afterEach, expect, test, vi } from 'vitest';
import { Command } from 'commander';
import { configureDefaultAction } from '../utils/cli-default-action';

const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
afterEach(() => {
  for (const [stream, descriptor] of [
    [process.stdin, stdinTTY],
    [process.stdout, stdoutTTY],
  ] as const) {
    if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
    else delete stream.isTTY;
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function setup(inputTTY = true, outputTTY = true, ci = '', term = 'xterm') {
  Object.defineProperty(process.stdin, 'isTTY', { value: inputTTY, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: outputTTY, configurable: true });
  vi.stubEnv('CI', ci);
  vi.stubEnv('TERM', term);
  const program = new Command().name('deposium').version('1.7.2').option('--no-update');
  program.exitOverride();
  const help: string[] = [];
  program.configureOutput({ writeOut: (value) => help.push(value), writeErr: () => {} });
  const menu = vi.fn().mockResolvedValue(undefined);
  configureDefaultAction(program, menu);
  return { program, menu, help };
}

test.each([
  { input: true, output: true, ci: '', term: 'xterm', args: [], opens: true },
  { input: true, output: true, ci: '', term: 'xterm', args: ['--no-update'], opens: true },
  { input: false, output: true, ci: '', term: 'xterm', args: [], opens: false },
  { input: true, output: false, ci: '', term: 'xterm', args: [], opens: false },
  { input: true, output: true, ci: '1', term: 'xterm', args: [], opens: false },
  { input: true, output: true, ci: '', term: 'dumb', args: [], opens: false },
])(
  'default launch respects terminal mode: %j',
  async ({ input, output, ci, term, args, opens }) => {
    const { program, menu, help } = setup(input, output, ci, term);
    await program.parseAsync(['node', 'cli', ...args]);
    expect(menu).toHaveBeenCalledTimes(opens ? 1 : 0);
    expect(help.join('')).toContain(opens ? '' : 'Usage: deposium');
    if (opens) expect(help).toEqual([]);
  }
);

test('an explicit subcommand is dispatched without opening the default menu', async () => {
  const { program, menu } = setup();
  const action = vi.fn();
  program.command('health').action(action);
  await program.parseAsync(['node', 'cli', 'health']);
  expect(action).toHaveBeenCalledOnce();
  expect(menu).not.toHaveBeenCalled();
});

test.each(['--help', '--version'])('%s remains offline and does not open the menu', async (arg) => {
  const { program, menu } = setup();
  await expect(program.parseAsync(['node', 'cli', arg])).rejects.toMatchObject({ exitCode: 0 });
  expect(menu).not.toHaveBeenCalled();
});

test.each(['unknown-command', '--unknown-option'])(
  '%s fails rather than opening an unrelated menu',
  async (arg) => {
    const { program, menu } = setup();
    program.command('health');
    await expect(program.parseAsync(['node', 'cli', arg])).rejects.toMatchObject({ exitCode: 1 });
    expect(menu).not.toHaveBeenCalled();
  }
);
