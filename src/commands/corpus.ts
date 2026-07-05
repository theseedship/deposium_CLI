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
      .option(
        '--metric <name>',
        // Backend `corpusEvaluateSchema.metrics` enum. `coherence`
        // was advertised here but is not a valid backend metric —
        // dropped. Sent as a one-element array so the schema is satisfied
        // whether the user passes one metric or omits the flag.
        'Evaluation metric (relevance|faithfulness|answer_relevancy|context_recall|context_precision|diversity|coverage|freshness|currency)'
      )
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
              // Schema expects `metrics: string[]`, not singular `metric`.
              metrics: [options.metric ?? 'relevance'],
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
      .requiredOption(
        '--type <improvement_type>',
        // Backend `corpusImproveSchema.improvement_type` enum. The old
        // `--focus` flag mapped to nothing — every invocation 400'd on
        // `improvement_type: Required`.
        'Improvement type (add_missing_topics|remove_duplicates|enhance_metadata|optimize_chunking|improve_embeddings|update_stale_content|diversify_sources)'
      )
      .option(
        '--evaluation-results <json>',
        'Prior corpus_evaluate output (JSON). Backend schema marks this required — chain with `corpus evaluate --format json`.'
      )
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n💡 Analyzing corpus improvements...\n'));

          const evaluationResults = options.evaluationResults
            ? safeParseJSON<unknown>(options.evaluationResults, '--evaluation-results')
            : {};

          const content = await runMcpTool(
            client,
            'corpus_improve',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              improvement_type: options.type,
              evaluation_results: evaluationResults,
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
      .option(
        '--action <action>',
        // Backend `corpusMonitorSchema.action` is required. Default to
        // `status` — the safe read-only query. `start`/`stop` mutate
        // the monitor and should be explicit.
        'Monitor action (start|stop|status)',
        'status'
      )
      .option(
        '--threshold <number>',
        // Backend key is `alert_threshold`, not `threshold`.
        'Alert threshold 0-1',
        '0.7'
      )
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
              action: options.action,
              alert_threshold: parseFloatOrThrow(options.threshold, '--threshold'),
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
      .option(
        '--time-window <days>',
        // Backend schema has no `time_window_days` — it takes an
        // absolute `baseline_date` (ISO string). Convert the flag by
        // subtracting N days from `now` on the client.
        'Baseline is N days before today',
        '30'
      )
      .option('--sensitivity <level>', 'Drift sensitivity (low|medium|high)', 'medium')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n📉 Detecting concept drift...\n'));

          // Compute `baseline_date` from `--time-window <days>`. Backend
          // reads ISO strings; use YYYY-MM-DD for stability across TZs.
          const days = parseIntOrThrow(options.timeWindow, '--time-window');
          const baselineDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

          const content = await runMcpTool(
            client,
            'corpus_drift',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              baseline_date: baselineDate,
              sensitivity: options.sensitivity,
            },
            { label: 'Drift detection' }
          );

          formatOutput(content, options.format);
        })
      )
  );
