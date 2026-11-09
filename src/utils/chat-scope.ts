import { tr } from './i18n';
import inquirer from 'inquirer';
import { menuPageSize } from './menu-layout';
import type { MCPClient } from '../client/mcp-client';
import { terminalText } from './terminal-text';

export interface ChatScope {
  spaceIds: string[];
  label: string;
}

export interface ChatScopeOptions {
  space?: string;
  promptMessage?: string;
  initialSpace?: string;
}

/** Resolve only from the authenticated catalogue; the server rechecks each call. */
export async function selectChatScope(
  client: Pick<MCPClient, 'listSpaces'>,
  options: ChatScopeOptions = {},
  interactive = Boolean(process.stdin.isTTY)
): Promise<ChatScope> {
  if (options.space !== undefined && !options.space.trim())
    throw new Error(tr('Space ID must not be empty.'));
  const spaces = await client.listSpaces();
  if (spaces.length === 0)
    throw new Error(tr('No accessible spaces. Create a space in DEPOSIUM first.'));
  let selected = options.space?.trim();
  if (!selected) {
    const preferred = spaces.find(
      (space) => space.id.toLowerCase() === options.initialSpace?.trim().toLowerCase()
    );
    if (!interactive) {
      if (!preferred) throw new Error(tr('Choose an explicit scope with --space <id>.'));
      return { spaceIds: [preferred.id], label: terminalText(preferred.name) };
    }
    if (options.initialSpace && !preferred)
      console.warn(
        tr('The configured default space is no longer accessible. Choose an available space.')
      );
    const answer = await inquirer.prompt<{ space: string }>([
      {
        type: 'select',
        name: 'space',
        pageSize: menuPageSize(spaces.length, 'catalogue'),
        loop: false,
        default: preferred?.id,
        message: options.promptMessage ?? tr('Chat in which space?'),
        choices: [
          ...spaces.map((space) => ({
            name:
              spaces.filter((candidate) => candidate.name === space.name).length > 1
                ? `${terminalText(space.name)} (${terminalText(space.id)})`
                : terminalText(space.name),
            value: space.id,
          })),
        ],
      },
    ]);
    selected = answer.space;
  }
  const space = spaces.find((space) => space.id.toLowerCase() === selected.toLowerCase());
  if (!space)
    throw new Error(tr('Space is not in your accessible catalogue. Use /spaces to list it.'));
  return { spaceIds: [space.id], label: terminalText(space.name) };
}

/** Compare space IDs without regard to their order or display labels. */
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
  '/sources    List sources received for the last answer',
  '/source <n> Read an emitted citation (or choose with /source)',
  '/verify     Inspect verification details for the last answer',
  '/exit       Return to the terminal or menu',
].join('\n');

/** Exact local command parsing: unknown slash input never reaches the model. */
export function parseChatCommand(input: string): { command: string; argument: string } | undefined {
  if (!input.startsWith('/')) return undefined;
  const [command, ...words] = input.slice(1).split(/\s+/);
  return { command: command.toLowerCase(), argument: words.join(' ') };
}

/** Render local slash help in the current language while keeping command tokens stable. */
export function getChatHelp(): string {
  return CHAT_HELP.split('\n')
    .map((line) => tr(line))
    .join('\n');
}
