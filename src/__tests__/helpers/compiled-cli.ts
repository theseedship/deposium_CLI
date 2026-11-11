import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';

export function useCompiledCli() {
  const require = createRequire(path.resolve('package.json'));
  const buildTimeout = 30000;
  let buildDirectory: string;
  let outputDirectory: string;

  beforeAll(() => {
    // Compile once, then exercise independent Node processes as an installed CLI
    // would run. Keep TypeScript compilation outside subprocess runtime deadlines.
    const cacheDirectory = path.resolve('node_modules/.cache');
    mkdirSync(cacheDirectory, { recursive: true });
    buildDirectory = mkdtempSync(path.join(cacheDirectory, 'deposium-cli-build-'));
    outputDirectory = path.join(buildDirectory, 'dist');
    const build = spawnSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--project',
        'tsconfig.json',
        '--outDir',
        outputDirectory,
        '--noCheck',
        '--declaration',
        'false',
        '--declarationMap',
        'false',
        '--sourceMap',
        'false',
      ],
      { encoding: 'utf8', timeout: buildTimeout }
    );
    expect(build.error, build.stderr || build.stdout).toBeUndefined();
    expect(build.status, build.stderr || build.stdout).toBe(0);
    // cli.ts imports its package manifest from the parent of the output directory.
    copyFileSync('package.json', path.join(buildDirectory, 'package.json'));
  }, buildTimeout + 5000);

  afterAll(() => {
    if (buildDirectory) rmSync(buildDirectory, { recursive: true, force: true });
  });

  return (modulePath: string) => path.join(outputDirectory, modulePath);
}
