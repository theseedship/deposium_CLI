import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import {
  initializeCommand,
  withErrorHandling,
  resolveTenantSpace,
  runMcpTool,
} from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

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

      const topK = parseIntOrThrow(options.topK, '--top-k');

      // `search_hub` has no `use_fts` / `use_fuzzy` toggles — Zod silently
      // dropped them, so `--fts` and `--fuzzy` were no-ops that returned
      // default vector results. Route `--fts` to the dedicated
      // `search_bm25_ranked` tool. `--fuzzy` currently has no backend
      // equivalent — surface that instead of silently degrading.
      if (options.fuzzy) {
        console.warn(
          chalk.yellow('⚠️  --fuzzy has no backend equivalent yet; falling back to vector search.')
        );
      }

      const content = options.fts
        ? await runMcpTool(
            client,
            'search_bm25_ranked',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              query,
              top_k: topK,
            },
            { label: 'BM25 search', spinner: !options.silent }
          )
        : await runMcpTool(
            client,
            'search_hub',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              query_text: query,
              use_vector_rel: options.vector !== undefined ? options.vector : true,
              use_graph: options.graph ?? false,
              top_k: topK,
            },
            { label: 'Search', spinner: !options.silent }
          );

      formatOutput(content, options.format);
    })
  );
