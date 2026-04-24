import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { initializeCommand, withErrorHandling, resolveTenantSpace } from '../utils/command-helpers';

export const graphCommand = new Command('graph')
  .description('Graph analysis and queries')
  .addCommand(
    new Command('search')
      .description('Search entities by pattern in graph')
      .argument('<pattern>', 'Entity search pattern')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--limit <number>', 'Max results', '50')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (pattern: string, options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🔍 Searching graph...\n'));

          const result = await client.callTool(
            'graph_search',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              pattern,
              limit: parseInt(options.limit, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Search failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('analyze')
      .description('Cluster and centrality analysis')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--algorithm <type>', 'Analysis algorithm (pagerank|betweenness|clustering)')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🔗 Analyzing Graph...\n'));

          const result = await client.callTool(
            'graph_analyze',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              algorithm: options.algorithm,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('path')
      .description('Find optimal path between two entities')
      .argument('<from>', 'Source entity ID')
      .argument('<to>', 'Target entity ID')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (from: string, to: string, options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold(`\n🛤️  Finding path: ${from} → ${to}...\n`));

          const result = await client.callTool(
            'graph_path',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              source_id: from,
              target_id: to,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Path finding failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('multihop')
      .description('Multi-hop queries with Kleene+ patterns')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--source-pattern <pattern>', 'Source entity pattern')
      .option('--target-pattern <pattern>', 'Target entity pattern')
      .option('--min-hops <number>', 'Minimum hops', '1')
      .option('--max-hops <number>', 'Maximum hops', '5')
      .option('--edge-filters <json>', 'Edge filters JSON')
      .option('--limit <number>', 'Max results', '100')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🔀 Executing multi-hop query...\n'));

          const edgeFilters = options.edgeFilters
            ? safeParseJSON<Record<string, unknown>>(options.edgeFilters, '--edge-filters')
            : undefined;

          const result = await client.callTool(
            'graph_multihop',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              source_pattern: options.sourcePattern,
              target_pattern: options.targetPattern,
              min_hops: parseInt(options.minHops, 10),
              max_hops: parseInt(options.maxHops, 10),
              edge_filters: edgeFilters,
              limit: parseInt(options.limit, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Multi-hop query failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('variable-path')
      .description('Variable-length path finding (1..n hops)')
      .argument('<from>', 'Source node ID')
      .argument('<to>', 'Target node ID')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--min-hops <number>', 'Minimum hops', '1')
      .option('--max-hops <number>', 'Maximum hops', '10')
      .option('--avoid-cycles', 'Avoid cycles in paths')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (from: string, to: string, options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold(`\n🔗 Finding variable paths: ${from} → ${to}...\n`));

          const result = await client.callTool(
            'graph_variable_path',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              source_id: from,
              target_id: to,
              min_hops: parseInt(options.minHops, 10),
              max_hops: parseInt(options.maxHops, 10),
              avoid_cycles: options.avoidCycles ?? false,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Variable path finding failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('khop')
      .description('K-hop neighborhood analysis')
      .argument('<nodeId>', 'Central node ID')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('-k, --hops <number>', 'Number of hops', '3')
      .option('--include-properties', 'Include node properties')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (nodeId: string, options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold(`\n🎯 Analyzing ${options.hops}-hop neighborhood...\n`));

          const result = await client.callTool(
            'graph_khop',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              node_id: nodeId,
              k: parseInt(options.hops, 10),
              include_properties: options.includeProperties ?? false,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ K-hop analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('components')
      .description('Find strongly connected components')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--min-size <number>', 'Minimum component size', '2')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🧩 Finding Components...\n'));

          const result = await client.callTool(
            'graph_components',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              min_component_size: parseInt(options.minSize, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Component analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  );
