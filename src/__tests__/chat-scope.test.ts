import { afterEach, describe, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import { selectChatScope, sameChatScope, parseChatCommand } from '../utils/chat-scope';
import { executeChatCommand } from '../utils/chat-commands';
import { ChatHistory } from '../utils/chat-history';

vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
const spaces = [
  { id: 'first', name: 'First', tenant_id: 'owner', created_at: '' },
  { id: 'second', name: 'Second', tenant_id: 'owner', created_at: '' },
];
const client = () => ({ listSpaces: vi.fn().mockResolvedValue(spaces) });
afterEach(() => vi.restoreAllMocks());

describe('authorized chat scope', () => {
  test('an explicit space is resolved against the authenticated catalogue', async () => {
    expect(await selectChatScope(client(), { space: 'first' }, false)).toEqual({
      spaceIds: ['first'],
      label: 'First',
    });
    await expect(selectChatScope(client(), { space: 'foreign' }, false)).rejects.toThrow(
      'accessible catalogue'
    );
  });
  test('a noninteractive session requires explicit scope instead of silently searching all', async () => {
    await expect(selectChatScope(client(), {}, false)).rejects.toThrow('--space');
  });
  test('all is not treated as an implicit expansion to every listed space', async () => {
    await expect(selectChatScope(client(), { space: 'all' }, false)).rejects.toThrow(
      'accessible catalogue'
    );
  });
  test('interactive selection uses accessible space choices', async () => {
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ space: 'second' });
    expect((await selectChatScope(client(), {}, true)).spaceIds).toEqual(['second']);
    expect(inquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'select',
        choices: expect.arrayContaining([expect.objectContaining({ value: 'second' })]),
      }),
    ]);
  });
  test('an empty or failed catalogue never becomes an all-spaces request', async () => {
    await expect(
      selectChatScope({ listSpaces: vi.fn().mockResolvedValue([]) }, { space: 'first' }, false)
    ).rejects.toThrow('No accessible spaces');
    const error = new Error('Catalogue unavailable');
    await expect(
      selectChatScope({ listSpaces: vi.fn().mockRejectedValue(error) }, { space: 'first' }, false)
    ).rejects.toBe(error);
  });
  test('scope comparison ignores catalogue order but detects added or removed access', () => {
    expect(
      sameChatScope(
        { spaceIds: ['first', 'second'], label: '' },
        { spaceIds: ['second', 'first'], label: '' }
      )
    ).toBe(true);
    expect(
      sameChatScope(
        { spaceIds: ['first'], label: '' },
        { spaceIds: ['first', 'second'], label: '' }
      )
    ).toBe(false);
  });
});

describe('local chat commands', () => {
  test('unknown slash input is recognized locally, ordinary messages are not', () => {
    expect(parseChatCommand('/unknown argument')).toEqual({
      command: 'unknown',
      argument: 'argument',
    });
    expect(parseChatCommand('Question about /path')).toBeUndefined();
    expect(parseChatCommand('/')).toEqual({ command: '', argument: '' });
  });
  test('changing space clears prior context, but reselecting it keeps context', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const history = new ChatHistory();
    history.addUserMessage('Old question');
    const context = { client: client(), history, scope: { spaceIds: ['first'], label: 'First' } };
    await executeChatCommand({ command: 'space', argument: 'first' }, context);
    expect(history.isEmpty()).toBe(false);
    const result = await executeChatCommand({ command: 'space', argument: 'second' }, context);
    expect(history.isEmpty()).toBe(true);
    expect(result.scope.spaceIds).toEqual(['second']);
  });
  test('a refused scope change preserves the current scope and history', async () => {
    const history = new ChatHistory();
    history.addUserMessage('Keep me');
    const context = { client: client(), history, scope: { spaceIds: ['first'], label: 'First' } };
    await expect(
      executeChatCommand({ command: 'space', argument: 'foreign' }, context)
    ).rejects.toThrow('accessible catalogue');
    expect(context.scope.spaceIds).toEqual(['first']);
    expect(history.isEmpty()).toBe(false);
  });
  test('slash alone opens the command menu; help and unknown commands never call the server', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const context = {
      client: client(),
      history: new ChatHistory(),
      scope: { spaceIds: ['first'], label: 'First' },
    };
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ command: 'help' });
    await executeChatCommand({ command: '', argument: '' }, context);
    await executeChatCommand({ command: 'unknown', argument: '' }, context);
    expect(log.mock.calls.join('\n')).toContain('/space');
    expect(context.client.listSpaces).not.toHaveBeenCalled();
  });
});
