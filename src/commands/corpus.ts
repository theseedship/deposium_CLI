import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const corpusCommand = new Command('corpus')
  .description('Corpus statistics and evaluation')
  .addCommand(
    new Command('stats')
      .description('Get corpus statistics')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(baseUrl);

        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n📊 Fetching Corpus Statistics...\n'));

          const result = await client.callTool(
            'corpus_stats',
            {
              tenant_id: options.tenant,
              space_id: options.space,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Stats failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('evaluate')
      .description('Evaluate corpus quality with LLM-as-judge')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--metric <name>', 'Evaluation metric (relevance|coherence|diversity)')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(baseUrl);

        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n🎯 Evaluating Corpus Quality...\n'));

          const result = await client.callTool(
            'corpus_evaluate',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              metric: options.metric || 'relevance',
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Evaluation failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('improve')
      .description('Get improvement suggestions for corpus')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--focus <area>', 'Focus area (coverage|quality|diversity)')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);
        const apiKey = await ensureAuthenticated(baseUrl);
        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n💡 Analyzing corpus improvements...\n'));

          const result = await client.callTool(
            'corpus.improve',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              focus: options.focus,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Improvement analysis failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('realtime-eval')
      .description('Real-time corpus evaluation with RSS')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--interval <seconds>', 'Evaluation interval', '300')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);
        const apiKey = await ensureAuthenticated(baseUrl);
        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n⚡ Starting real-time evaluation...\n'));

          const result = await client.callTool(
            'corpus.realtime_eval',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              interval: parseInt(options.interval, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Real-time eval failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('monitor')
      .description('Monitor corpus quality with anomaly detection')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--threshold <number>', 'Anomaly threshold', '0.8')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);
        const apiKey = await ensureAuthenticated(baseUrl);
        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n🔍 Monitoring corpus quality...\n'));

          const result = await client.callTool(
            'corpus.monitor',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              threshold: parseFloat(options.threshold),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Monitoring failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('freshness')
      .description('Check corpus freshness against external sources')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--sources <json>', 'External sources JSON')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);
        const apiKey = await ensureAuthenticated(baseUrl);
        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n🆕 Checking corpus freshness...\n'));

          const sources = options.sources
            ? safeParseJSON<string[]>(options.sources, '--sources')
            : undefined;

          const result = await client.callTool(
            'corpus.freshness',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              external_sources: sources,
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Freshness check failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('drift')
      .description('Detect concept drift over time')
      .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
      .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
      .option('--time-window <days>', 'Time window for comparison', '30')
      .option('-f, --format <type>', 'Output format (json|table)', 'table')
      .action(async (options) => {
        const config = getConfig();
        const baseUrl = getBaseUrl(config);
        const apiKey = await ensureAuthenticated(baseUrl);
        const client = new MCPClient(baseUrl, apiKey);

        try {
          console.log(chalk.bold('\n📉 Detecting concept drift...\n'));

          const result = await client.callTool(
            'corpus.drift',
            {
              tenant_id: options.tenant,
              space_id: options.space,
              time_window_days: parseInt(options.timeWindow, 10),
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Drift detection failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  );
