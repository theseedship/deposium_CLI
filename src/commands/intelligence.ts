import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

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
  .action(async (query: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🧠 Analyzing query intent...\n'));

      const result = await client.callTool(
        'smart_analyze',
        { query_text: query },
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

// smart.suggest - Auto-completion and suggestions
intelligenceCommand
  .command('suggest')
  .description('Generate intelligent query suggestions and auto-completions')
  .argument('<partial>', 'Partial query text')
  .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
  .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (partial: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n💡 Generating suggestions...\n'));

      const result = await client.callTool(
        'smart_suggest',
        {
          partial_query: partial,
          tenant_id: options.tenant,
          space_id: options.space,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Suggestion failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// smart.summarize - Result summarization
intelligenceCommand
  .command('summarize')
  .description('Generate intelligent summaries of search results')
  .argument('<results>', 'Results JSON (use - for stdin)')
  .option('--max-tokens <number>', 'Maximum summary tokens', '500')
  .option('--focus <text>', 'Focus area for summary')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'markdown')
  .option('--silent', 'Suppress progress messages')
  .action(async (results: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n📝 Summarizing results...\n'));

      // Parse results input
      let resultsData;
      if (results === '-') {
        console.error(
          chalk.red('❌ Reading from stdin is not yet supported. Please provide JSON directly.')
        );
        process.exit(1);
      } else {
        resultsData = JSON.parse(results);
      }

      const result = await client.callTool(
        'smart_summarize',
        {
          results: resultsData,
          max_tokens: parseInt(options.maxTokens, 10),
          focus: options.focus,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Summarization failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// smart.elicit - Clarification detection
intelligenceCommand
  .command('elicit')
  .description('Detect if query needs clarification and generate questions')
  .argument('<query>', 'Query text to check')
  .option('--search-results <number>', 'Number of search results found', '0')
  .option('--context <json>', 'Context JSON (previous queries, preferences, history)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🤔 Checking for clarification needs...\n'));

      const context = options.context ? JSON.parse(options.context) : undefined;

      const result = await client.callTool(
        'smart_elicit',
        {
          query_text: query,
          search_results: parseInt(options.searchResults, 10),
          context,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Elicitation failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });
