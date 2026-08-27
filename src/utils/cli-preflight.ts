/**
 * The `preAction` preflight of the `deposium` program.
 *
 * WHY IT IS ITS OWN MODULE. The preflight resolves the server URL, and `getBaseUrl()`
 * THROWS on an `http://` non-localhost URL when `--insecure` was not passed. Some commands
 * never touch the API — `config`, `auth`, and the offline `temporal-assertion` oracle — so
 * for them nothing must be resolved at all: an offline verifier that refused to run because
 * a stored server URL is not acceptable would be failing for a reason it has nothing to do
 * with. The order is therefore: propagate `--insecure`, decide whether the command uses the
 * API, and only then read the configuration.
 *
 * Extracted from `cli.ts` so that order can be tested without booting the whole program.
 *
 * @module utils/cli-preflight
 */

import chalk from 'chalk';
import { getConfig, getBaseUrl } from './config';

/** Commands that run without the API: nothing about the server URL is resolved for them. */
export const NO_API_COMMANDS: readonly string[] = ['config', 'auth', 'temporal-assertion'];

/** Whether the preflight has any reason to read the configuration for this command. */
export function usesApi(currentCommand: string | undefined): boolean {
  return (
    currentCommand !== undefined &&
    currentCommand !== '' &&
    !NO_API_COMMANDS.includes(currentCommand)
  );
}

/**
 * Propagates `--insecure` to the environment, then — for API commands only — reads the
 * configuration and warns when no server URL is set.
 *
 * @param currentCommand - The sub-command name (`program.args[0]`).
 * @param options - Global options; `insecure` stays `undefined` when the flag is absent so
 *   the `DEPOSIUM_INSECURE` environment variable can still decide.
 */
export function runPreflight(
  currentCommand: string | undefined,
  options: { insecure?: boolean } = {}
): void {
  // Propagate --insecure to the env var so enforceUrlSecurity() can read it
  if (options.insecure === true) {
    process.env.DEPOSIUM_INSECURE = 'true';
  }
  if (!usesApi(currentCommand)) {
    return;
  }
  const config = getConfig();
  const insecure = options.insecure ?? process.env.DEPOSIUM_INSECURE === 'true';
  const baseUrl = getBaseUrl(config, { insecure });
  if (!config.deposiumUrl && !config.mcpUrl) {
    console.log(chalk.yellow('⚠️  Deposium server URL not configured.'));
    console.log(chalk.gray(`Using default: ${chalk.cyan(baseUrl)}`));
    console.log(
      chalk.gray('To change, run: ') + chalk.cyan('deposium config set deposium-url <url>')
    );
  }
}
