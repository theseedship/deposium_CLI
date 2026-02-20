import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';

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

      const result = await client.callTool(
        'ui_show_dashboard',
        { port: parseInt(options.port, 10) },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Dashboard failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
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

      const result = await client.callTool(
        'ui_show_search',
        { port: parseInt(options.port, 10) },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Search UI failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
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

      const result = await client.callTool(
        'ui_show_health',
        {
          port: parseInt(options.port, 10),
          refresh_interval: parseInt(options.refresh, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Health monitor failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
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

      const result = await client.callTool(
        'ui_show_tools',
        { port: parseInt(options.port, 10) },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Tools explorer failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
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

      const result = await client.callTool(
        'ui_show_embeddings',
        {
          port: parseInt(options.port, 10),
          refresh_interval: parseInt(options.refresh, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Embeddings monitor failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );
