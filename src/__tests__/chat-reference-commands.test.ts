import { afterEach, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import {
  chatSourceChoices,
  printChatSourceDetail,
  printChatSources,
  printChatVerification,
} from '../utils/chat-output';
import { executeChatCommand } from '../utils/chat-commands';
import { ChatHistory } from '../utils/chat-history';
import type { ChatTurnDetails } from '../utils/chat-output';
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function capture() {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => spy.mock.calls.flat().join('\n');
}
const source = {
  citation_id: 15,
  file_id: 42,
  file_name: 'pitch.pdf',
  page: 7,
  snippet: 'The documented amount is 100.',
};

test('citation numbers stay aligned with emitted references and expose readable passages', async () => {
  const out = capture();
  const details: ChatTurnDetails = { citations: [source], verifications: [] };
  const client = { listSpaces: vi.fn() };
  await executeChatCommand(
    { command: 'source', argument: '15' },
    { client, history: new ChatHistory(10), scope: { spaceIds: ['one'], label: 'One' }, details }
  );
  expect(out()).toContain('Citation 15');
  expect(out()).toContain('pitch.pdf p.7');
  expect(out()).toContain(source.snippet);
  expect(client.listSpaces).not.toHaveBeenCalled();
  printChatSources(details.citations);
  expect(out()).toContain('citations 15');
  expect(out()).toContain('/source');
});

test('a later unavailable reference supersedes earlier metadata without leaking it', () => {
  const out = capture();
  const citations = [source, { ...source, availability: 'unavailable' as const }];
  expect(chatSourceChoices(citations)).toEqual([]);
  printChatSourceDetail(citations, 15);
  expect(out()).not.toContain('pitch.pdf');
  expect(out()).not.toContain(source.snippet);
});

test('excerpts are bounded and terminal control sequences are stripped', () => {
  const out = capture();
  printChatSourceDetail(
    [{ ...source, file_name: '\x1b]52;c;AAAA\x07pitch.pdf', snippet: 'x'.repeat(3000) }],
    15
  );
  expect(out()).not.toContain('AAAA');
  expect(out()).not.toContain('\x1b');
  expect(out()).toContain('Excerpt truncated');
  expect(out()).not.toContain('x'.repeat(2501));
});

test('clearing history or changing space clears inspectable references', async () => {
  capture();
  const details: ChatTurnDetails = { citations: [source], verifications: [] };
  const client = { listSpaces: vi.fn().mockResolvedValue([{ id: 'two', name: 'Two' }]) };
  const context = {
    client,
    history: new ChatHistory(10),
    scope: { spaceIds: ['one'], label: 'One' },
    details,
  };
  await executeChatCommand({ command: 'clear', argument: '' }, context);
  expect(details.citations).toEqual([]);
  details.citations = [source];
  await executeChatCommand({ command: 'space', argument: 'two' }, context);
  expect(details.citations).toEqual([]);
});

test('interactive source selection offers actual citation IDs, and invalid input never becomes a question', async () => {
  const out = capture();
  const context = {
    client: { listSpaces: vi.fn() },
    history: new ChatHistory(10),
    scope: { spaceIds: ['one'], label: 'One' },
    details: { citations: [source], verifications: [] },
  };
  vi.mocked(inquirer.prompt).mockResolvedValueOnce({ citation: '15' });
  await executeChatCommand({ command: 'source', argument: '' }, context);
  expect(out()).toContain(source.snippet);
  await executeChatCommand({ command: 'source', argument: '15 bad' }, context);
  expect(out()).toContain('Use /source');
  expect(context.client.listSpaces).not.toHaveBeenCalled();
});

test('known verifier categories remain visible without dumping technical quote fragments', () => {
  const out = capture();
  const events = [
    {
      validated: true,
      passed: false,
      action: 'human_review' as const,
      issues: [
        {
          type: 'amount_mismatch',
          severity: 'high',
          description: 'Amount in claim absent: RAW QUOTE',
        },
        {
          type: 'entity_unresolved',
          severity: 'low',
          description: 'Entity not verified: RAW NAME',
        },
      ],
      recommendation: 'Issues detected: entity_unresolved, amount_mismatch.',
    },
  ];
  printChatVerification(events);
  expect(out()).toContain('response needs review');
  expect(out()).toContain('Amounts to check');
  expect(out()).toContain('Names not linked');
  expect(out()).not.toContain('RAW QUOTE');
  expect(out()).not.toContain('RAW NAME');
  expect(out()).not.toContain('Issues detected:');
  printChatVerification(events, true);
  expect(out()).toContain('RAW QUOTE');
  expect(out()).toContain('Issues detected:');
});

test('missing or malformed source identities are not invented for inspection', () => {
  const out = capture();
  const malformed = [
    { citation_id: 1, snippet: 'No identity' },
    null,
    { ...source, availability: 'unknown' },
  ] as unknown as ChatTurnDetails['citations'];
  expect(chatSourceChoices(malformed)).toEqual([]);
  printChatSourceDetail(malformed, 1);
  expect(out()).not.toContain('undefined');
  expect(out()).not.toContain('No identity');
  printChatSourceDetail(
    [{ ...source, page: '\x1b]52;c;AAAA\x07' } as unknown as typeof source],
    15
  );
  expect(out()).not.toContain('AAAA');
});
