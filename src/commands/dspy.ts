import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';

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
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🧭 Routing query...\n'));

      const params = options.params
        ? safeParseJSON<Record<string, unknown>>(options.params, '--params')
        : {};

      const content = await runMcpTool(
        client,
        'dspy_route',
        {
          query,
          userId: options.userId,
          params,
          evaluateResult: options.evaluate ?? false,
        },
        { label: 'Routing', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// dspy.analyze - Query intent analysis
dspyCommand
  .command('analyze')
  .description('Analyze query intent and suggest optimizations')
  .argument('<query>', 'Query to analyze')
  .option('--include-templates', 'Include query templates')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🔍 Analyzing query intent...\n'));

      const content = await runMcpTool(
        client,
        'dspy_analyze',
        {
          query,
          includeTemplates: options.includeTemplates ?? false,
        },
        { label: 'Analysis', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );
