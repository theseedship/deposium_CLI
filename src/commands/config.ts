import { tr } from '../utils/i18n';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  getConfig,
  getBaseUrl,
  setConfig,
  setApiKey,
  deleteConfig,
  deleteApiKey,
  resetConfig,
  getConfigPath,
  DeposiumConfig,
} from '../utils/config';
import { saveLanguage } from '../utils/preferences';
import { updateSavedLanguage } from '../utils/i18n';
import { assertNotServiceKey } from '../utils/auth';

type ConfigKey = keyof DeposiumConfig;

export const configCommand = new Command('config')
  .description('Manage Deposium CLI configuration')
  .addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key')
      .argument('<value>', 'Configuration value')
      .action((key, value) => {
        const validKeys = [
          'api-key',
          'deposium-url',
          'mcp-url', // @deprecated - use deposium-url
          'default-tenant',
          'default-space',
          'language',
        ];

        if (!validKeys.includes(key)) {
          console.error(chalk.red(tr('\n❌ Invalid key: {0}', key)));
          console.log(chalk.yellow(tr('\nValid keys:')));
          validKeys.forEach((k) => console.log(`  - ${k}`));
          console.log('');
          process.exit(1);
        }

        if (key === 'language') {
          saveLanguage(value);
          console.log(tr('Language preference saved.'));
          return;
        }

        // `api-key` is special: it goes to the separate credentials
        // store (chmod 0600, encrypted) — NOT the main config — so the
        // security guarantee "API key isolated in ~/.deposium/credentials"
        // holds whatever path provisioned it. Service-key guardrail
        // runs first so a `dep_svc_*` paste fails fast with a clear
        // message instead of a cryptic 401 on the next call.
        if (key === 'api-key') {
          if (typeof value !== 'string' || value.trim().length === 0) {
            console.error(chalk.red(tr('\n❌ api-key must be a non-empty string\n')));
            process.exit(1);
          }
          assertNotServiceKey(value, 'prompt');
          setApiKey(value);
          console.log(
            chalk.green(tr('\n✅ Set {0} (stored in credentials)\n', chalk.cyan('api-key')))
          );
          return;
        }

        // Convert kebab-case to camelCase
        const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase()) as ConfigKey;

        // Normalize URLs by removing trailing slash. `value` arrives as
        // a string from commander (the arg is `<value>`, required) so
        // the narrowing is safe — we just need the type to reflect that.
        let parsedValue: string = value as string;
        if (key === 'mcp-url' || key === 'deposium-url') {
          parsedValue = parsedValue.replace(/\/$/, '');
        }

        setConfig(camelKey, parsedValue);
        console.log(
          chalk.green(
            tr('\n✅ Set {0} = {1}\n', chalk.cyan(key), chalk.yellow(String(parsedValue)))
          )
        );
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('[key]', 'Configuration key (optional - shows all if omitted)')
      .action((key) => {
        const config = getConfig();

        if (key) {
          const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase()) as ConfigKey;
          let value: string | undefined = config[camelKey];

          // Mask API key for security
          if (key === 'api-key' && typeof value === 'string') {
            value = value.substring(0, 8) + '...';
          }

          if (value !== undefined) {
            console.log(chalk.cyan(key) + ':', chalk.yellow(value));
          } else {
            console.log(chalk.gray(tr('{0}: not set', key)));
          }
        } else {
          console.log(chalk.bold(tr('\n📋 Deposium CLI Configuration:\n')));

          // Mask API key for security (show first 8 chars + ...)
          const maskedApiKey = config.apiKey
            ? config.apiKey.substring(0, 8) + '...'
            : chalk.gray(tr('not set'));

          const baseUrl = getBaseUrl(config);
          console.log(tr('Language preference: {0}', config.language ?? 'auto'));

          console.log(chalk.cyan(tr('api-key:')), maskedApiKey);
          console.log(
            chalk.cyan(tr('deposium-url:')),
            config.deposiumUrl ?? chalk.gray(tr('not set'))
          );
          console.log(
            chalk.cyan(tr('mcp-url:')),
            config.mcpUrl ?? chalk.gray(tr('not set (deprecated)'))
          );
          console.log(chalk.cyan(tr('effective-url:')), baseUrl);
          console.log(
            chalk.cyan(tr('default-tenant:')),
            config.defaultTenant ?? chalk.gray(tr('not set'))
          );
          console.log(
            chalk.cyan(tr('default-space:')),
            config.defaultSpace ?? chalk.gray(tr('not set'))
          );
          console.log('');
          console.log(chalk.gray(tr('Config file:')), getConfigPath());
          console.log('');
        }
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a configuration value')
      .argument('<key>', 'Configuration key')
      .action((key) => {
        if (key === 'api-key') {
          deleteApiKey();
          console.log(
            chalk.green(tr('\n✅ Deleted {0} (from credentials)\n', chalk.cyan('api-key')))
          );
          return;
        }
        const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase()) as ConfigKey;
        deleteConfig(camelKey);
        if (key === 'language') updateSavedLanguage('auto');
        console.log(chalk.green(tr('\n✅ Deleted {0}\n', chalk.cyan(key))));
      })
  )
  .addCommand(
    new Command('reset').description('Reset all configuration to defaults').action(() => {
      resetConfig();
      updateSavedLanguage('auto');
      console.log(chalk.green(tr('\n✅ Configuration reset to defaults\n')));
    })
  )
  .addCommand(
    new Command('path').description('Show configuration file path').action(() => {
      console.log(chalk.gray(tr('\nConfiguration file:')));
      console.log(chalk.cyan(getConfigPath()));
      console.log('');
    })
  );
