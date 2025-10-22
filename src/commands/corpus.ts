import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const corpusCommand = new Command('corpus')
  .description('Corpus statistics and evaluation')
  .addCommand(
    new Command('stats')
      .description('Get corpus statistics')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

        try {
          console.log(chalk.bold('\n📊 Fetching Corpus Statistics...\n'));

          const result = await client.callTool(
            'corpus_stats',
            {
              tenant_id: options.tenant,
              space_id: options.space,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Stats failed:'), result.content);
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
    new Command('evaluate')
      .description('Evaluate corpus quality with LLM-as-judge')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--metric <name>', 'Evaluation metric (relevance|coherence|diversity)')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

        try {
          console.log(chalk.bold('\n🎯 Evaluating Corpus Quality...\n'));

          const result = await client.callTool(
            'corpus_evaluate',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              metric: options.metric || 'relevance',
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Evaluation failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  );
