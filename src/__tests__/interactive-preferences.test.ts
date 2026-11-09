import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import { initializeLanguage } from '../utils/i18n';
const { initializeCommand, openSettings, startChat, health } = vi.hoisted(() => ({
  initializeCommand: vi.fn(),
  openSettings: vi.fn(),
  startChat: vi.fn(),
  health: vi.fn(),
}));
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
vi.mock('../utils/command-helpers', () => ({
  initializeCommand,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('../utils/settings', () => ({ openSettings }));
vi.mock('../chat', () => ({ startChat }));
vi.mock('../utils/config', () => ({
  getConfig: () => ({}),
  getBaseUrl: () => 'https://app.example.test',
}));
import { startInteractive } from '../interactive';
beforeEach(() => {
  vi.clearAllMocks();
  initializeLanguage(undefined, undefined, {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  health.mockResolvedValue({ status: 'ok' });
  initializeCommand.mockResolvedValue({ client: { health }, config: {} });
});
afterEach(() => {
  vi.restoreAllMocks();
  initializeLanguage(undefined, undefined, {});
});
test('the main menu and exit are available without authentication or network work', async () => {
  vi.mocked(inquirer.prompt).mockResolvedValueOnce({ command: 'exit' });
  await startInteractive();
  expect(initializeCommand).not.toHaveBeenCalled();
});
test('offline Settings is reachable before login and the next main menu reflects its saved language', async () => {
  vi.mocked(inquirer.prompt)
    .mockResolvedValueOnce({ command: 'settings' })
    .mockResolvedValueOnce({ command: 'exit' });
  openSettings.mockImplementationOnce(async () => initializeLanguage('fr', undefined, {}));
  await startInteractive();
  expect(openSettings).toHaveBeenCalledOnce();
  expect(initializeCommand).not.toHaveBeenCalled();
  expect(inquirer.prompt).toHaveBeenNthCalledWith(2, [
    expect.objectContaining({
      choices: expect.arrayContaining([
        expect.objectContaining({
          value: 'settings',
          name: 'Paramètres — langue et espace par défaut',
        }),
      ]),
    }),
  ]);
});
test('Chat owns its existing authentication initialization, without a redundant menu initialization', async () => {
  vi.mocked(inquirer.prompt)
    .mockResolvedValueOnce({ command: 'chat' })
    .mockResolvedValueOnce({ command: 'exit' });
  await startInteractive();
  expect(startChat).toHaveBeenCalledOnce();
  expect(initializeCommand).not.toHaveBeenCalled();
});
test('advanced reference and back do not authenticate before an API operation is chosen', async () => {
  vi.mocked(inquirer.prompt)
    .mockResolvedValueOnce({ command: 'advanced' })
    .mockResolvedValueOnce({ action: 'reference' })
    .mockResolvedValueOnce({ command: 'advanced' })
    .mockResolvedValueOnce({ action: 'back' })
    .mockResolvedValueOnce({ command: 'exit' });
  await startInteractive();
  expect(initializeCommand).not.toHaveBeenCalled();
});
test('an API operation still initializes and authenticates before calling the client', async () => {
  vi.mocked(inquirer.prompt)
    .mockResolvedValueOnce({ command: 'health' })
    .mockResolvedValueOnce({ command: 'exit' });
  await startInteractive();
  expect(initializeCommand).toHaveBeenCalledOnce();
  expect(health).toHaveBeenCalledOnce();
  expect(initializeCommand.mock.invocationCallOrder[0]).toBeLessThan(
    health.mock.invocationCallOrder[0]
  );
});
