import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, resolveTenantSpace } from '../utils/command-helpers';

export const searchCommand = new Command('search')
  .description('Search documents using DuckDB VSS, FTS, or fuzzy matching')
  .argument('<query>', 'Search query text')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('-k, --top-k <number>', 'Number of results', '10')
  .option('--vector', 'Use vector search (semantic)')
  .option('--fts', 'Use full-text search')
  .option('--fuzzy', 'Use fuzzy matching')
  .option('--graph', 'Include graph traversal')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n🔍 Searching Deposium...\n'));

      const result = await client.callTool(
        'search_hub',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          query_text: query,
          use_vector_rel: options.vector !== undefined ? options.vector : true,
          use_fts: options.fts ?? false,
          use_fuzzy: options.fuzzy ?? false,
          use_graph: options.graph ?? false,
          top_k: parseInt(options.topK, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Search failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );
