import { afterEach, expect, test, vi } from 'vitest';

const { client, init } = vi.hoisted(() => {
  const client = { callTool: vi.fn() };
  return { client, init: vi.fn().mockResolvedValue({ client }) };
});
vi.mock('../../utils/command-helpers', async (original) => ({
  ...(await original<typeof import('../../utils/command-helpers')>()),
  initializeCommand: init,
}));
import { compoundCommand } from '../../commands/compound';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test.each(['analyze', 'research'])(
  'compound %s JSON is parseable and does not start a spinner',
  async (operation) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const content = [
      { type: 'text', text: JSON.stringify({ success: true, answer: 'Fixture answer' }) },
    ];
    client.callTool.mockResolvedValue({ content, isError: false });
    await compoundCommand.parseAsync([
      'node',
      'test',
      operation,
      'fixture question',
      '--format',
      'json',
    ]);
    expect(JSON.parse(log.mock.calls.flat().join('\n'))).toEqual(content);
    expect(init).toHaveBeenCalledWith({ machineReadable: true });
    expect(client.callTool).toHaveBeenCalledWith(`compound_${operation}`, expect.any(Object), {
      spinner: false,
    });
  }
);
