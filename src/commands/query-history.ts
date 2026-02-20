import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';

export const queryHistoryCommand = new Command('query-history')
  .alias('qh')
  .description('Query history tracking and analytics');

// query.log - Log a query
queryHistoryCommand
  .command('log')
  .description('Log a query to history')
  .argument('<query>', 'Query text')
  .option('--user-id <id>', 'User ID')
  .option('--engine <engine>', 'Engine used (sql|pgq|cypher)')
  .option('--results <number>', 'Number of results returned')
  .option('--latency <ms>', 'Query latency in milliseconds')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📝 Logging query...\n'));

      const result = await client.callTool(
        'query_log',
        {
          query,
          userId: options.userId,
          engine: options.engine,
          results: options.results ? parseInt(options.results, 10) : undefined,
          latency: options.latency ? parseInt(options.latency, 10) : undefined,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Query log failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// query.export - Export query history
queryHistoryCommand
  .command('export')
  .description('Export query history to file')
  .option('--user-id <id>', 'Filter by user ID')
  .option('--format <type>', 'Export format (json|csv)', 'json')
  .option('--output <path>', 'Output file path')
  .option('--time-range <range>', 'Time range (1h|24h|7d|30d)', '24h')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n💾 Exporting query history...\n'));

      const result = await client.callTool(
        'query_export',
        {
          userId: options.userId,
          format: options.format,
          output: options.output,
          time_range: options.timeRange,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Export failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// query.retrieve - Retrieve query history
queryHistoryCommand
  .command('retrieve')
  .description('Retrieve query history')
  .option('--user-id <id>', 'Filter by user ID')
  .option('--limit <number>', 'Number of queries', '50')
  .option('--offset <number>', 'Pagination offset', '0')
  .option('--engine <engine>', 'Filter by engine')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📜 Retrieving query history...\n'));

      const result = await client.callTool(
        'query_retrieve',
        {
          userId: options.userId,
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
          engine: options.engine,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Retrieve failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// query.stats - Query statistics
queryHistoryCommand
  .command('stats')
  .description('Get query history statistics')
  .option('--user-id <id>', 'Filter by user ID')
  .option('--time-range <range>', 'Time range (1h|24h|7d|30d)', '24h')
  .option('--group-by <field>', 'Group by field (engine|user|hour|day)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📊 Fetching query statistics...\n'));

      const result = await client.callTool(
        'query_stats',
        {
          userId: options.userId,
          time_range: options.timeRange,
          group_by: options.groupBy,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Stats failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// query.cleanup - Cleanup old queries
queryHistoryCommand
  .command('cleanup')
  .description('Cleanup old query history')
  .option('--older-than <days>', 'Delete queries older than N days', '90')
  .option('--confirm', 'Skip confirmation prompt')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      if (!options.confirm) {
        console.log(
          chalk.yellow(
            `⚠️  This will delete queries older than ${options.olderThan} days. Use --confirm to proceed.`
          )
        );
        process.exit(0);
      }

      console.log(chalk.bold('\n🗑️  Cleaning up query history...\n'));

      const result = await client.callTool(
        'query_cleanup',
        {
          older_than_days: parseInt(options.olderThan, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Cleanup failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );
