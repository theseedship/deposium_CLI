import { tr } from './utils/i18n';
import inquirer from 'inquirer';
import { menuPageSize } from './utils/menu-layout';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import { formatOutput } from './utils/formatter';
import { ChatHistory } from './utils/chat-history';
import { startChat } from './chat';
import { initializeCommand, getErrorMessage } from './utils/command-helpers';
import { selectChatScope } from './utils/chat-scope';
import { mcpErrorMessage } from './utils/mcp-content';
import { runCompoundAnalysis } from './utils/compound-analysis';
import type { DeposiumConfig } from './utils/config';
import { openSettings } from './utils/settings';
import { verifiedCliContext, printCliContext } from './utils/preferences';
import { browseToolCatalogue } from './utils/tool-catalogue';
import { createWelcomeBanner } from './utils/branding';

/** Public terminal operations. Internal routers and database administration are not menu actions. */
export const MAIN_OPERATIONS = [
  { name: 'Chat — ask questions about documents in one space', value: 'chat', icon: '💬' },
  { name: 'Search — find passages in one space', value: 'search', icon: '🔎' },
  { name: 'Corpus statistics — document, page and graph counts', value: 'corpus', icon: '📊' },
  { name: 'Health — check the connected service', value: 'health', icon: '🩺' },
  { name: 'Tools — reference for MCP clients and API integrations', value: 'tools', icon: '🧰' },
  { name: 'Settings — language and default space', value: 'settings', icon: '⚙️' },
  {
    name: 'Advanced — reasoning, query diagnostics and MCP resources',
    value: 'advanced',
    icon: '🧭',
  },
  { name: 'Exit', value: 'exit', icon: '↩' },
];

/** Select an authorized named space, using the configured default only as a picker preference.
 * Throws on catalogue failure or an inaccessible explicit selection; never broadens scope.
 */
export async function interactiveScope(client: MCPClient, config: DeposiumConfig) {
  const selected = await selectChatScope(
    client,
    {
      initialSpace: config.defaultSpace === 'default' ? undefined : config.defaultSpace,
      promptMessage: 'Choose an accessible space:',
    },
    true
  );
  console.log(chalk.cyan(tr('Space: {0}', selected.label)));
  // The authenticated server resolves the tenant; an ID is never fabricated here.
  return { space_id: selected.spaceIds[0] };
}

async function input(message: string): Promise<string> {
  const answer = await inquirer.prompt<{ value: string }>([
    {
      type: 'input',
      name: 'value',
      message,
      validate: (value: string) => value.trim().length > 0 || tr('Enter a value.'),
    },
  ]);
  return answer.value;
}

async function showTool(
  client: MCPClient,
  tool: string,
  args: Record<string, unknown>,
  format = 'table'
) {
  const result = await client.callTool(tool, args, { spinner: true });
  if (result.isError) throw new Error(mcpErrorMessage(result.content));
  formatOutput(result.content, format);
  return result.content;
}

/** Keep only successful exchanges and send previous conversation as optional text. */
export async function interactiveCompound(client: MCPClient, history: ChatHistory, query: string) {
  formatOutput(await runCompoundAnalysis(client, history, query), 'markdown');
}

/** Let the user inspect, clear or decline prior Compound context before another request. */
export async function prepareCompoundHistory(history: ChatHistory): Promise<boolean> {
  while (!history.isEmpty()) {
    const { context } = await inquirer.prompt<{ context: string }>([
      {
        type: 'select',
        name: 'context',
        pageSize: menuPageSize(4),
        loop: false,
        message: tr('Compound conversation context:'),
        choices: [
          { name: tr('Start a new context (clear previous exchanges)'), value: 'clear' },
          { name: tr('Continue with previous exchanges'), value: 'continue' },
          { name: tr('View previous exchanges'), value: 'view' },
          { name: tr('Back without sending a question'), value: 'back' },
        ],
      },
    ]);
    if (context === 'back') return false;
    if (context === 'continue') return true;
    if (context === 'clear') history.clear();
    else history.display();
  }
  return true;
}

