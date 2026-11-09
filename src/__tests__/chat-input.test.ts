import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { chatMessagePrompt, readChatMessage } from '../utils/chat-input';
import { matchingChatCommands, chatCommands } from '../utils/chat-command-catalogue';
import { initializeLanguage } from '../utils/i18n';
import { menuPageSize } from '../utils/menu-layout';
import inquirer from 'inquirer';

vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  initializeLanguage(undefined, 'en', {});
});

async function terminal() {
  vi.stubEnv('TERM', 'xterm-256color');
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), { columns: 80, rows: 24, isTTY: true });
  let screen = '';
  output.on('data', (data) => {
    screen += data.toString();
  });
  const controller = new AbortController();
  const answer = chatMessagePrompt(
    { message: 'You:' },
    { input, output, signal: controller.signal }
  );
  await vi.waitFor(() => expect(screen).toContain('You:'));
  return { input, output, answer, controller, text: () => stripVTControlCharacters(screen) };
}

describe('live local chat command input', () => {
  it('filters prefixes, prefers exact tokens and never completes text or arguments', () => {
    expect(matchingChatCommands('/sp').map((x) => x.command)).toEqual(['space', 'spaces']);
    expect(matchingChatCommands('/source')[0].command).toBe('source');
    for (const text of ['question /sp', '/space abc', '/typo', ' /sp'])
      expect(matchingChatCommands(text)).toEqual([]);
    expect(matchingChatCommands('/')).toHaveLength(9);
  });
  it('shows all commands immediately, filters, navigates and completes without sending', async () => {
    const t = await terminal();
    let settled = false;
    void t.answer.then(() => {
      settled = true;
    });
    t.input.write('/');
    await vi.waitFor(() => expect(t.text()).toContain('/verify'));
    t.input.write('sp');
    t.input.write('\u001b[B');
    t.input.write('\t');
    await vi.waitFor(() => expect(t.text()).toContain('You: /spaces'));
    expect(settled).toBe(false);
    t.input.write('\r');
    expect(await t.answer).toBe('/spaces');
    expect(t.input.listenerCount('keypress')).toBe(0);
  });
  it('runs the highlighted command on Enter and preserves an exact /source', async () => {
    const t = await terminal();
    t.input.write('/source\r');
    expect(await t.answer).toBe('/source');
  });
  it('Escape hides suggestions without deleting the input or replacing a prefix', async () => {
    const t = await terminal();
    t.input.write('/sp');
    t.input.write('\u001b');
    await new Promise((resolve) => setTimeout(resolve, 550)); // readline disambiguates lone Escape
    t.input.write('\r');
    expect(await t.answer).toBe('/sp');
  });
  it('preserves Unicode and readline cursor editing for ordinary questions', async () => {
    const t = await terminal();
    t.input.write('été ?');
    t.input.write('\u001b[D');
    t.input.write('ici');
    t.input.write('\r');
    expect(await t.answer).toBe('été ici?');
  });
  it('does not replace command arguments or send unknown slash text to another command', async () => {
    for (const text of ['/space my-id', '/typo', '/source 2']) {
      const t = await terminal();
      t.input.write(`${text}\t\r`);
      expect(await t.answer).toBe(text);
    }
  });
  it('keeps a multiline bracketed paste in the input until explicit Enter', async () => {
    const t = await terminal();
    let settled = false;
    void t.answer.then(() => {
      settled = true;
    });
    t.input.write('\u001b[200~/clear\n/exit\u001b[201~');
    await vi.waitFor(() => expect(t.text()).toContain('/clear /exit'));
    expect(settled).toBe(false);
    t.input.write('\r');
    expect(await t.answer).toBe('/clear /exit');
  });
  it('cleans up terminal listeners and paste mode after abort or Ctrl+C', async () => {
    for (const abort of [true, false]) {
      const baseline = process.stdout.listenerCount('resize');
      const t = await terminal();
      const rejection = expect(t.answer).rejects.toThrow();
      if (abort) t.controller.abort();
      else t.input.write('\u0003');
      await rejection;
      expect(process.stdout.listenerCount('resize')).toBe(baseline);
      expect(t.input.listenerCount('keypress')).toBe(0);
      expect(t.text()).not.toContain('undefined');
    }
  });
  it('rerenders a bounded suggestion list when the terminal is resized', async () => {
    const rows = process.stdout.rows;
    const columns = process.stdout.columns;
    try {
      Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 14 });
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 40 });
      const t = await terminal();
      t.input.write('/');
      await vi.waitFor(() => expect(t.text()).toContain('(1/9)'));
      Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 40 });
      process.stdout.emit('resize');
      await vi.waitFor(() => expect(t.text()).toContain('/exit'));
      t.input.write('\r');
      expect(await t.answer).toBe('/space');
    } finally {
      Object.defineProperty(process.stdout, 'rows', { configurable: true, value: rows });
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: columns });
    }
  });
  it('localizes descriptions without changing command tokens', () => {
    initializeLanguage('fr', undefined, {});
    expect(chatCommands().find((x) => x.command === 'space')?.description).toBe(
      'Choisir un espace'
    );
  });
  it('falls back to the existing prompt without a real terminal', async () => {
    vi.stubEnv('TERM', 'dumb');
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: '/help' });
    expect(await readChatMessage()).toBe('/help');
  });
});

describe('menu viewport', () => {
  it('shows all feature choices on a normal terminal and bounds long data lists', () => {
    expect(menuPageSize(8, 'features', 24)).toBe(8);
    expect(menuPageSize(9, 'features', 24)).toBe(9);
    expect(menuPageSize(100, 'catalogue', 40)).toBe(15);
    expect(menuPageSize(100, 'catalogue', 16)).toBe(7);
    expect(menuPageSize(8, 'features', 12)).toBe(3);
  });
});
