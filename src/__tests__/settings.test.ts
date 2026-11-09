import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import { getLanguage, initializeLanguage } from '../utils/i18n';
const { store, setConfig, deleteConfig, listSpaces, initializeCommand } = vi.hoisted(() => ({
  store: {} as Record<string, string>,
  setConfig: vi.fn(),
  deleteConfig: vi.fn(),
  listSpaces: vi.fn(),
  initializeCommand: vi.fn(),
}));
vi.mock('../utils/config', () => ({
  getConfig: () => ({ ...store, defaultSpace: process.env.DEPOSIUM_SPACE ?? store.defaultSpace }),
  getBaseUrl: (config: { deposiumUrl?: string }) =>
    config.deposiumUrl ?? 'https://app.example.test',
  setConfig,
  deleteConfig,
}));
vi.mock('../utils/command-helpers', () => ({ initializeCommand }));
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
import { saveLanguage, cliContext, verifiedCliContext, diagnosticUrl } from '../utils/preferences';
import {
  saveDefaultSpace,
  clearDefaultSpace,
  openSettings,
  warnSpaceOverride,
} from '../utils/settings';
let output: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.keys(store).forEach((key) => delete store[key]);
  vi.clearAllMocks();
  vi.stubEnv('DEPOSIUM_SPACE', undefined);
  initializeLanguage(undefined, undefined, {});
  setConfig.mockImplementation((key, value) => {
    store[key] = value;
  });
  deleteConfig.mockImplementation((key) => {
    delete store[key];
  });
  output = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  initializeLanguage(undefined, undefined, {});
});
test('language saves are validated before writing and do not touch credentials', () => {
  store.apiKey = 'PRIVATE';
  expect(() => saveLanguage('de')).toThrow('fr, en or auto');
  expect(setConfig).not.toHaveBeenCalled();
  saveLanguage('fr');
  expect(setConfig).toHaveBeenCalledExactlyOnceWith('language', 'fr');
  expect(getLanguage()).toBe('fr');
  expect(store.apiKey).toBe('PRIVATE');
});
test('saving an explicit space rechecks the fresh catalogue; refusal and failure preserve the prior value', async () => {
  store.defaultSpace = 'old';
  listSpaces.mockResolvedValue([{ id: 'new', name: 'Garden' }]);
  await expect(saveDefaultSpace({ listSpaces }, 'foreign', false)).rejects.toThrow(
    'accessible catalogue'
  );
  expect(store.defaultSpace).toBe('old');
  expect(setConfig).not.toHaveBeenCalled();
  listSpaces.mockRejectedValueOnce(new Error('network'));
  await expect(saveDefaultSpace({ listSpaces }, 'new', false)).rejects.toThrow('network');
  expect(store.defaultSpace).toBe('old');
  await saveDefaultSpace({ listSpaces }, 'new', false);
  expect(store.defaultSpace).toBe('new');
});
test('picker uses authorized names; clearing a saved space does not clear an environment override', async () => {
  listSpaces.mockResolvedValue([{ id: 'chosen', name: 'Garden' }]);
  vi.mocked(inquirer.prompt).mockResolvedValueOnce({ space: 'chosen' });
  await saveDefaultSpace({ listSpaces }, undefined, true);
  expect(inquirer.prompt).toHaveBeenCalledWith([
    expect.objectContaining({
      choices: [expect.objectContaining({ name: 'Garden', value: 'chosen' })],
    }),
  ]);
  vi.stubEnv('DEPOSIUM_SPACE', 'environment-space');
  clearDefaultSpace();
  expect(store.defaultSpace).toBeUndefined();
  expect(cliContext().space).toEqual({
    id: 'environment-space',
    source: 'environment',
    status: 'unverified',
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpaceOverride();
  expect(error.mock.calls.flat().join('')).toContain('DEPOSIUM_SPACE');
});
test('space diagnostics distinguish absent, inaccessible and unavailable without replacing the configured ID', async () => {
  expect((await verifiedCliContext({ listSpaces }, {})).space.status).toBe('none');
  expect(listSpaces).not.toHaveBeenCalled();
  listSpaces.mockResolvedValue([]);
  expect((await verifiedCliContext({ listSpaces }, { defaultSpace: 'old' })).space).toMatchObject({
    id: 'old',
    status: 'inaccessible',
  });
  listSpaces.mockRejectedValue(new Error('private backend detail'));
  const context = await verifiedCliContext({ listSpaces }, { defaultSpace: 'old' });
  expect(context.space).toMatchObject({ id: 'old', status: 'unavailable' });
  expect(JSON.stringify(context)).not.toContain('private backend detail');
});
test('diagnostics omit credentials, query, fragment and path; actual API config is unchanged', () => {
  const config = {
    apiKey: 'PRIVATE',
    deposiumUrl: 'https://user:secret@app.example.test/path?token=value#fragment',
    edgeUrl: 'https://user:secret@edge.example.test/path?key=value',
  };
  const json = JSON.stringify(cliContext(config));
  expect(json).toContain('https://app.example.test');
  expect(json).toContain('https://edge.example.test');
  for (const secret of ['PRIVATE', 'secret', 'user:', 'token', 'fragment', '/path'])
    expect(json).not.toContain(secret);
  expect(config.apiKey).toBe('PRIVATE');
  expect(diagnosticUrl('not a URL')).toBe('invalid_url');
});
test('language preferences are available offline and the settings menu redraws in the new language', async () => {
  vi.mocked(inquirer.prompt)
    .mockResolvedValueOnce({ setting: 'language' })
    .mockResolvedValueOnce({ language: 'fr' })
    .mockResolvedValueOnce({ setting: 'back' });
  await openSettings();
  expect(initializeCommand).not.toHaveBeenCalled();
  expect(inquirer.prompt).toHaveBeenNthCalledWith(3, [
    expect.objectContaining({ message: 'Paramètres :' }),
  ]);
  expect(output.mock.calls.flat().join('\n')).toContain('Langue : fr');
});
