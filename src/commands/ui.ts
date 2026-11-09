import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

export const uiCommand = new Command('ui').description(
  'Fetch MCP app resources for a compatible UI host (not a terminal dashboard)'
);

// ui.show_dashboard - Interactive HTML dashboard
uiCommand
  .command('dashboard')
  .description('Fetch the HTML dashboard resource (requires an MCP app host)')
  .option('--port <number>', 'Server port', '8080')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🎨 Fetching dashboard...\n'));

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
  .description('Fetch the visual search resource (requires an MCP app host)')
  .option('--port <number>', 'Server port', '8081')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🔍 Fetching search interface...\n'));

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
  .description('Fetch the health monitor resource (requires an MCP app host)')
  .option('--port <number>', 'Server port', '8082')
  .option('--refresh <seconds>', 'Refresh interval in seconds', '5')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n💚 Fetching health monitor...\n'));

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
  .description('Fetch the tools explorer resource (requires an MCP app host)')
  .option('--port <number>', 'Server port', '8083')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🛠️  Fetching tools explorer...\n'));

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

      console.log(chalk.bold('\n⚡ Fetching embeddings monitor...\n'));

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
