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
        ];

        if (!validKeys.includes(key)) {
          console.error(chalk.red(`\n❌ Invalid key: ${key}`));
          console.log(chalk.yellow('\nValid keys:'));
          validKeys.forEach((k) => console.log(`  - ${k}`));
          console.log('');
          process.exit(1);
        }

        // `api-key` is special: it goes to the separate credentials
        // store (chmod 0600, encrypted) — NOT the main config — so the
        // security guarantee "API key isolated in ~/.deposium/credentials"
        // holds whatever path provisioned it. Service-key guardrail
        // runs first so a `dep_svc_*` paste fails fast with a clear
        // message instead of a cryptic 401 on the next call.
        if (key === 'api-key') {
          if (typeof value !== 'string' || value.trim().length === 0) {
            console.error(chalk.red('\n❌ api-key must be a non-empty string\n'));
            process.exit(1);
          }
          assertNotServiceKey(value, 'prompt');
          setApiKey(value);
          console.log(chalk.green(`\n✅ Set ${chalk.cyan('api-key')} (stored in credentials)\n`));
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
          chalk.green(`\n✅ Set ${chalk.cyan(key)} = ${chalk.yellow(String(parsedValue))}\n`)
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
            console.log(chalk.gray(`${key}: not set`));
          }
        } else {
          console.log(chalk.bold('\n📋 Deposium CLI Configuration:\n'));

          // Mask API key for security (show first 8 chars + ...)
          const maskedApiKey = config.apiKey
            ? config.apiKey.substring(0, 8) + '...'
            : chalk.gray('not set');

          const baseUrl = getBaseUrl(config);

          console.log(chalk.cyan('api-key:'), maskedApiKey);
          console.log(chalk.cyan('deposium-url:'), config.deposiumUrl ?? chalk.gray('not set'));
          console.log(chalk.cyan('mcp-url:'), config.mcpUrl ?? chalk.gray('not set (deprecated)'));
          console.log(chalk.cyan('effective-url:'), baseUrl);
          console.log(chalk.cyan('default-tenant:'), config.defaultTenant ?? chalk.gray('not set'));
          console.log(chalk.cyan('default-space:'), config.defaultSpace ?? chalk.gray('not set'));
          console.log('');
          console.log(chalk.gray('Config file:'), getConfigPath());
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
          console.log(chalk.green(`\n✅ Deleted ${chalk.cyan('api-key')} (from credentials)\n`));
          return;
        }
        const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase()) as ConfigKey;
        deleteConfig(camelKey);
        console.log(chalk.green(`\n✅ Deleted ${chalk.cyan(key)}\n`));
      })
  )
  .addCommand(
    new Command('reset').description('Reset all configuration to defaults').action(() => {
      resetConfig();
      console.log(chalk.green('\n✅ Configuration reset to defaults\n'));
    })
  )
  .addCommand(
    new Command('path').description('Show configuration file path').action(() => {
      console.log(chalk.gray('\nConfiguration file:'));
      console.log(chalk.cyan(getConfigPath()));
      console.log('');
    })
  );
