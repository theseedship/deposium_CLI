import type { Command } from 'commander';

/** Open the menu for a bare terminal invocation; keep noninteractive callers on offline help. */
export function configureDefaultAction(program: Command, openMenu: () => Promise<void>): void {
  program.action(async () => {
    if (
      process.stdin.isTTY &&
      process.stdout.isTTY &&
      !process.env.CI &&
      process.env.TERM !== 'dumb'
    ) {
      await openMenu();
    } else program.outputHelp();
  });
}
