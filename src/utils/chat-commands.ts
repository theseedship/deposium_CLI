import { tr } from './i18n';
import inquirer from 'inquirer';
import { chatCommands } from './chat-command-catalogue';
import { menuPageSize } from './menu-layout';
import chalk from 'chalk';
import type { MCPClient } from '../client/mcp-client';
import { ChatHistory } from './chat-history';
import type { ChatTurnDetails } from './chat-output';
import { executeReferenceCommand } from './chat-reference-commands';
import { getChatHelp, ChatScope, sameChatScope, selectChatScope } from './chat-scope';

interface CommandContext {
  client: Pick<MCPClient, 'listSpaces'>;
  history: ChatHistory;
  scope: ChatScope;
  details?: ChatTurnDetails;
}

async function changeSpace(argument: string, context: CommandContext): Promise<ChatScope> {
  const next = await selectChatScope(context.client, {
    space: argument || undefined,
  });
  if (!sameChatScope(context.scope, next)) {
    context.history.clear();
    if (context.details) {
      context.details.citations = [];
      context.details.verifications = [];
    }
    console.log(chalk.gray(tr('Conversation history cleared for the new space.')));
  }
  console.log(chalk.cyan(tr('Space: {0}\n', next.label)));
  return next;
}

/** Local-only commands: never invoke a model or accept an unchecked space. */
export async function executeChatCommand(
  local: { command: string; argument: string },
  context: CommandContext
): Promise<{ scope: ChatScope; exit: boolean }> {
  let command = local.command;
  if (command === '' && !local.argument) {
    const choice = await inquirer.prompt<{ command: string }>([
      {
        type: 'select',
        name: 'command',
        message: tr('Chat command:'),
        pageSize: menuPageSize(chatCommands().length),
        loop: false,
        choices: chatCommands().map(({ command, description }) => ({
          name: `/${command} — ${description}`,
          value: command,
        })),
      },
    ]);
    command = choice.command;
  }
  const result = { scope: context.scope, exit: false };
  if (local.argument && command !== 'space' && command !== 'source') {
    console.log(chalk.yellow(tr('Unexpected command argument. Use /help.')));
    return result;
  }
  if (['sources', 'source', 'verify'].includes(command)) {
    await executeReferenceCommand(command, local.argument, context.details);
    return result;
  }
  switch (command) {
    case 'exit':
      console.log(chalk.green(tr('\n👋 Goodbye!\n')));
      result.exit = true;
      break;
    case 'help':
      console.log(getChatHelp());
      break;
    case 'clear':
      context.history.clear();
      if (context.details) {
        context.details.citations = [];
        context.details.verifications = [];
      }
      console.log(chalk.yellow(tr('🗑️  Conversation history cleared\n')));
      break;
    case 'history':
      context.history.display();
      break;
    case 'spaces':
      for (const space of await context.client.listSpaces())
        console.log(`  ${space.name} — ${space.id}`);
      break;
    case 'space':
      result.scope = await changeSpace(local.argument, context);
      break;
    default:
      console.log(chalk.yellow(tr('Unknown chat command. Use /help.')));
  }
  return result;
}
