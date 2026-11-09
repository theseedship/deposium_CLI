import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
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
      const format = options.format.toLowerCase();
      const { config, client } = await initializeCommand({ machineReadable: format === 'json' });
      // The server resolves an omitted tenant from the authenticated API key.
      // A fabricated 'default' tenant is an explicit foreign identity, not a default.
      const tenantId =
        options.tenant ?? (config.defaultTenant === 'default' ? undefined : config.defaultTenant);
      const spaceId = options.space ?? config.defaultSpace;
      if (!spaceId || spaceId === 'default') {
        throw new Error(
          'Choose a space with --space <id> or configure defaultSpace. Use deposium space list.'
        );
      }
      const tenant = tenantId ? { tenant_id: tenantId } : {};
      const progress = !options.silent && format !== 'json';

      if (progress) console.log(chalk.bold('\n🔍 Searching Deposium...\n'));

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
              ...tenant,
              space_id: spaceId,
              query,
              top_k: topK,
            },
            { label: 'BM25 search', spinner: progress }
          )
        : await runMcpTool(
            client,
            'search_hub',
            {
              ...tenant,
              space_id: spaceId,
              query_text: query,
              use_vector_rel: options.vector !== undefined ? options.vector : true,
              use_graph: options.graph ?? false,
              top_k: topK,
            },
            { label: 'Search', spinner: progress }
          );

      formatOutput(content, format);
    })
  );
