import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import {
  commandProgress,
  initializeCommand,
  withErrorHandling,
  runMcpTool,
} from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

export const logsCommand = new Command('logs').description(
  'View, search, and analyze MCP server logs'
);

// view.logs - View recent logs (snapshot — there is no streaming yet)
logsCommand
  .command('view')
  .description('View recent MCP server logs (snapshot)')
  .option('--level <level>', 'Log level filter (error|warn|info|debug)', 'info')
  .option('--limit <number>', 'Number of log entries', '100')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand({
        machineReadable: options.format?.toLowerCase() === 'json',
      });

      if (commandProgress(options)) console.log(chalk.bold('\n📜 Viewing logs...\n'));

      const content = await runMcpTool(
        client,
        'view_logs',
        {
          level: options.level,
          limit: parseIntOrThrow(options.limit, '--limit'),
        },
        { label: 'View logs', spinner: commandProgress(options) }
      );

      formatOutput(content, options.format);
    })
  );

// log.stats - Log statistics
logsCommand
  .command('stats')
  .description('Get log statistics and summaries')
  .option('--time-range <range>', 'Time range (1h|24h|7d|30d)', '24h')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand({
        machineReadable: options.format?.toLowerCase() === 'json',
      });

      if (commandProgress(options)) console.log(chalk.bold('\n📊 Fetching log statistics...\n'));

      const content = await runMcpTool(
        client,
        'get_log_stats',
        {
          time_range: options.timeRange,
        },
        { label: 'Log stats', spinner: commandProgress(options) }
      );

      formatOutput(content, options.format);
    })
  );

// clear.logs - Clear logs
logsCommand
  .command('clear')
  .description('Clear MCP server logs')
  .option('--confirm', 'Explicitly confirm clearing server logs')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      if (!options.confirm)
        throw new Error('Clearing server logs requires --confirm. No logs were cleared.');
      const { client } = await initializeCommand({
        machineReadable: options.format?.toLowerCase() === 'json',
      });

      if (commandProgress(options)) console.log(chalk.bold('\n🗑️  Clearing logs...\n'));

      const content = await runMcpTool(
        client,
        'clear_logs',
        {},
        { label: 'Clear logs', spinner: commandProgress(options) }
      );

      formatOutput(content, options.format);
    })
  );

// search.logs - Search logs
logsCommand
  .command('search')
  .description('Search logs by pattern')
  .argument('<pattern>', 'Search pattern (regex supported)')
  .option('--level <level>', 'Log level filter')
  .option('--limit <number>', 'Number of results', '100')
  .option('--context <lines>', 'Context lines before/after match', '2')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (pattern: string, options) => {
      const { client } = await initializeCommand({
        machineReadable: options.format?.toLowerCase() === 'json',
      });

      if (commandProgress(options)) console.log(chalk.bold('\n🔍 Searching logs...\n'));

      const content = await runMcpTool(
        client,
        'search_logs',
        {
          pattern,
          level: options.level,
          limit: parseIntOrThrow(options.limit, '--limit'),
          context: parseIntOrThrow(options.context, '--context'),
        },
        { label: 'Search logs', spinner: commandProgress(options) }
      );

      formatOutput(content, options.format);
    })
  );
