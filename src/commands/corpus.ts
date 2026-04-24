import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { initializeCommand, withErrorHandling, resolveTenantSpace } from '../utils/command-helpers';

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

          const result = await client.callTool(
            'corpus_stats',
            {
              tenant_id: tenantId,
              space_id: spaceId,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Stats failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
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

          const result = await client.callTool(
            'corpus_evaluate',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              metric: options.metric ?? 'relevance',
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Evaluation failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
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

          const result = await client.callTool(
            'corpus_improve',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              focus: options.focus,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Improvement analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  )
  .addCommand(
    new Command('realtime-eval')
      .description('Real-time corpus evaluation with RSS')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-s, --space <id>', 'Space ID')
      .option('--interval <seconds>', 'Evaluation interval', '300')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(
        withErrorHandling(async (options) => {
          const { config, client } = await initializeCommand();
          const { tenantId, spaceId } = resolveTenantSpace(options, config);

          console.log(chalk.bold('\n⚡ Starting real-time evaluation...\n'));

          const result = await client.callTool(
            'corpus_realtime_eval',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              interval: parseInt(options.interval, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Real-time eval failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
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

          const result = await client.callTool(
            'corpus_monitor',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              threshold: parseFloat(options.threshold),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Monitoring failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
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

          const result = await client.callTool(
            'corpus_freshness',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              external_sources: sources,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Freshness check failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
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

          const result = await client.callTool(
            'corpus_drift',
            {
              tenant_id: tenantId,
              space_id: spaceId,
              time_window_days: parseInt(options.timeWindow, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Drift detection failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        })
      )
  );
