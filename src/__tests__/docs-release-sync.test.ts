import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const script = join(process.cwd(), '.github', 'scripts', 'dispatch-docs-release.sh');
const packageName = '@deposium/cli';
const version = '2.3.4';
const registryFlag = '--registry=https://registry.npmjs.org';
const token = 'secret-test-token-must-not-appear';

interface RunOptions {
  releaseVersion?: string;
  ghToken?: string;
  publicJson?: string;
  latestJson?: string;
  publicExit?: number;
  latestExit?: number;
  ghExit?: number;
}

function runDispatch(options: RunOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cli-docs-release-'));
  try {
    const npmCalls = join(root, 'npm-calls');
    const ghCalls = join(root, 'gh-calls');
    const ghInput = join(root, 'gh-input');
    for (const file of [npmCalls, ghCalls, ghInput]) writeFileSync(file, '');

    const npm = join(root, 'npm');
    writeFileSync(
      npm,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$NPM_CALLS"\n' +
        'if [ "$1" != view ]; then exit 41; fi\n' +
        'if [ "$3" = version ]; then\n  [ "$PUBLIC_EXIT" = 0 ] || exit "$PUBLIC_EXIT"\n  printf \'%s\\n\' "$PUBLIC_JSON"\n' +
        'elif [ "$3" = dist-tags.latest ]; then\n  [ "$LATEST_EXIT" = 0 ] || exit "$LATEST_EXIT"\n  printf \'%s\\n\' "$LATEST_JSON"\n' +
        'else\n  exit 42\nfi\n'
    );
    chmodSync(npm, 0o755);

    const gh = join(root, 'gh');
    writeFileSync(
      gh,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GH_CALLS"\ncat > "$GH_INPUT"\n' +
        'if [ "$GH_EXIT" != 0 ]; then echo "simulated gh failure" >&2; exit "$GH_EXIT"; fi\n'
    );
    chmodSync(gh, 0o755);

    const result = spawnSync('bash', [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${root}:${process.env.PATH ?? ''}`,
        RELEASE_VERSION: options.releaseVersion ?? version,
        GH_TOKEN: options.ghToken ?? token,
        NPM_CALLS: npmCalls,
        GH_CALLS: ghCalls,
        GH_INPUT: ghInput,
        PUBLIC_JSON: options.publicJson ?? JSON.stringify(version),
        LATEST_JSON: options.latestJson ?? JSON.stringify(version),
        PUBLIC_EXIT: String(options.publicExit ?? 0),
        LATEST_EXIT: String(options.latestExit ?? 0),
        GH_EXIT: String(options.ghExit ?? 0),
      },
    });
    if (result.error) throw result.error;
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      npmCalls: readFileSync(npmCalls, 'utf8').trim().split('\n').filter(Boolean),
      ghCalls: readFileSync(ghCalls, 'utf8').trim().split('\n').filter(Boolean),
      ghPayload: readFileSync(ghInput, 'utf8'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform === 'win32')('docs release dispatch', () => {
  test.each([version, `v${version}`])(
    'queues only a verified public latest release: %s',
    (input) => {
      const result = runDispatch({ releaseVersion: input });
      expect(result.status).toBe(0);
      expect(result.npmCalls).toEqual([
        `view ${packageName}@${version} version --json --prefer-online ${registryFlag}`,
        `view ${packageName} dist-tags.latest --json --prefer-online ${registryFlag}`,
      ]);
      expect(result.ghCalls).toEqual([
        'api -X POST repos/theseedship/deposium_docs/dispatches --input -',
      ]);
      expect(JSON.parse(result.ghPayload)).toEqual({
        event_type: 'cli-released',
        client_payload: { package: packageName, version },
      });
      expect(result.stdout).toContain('Queued docs release sync');
      expect(result.stdout).not.toContain('deployed');
      expect(`${result.stdout}${result.stderr}`).not.toContain(token);
    }
  );

  test.each(['', '2.3', '2.03.4', '2.3.4-rc.1', 'v2.3.4-beta', '2.3.4;echo bad'])(
    'rejects invalid or prerelease version before I/O: %s',
    (input) => {
      const result = runDispatch({ releaseVersion: input });
      expect(result.status).not.toBe(0);
      expect(result.npmCalls).toEqual([]);
      expect(result.ghCalls).toEqual([]);
    }
  );

  test('requires GH_TOKEN before querying npm', () => {
    const result = runDispatch({ ghToken: '' });
    expect(result.status).not.toBe(0);
    expect(result.npmCalls).toEqual([]);
    expect(result.ghCalls).toEqual([]);
    expect(result.stderr).not.toContain(token);
  });

  test.each([
    { label: 'unpublished version', publicJson: JSON.stringify('2.3.3') },
    { label: 'malformed public response', publicJson: '{' },
    { label: 'non-string public response', publicJson: 'null' },
  ])('does not dispatch on $label', (options) => {
    const result = runDispatch(options);
    expect(result.status).not.toBe(0);
    expect(result.npmCalls).toHaveLength(1);
    expect(result.ghCalls).toEqual([]);
  });

  test.each([
    { label: 'wrong latest tag', latestJson: JSON.stringify('2.3.3') },
    { label: 'malformed latest response', latestJson: '{' },
    { label: 'non-string latest response', latestJson: '{}' },
  ])('does not dispatch on $label', (options) => {
    const result = runDispatch(options);
    expect(result.status).not.toBe(0);
    expect(result.npmCalls).toHaveLength(2);
    expect(result.ghCalls).toEqual([]);
  });

  test('fails closed if public version lookup fails', () => {
    const result = runDispatch({ publicExit: 42 });
    expect(result.status).not.toBe(0);
    expect(result.npmCalls).toHaveLength(1);
    expect(result.ghCalls).toEqual([]);
  });

  test('fails closed if latest tag lookup fails', () => {
    const result = runDispatch({ latestExit: 42 });
    expect(result.status).not.toBe(0);
    expect(result.npmCalls).toHaveLength(2);
    expect(result.ghCalls).toEqual([]);
  });

  test('surfaces a dispatch failure without claiming the docs are synced', () => {
    const result = runDispatch({ ghExit: 42 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Could not queue the docs release dispatch');
    expect(result.stdout).not.toContain('Queued docs release sync');
    expect(result.ghCalls).toHaveLength(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(token);
  });
});
