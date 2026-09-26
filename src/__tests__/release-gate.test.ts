import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const script = join(process.cwd(), '.github', 'scripts', 'npm-release-gate.sh');
const packageName = '@example/release-gate';
const version = '2.3.4';

interface GateOptions {
  event?: 'push' | 'workflow_dispatch';
  ref?: string;
  previousVersion?: string;
  dryRun?: boolean;
  publicJson?: string;
  stagedJson?: string;
  publicExit?: number;
  stagedExit?: number;
}

function runGate(options: GateOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cli-release-gate-'));
  try {
    const output = join(root, 'output');
    const summary = join(root, 'summary');
    const calls = join(root, 'npm-calls');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: packageName, version }));
    writeFileSync(output, '');
    writeFileSync(summary, '');
    writeFileSync(calls, '');

    const git = join(root, 'git');
    writeFileSync(
      git,
      '#!/bin/sh\n[ "$1" = show ] || exit 40\nprintf \'{"version":"%s"}\\n\' "$PREVIOUS_VERSION"\n'
    );
    chmodSync(git, 0o755);

    const npm = join(root, 'npm');
    writeFileSync(
      npm,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$NPM_CALLS"\n' +
        'if [ "$1" = view ]; then\n  [ "$PUBLIC_EXIT" = 0 ] || exit "$PUBLIC_EXIT"\n  printf \'%s\\n\' "$PUBLIC_JSON"\n' +
        'elif [ "$1" = stage ] && [ "$2" = list ]; then\n  [ "$STAGED_EXIT" = 0 ] || exit "$STAGED_EXIT"\n  printf \'%s\\n\' "$STAGED_JSON"\n' +
        'else\n  exit 41\nfi\n'
    );
    chmodSync(npm, 0o755);

    const ref = options.ref ?? 'refs/heads/main';
    const result = spawnSync('bash', [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${root}:${process.env.PATH ?? ''}`,
        GITHUB_EVENT_NAME: options.event ?? 'push',
        GITHUB_REF: ref,
        GITHUB_REF_NAME: ref.split('/').at(-1) ?? '',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        PUSH_BEFORE: 'previous-commit',
        PREVIOUS_VERSION: options.previousVersion ?? '2.3.3',
        DRY_RUN: String(options.dryRun ?? false),
        NPM_CALLS: calls,
        PUBLIC_JSON: options.publicJson ?? '["2.3.3"]',
        STAGED_JSON: options.stagedJson ?? '[]',
        PUBLIC_EXIT: String(options.publicExit ?? 0),
        STAGED_EXIT: String(options.stagedExit ?? 0),
      },
    });
    if (result.error) throw result.error;
    return {
      status: result.status,
      output: readFileSync(output, 'utf8'),
      summary: readFileSync(summary, 'utf8'),
      calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform === 'win32')('npm release gate', () => {
  test('skips a main push without a version change before querying npm', () => {
    const result = runGate({ previousVersion: version });
    expect(result.status).toBe(0);
    expect(result.output).toContain('proceed=false');
    expect(result.calls).toEqual([]);
  });

  test('allows a changed, unpublished and unstaged version', () => {
    const result = runGate();
    expect(result.status).toBe(0);
    expect(result.output).toContain('proceed=true');
    expect(result.calls).toEqual([
      `view ${packageName} versions --json --prefer-online`,
      `stage list ${packageName} --json`,
    ]);
  });

  test('skips a version already public without querying stages', () => {
    const result = runGate({ publicJson: JSON.stringify(['2.3.3', version]) });
    expect(result.status).toBe(0);
    expect(result.output).toContain('proceed=false');
    expect(result.summary).toContain('already public');
    expect(result.calls).toHaveLength(1);
  });

  test('skips a staged version and reports its stage ID', () => {
    const result = runGate({
      stagedJson: JSON.stringify([{ id: 'stage-123', packageName, version }]),
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain('proceed=false');
    expect(result.summary).toContain('ID stage-123');
  });

  test('fails closed on malformed public JSON', () => {
    const result = runGate({ publicJson: '{' });
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('proceed=true');
    expect(result.calls).toHaveLength(1);
  });

  test('fails closed on malformed staged JSON', () => {
    const result = runGate({ stagedJson: '{}' });
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('proceed=true');
    expect(result.calls).toHaveLength(2);
  });

  test('allows a matching version tag', () => {
    const result = runGate({ ref: `refs/tags/v${version}` });
    expect(result.status).toBe(0);
    expect(result.output).toContain('proceed=true');
  });

  test('rejects a mismatched version tag before querying npm', () => {
    const result = runGate({ ref: 'refs/tags/v2.3.3' });
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('proceed=true');
    expect(result.calls).toEqual([]);
  });

  test('allows manual dry runs without querying npm', () => {
    const result = runGate({ event: 'workflow_dispatch', dryRun: true, publicJson: '{' });
    expect(result.status).toBe(0);
    expect(result.output).toContain('proceed=true');
    expect(result.calls).toEqual([]);
  });

  test('fails closed when npm view fails', () => {
    const result = runGate({ publicExit: 42 });
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('proceed=true');
    expect(result.calls).toHaveLength(1);
  });

  test('fails closed when npm stage list fails', () => {
    const result = runGate({ stagedExit: 42 });
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('proceed=true');
    expect(result.calls).toHaveLength(2);
  });

  test('fails closed when a matching stage has no ID', () => {
    const result = runGate({ stagedJson: JSON.stringify([{ packageName, version }]) });
    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain('proceed=true');
    expect(result.calls).toHaveLength(2);
  });
});
