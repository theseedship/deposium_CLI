import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
let home: string;
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'deposium-preferences-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));
function cli(args: string[], overrides: NodeJS.ProcessEnv = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('DEPOSIUM_'))
  );
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--no-update', ...args], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...env,
      HOME: home,
      LANG: 'en_US.UTF-8',
      LC_ALL: '',
      LC_MESSAGES: '',
      DEPOSIUM_NO_UPDATE: '1',
      ...overrides,
    },
  });
}
function json(args: string[], env?: NodeJS.ProcessEnv) {
  const result = cli(args, env);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}
test('preferences persist across launches, an invocation override does not, and credentials are untouched', () => {
  expect(cli(['config', 'set', 'api-key', 'dep_test_fixture_only_not_real']).status).toBe(0);
  const credentials = path.join(home, '.deposium', 'credentials.json');
  const prior = readFileSync(credentials);
  expect(json(['settings', 'language', 'fr', '--json'])).toMatchObject({
    language: 'fr',
    language_source: 'saved',
    saved_language: 'fr',
  });
  expect(cli(['--help']).stdout).toContain('Utilisation : deposium');
  expect(json(['--lang', 'en', 'settings', 'show', '--json'])).toMatchObject({
    language: 'en',
    language_source: 'flag',
    saved_language: 'fr',
  });
  expect(json(['settings', 'show', '--json']).language).toBe('fr');
  expect(json(['settings', 'language', 'auto', '--json'], { LANG: 'fr_CA.UTF-8' })).toMatchObject({
    language: 'fr',
    language_source: 'locale',
    saved_language: 'auto',
  });
  expect(readFileSync(credentials).equals(prior)).toBe(true);
  expect(readFileSync(path.join(home, '.deposium', 'config.json'), 'utf8')).not.toContain(
    '"language"'
  );
});
test('offline settings work with an unreachable HTTP server and redact diagnostic URLs', () => {
  const result = json(['settings', 'show', '--json'], {
    DEPOSIUM_URL: 'http://user:secret@offline.example.test/private?token=value#fragment',
    DEPOSIUM_EDGE_URL: 'https://user:secret@edge.example.test/private',
  });
  expect(result.instance).toBe('http://offline.example.test');
  expect(result.edge).toBe('https://edge.example.test');
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(existsSync(path.join(home, '.deposium', 'credentials.json'))).toBe(false);
});
test('bad language and conflicting space input fail before authentication without mutating the preference', () => {
  expect(json(['settings', 'language', 'en', '--json']).saved_language).toBe('en');
  for (const args of [
    ['settings', 'language', 'de', '--json'],
    ['--lang=de', 'settings', 'show', '--json'],
    ['settings', 'space', 'foreign', '--clear', '--json'],
    ['settings', 'space', '--json'],
  ]) {
    const result = cli(args);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('auth login');
  }
  expect(json(['settings', 'show', '--json']).saved_language).toBe('en');
});
test('French command help translates metadata without translating flags, enum values or command names', () => {
  const result = cli(['--lang', 'fr', 'search', '--help']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Utilisation : deposium search');
  expect(result.stdout).toContain('--format <type>');
  expect(result.stdout).toContain('json|table|markdown');
  expect(result.stdout).toContain('Rechercher des documents');
  expect(result.stdout).toContain('Options globales :');
});
