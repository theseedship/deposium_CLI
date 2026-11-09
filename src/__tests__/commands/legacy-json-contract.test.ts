import { afterEach, expect, test, vi } from 'vitest';
import type { Command } from 'commander';

const { client, init } = vi.hoisted(() => {
  const client = { callTool: vi.fn() };
  return {
    client,
    init: vi.fn().mockResolvedValue({ client, config: { defaultSpace: 'fixture-space' } }),
  };
});
vi.mock('../../utils/command-helpers', async (original) => ({
  ...(await original<typeof import('../../utils/command-helpers')>()),
  initializeCommand: init,
}));
import { corpusCommand } from '../../commands/corpus';
import { intelligenceCommand } from '../../commands/intelligence';
import { dspyCommand } from '../../commands/dspy';
import { leanragCommand } from '../../commands/leanrag';
import { mermaidCommand } from '../../commands/mermaid';
import { evaluateCommand } from '../../commands/evaluate';
import { uiCommand } from '../../commands/ui';
import { logsCommand } from '../../commands/logs';
import { queryHistoryCommand } from '../../commands/query-history';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function resetOptions(command: Command): void {
  for (const option of command.options)
    command.setOptionValue(option.attributeName(), option.defaultValue);
  command.commands.forEach(resetOptions);
}

const cases: Array<[Command, string[]]> = [
  [corpusCommand, ['stats']],
  [corpusCommand, ['evaluate']],
  [corpusCommand, ['improve', '--type', 'add_missing_topics', '--evaluation-results', '{}']],
  [corpusCommand, ['eval-snapshot']],
  [corpusCommand, ['monitor']],
  [corpusCommand, ['freshness']],
  [corpusCommand, ['drift']],
  [intelligenceCommand, ['analyze', 'fixture']],
  [intelligenceCommand, ['suggest', 'fixture']],
  [intelligenceCommand, ['summarize', '[]']],
  [intelligenceCommand, ['elicit', 'fixture']],
  [dspyCommand, ['analyze', 'fixture']],
  [leanragCommand, ['retrieve', 'fixture']],
  [leanragCommand, ['aggregate', '[]']],
  [leanragCommand, ['analyze', 'fixture']],
  [mermaidCommand, ['parse']],
  [mermaidCommand, ['generate', 'flowchart', '--data', '{}']],
  [mermaidCommand, ['query', 'fixture']],
  [evaluateCommand, ['metrics', '--user-id', 'fixture-user']],
  [evaluateCommand, ['dashboard']],
  [
    evaluateCommand,
    [
      'feedback',
      '--query-id',
      'fixture-query',
      '--user-id',
      'fixture-user',
      '--score',
      '0.5',
      '--feedback',
      'fixture',
    ],
  ],
  [evaluateCommand, ['code', 'fixture']],
  [evaluateCommand, ['graph']],
  [evaluateCommand, ['quality', 'fixture']],
  [uiCommand, ['dashboard']],
  [uiCommand, ['search-ui']],
  [uiCommand, ['health-monitor']],
  [uiCommand, ['tools-explorer']],
  [uiCommand, ['embeddings-monitor']],
  [logsCommand, ['view']],
  [logsCommand, ['stats']],
  [logsCommand, ['clear', '--confirm']],
  [logsCommand, ['search', 'fixture']],
  [queryHistoryCommand, ['log', 'fixture']],
  [queryHistoryCommand, ['export']],
  [queryHistoryCommand, ['retrieve']],
  [queryHistoryCommand, ['stats']],
];

test.each(
  cases.map(([command, args]) => ({ name: `${command.name()} ${args[0]}`, command, args }))
)(
  '$name returns only JSON and never requests interactive authentication or a spinner',
  async ({ command, args }) => {
    resetOptions(command);
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const content = [{ type: 'text', text: JSON.stringify({ fixture: true }) }];
    client.callTool.mockResolvedValue({ content, isError: false });
    await command.parseAsync(['node', 'test', ...args, '--format', 'json']);
    expect(error).not.toHaveBeenCalled();
    expect(JSON.parse(output.mock.calls.flat().join('\n'))).toEqual(content);
    expect(init).toHaveBeenCalledWith({ machineReadable: true });
    expect(client.callTool).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      spinner: false,
    });
  }
);

test('clearing logs without confirmation fails before authentication or backend execution', async () => {
  resetOptions(logsCommand);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  await logsCommand.parseAsync(['node', 'test', 'clear', '--format', 'json']);
  expect(init).not.toHaveBeenCalled();
  expect(client.callTool).not.toHaveBeenCalled();
  expect(output).not.toHaveBeenCalled();
  expect(exit).toHaveBeenCalledWith(1);
});

test.each([[], ['--confirm']])(
  'internal cleanup refuses explicitly before auth, including %j',
  async (confirmation) => {
    resetOptions(queryHistoryCommand);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await queryHistoryCommand.parseAsync([
      'node',
      'test',
      'cleanup',
      ...confirmation,
      '--format',
      'json',
    ]);
    expect(init).not.toHaveBeenCalled();
    expect(client.callTool).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  }
);
