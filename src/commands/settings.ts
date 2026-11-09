import { Command } from 'commander';
import { cliContext, printCliContext, saveLanguage } from '../utils/preferences';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';
import {
  clearDefaultSpace,
  openSettings,
  saveDefaultSpace,
  warnSpaceOverride,
} from '../utils/settings';
import { tr } from '../utils/i18n';

function showSettings(json = false): void {
  const context = cliContext();
  if (json) console.log(JSON.stringify(context, null, 2));
  else printCliContext(context);
}

/** Public presentation/scope settings; no credential or server-security mutation. */
export const settingsCommand: Command = new Command('settings')
  .description('Manage language and default-space preferences')
  .option('--json', 'Show effective settings as JSON without prompts')
  .action(
    withErrorHandling(async (options: { json?: boolean }) => {
      if (options.json || !process.stdin.isTTY || !process.stdout.isTTY) showSettings(options.json);
      else await openSettings();
    })
  )
  .addCommand(
    new Command('show')
      .description('Show effective settings without credentials or network calls')
      .option('--json', 'Show effective settings as JSON without prompts')
      .action((options: { json?: boolean }) =>
        showSettings(options.json ?? settingsCommand.opts().json)
      )
  )
  .addCommand(
    new Command('language')
      .description('Save the UI and default chat language (fr|en|auto)')
      .argument('<language>', 'Language preference: fr, en or auto')
      .option('--json', 'Show effective settings as JSON without prompts')
      .action(
        withErrorHandling(async (language: string, options: { json?: boolean }) => {
          saveLanguage(language);
          showSettings(options.json ?? settingsCommand.opts().json);
        })
      )
  )
  .addCommand(
    new Command('space')
      .description('Save an authorized default space or clear the saved preference')
      .argument('[id]', 'An accessible space ID; omit to choose by name in a terminal')
      .option('--clear', 'Clear the saved space without changing environment overrides')
      .option('--json', 'Show effective settings as JSON without prompts')
      .action(
        withErrorHandling(
          async (id: string | undefined, options: { clear?: boolean; json?: boolean }) => {
            const json = options.json ?? settingsCommand.opts().json;
            if (options.clear && id) throw new Error(tr('Do not combine a space ID with --clear.'));
            if (options.clear) clearDefaultSpace();
            else {
              const interactive = !json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
              if (!id && !interactive)
                throw new Error(tr('Choose an explicit scope with --space <id>.'));
              const { client } = await initializeCommand({ machineReadable: !interactive });
              await saveDefaultSpace(client, id, interactive);
            }
            warnSpaceOverride();
            showSettings(json);
          }
        )
      )
  );
