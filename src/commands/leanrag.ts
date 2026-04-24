import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, parseAPIResponse } from '../utils/formatter';
import { initializeCommand, withErrorHandling, resolveTenantSpace } from '../utils/command-helpers';

export const leanragCommand = new Command('leanrag').description(
  'Optimized LeanRAG retrieval and analysis'
);

// leanrag.retrieve - Optimized retrieval
leanragCommand
  .command('retrieve')
  .description('Optimized LeanRAG retrieval with ranking')
  .argument('<query>', 'Search query text')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('-k, --top-k <number>', 'Number of results', '10')
  .option('--rerank', 'Enable reranking')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n🎯 LeanRAG retrieval...\n'));

      const result = await client.callTool(
        'leanrag_retrieve',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          query_text: query,
          top_k: parseInt(options.topK, 10),
          rerank: options.rerank ?? false,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Retrieval failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// leanrag.aggregate - Result aggregation
leanragCommand
  .command('aggregate')
  .description('Aggregate and rank LeanRAG results')
  .argument('<results>', 'Results JSON (use - for stdin)')
  .option('--strategy <type>', 'Aggregation strategy (reciprocal_rank|weighted)', 'reciprocal_rank')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (results: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📊 Aggregating results...\n'));

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

      const result = await client.callTool(
        'leanrag_aggregate',
        {
          results: resultsData,
          strategy: options.strategy,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Aggregation failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// leanrag.analyze - LeanRAG analysis
leanragCommand
  .command('analyze')
  .description('Analyze query using LeanRAG method')
  .argument('<query>', 'Query to analyze')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n🔬 LeanRAG analysis...\n'));

      const result = await client.callTool(
        'leanrag_analyze',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          query_text: query,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Analysis failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );
