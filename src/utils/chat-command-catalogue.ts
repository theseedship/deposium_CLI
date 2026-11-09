import { tr } from './i18n';

const COMMANDS = [
  { command: 'space', description: 'Choose space' },
  { command: 'spaces', description: 'List spaces' },
  { command: 'sources', description: 'Sources for the last answer' },
  { command: 'source', description: 'Read a cited passage' },
  { command: 'verify', description: 'Verification details' },
  { command: 'help', description: 'Show help' },
  { command: 'history', description: 'Show history' },
  { command: 'clear', description: 'Clear history' },
  { command: 'exit', description: 'Exit chat' },
] as const;

/** Shared local catalogue: completion and the slash menu cannot offer different commands. */
export function chatCommands() {
  return COMMANDS.map(({ command, description }) => ({ command, description: tr(description) }));
}

/** Complete only a slash command token, never ordinary prose or command arguments. */
export function matchingChatCommands(input: string) {
  if (!/^\/[a-z]*$/i.test(input)) return [];
  const prefix = input.slice(1).toLowerCase();
  const matches = chatCommands().filter(({ command }) => command.startsWith(prefix));
  const exact = matches.find(({ command }) => command === prefix);
  return exact ? [exact, ...matches.filter((match) => match !== exact)] : matches;
}
