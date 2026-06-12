import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON, parseAPIResponse } from '../utils/formatter';
import {
  initializeCommand,
  withErrorHandling,
  resolveTenantSpace,
  runMcpTool,
} from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

export const intelligenceCommand = new Command('intelligence')
  .alias('smart')
  .description('AI-powered query analysis, suggestions, and summaries');

// smart.analyze - Query intent analysis
intelligenceCommand
  .command('analyze')
  .description('Analyze query intent and optimize search parameters')
  .argument('<query>', 'Query text to analyze')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🧠 Analyzing query intent...\n'));

      const content = await runMcpTool(
        client,
        'smart_analyze',
        { query_text: query },
        { label: 'Analysis', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// smart.suggest - Auto-completion and suggestions
intelligenceCommand
  .command('suggest')
  .description('Generate intelligent query suggestions and auto-completions')
  .argument('<partial>', 'Partial query text')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (partial: string, options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n💡 Generating suggestions...\n'));

      const content = await runMcpTool(
        client,
        'smart_suggest',
        {
          partial_query: partial,
          tenant_id: tenantId,
          space_id: spaceId,
        },
        { label: 'Suggestion', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// smart.summarize - Result summarization
intelligenceCommand
  .command('summarize')
  .description('Generate intelligent summaries of search results')
  .argument('<results>', 'Results JSON (use - for stdin)')
  .option('--max-tokens <number>', 'Maximum summary tokens', '500')
  .option('--focus <text>', 'Focus area for summary')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'markdown')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (results: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📝 Summarizing results...\n'));

      // Parse results input
      let resultsData;
      if (results === '-') {
        console.error(
          chalk.red('❌ Reading from stdin is not yet supported. Please provide JSON directly.')
        );
        process.exit(1);
      } else {
        resultsData = parseAPIResponse(results);
      }

      const content = await runMcpTool(
        client,
        'smart_summarize',
        {
          results: resultsData,
          max_tokens: parseIntOrThrow(options.maxTokens, '--max-tokens'),
          focus: options.focus,
        },
        { label: 'Summarization', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// smart.elicit - Clarification detection
intelligenceCommand
  .command('elicit')
  .description('Detect if query needs clarification and generate questions')
  .argument('<query>', 'Query text to check')
  .option('--search-results <number>', 'Number of search results found', '0')
  .option('--context <json>', 'Context JSON (previous queries, preferences, history)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🤔 Checking for clarification needs...\n'));

      const context = options.context
        ? safeParseJSON<Record<string, unknown>>(options.context, '--context')
        : undefined;

      const content = await runMcpTool(
        client,
        'smart_elicit',
        {
          query_text: query,
          search_results: parseIntOrThrow(options.searchResults, '--search-results'),
          context,
        },
        { label: 'Elicitation', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );
