import inquirer from 'inquirer';
import type { MCPClient } from '../client/mcp-client';

export interface ChatScope {
  spaceIds: string[];
  label: string;
}

export interface ChatScopeOptions {
  space?: string;
}

/** Resolve only from the authenticated catalogue; the server rechecks each call. */
export async function selectChatScope(
  client: Pick<MCPClient, 'listSpaces'>,
  options: ChatScopeOptions = {},
  interactive = Boolean(process.stdin.isTTY)
): Promise<ChatScope> {
  const spaces = await client.listSpaces();
  if (spaces.length === 0)
    throw new Error('No accessible spaces. Create a space in DEPOSIUM first.');
  let selected = options.space;
  if (!selected) {
    if (!interactive) throw new Error('Choose an explicit scope with --space <id>.');
    const answer = await inquirer.prompt<{ space: string }>([
      {
        type: 'select',
        name: 'space',
        message: 'Chat in which space?',
        choices: [
          ...spaces.map((space) => ({ name: `${space.name} (${space.id})`, value: space.id })),
        ],
      },
    ]);
    selected = answer.space;
  }
  const space = spaces.find((space) => space.id.toLowerCase() === selected.toLowerCase());
  if (!space) throw new Error('Space is not in your accessible catalogue. Use /spaces to list it.');
  return { spaceIds: [space.id], label: space.name };
}

export function sameChatScope(a: ChatScope, b: ChatScope): boolean {
  const left = [...a.spaceIds].sort();
  const right = [...b.spaceIds].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export const CHAT_HELP = [
  '/help       Show chat commands',
  '/spaces     List accessible spaces',
  '/space      Choose a space (clears history when scope changes)',
  '/space <id> Choose an accessible space by ID',
  '/clear      Clear conversation history',
  '/history    View conversation history',
  '/exit       Return to the terminal or menu',
].join('\n');

/** Exact local command parsing: unknown slash input never reaches the model. */
export function parseChatCommand(input: string): { command: string; argument: string } | undefined {
  if (!input.startsWith('/')) return undefined;
  const [command, ...words] = input.slice(1).split(/\s+/);
  return { command: command.toLowerCase(), argument: words.join(' ') };
}
