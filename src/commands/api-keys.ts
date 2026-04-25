import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';

export const apiKeysCommand = new Command('api-keys').description(
  'Manage server-side API keys (list, create, delete, rotate, usage)'
);

// api-keys.list — List API keys
apiKeysCommand
  .command('list')
  .alias('ls')
  .description('List API keys on your account')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold('\n🔑 Listing API keys...\n'));
      }

      const keys = await client.listApiKeys();

      if (keys.length === 0) {
        console.log(chalk.yellow('No API keys found.'));
        if (!options.silent) {
          console.log(chalk.gray('Run `deposium api-keys create --name <n>` to create one.'));
        }
        return;
      }

      if (!options.silent) {
        console.log(chalk.gray(`Found ${keys.length} key(s)\n`));
      }

      formatOutput(keys, options.format);
    })
  );

// api-keys.create — Create a new API key
apiKeysCommand
  .command('create')
  .alias('new')
  .description('Create a new API key (requires `api_access` feature on your plan)')
  .requiredOption('-n, --name <name>', 'Human-readable name for the key')
  .option(
    '-s, --scopes <list>',
    'Comma-separated scopes (e.g. read,write,execute,execute:network,admin)'
  )
  .option(
    '-t, --tier <tier>',
    'Rate-limit tier (free|pro|enterprise) — server may override based on plan'
  )
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'json')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold(`\n🔑 Creating API key ${chalk.cyan(options.name)}...\n`));
      }

      const created = await client.createApiKey({
        name: options.name,
        scopes: options.scopes ? options.scopes.split(',').map((s: string) => s.trim()) : undefined,
        rate_limit_tier: options.tier,
      });

      // Loud one-time-only warning before printing the secret
      const secret = created.secret ?? created.key;
      if (secret) {
        console.log(chalk.yellow.bold('\n⚠️  Save this secret NOW. It will not be shown again.\n'));
        console.log(chalk.bold(`  ${secret}\n`));
      }

      formatOutput(created, options.format);
    })
  );

// api-keys.delete — Delete an API key
apiKeysCommand
  .command('delete')
  .alias('rm')
  .description('Delete an API key by ID')
  .argument('<id>', 'API key ID')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.yes) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.red(
              `Delete API key ${id}? Any application using it will stop working immediately.`
            ),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          return;
        }
      }

      await client.deleteApiKey(id);

      if (!options.silent) {
        console.log(chalk.green(`\n✅ API key ${id} deleted\n`));
      }
    })
  );

// api-keys.rotate — Rotate an API key
apiKeysCommand
  .command('rotate')
  .description('Rotate an API key — old secret is invalidated, new one issued')
  .argument('<id>', 'API key ID')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'json')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.yes) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow(
              `Rotate API key ${id}? The current secret will stop working immediately.`
            ),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          return;
        }
      }

      const rotated = await client.rotateApiKey(id);

      const secret = rotated.secret ?? rotated.key;
      if (secret) {
        console.log(
          chalk.yellow.bold('\n⚠️  Save this NEW secret NOW. It will not be shown again.\n')
        );
        console.log(chalk.bold(`  ${secret}\n`));
      }

      formatOutput(rotated, options.format);
    })
  );

// api-keys.usage — Get usage stats for a key
apiKeysCommand
  .command('usage')
  .description('Show usage statistics for an API key')
  .argument('<id>', 'API key ID')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'json')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold(`\n📊 Fetching usage for ${chalk.cyan(id)}...\n`));
      }

      const usage = await client.getApiKeyUsage(id);
      formatOutput(usage, options.format);
    })
  );
