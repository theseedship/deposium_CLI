import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const healthCommand = new Command('health')
  .description('Check MCP Server and services health')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(async (options) => {
    const config = getConfig();

    // Ensure user is authenticated
    const apiKey = await ensureAuthenticated(config.mcpUrl!);

    try {
      const client = new MCPClient(config.mcpUrl!, apiKey);

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

        if (health.services && Array.isArray(health.services)) {
          console.log(chalk.bold('\nServices:'));
          health.services.forEach((service: any) => {
            const icon = service.status === 'healthy' ? '✅' : '❌';
            const color = service.status === 'healthy' ? chalk.green : chalk.red;
            const message = service.message ? ` - ${service.message}` : '';
            console.log(
              `  ${icon} ${color(service.service || 'Unknown')}: ${service.status}${message}`
            );
          });
        }

        console.log('');
      }
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(chalk.yellow('\n💡 Tip:'), 'Make sure the MCP server is running:');
      console.log(chalk.gray('  cd deposium_MCPs && npm run dev\n'));
      process.exit(1);
    }
  });
