import inquirer from 'inquirer';
import { menuPageSize } from './menu-layout';
import { getConfig, setConfig, deleteConfig } from './config';
import type { MCPClient } from '../client/mcp-client';
import { initializeCommand } from './command-helpers';
import { selectChatScope } from './chat-scope';
import { cliContext, printCliContext, saveLanguage } from './preferences';
import { tr } from './i18n';

/** Persist only a fresh catalogue-authorized space; failures leave the prior preference intact. */
export async function saveDefaultSpace(
  client: Pick<MCPClient, 'listSpaces'>,
  id?: string,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
): Promise<void> {
  const scope = await selectChatScope(
    client,
    {
      space: id,
      initialSpace: getConfig().defaultSpace,
      promptMessage: tr('Choose the default space:'),
    },
    interactive
  );
  setConfig('defaultSpace', scope.spaceIds[0]);
}

/** Clear the saved preference only; an environment override continues to apply. */
export function clearDefaultSpace(): void {
  deleteConfig('defaultSpace');
}

/** Explain active environment precedence rather than claiming a saved value is effective. */
export function warnSpaceOverride(): void {
  if (process.env.DEPOSIUM_SPACE !== undefined)
    console.error(
      tr(
        'DEPOSIUM_SPACE overrides the saved default. Change or unset it to use the saved preference.'
      )
    );
}

/** Settings can open without authentication; only selecting a space needs the API. */
export async function openSettings(): Promise<void> {
  while (true) {
    printCliContext(cliContext());
    const { setting } = await inquirer.prompt<{ setting: string }>([
      {
        type: 'select',
        name: 'setting',
        pageSize: menuPageSize(4),
        loop: false,
        message: tr('Settings:'),
        choices: [
          { name: tr('Language — menus and default chat answer'), value: 'language' },
          { name: tr('Default space — choose by name'), value: 'space' },
          { name: tr('Clear saved default space'), value: 'clear-space' },
          { name: tr('Back'), value: 'back' },
        ],
      },
    ]);
    if (setting === 'back') return;
    try {
      if (setting === 'language') {
        const { language } = await inquirer.prompt<{ language: string }>([
          {
            type: 'select',
            name: 'language',
            pageSize: menuPageSize(3),
            loop: false,
            message: tr('Language preference:'),
            default: getConfig().language ?? 'auto',
            choices: [
              { name: tr('Français'), value: 'fr' },
              { name: tr('English'), value: 'en' },
              { name: tr('Automatic — terminal locale, then English'), value: 'auto' },
            ],
          },
        ]);
        saveLanguage(language);
      } else if (setting === 'space') {
        const { client } = await initializeCommand();
        await saveDefaultSpace(client);
        warnSpaceOverride();
      } else if (setting === 'clear-space') {
        clearDefaultSpace();
        warnSpaceOverride();
      }
    } catch (error) {
      console.error(
        tr('Settings change failed:'),
        error instanceof Error ? error.message : tr('Unknown error')
      );
    }
  }
}
