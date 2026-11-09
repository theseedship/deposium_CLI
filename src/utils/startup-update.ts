import { tr } from './i18n';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';

const PACKAGE = '@deposium/cli';
const REGISTRY = 'https://registry.npmjs.org';
let activeChild: ChildProcess | undefined;
let shutdownSignal: NodeJS.Signals | undefined;
let shutdownTimer: NodeJS.Timeout | undefined;

function signalExitCode(signal: NodeJS.Signals | null): number {
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
}

/** Let the CLI's shutdown handler wait for its installer/restarted session to close. */
export function forwardStartupUpdateSignal(signal: NodeJS.Signals): boolean {
  if (!activeChild) return false;
  if (shutdownSignal) return true;
  const child = activeChild;
  shutdownSignal = signal;
  try {
    child.kill(signal);
  } catch {
    /* close may already be pending */
  }
  shutdownTimer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already closed */
    }
  }, 2000);
  shutdownTimer.unref();
  return true;
}

function clearActiveChild(child: ChildProcess): void {
  if (activeChild !== child) return;
  activeChild = undefined;
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = undefined;
}

export interface UpdateRuntime {
  nodePath: string;
  entryPoint: string;
  platform: NodeJS.Platform;
  interactive: boolean;
  bun: boolean;
  env: NodeJS.ProcessEnv;
}

function stableVersion(value: string): number[] | undefined {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

function newerVersion(candidate: string, current: string): boolean {
  const next = stableVersion(candidate);
  const old = stableVersion(current);
  if (!next || !old) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== old[i]) return next[i] > old[i];
  }
  return false;
}

function shouldCheck(args: string[], runtime: UpdateRuntime): boolean {
  const disabled = ['1', 'true'].includes(runtime.env.DEPOSIUM_NO_UPDATE ?? '');
  const excluded = ['--no-update', '--help', '-h', '--version', '-V', '--json', '--format'];
  const navigationArgs = args.filter(
    (arg, index) => arg !== '--lang' && !arg.startsWith('--lang=') && args[index - 1] !== '--lang'
  );
  const command = navigationArgs.find((arg) => !arg.startsWith('-'));
  return (
    runtime.interactive &&
    !runtime.bun &&
    !runtime.env.CI &&
    !runtime.env.DEPOSIUM_SKIP_UPDATE_CHECK &&
    !disabled &&
    !args.some((arg) => excluded.includes(arg) || arg.startsWith('--format=')) &&
    (!navigationArgs.length || ['chat', 'interactive', 'i'].includes(command ?? ''))
  );
}

function findNpmCli(runtime: UpdateRuntime): string | undefined {
  const paths = runtime.platform === 'win32' ? path.win32 : path;
  const nodeDirectory = paths.dirname(runtime.nodePath);
  const candidates = [
    paths.resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
    paths.resolve(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
  ];
  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (npmCli) return npmCli;
  const searchPath = runtime.env.PATH ?? runtime.env.Path ?? '';
  for (const directory of searchPath.split(runtime.platform === 'win32' ? ';' : ':')) {
    if (!paths.isAbsolute(directory)) continue;
    const adjacent = paths.join(directory, 'node_modules/npm/bin/npm-cli.js');
    if (existsSync(adjacent)) return adjacent;
    const executable = paths.join(directory, 'npm');
    if (!existsSync(executable)) continue;
    try {
      const target = realpathSync(executable);
      if (paths.basename(target) === 'npm-cli.js') return target;
    } catch {
      /* Broken or inaccessible PATH entry: try the next one. */
    }
  }
}

async function globalInstallation(runtime: UpdateRuntime) {
  const paths = runtime.platform === 'win32' ? path.win32 : path;
  const npmCli = findNpmCli(runtime);
  if (!npmCli) return;
  const prefix = await new Promise<string>((resolve, reject) => {
    execFile(
      runtime.nodePath,
      [npmCli, 'prefix', '--global'],
      { timeout: 1500, maxBuffer: 4096, windowsHide: true, env: runtime.env },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim()))
    );
  });
  if (!paths.isAbsolute(prefix) || /[\r\n]/.test(prefix)) return;
  const root = paths.join(
    prefix,
    runtime.platform === 'win32' ? 'node_modules' : 'lib/node_modules'
  );
  const packagePath = paths.join(root, PACKAGE);
  if (lstatSync(packagePath).isSymbolicLink() || existsSync(paths.join(packagePath, '.git')))
    return;
  const entryPoint = realpathSync(paths.join(packagePath, 'dist/cli.js'));
  const actual = realpathSync(runtime.entryPoint);
  const same =
    runtime.platform === 'win32'
      ? actual.toLowerCase() === entryPoint.toLowerCase()
      : actual === entryPoint;
  if (!same) return; // Never replace a checkout, npx cache, or another installation.
  return { npmCli, prefix, entryPoint, manifest: paths.join(packagePath, 'package.json') };
}

