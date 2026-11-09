import inquirer from 'inquirer';
import chalk from 'chalk';
import type { MCPClient } from '../client/mcp-client';
import { ChatHistory } from './chat-history';
import { CHAT_HELP, ChatScope, sameChatScope, selectChatScope } from './chat-scope';

interface CommandContext {
  client: Pick<MCPClient, 'listSpaces'>;
  history: ChatHistory;
  scope: ChatScope;
}

async function changeSpace(argument: string, context: CommandContext): Promise<ChatScope> {
  const next = await selectChatScope(context.client, {
    space: argument || undefined,
  });
  if (!sameChatScope(context.scope, next)) {
    context.history.clear();
    console.log(chalk.gray('Conversation history cleared for the new space.'));
  }
  console.log(chalk.cyan(`Space: ${next.label}\n`));
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
        message: 'Chat command:',
        choices: [
          { name: 'Choose space', value: 'space' },
          { name: 'List spaces', value: 'spaces' },
          { name: 'Show help', value: 'help' },
          { name: 'Show history', value: 'history' },
          { name: 'Clear history', value: 'clear' },
          { name: 'Exit chat', value: 'exit' },
        ],
      },
    ]);
    command = choice.command;
  }
  const result = { scope: context.scope, exit: false };
  if (local.argument && command !== 'space') {
    console.log(chalk.yellow('Unexpected command argument. Use /help.'));
    return result;
  }
  switch (command) {
    case 'exit':
      console.log(chalk.green('\n👋 Goodbye!\n'));
      result.exit = true;
      break;
    case 'help':
      console.log(CHAT_HELP);
      break;
    case 'clear':
      context.history.clear();
      console.log(chalk.yellow('🗑️  Conversation history cleared\n'));
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
      console.log(chalk.yellow('Unknown chat command. Use /help.'));
  }
  return result;
}
