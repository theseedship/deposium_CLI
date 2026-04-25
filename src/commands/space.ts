import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';

export const spaceCommand = new Command('space').description(
  'Manage workspaces (list, show, create)'
);

// space.list — List all spaces accessible to the authenticated user
spaceCommand
  .command('list')
  .alias('ls')
  .description('List all spaces accessible to your API key')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold('\n📂 Fetching spaces...\n'));
      }

      const spaces = await client.listSpaces();

      if (spaces.length === 0) {
        console.log(chalk.yellow('No spaces found.'));
        return;
      }

      if (!options.silent) {
        console.log(chalk.gray(`Found ${spaces.length} space${spaces.length > 1 ? 's' : ''}\n`));
      }

      formatOutput(spaces, options.format);
    })
  );

// space.show — Show details of a specific space
spaceCommand
  .command('show')
  .alias('info')
  .description('Show details of a specific space by ID')
  .argument('<id>', 'Space ID (UUID)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold(`\n📂 Fetching space ${chalk.cyan(id)}...\n`));
      }

      // Server doesn't expose GET /api/spaces/:id, so we filter the list.
      // For richer details (file count, aggregations), use `corpus stats --space <id>`.
      const spaces = await client.listSpaces();
      const space = spaces.find((s) => s.id === id);

      if (!space) {
        console.error(chalk.red(`\n❌ Space not found: ${id}`));
        console.log(chalk.gray('Run `deposium space list` to see available spaces.\n'));
        process.exit(1);
      }

      formatOutput(space, options.format);
    })
  );

// space.create — Create a new space via the deposium_admin macro tool
spaceCommand
  .command('create')
  .alias('new')
  .description('Create a new space')
  .argument('<name>', 'Space name')
  .option('-d, --description <text>', 'Space description')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (name: string, options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold(`\n📂 Creating space ${chalk.cyan(name)}...\n`));
      }

      const result = await client.callTool(
        'deposium_admin',
        {
          operation: 'create_space',
          name,
          description: options.description,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Create failed:'), result.content);
        process.exit(1);
      }

      if (!options.silent) {
        console.log(chalk.green('\n✅ Space created\n'));
      }

      formatOutput(result.content, options.format);
    })
  );
