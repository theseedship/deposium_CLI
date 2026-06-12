import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

export const uiCommand = new Command('ui').description(
  'Interactive UI dashboards and visualizations'
);

// ui.show_dashboard - Interactive HTML dashboard
uiCommand
  .command('dashboard')
  .description('Open interactive HTML dashboard')
  .option('--port <number>', 'Server port', '8080')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🎨 Opening dashboard...\n'));

      const content = await runMcpTool(
        client,
        'ui_show_dashboard',
        { port: parseIntOrThrow(options.port, '--port') },
        { label: 'Dashboard', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// ui.show_search - Visual search interface
uiCommand
  .command('search-ui')
  .description('Open visual search interface')
  .option('--port <number>', 'Server port', '8081')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🔍 Opening search interface...\n'));

      const content = await runMcpTool(
        client,
        'ui_show_search',
        { port: parseIntOrThrow(options.port, '--port') },
        { label: 'Search UI', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// ui.show_health - Real-time health monitor
uiCommand
  .command('health-monitor')
  .description('Open real-time health monitor')
  .option('--port <number>', 'Server port', '8082')
  .option('--refresh <seconds>', 'Refresh interval in seconds', '5')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n💚 Opening health monitor...\n'));

      const content = await runMcpTool(
        client,
        'ui_show_health',
        {
          port: parseIntOrThrow(options.port, '--port'),
          refresh_interval: parseIntOrThrow(options.refresh, '--refresh'),
        },
        { label: 'Health monitor', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// ui.show_tools - MCP tools explorer
uiCommand
  .command('tools-explorer')
  .description('Open MCP tools explorer')
  .option('--port <number>', 'Server port', '8083')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🛠️  Opening tools explorer...\n'));

      const content = await runMcpTool(
        client,
        'ui_show_tools',
        { port: parseIntOrThrow(options.port, '--port') },
        { label: 'Tools explorer', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// ui.show_embeddings - Embeddings queue monitor
uiCommand
  .command('embeddings-monitor')
  .description('Open embeddings queue monitor')
  .option('--port <number>', 'Server port', '8084')
  .option('--refresh <seconds>', 'Refresh interval in seconds', '10')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n⚡ Opening embeddings monitor...\n'));

      const content = await runMcpTool(
        client,
        'ui_show_embeddings',
        {
          port: parseIntOrThrow(options.port, '--port'),
          refresh_interval: parseIntOrThrow(options.refresh, '--refresh'),
        },
        { label: 'Embeddings monitor', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );
