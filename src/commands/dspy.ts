import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import {
  commandProgress,
  initializeCommand,
  withErrorHandling,
  runMcpTool,
} from '../utils/command-helpers';

export const dspyCommand = new Command('dspy').description(
  'DSPy intelligent query routing and optimization'
);

// dspy.route - Intelligent query routing
dspyCommand
  .command('route', { hidden: true })
  .description('Server-internal routing (unavailable to public CLI callers)')
  .argument('<query>', 'Query to route')
  .option('--user-id <id>', 'User ID for routing')
  .option('--params <json>', 'Additional parameters JSON')
  .option('--evaluate', 'Evaluate result quality')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async () => {
      throw new Error(
        'DSPy route is a server-internal operation and is unavailable with a user API key. Use chat for documents or intelligence analyze to inspect query intent.'
      );
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
      const { client } = await initializeCommand({
        machineReadable: options.format?.toLowerCase() === 'json',
      });

      if (commandProgress(options)) console.log(chalk.bold('\n🔍 Analyzing query intent...\n'));

      const content = await runMcpTool(
        client,
        'dspy_analyze',
        {
          query,
          includeTemplates: options.includeTemplates ?? false,
        },
        { label: 'Analysis', spinner: commandProgress(options) }
      );

      formatOutput(content, options.format);
    })
  );
