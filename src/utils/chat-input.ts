import { createPrompt, useState, useKeypress, useEffect, useRef } from '@inquirer/core';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { matchingChatCommands } from './chat-command-catalogue';
import { menuPageSize } from './menu-layout';
import { tr } from './i18n';

/** Readline owns text editing; Inquirer's screen and lifecycle own the completion popup. */
export const chatMessagePrompt: (
  config: { message: string },
  context?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream; signal?: AbortSignal }
) => Promise<string> = createPrompt<string, { message: string }>((config, done) => {
  const [value, setValue] = useState('');
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [size, setSize] = useState(0);
  const paste = useRef(false);
  const matches = dismissed ? [] : matchingChatCommands(value);

  useEffect(
    (rl) => {
      const resize = () => setSize(size + 1);
      process.stdout.on('resize', resize);
      // Bracketed paste keeps pasted line breaks from submitting a command or a question.
      const bracketed = (enabled: boolean) => {
        rl.output.unmute();
        rl.output.write(enabled ? '\u001b[?2004h' : '\u001b[?2004l');
        rl.output.mute();
      };
      bracketed(true);
      return () => {
        process.stdout.removeListener('resize', resize);
        bracketed(false);
      };
    },
    [size]
  );

  useKeypress((key, rl) => {
    const sequence = (key as typeof key & { sequence?: string }).sequence;
    if (sequence === '\u001b[200~') {
      paste.current = true;
      return;
    }
    if (sequence === '\u001b[201~') {
      paste.current = false;
      return;
    }
    const replace = (text: string) => {
      rl.clearLine(0);
      rl.write(text);
      setValue(text);
    };
    if (key.name === 'enter' || key.name === 'return') {
      if (paste.current) {
        replace(`${value} `);
        return;
      }
      const answer = matches[index] ? `/${matches[index].command}` : value;
      // Readline clears its buffer before this handler. Restore it for cursor bookkeeping.
      replace(answer);
      setFinished(true);
      done(answer);
    } else if (key.name === 'escape') {
      setDismissed(true);
    } else if ((key.name === 'up' || key.name === 'down') && matches.length) {
      replace(value);
      setIndex((index + (key.name === 'down' ? 1 : -1) + matches.length) % matches.length);
    } else if (key.name === 'tab') {
      if (matches[index]) {
        replace(`/${matches[index].command}`);
        setIndex(0);
      }
    } else {
      setValue(rl.line);
      if (rl.line !== value) {
        setIndex(0);
        setDismissed(false);
      }
    }
  });

  const prompt = `${finished ? chalk.green('✔') : chalk.cyan('?')} ${config.message} ${value}`;
  if (finished || !matches.length) return prompt;
  const pageSize = menuPageSize(matches.length);
  const start = Math.max(0, Math.min(index - pageSize + 1, matches.length - pageSize));
  const width = Math.max(12, (process.stdout.columns ?? 80) - 4);
  const lines = matches.slice(start, start + pageSize).map((match, offset) => {
    const label = `/${match.command} — ${match.description}`;
    const clipped =
      Array.from(label).length > width
        ? `${Array.from(label)
            .slice(0, width - 1)
            .join('')}…`
        : label;
    return start + offset === index ? chalk.cyan(`❯ ${clipped}`) : `  ${clipped}`;
  });
  const position = matches.length > pageSize ? ` (${index + 1}/${matches.length})` : '';
  return [
    prompt,
    `\n${lines.join('\n')}\n${chalk.dim(tr('↑↓ choose · Tab complete · Enter run · Esc dismiss'))}${position}`,
  ];
});

/** Keep the standard prompt in non-interactive/dumb terminals and CI. */
export async function readChatMessage(): Promise<string> {
  if (process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== 'dumb' && !process.env.CI)
    return chatMessagePrompt({ message: tr('You:') });
  const { message } = await inquirer.prompt<{ message: string }>([
    { type: 'input', name: 'message', message: tr('You:') },
  ]);
  return message;
}
