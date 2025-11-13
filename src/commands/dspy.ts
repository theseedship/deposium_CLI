import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const dspyCommand = new Command('dspy').description(
  'DSPy intelligent query routing and optimization'
);

// dspy.route - Intelligent query routing
dspyCommand
  .command('route')
  .description('Route query to optimal engine (SQL/PGQ/Cypher)')
  .argument('<query>', 'Query to route')
  .option('--user-id <id>', 'User ID for routing')
  .option('--params <json>', 'Additional parameters JSON')
  .option('--evaluate', 'Evaluate result quality')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const apiKey = await ensureAuthenticated(config.mcpUrl!);
    const client = new MCPClient(config.mcpUrl!, apiKey);

    try {
      console.log(chalk.bold('\n🧭 Routing query...\n'));

      const params = options.params ? JSON.parse(options.params) : {};

      const result = await client.callTool(
        'dspy.route',
        {
          query,
          userId: options.userId,
          params,
          evaluateResult: options.evaluate || false,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Routing failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// dspy.analyze - Query intent analysis
dspyCommand
  .command('analyze')
  .description('Analyze query intent and suggest optimizations')
  .argument('<query>', 'Query to analyze')
  .option('--include-templates', 'Include query templates')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const apiKey = await ensureAuthenticated(config.mcpUrl!);
    const client = new MCPClient(config.mcpUrl!, apiKey);

    try {
      console.log(chalk.bold('\n🔍 Analyzing query intent...\n'));

      const result = await client.callTool(
        'dspy.analyze',
        {
          query,
          includeTemplates: options.includeTemplates || false,
        },
        { spinner: !options.silent }
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
  });
