import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig, deleteConfig, resetConfig, getConfigPath } from '../utils/config';

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
          'mcp-url',
          'default-tenant',
          'default-space',
          'output-format',
          'silent-mode',
        ];

        if (!validKeys.includes(key)) {
          console.error(chalk.red(`\n❌ Invalid key: ${key}`));
          console.log(chalk.yellow('\nValid keys:'));
          validKeys.forEach((k) => console.log(`  - ${k}`));
          console.log('');
          process.exit(1);
        }

        // Convert kebab-case to camelCase
        const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());

        // Parse boolean values
        let parsedValue: any = value;
        if (value === 'true') parsedValue = true;
        if (value === 'false') parsedValue = false;

        // Normalize MCP URL by removing trailing slash
        if (key === 'mcp-url' && typeof parsedValue === 'string') {
          parsedValue = parsedValue.replace(/\/$/, '');
        }

        setConfig(camelKey as any, parsedValue);
        console.log(chalk.green(`\n✅ Set ${chalk.cyan(key)} = ${chalk.yellow(parsedValue)}\n`));
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('[key]', 'Configuration key (optional - shows all if omitted)')
      .action((key) => {
        const config = getConfig();

        if (key) {
          const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
          let value = (config as any)[camelKey];

          // Mask API key for security
          if (key === 'api-key' && value) {
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

          console.log(chalk.cyan('api-key:'), maskedApiKey);
          console.log(chalk.cyan('mcp-url:'), config.mcpUrl || chalk.gray('not set'));
          console.log(chalk.cyan('default-tenant:'), config.defaultTenant || chalk.gray('not set'));
          console.log(chalk.cyan('default-space:'), config.defaultSpace || chalk.gray('not set'));
          console.log(chalk.cyan('output-format:'), config.outputFormat || chalk.gray('not set'));
          console.log(chalk.cyan('silent-mode:'), config.silentMode || chalk.gray('not set'));
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
        const camelKey = key.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
        deleteConfig(camelKey as any);
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
