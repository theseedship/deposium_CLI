import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const logsCommand = new Command('logs')
  .description('View, search, and analyze MCP server logs');

// view.logs - View recent logs
logsCommand
  .command('view')
  .description('View recent MCP server logs')
  .option('--level <level>', 'Log level filter (error|warn|info|debug)', 'info')
  .option('--limit <number>', 'Number of log entries', '100')
  .option('--tail', 'Tail logs in real-time')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const apiKey = await ensureAuthenticated(config.mcpUrl!);
    const client = new MCPClient(config.mcpUrl!, apiKey);

    try {
      console.log(chalk.bold('\n📜 Viewing logs...\n'));

      const result = await client.callTool(
        'view.logs',
        {
          level: options.level,
          limit: parseInt(options.limit, 10),
          tail: options.tail || false,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ View logs failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// log.stats - Log statistics
logsCommand
  .command('stats')
  .description('Get log statistics and summaries')
  .option('--time-range <range>', 'Time range (1h|24h|7d|30d)', '24h')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const apiKey = await ensureAuthenticated(config.mcpUrl!);
    const client = new MCPClient(config.mcpUrl!, apiKey);

    try {
      console.log(chalk.bold('\n📊 Fetching log statistics...\n'));

      const result = await client.callTool(
        'log.stats',
        {
          time_range: options.timeRange,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Log stats failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// clear.logs - Clear logs
logsCommand
  .command('clear')
  .description('Clear MCP server logs')
  .option('--confirm', 'Skip confirmation prompt')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const apiKey = await ensureAuthenticated(config.mcpUrl!);
    const client = new MCPClient(config.mcpUrl!, apiKey);

    try {
      if (!options.confirm) {
        console.log(chalk.yellow('⚠️  This will clear all logs. Use --confirm to proceed.'));
        process.exit(0);
      }

      console.log(chalk.bold('\n🗑️  Clearing logs...\n'));

      const result = await client.callTool('clear.logs', {}, { spinner: !options.silent });

      if (result.isError) {
        console.error(chalk.red('\n❌ Clear logs failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

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
  .action(async (pattern: string, options) => {
    const config = getConfig();
    const apiKey = await ensureAuthenticated(config.mcpUrl!);
    const client = new MCPClient(config.mcpUrl!, apiKey);

    try {
      console.log(chalk.bold('\n🔍 Searching logs...\n'));

      const result = await client.callTool(
        'search.logs',
        {
          pattern,
          level: options.level,
          limit: parseInt(options.limit, 10),
          context: parseInt(options.context, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Search logs failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });
