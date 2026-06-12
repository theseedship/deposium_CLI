import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import {
  initializeCommand,
  withErrorHandling,
  resolveTenantSpace,
  runMcpTool,
} from '../utils/command-helpers';
import { parseIntOrThrow, parseFloatOrThrow } from '../utils/parsers';

export const corpusCommand = new Command('corpus')
  .description('Corpus statistics and evaluation')
  .addCommand(
    new Command('stats')
      .description('Get corpus statistics')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n📊 Fetching Corpus Statistics...\n'));

          const content = await runMcpTool(
            client,
            'corpus_stats',
            {
              tenant_id: tenantId,
              space_id: spaceId,
            },
            { label: 'Stats' }
          );

          formatOutput(content, options.format);
        })
      )
  )
  .addCommand(
    new Command('evaluate')
      .description('Evaluate corpus quality with LLM-as-judge')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--metric <name>', 'Evaluation metric (relevance|coherence|diversity)')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🎯 Evaluating Corpus Quality...\n'));

          const content = await runMcpTool(
            client,
            'corpus_evaluate',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              metric: options.metric ?? 'relevance',
            },
            { label: 'Evaluation' }
          );

          formatOutput(content, options.format);
        })
      )
  )
  .addCommand(
    new Command('improve')
      .description('Get improvement suggestions for corpus')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--focus <area>', 'Focus area (coverage|quality|diversity)')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n💡 Analyzing corpus improvements...\n'));

          const content = await runMcpTool(
            client,
            'corpus_improve',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              focus: options.focus,
            },
            { label: 'Improvement analysis' }
          );

          formatOutput(content, options.format);
        })
      )
  )
  .addCommand(
    new Command('eval-snapshot')
      .alias('realtime-eval') // kept for back-compat — the call is still a one-shot snapshot
      .description('Snapshot corpus evaluation (one-shot — no recurring stream)')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option(
        '--interval <seconds>',
        'Window size in seconds the server uses for the snapshot (not a poll interval — the CLI calls once)',
        '300'
      )
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n⚡ Fetching evaluation snapshot...\n'));

          const content = await runMcpTool(
            client,
            'corpus_realtime_eval',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              interval: parseIntOrThrow(options.interval, '--interval'),
            },
            { label: 'Evaluation snapshot' }
          );

          formatOutput(content, options.format);
        })
      )
  )
  .addCommand(
    new Command('monitor')
      .description('Monitor corpus quality with anomaly detection')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--threshold <number>', 'Anomaly threshold', '0.8')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🔍 Monitoring corpus quality...\n'));

          const content = await runMcpTool(
            client,
            'corpus_monitor',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              threshold: parseFloatOrThrow(options.threshold, '--threshold'),
            },
            { label: 'Monitoring' }
          );

          formatOutput(content, options.format);
        })
      )
  )
  .addCommand(
    new Command('freshness')
      .description('Check corpus freshness against external sources')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--sources <json>', 'External sources JSON')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n🆕 Checking corpus freshness...\n'));

          const sources = options.sources
            ? safeParseJSON<string[]>(options.sources, '--sources')
            : undefined;

          const content = await runMcpTool(
            client,
            'corpus_freshness',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              external_sources: sources,
            },
            { label: 'Freshness check' }
          );

          formatOutput(content, options.format);
        })
      )
  )
  .addCommand(
    new Command('drift')
      .description('Detect concept drift over time')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--time-window <days>', 'Time window for comparison', '30')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n📉 Detecting concept drift...\n'));

          const content = await runMcpTool(
            client,
            'corpus_drift',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              time_window_days: parseIntOrThrow(options.timeWindow, '--time-window'),
            },
            { label: 'Drift detection' }
          );

          formatOutput(content, options.format);
        })
      )
  );
