import { afterEach, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import { initializeCommand } from '../utils/command-helpers';
import { startChat } from '../chat';
import type { ChatStreamOptions } from '../client/mcp-client';

vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
vi.mock('../utils/config', () => ({
  getConfig: () => ({}),
  getEdgeUrl: () => 'https://edge.example.test',
  getMcpDirectUrl: () => 'https://mcp.example.test',
}));
vi.mock('../utils/command-helpers', () => ({
  initializeCommand: vi.fn(),
  getErrorMessage: (e: Error) => e.message,
}));
afterEach(() => vi.restoreAllMocks());

test('the REPL keeps scope and follow-up context, isolates a changed space and handles slash commands locally', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const turns: Array<{ message: string; spaceIds: string[]; history: unknown[] }> = [];
  const client = {
    listSpaces: vi.fn().mockResolvedValue([
      { id: 'first', name: 'First' },
      { id: 'second', name: 'Second' },
    ]),
    chatStream: vi.fn(async (_url: string, message: string, opts: ChatStreamOptions) => {
      turns.push({
        message,
        spaceIds: [...(opts.spaceIds ?? [])],
        history: [...(opts.conversationHistory ?? [])],
      });
      opts.onToken('Answer.');
    }),
  };
  vi.mocked(initializeCommand).mockResolvedValue({ client } as unknown as Awaited<
    ReturnType<typeof initializeCommand>
  >);
  for (const message of [
    '/help',
    '/typo',
    'Question one',
    'Follow-up',
    '/space second',
    'Question two',
    '/exit',
  ]) {
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message });
  }
  await startChat({ space: 'first' });
  expect(turns.map((t) => t.message)).toEqual(['Question one', 'Follow-up', 'Question two']);
  expect(turns.map((t) => t.spaceIds)).toEqual([['first'], ['first'], ['second']]);
  expect(turns[0].history).toEqual([]);
  expect(turns[1].history).not.toContainEqual({ role: 'user', content: 'Follow-up' });
  expect(turns[1].history).toContainEqual({ role: 'assistant', content: 'Answer.' });
  expect(turns[2].history).not.toContainEqual({ role: 'user', content: 'Question one' });
  expect(turns[2].history).not.toContainEqual({ role: 'user', content: 'Follow-up' });
});

test('a blocked answer without fallback does not feed the rejected turn into the next question', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const histories: unknown[] = [];
  let count = 0;
  const client = {
    listSpaces: vi.fn().mockResolvedValue([{ id: 'first', name: 'First' }]),
    chatStream: vi.fn(async (_url: string, _message: string, opts: ChatStreamOptions) => {
      histories.push(opts.conversationHistory);
      if (count++ === 0) opts.onAnswerBlocked?.({ id: 'answer', reason: 'unsupported_claim' });
      else opts.onToken('Safe answer.');
    }),
  };
  vi.mocked(initializeCommand).mockResolvedValue({ client } as unknown as Awaited<
    ReturnType<typeof initializeCommand>
  >);
  for (const message of ['Rejected question', 'New question', '/exit'])
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message });
  await startChat({ space: 'first' });
  expect(histories).toEqual([[], []]);
});
