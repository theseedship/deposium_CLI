import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import {
  formatOutput,
  displayStatus,
  createTitleBox,
  divider,
  displayMetricBar,
  createInfoBox,
} from '../utils/formatter';
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
        // Enhanced health display
        console.log(createTitleBox('HEALTH CHECK', 'Deposium MCP Server Status'));

        // Server status
        console.log(createInfoBox('MCP Server', `Connected to ${config.mcpUrl}`, 'success'));

        if (health.services && Array.isArray(health.services)) {
          console.log(divider('Services Status', 'light'));
          console.log('');

          health.services.forEach((service: any) => {
            let status: 'online' | 'offline' | 'degraded' | 'unknown';

            if (service.status === 'healthy' || service.status === 'online') {
              status = 'online';
            } else if (service.status === 'offline' || service.status === 'unhealthy') {
              status = 'offline';
            } else if (service.status === 'degraded') {
              status = 'degraded';
            } else {
              status = 'unknown';
            }

            displayStatus(service.service || 'Unknown', status);

            if (service.message) {
              console.log(chalk.gray(`  └─ ${service.message}`));
            }
          });

          // Calculate uptime percentage if available
          const healthyServices = health.services.filter(
            (s: any) => s.status === 'healthy' || s.status === 'online'
          ).length;
          const totalServices = health.services.length;

          console.log('\n' + divider('Overall Health', 'light'));
          console.log('');
          displayMetricBar('System Health', healthyServices, totalServices, ' services');
        }

        console.log('\n' + divider('', 'light') + '\n');
      }
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(chalk.yellow('\n💡 Tip:'), 'Make sure the MCP server is running:');
      console.log(chalk.gray('  cd [private-server-repo] && npm run dev\n'));
      process.exit(1);
    }
  });
