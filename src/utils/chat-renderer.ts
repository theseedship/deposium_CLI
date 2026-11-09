import chalk from 'chalk';
import type { ChatActivity } from './chat-activity';

/** Own the response prefix and stop terminal activity before any answer is written. */
export function createChatRenderer(activity: ChatActivity) {
  let started = false;
  const begin = () => {
    activity.stop();
    if (!started) process.stdout.write(chalk.green('\nAI: '));
    started = true;
  };
  return {
    waiting(phase?: string) {
      started = false;
      activity.start(phase);
    },
    phase(label: string) {
      if (!started) activity.phase(label);
    },
    token(token: string) {
      begin();
      process.stdout.write(token);
    },
    replace(previous: string, answer: string) {
      activity.stop();
      if (started) {
        // Preserve the existing multiline-draft replacement contract. Soft wrapping
        // is not counted as a newline; full terminal reflow remains separate work.
        process.stdout.write('\r\x1b[K');
        for (let i = 0; i < (previous.match(/\n/g) ?? []).length; i++)
          process.stdout.write('\x1b[F\x1b[K');
        process.stdout.write(chalk.green('AI: ') + answer);
      } else {
        begin();
        process.stdout.write(answer);
      }
    },
  };
}
