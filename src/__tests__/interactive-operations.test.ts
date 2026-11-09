import { afterEach, describe, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import type { MCPClient } from '../client/mcp-client';
import {
  interactiveCompound,
  interactiveScope,
  MAIN_OPERATIONS,
  prepareCompoundHistory,
} from '../interactive';
import { ChatHistory } from '../utils/chat-history';
import { resolveTenantSpace, runMcpTool } from '../utils/command-helpers';
vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('public interactive operations', () => {
  test('does not advertise internal routing or database administration as public actions', () => {
    const values = MAIN_OPERATIONS.map((choice) => choice.value);
    expect(values).not.toContain('dspy');
    expect(values).not.toContain('duckdb');
    expect(values).toContain('corpus');
  });
  test('selects a named authorized space without prompting for tenant or UUID', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ space: 'space-a' });
    const client = {
      listSpaces: vi
        .fn()
        .mockResolvedValue([{ id: 'space-a', name: 'Garden', tenant_id: 'owner' }]),
    };
    expect(await interactiveScope(client as unknown as MCPClient, {})).toEqual({
      space_id: 'space-a',
    });
    expect(inquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        choices: [expect.objectContaining({ name: 'Garden', value: 'space-a' })],
      }),
    ]);
  });
  test('a failed catalogue does not select default or broaden scope', async () => {
    const client = { listSpaces: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(interactiveScope(client as unknown as MCPClient, {})).rejects.toThrow('offline');
    expect(inquirer.prompt).not.toHaveBeenCalled();
  });
  test('explicit direct-command space omits an invented tenant and missing scope fails', () => {
    expect(
      JSON.parse(
        JSON.stringify({ tenant_id: resolveTenantSpace({ space: 'space-a' }, {}).tenantId })
      )
    ).toEqual({});
    expect(() => resolveTenantSpace({}, {})).toThrow('--space');
    expect(() => resolveTenantSpace({}, { defaultSpace: 'default' })).toThrow('--space');
  });
  test('compound sends optional textual prior context; failures never enter history', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const callTool = vi
      .fn()
      .mockResolvedValueOnce({ isError: true, content: { message: 'unavailable' } })
      .mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ success: true, answer: 'Answer' }) }],
      });
    const history = new ChatHistory(10);
    const client = { callTool } as unknown as MCPClient;
    await expect(interactiveCompound(client, history, 'failed question')).rejects.toThrow(
      'unavailable'
    );
    expect(history.isEmpty()).toBe(true);
    await interactiveCompound(client, history, 'first');
    expect(callTool).toHaveBeenLastCalledWith(
      'compound_analyze',
      { query: 'first' },
      expect.any(Object)
    );
    await interactiveCompound(client, history, 'follow-up');
    const args = callTool.mock.calls.at(-1)![1];
    expect(typeof args.context).toBe('string');
    expect(args.context).toContain('first');
    expect(args.context).not.toContain('follow-up');
    expect(args.context).not.toContain('failed question');
  });
  test.each([
    'duckdb_serve',
    'duckdb_connect',
    'duckdb_federate',
    'duckdb_expose',
    'duckdb_mcp_status',
    'duckdb_query_mcp',
    'query_cleanup',
  ])('%s is refused without a tool call', async (tool) => {
    const callTool = vi.fn();
    await expect(
      runMcpTool({ callTool } as unknown as MCPClient, tool, {}, { label: 'Operation' })
    ).rejects.toThrow('server-internal');
    expect(callTool).not.toHaveBeenCalled();
  });
  test.each(['space-a', 'revoked-space'])(
    'a configured %s is a preference, not a forced scope',
    async (defaultSpace) => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ space: 'space-b' });
      const client = {
        listSpaces: vi.fn().mockResolvedValue([
          { id: 'space-a', name: 'First' },
          { id: 'space-b', name: 'Second' },
        ]),
      };
      expect(await interactiveScope(client as unknown as MCPClient, { defaultSpace })).toEqual({
        space_id: 'space-b',
      });
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          default: defaultSpace === 'space-a' ? 'space-a' : undefined,
        }),
      ]);
    }
  );
  test('Compound context can be viewed, declined or cleared before another request', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const history = new ChatHistory(10);
    history.addUserMessage('previous topic');
    history.addAssistantMessage('previous answer');
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ context: 'view' })
      .mockResolvedValueOnce({ context: 'back' });
    const display = vi.spyOn(history, 'display').mockImplementation(() => {});
    expect(await prepareCompoundHistory(history)).toBe(false);
    expect(display).toHaveBeenCalledOnce();
    expect(history.isEmpty()).toBe(false);
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ context: 'clear' });
    expect(await prepareCompoundHistory(history)).toBe(true);
    expect(history.isEmpty()).toBe(true);
  });
});
