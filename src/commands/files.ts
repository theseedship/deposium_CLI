import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';

export const filesCommand = new Command('files').description(
  'Manage documents and files (list, show, check, rm)'
);

// files.list — List documents (optionally filtered by space)
filesCommand
  .command('list')
  .alias('ls')
  .description('List documents accessible to your API key')
  .option('-s, --space <id>', 'Filter by space ID (UUID)')
  .option('--limit <number>', 'Page size (server default 50)')
  .option('--offset <number>', 'Pagination offset', '0')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        const filter = options.space ? ` for space ${chalk.cyan(options.space)}` : '';
        console.log(chalk.bold(`\n📄 Listing documents${filter}...\n`));
      }

      const result = await client.listDocuments({
        spaceId: options.space,
        limit: options.limit ? parseInt(options.limit, 10) : undefined,
        offset: options.offset ? parseInt(options.offset, 10) : undefined,
      });

      if (result.items.length === 0) {
        console.log(chalk.yellow('No documents found.'));
        return;
      }

      if (!options.silent) {
        const total = result.pagination?.total ?? result.items.length;
        console.log(chalk.gray(`Showing ${result.items.length} of ${total} document(s)\n`));
      }

      formatOutput(result.items, options.format);
    })
  );

// files.show — Show details of a specific document
filesCommand
  .command('show')
  .alias('info')
  .description('Show details of a specific document by ID')
  .argument('<id>', 'Document ID (numeric)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold(`\n📄 Fetching document ${chalk.cyan(id)}...\n`));
      }

      const doc = await client.getDocument(id);
      formatOutput(doc, options.format);
    })
  );

// files.check — Validate file integrity via the `check_file` MCP tool
filesCommand
  .command('check')
  .alias('validate')
  .description('Validate file integrity (checksums, parsing, indexation)')
  .argument('<id>', 'Document ID (numeric)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'json')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.silent) {
        console.log(chalk.bold(`\n🔍 Validating document ${chalk.cyan(id)}...\n`));
      }

      const result = await client.callTool(
        'check_file',
        { document_id: id },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Validation failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// files.rm — Delete a document (with confirmation prompt)
filesCommand
  .command('rm')
  .alias('delete')
  .description('Delete a document by ID')
  .argument('<id>', 'Document ID (numeric)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (id: string, options) => {
      const { client } = await initializeCommand();

      if (!options.yes) {
        // Fetch the document so the user sees what they're about to delete
        const doc = await client.getDocument(id);
        console.log(chalk.bold('\n📄 About to delete:'));
        console.log(`  ID:        ${doc.id}`);
        console.log(`  File name: ${doc.file_name}`);
        console.log(`  Size:      ${doc.size} bytes`);
        console.log(`  Type:      ${doc.doc_type} (${doc.mime_type})`);
        console.log('');

        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.red(`Delete document #${id}? This cannot be undone.`),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          return;
        }
      }

      await client.deleteDocument(id);

      if (!options.silent) {
        console.log(chalk.green(`\n✅ Document ${id} deleted\n`));
      }
    })
  );
