import { tr } from '../utils/i18n';
import { Command } from 'commander';
import chalk from 'chalk';
import type { MCPHealthService, MCPHealthResponse } from '../client/mcp-client';
import {
  formatOutput,
  displayStatus,
  createTitleBox,
  divider,
  displayMetricBar,
  createInfoBox,
} from '../utils/formatter';
import { initializeCommand, getErrorMessage } from '../utils/command-helpers';
import { verifiedCliContext, printCliContext } from '../utils/preferences';

function printServiceHealth(health: MCPHealthResponse): void {
  if (Array.isArray(health.services) && health.services.length > 0) {
    console.log(divider(tr('Services Status'), 'light'));
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

      displayStatus(service.name || tr('Unknown'), status);

      if (service.message) {
        console.log(chalk.gray(`  └─ ${service.message}`));
      }
    });

    // Calculate uptime percentage if available
    const healthyServices = health.services.filter(
      (s) => s.status === 'healthy' || s.status === 'online'
    ).length;
    const totalServices = health.services.length;

    console.log('\n' + divider(tr('Overall Health'), 'light'));
    console.log('');
    displayMetricBar(tr('System Health'), healthyServices, totalServices, tr(' services'));
  }

  if (!Array.isArray(health.services) || !health.services.length)
    console.log(tr('No service details supplied.'));
}

export const healthCommand = new Command('health')
  .description('Check Deposium API and services health')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .option(
    '--context',
    'Include effective language, instance and authorized default-space diagnostics'
  )
  .action(async (options) => {
    try {
      const format = options.format.toLowerCase();
      const machineOutput = format === 'json';
      const { client, config } = await initializeCommand({ machineReadable: machineOutput });
      if (!machineOutput) console.log(chalk.bold(tr('\n🏥 Checking Deposium Health...\n')));

      // First check server connectivity
      const health = await client.health();
      if (options.context && !options.verbose) {
        const context = await verifiedCliContext(client, config);
        if (machineOutput) formatOutput({ health, context }, 'json');
        else {
          formatOutput(health, format);
          printCliContext(context);
        }
        return;
      }
      if (machineOutput && !options.verbose) {
        formatOutput(health, 'json');
        return;
      }

      if (options.verbose) {
        // Call system_health tool for detailed info
        const detailedHealth = await client.callTool(
          'system_health',
          { verbose: true },
          { spinner: !machineOutput }
        );

        if (detailedHealth.isError) {
          console.error(chalk.red(tr('\n❌ Health check failed:')), detailedHealth.content);
          process.exit(1);
        }

        if (options.context) {
          const context = await verifiedCliContext(client, config);
          if (machineOutput)
            formatOutput({ health, details: detailedHealth.content, context }, 'json');
          else {
            formatOutput(detailedHealth.content, format);
            printCliContext(context);
          }
        } else formatOutput(detailedHealth.content, format);
      } else {
        // Enhanced health display
        console.log(createTitleBox(tr('HEALTH CHECK'), tr('Deposium API Status')));

        // Server status
        printCliContext(await verifiedCliContext(client, config));
        console.log(
          createInfoBox(
            tr('Deposium API'),
            tr('Health endpoint responded; inspect service details below.'),
            'info'
          )
        );

        printServiceHealth(health);
        console.log('\n' + divider('', 'light') + '\n');
      }
    } catch (error: unknown) {
      console.error(chalk.red(tr('\n❌ Error:')), getErrorMessage(error));
      console.error(
        chalk.yellow(tr('\n💡 Tip:')),
        tr('Make sure the Deposium server is reachable.')
      );
      console.error(
        chalk.gray(tr('  Verify DEPOSIUM_URL and that the API responds at /api/cli/mcp.\n'))
      );
      process.exit(1);
    }
  });
