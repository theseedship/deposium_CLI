import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const graphCommand = new Command('graph')
  .description('Graph analysis and queries')
  .addCommand(
    new Command('analyze')
      .description('Analyze graph structure')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

        try {
          console.log(chalk.bold('\n🔗 Analyzing Graph...\n'));

          // TODO: graph.analyze tool not yet available on MCP server
          // Available: graph_multihop, graph_variable_path, graph_khop, graph_components
          const result = await client.callTool(
            'graph_multihop',
            {
              tenant_id: options.tenant,
              space_id: options.space,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('path')
      .description('Find optimal path between two entities')
      .argument('<from>', 'Source entity ID')
      .argument('<to>', 'Target entity ID')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (from, to, options) => {
        const config = getConfig();

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

        try {
          console.log(chalk.bold(`\n🛤️  Finding path: ${from} → ${to}...\n`));

          const result = await client.callTool(
            'graph_variable_path',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              from_entity_id: from,
              to_entity_id: to,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Path finding failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('components')
      .description('Find strongly connected components')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

        try {
          console.log(chalk.bold('\n🧩 Finding Components...\n'));

          const result = await client.callTool(
            'graph_components',
            {
              tenant_id: options.tenant,
              space_id: options.space,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Component analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  );
