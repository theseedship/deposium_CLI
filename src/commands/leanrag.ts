import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, parseAPIResponse } from '../utils/formatter';
import {
  initializeCommand,
  withErrorHandling,
  resolveTenantSpace,
  runMcpTool,
} from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

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

      const content = await runMcpTool(
        client,
        'leanrag_retrieve',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          query_text: query,
          top_k: parseIntOrThrow(options.topK, '--top-k'),
          rerank: options.rerank ?? false,
        },
        { label: 'Retrieval', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// leanrag.aggregate - Result aggregation
leanragCommand
  .command('aggregate')
  .description('Aggregate and rank LeanRAG results')
  .argument('<results>', 'Results JSON')
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

      const content = await runMcpTool(
        client,
        'leanrag_aggregate',
        {
          results: resultsData,
          strategy: options.strategy,
        },
        { label: 'Aggregation', spinner: !options.silent }
      );

      formatOutput(content, options.format);
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

      const content = await runMcpTool(
        client,
        'leanrag_analyze',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          query_text: query,
        },
        { label: 'Analysis', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );
