import { Command } from 'commander';
import chalk from 'chalk';
import type { MCPHealthService } from '../client/mcp-client';
import {
  formatOutput,
  displayStatus,
  createTitleBox,
  divider,
  displayMetricBar,
  createInfoBox,
} from '../utils/formatter';
import { initializeCommand, getErrorMessage } from '../utils/command-helpers';

export const healthCommand = new Command('health')
  .description('Check Deposium API and services health')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(async (options) => {
    const { client, baseUrl } = await initializeCommand();

    try {
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
        console.log(createTitleBox('HEALTH CHECK', 'Deposium API Status'));

        // Server status
        console.log(createInfoBox('Deposium API', `Connected to ${baseUrl}`, 'success'));

        if (health.services && Array.isArray(health.services)) {
          console.log(divider('Services Status', 'light'));
          console.log('');

          health.services.forEach((service: MCPHealthService) => {
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

            displayStatus(service.name || 'Unknown', status);

            if (service.message) {
              console.log(chalk.gray(`  └─ ${service.message}`));
            }
          });

          // Calculate uptime percentage if available
          const healthyServices = health.services.filter(
            (s) => s.status === 'healthy' || s.status === 'online'
          ).length;
          const totalServices = health.services.length;

          console.log('\n' + divider('Overall Health', 'light'));
          console.log('');
          displayMetricBar('System Health', healthyServices, totalServices, ' services');
        }

        console.log('\n' + divider('', 'light') + '\n');
      }
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      console.log(chalk.yellow('\n💡 Tip:'), 'Make sure the Deposium server is running:');
      console.log(chalk.gray('  cd deposium_solid && pnpm dev\n'));
      process.exit(1);
    }
  });