async function latestVersion(): Promise<string | undefined> {
  const response = await fetch(`${REGISTRY}/@deposium%2fcli/latest`, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) return;
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') return;
  const metadata = data as { name?: unknown; version?: unknown };
  return metadata.name === PACKAGE && typeof metadata.version === 'string'
    ? metadata.version
    : undefined;
}

function runInherited(runtime: UpdateRuntime, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    // Calling npm's JS entry with this Node avoids shell quoting and npm.cmd on Windows.
    const child = spawn(runtime.nodePath, args, {
      stdio: 'inherit',
      env: { ...runtime.env, DEPOSIUM_SKIP_UPDATE_CHECK: '1' },
      shell: false,
    });
    activeChild = child;
    child.once('error', () => {
      if (!child.pid) {
        clearActiveChild(child);
        resolve(1);
      }
    });
    child.once('close', (code, signal) => {
      clearActiveChild(child);
      resolve(shutdownSignal ? signalExitCode(shutdownSignal) : (code ?? signalExitCode(signal)));
    });
  });
}

function installedVersionMatches(manifestPath: string, version: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string;
      version?: string;
    };
    return manifest.name === PACKAGE && manifest.version === version;
  } catch {
    return false;
  }
}

function currentRuntime(): UpdateRuntime {
  return {
    nodePath: process.execPath,
    entryPoint: process.argv[1] ?? '',
    platform: process.platform,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    bun: Boolean(process.versions.bun),
    env: process.env,
  };
}

/** Offer an in-place npm update only for interactive, globally installed CLI sessions.
 * Returns the restarted process's exit code, or undefined to run the current command.
 * Detection failures are silent; credentials and remote MCP deployments are untouched.
 */
export async function offerStartupUpdate(
  version: string,
  args: string[],
  runtime: UpdateRuntime = currentRuntime()
): Promise<number | undefined> {
  if (!shouldCheck(args, runtime) || !stableVersion(version)) return;
  shutdownSignal = undefined;
  let installation: Awaited<ReturnType<typeof globalInstallation>>;
  let latest: string | undefined;
  try {
    installation = await globalInstallation(runtime);
    if (!installation) return;
    latest = await latestVersion();
  } catch {
    return; // Offline, unavailable registry/npm, or unsupported installation: continue normally.
  }
  if (!latest || !newerVersion(latest, version)) return;

  let update: boolean;
  try {
    ({ update } = await inquirer.prompt<{ update: boolean }>([
      {
        type: 'confirm',
        name: 'update',
        default: true,
        message: tr(
          'DEPOSIUM CLI {0} is available on npmjs.org (installed {1}). Update and restart now?',
          latest,
          version
        ),
      },
    ]));
  } catch (error) {
    return error instanceof Error && error.name === 'ExitPromptError' ? 130 : undefined;
  }
  if (!update) return;

  const installed = await runInherited(runtime, [
    installation.npmCli,
    'install',
    '--global',
    '--prefix',
    installation.prefix,
    `${PACKAGE}@${latest}`,
    `--registry=${REGISTRY}`,
    `--@deposium:registry=${REGISTRY}`,
    '--ignore-scripts',
    '--engine-strict',
  ]);
  if (installed !== 0) {
    if (shutdownSignal) return installed;
    console.error(
      tr(
        'CLI update failed. Your login is preserved; retry the npm installation before restarting.'
      )
    );
    return installed;
  }
  if (!installedVersionMatches(installation.manifest, latest)) {
    console.error(
      tr('The installed CLI version could not be verified. Restart manually after checking npm.')
    );
    return 1;
  }
  console.log(tr('DEPOSIUM CLI {0} installed. Restarting…', latest));
  return runInherited(runtime, [installation.entryPoint, ...args]);
}
