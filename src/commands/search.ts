import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';
import { getErrorMessage } from '../utils/command-helpers';

export const searchCommand = new Command('search')
  .description('Search documents using DuckDB VSS, FTS, or fuzzy matching')
  .argument('<query>', 'Search query text')
  .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant ?? 'default')
  .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace ?? 'default')
  .option('-k, --top-k <number>', 'Number of results', '10')
  .option('--vector', 'Use vector search (semantic)')
  .option('--fts', 'Use full-text search')
  .option('--fuzzy', 'Use fuzzy matching')
  .option('--graph', 'Include graph traversal')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);

    // Ensure user is authenticated
    const apiKey = await ensureAuthenticated(baseUrl);

    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🔍 Searching Deposium...\n'));

      const result = await client.callTool(
        'search_hub',
        {
          tenant_id: options.tenant,
          space_id: options.space,
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
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });
