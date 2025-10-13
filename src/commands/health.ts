import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';

export const healthCommand = new Command('health')
  .description('Check MCP Server and services health')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(async (options) => {
    const config = getConfig();

    try {
      const client = new MCPClient(config.mcpUrl!);

      console.log(chalk.bold('\n🏥 Checking Deposium Health...\n'));

      // First check server connectivity
      const health = await client.health();

      if (options.verbose) {
        // Call system_health tool for detailed info
        const detailedHealth = await client.callTool(
          'system_health',
          { verbose: true },
          { spinner: true }
        );

        if (detailedHealth.isError) {
          console.error(chalk.red('\n❌ Health check failed:'), detailedHealth.content);
          process.exit(1);
        }

        formatOutput(detailedHealth.content, options.format);
      } else {
        // Simple health display
        console.log(chalk.green('✅ MCP Server:'), 'Healthy');
        console.log(chalk.gray('URL:'), config.mcpUrl);

        if (health.services) {
          console.log(chalk.bold('\nServices:'));
          Object.entries(health.services).forEach(([name, status]: [string, any]) => {
            const icon = status === 'healthy' ? '✅' : '❌';
            const color = status === 'healthy' ? chalk.green : chalk.red;
            console.log(`  ${icon} ${color(name)}: ${status}`);
          });
        }

        console.log('');
      }
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(
        chalk.yellow('\n💡 Tip:'),
        'Make sure the MCP server is running:'
      );
      console.log(
        chalk.gray('  cd [private-server-repo] && npm run dev\n')
      );
      process.exit(1);
    }
  });