async function advanced(history: ChatHistory) {
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'select',
      name: 'action',
      pageSize: menuPageSize(7),
      loop: false,
      message: tr('Advanced operation:'),
      choices: [
        {
          name: tr('General AI (Compound) — no document space selected'),
          value: 'compound',
        },
        {
          name: tr(
            'Query intent — inspect how a question would be classified (does not analyze documents)'
          ),
          value: 'intent',
        },
        { name: tr('Graph components — connected groups in one space'), value: 'components' },
        { name: tr('Graph path — explore relations from an entity ID'), value: 'path' },
        { name: tr('MCP app resources — requires a compatible UI host'), value: 'resources' },
        {
          name: tr('Command reference — purpose and requirements of other commands'),
          value: 'reference',
        },
        { name: tr('Back'), value: 'back' },
      ],
    },
  ]);
  if (action === 'back') return;
  if (action === 'reference') {
    console.log(tr('Run deposium <command> --help for arguments and prerequisites.'));
    console.log('https://docs.deposium.ai/cli/');
    console.log(
      tr('Server-internal routers and database administration are not public terminal operations.')
    );
    return;
  }
  const { client, config } = await initializeCommand();
  if (action === 'compound') {
    if (!(await prepareCompoundHistory(history))) return;
    console.log(
      tr(
        'This operation does not select or search one of your document spaces. To summarize your files, return to Chat. General AI may use server reasoning and web tools.'
      )
    );
    await interactiveCompound(client, history, await input(tr('Question:')));
  } else if (action === 'intent') {
    console.log(
      tr(
        'Classifies your question and suggests search parameters; it does not summarize your documents.'
      )
    );
    await showTool(client, 'smart_analyze', { query_text: await input('Question to classify:') });
  } else if (action === 'components' || action === 'path') {
    const scope = await interactiveScope(client, config);
    const args =
      action === 'path' ? { ...scope, source_id: await input(tr('Source entity ID:')) } : scope;
    await showTool(client, action === 'path' ? 'graph_variable_path' : 'graph_components', args);
  } else if (action === 'resources') {
    const { resource } = await inquirer.prompt<{ resource: string }>([
      {
        type: 'select',
        name: 'resource',
        pageSize: menuPageSize(3),
        loop: false,
        message: tr('Resource to inspect (no browser is opened):'),
        choices: [
          { name: tr('Dashboard resource'), value: 'ui_show_dashboard' },
          { name: tr('Health resource'), value: 'ui_show_health' },
          { name: tr('Tools explorer resource'), value: 'ui_show_tools' },
        ],
      },
    ]);
    await showTool(client, resource, {});
  }
}

export async function startInteractive(): Promise<void> {
  console.log(createWelcomeBanner());
  const history = new ChatHistory(10);
  while (true) {
    const { command } = await inquirer.prompt<{ command: string }>([
      {
        type: 'select',
        name: 'command',
        pageSize: menuPageSize(MAIN_OPERATIONS.length),
        loop: false,
        message: tr('Select an operation:'),
        choices: MAIN_OPERATIONS.map((choice) => ({
          ...choice,
          name: `${choice.icon}  ${tr(choice.name)}`,
        })),
      },
    ]);
    if (command === 'exit') return;
    try {
      if (command === 'settings') {
        await openSettings();
        continue;
      }
      if (command === 'chat') {
        await startChat();
        continue;
      }
      if (command === 'advanced') {
        await advanced(history);
        continue;
      }
      const { client, config } = await initializeCommand();
      if (command === 'search') {
        const scope = await interactiveScope(client, config);
        await showTool(client, 'search_hub', {
          ...scope,
          query_text: await input(tr('Search for:')),
        });
      } else if (command === 'corpus') {
        const scope = await interactiveScope(client, config);
        console.log(
          tr('Counts for the selected space; missing metrics are not assumed to be zero.')
        );
        await showTool(client, 'corpus_stats', scope);
      } else if (command === 'health') {
        // A returned HTTP response is not evidence that every service is healthy.
        formatOutput(await client.health(), 'table');
        printCliContext(await verifiedCliContext(client, config));
      } else if (command === 'tools') {
        await browseToolCatalogue(client);
      }
    } catch (error) {
      console.error(chalk.red(tr('Operation failed:')), getErrorMessage(error));
      console.error(
        tr(
          'Check the selected space, authentication and permissions. Use deposium <command> --help for requirements.'
        )
      );
    }
  }
}
