import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput, safeParseJSON, parseAPIResponse } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';
import { getErrorMessage } from '../utils/command-helpers';

/** OpenBench category information */
interface BenchmarkCategory {
  name: string;
  description: string;
  benchmarks: string[];
}

/** Response from openbench_list */
interface BenchmarkListResponse {
  categories: Record<string, BenchmarkCategory>;
  providers: string[];
  default_provider: string;
  default_model: string;
}

/** Response from openbench_run and openbench_corpus_eval */
interface BenchmarkRunResponse {
  score: number;
  category: string;
  provider: string;
  model: string;
  samples_evaluated: number;
  duration_seconds?: number;
  timestamp: string;
  metrics?: Record<string, unknown>;
  errors?: string[];
}

export const benchmarkCommand = new Command('benchmark')
  .alias('bench')
  .description('OpenBench LLM benchmarking and evaluation');

// benchmark list - List available benchmarks
benchmarkCommand
  .command('list')
  .description('List available OpenBench categories and providers')
  .option('--details', 'Include detailed information', true)
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.silent) {
        console.log(chalk.bold('\n📋 Available OpenBench Categories\n'));
      }

      const result = await client.callTool(
        'openbench_list',
        {
          include_details: options.details,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Failed to list benchmarks:'), result.content);
        process.exit(1);
      }

      // Parse and display categories nicely
      const data = parseAPIResponse<BenchmarkListResponse>(result.content);

      if (options.format === 'table' && data.categories) {
        console.log(chalk.cyan('Categories:'));
        for (const [key, category] of Object.entries(data.categories)) {
          console.log(`  ${chalk.yellow(key)}: ${category.name}`);
          console.log(`    ${chalk.gray(category.description)}`);
          if (category.benchmarks) {
            console.log(`    Benchmarks: ${chalk.green(category.benchmarks.join(', '))}`);
          }
        }
        console.log(`\n${chalk.cyan('Providers:')} ${data.providers?.join(', ') || 'N/A'}`);
        console.log(`${chalk.cyan('Default:')} ${data.default_provider}/${data.default_model}`);
      } else {
        formatOutput(result.content, options.format);
      }
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// benchmark run - Run a standard benchmark
benchmarkCommand
  .command('run')
  .description('Run a standardized LLM benchmark')
  .option(
    '-c, --category <name>',
    'Benchmark category (knowledge|coding|math|reasoning|cybersecurity|search)',
    'search'
  )
  .option('-p, --provider <name>', 'LLM provider (groq|openai|anthropic)', 'groq')
  .option('-m, --model <name>', 'Model name', 'llama-3.1-8b-instant')
  .option('-n, --samples <number>', 'Maximum samples to evaluate', '100')
  .option('--no-cache', 'Disable result caching')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.silent) {
        console.log(chalk.bold('\n🏃 Running OpenBench Benchmark\n'));
        console.log(chalk.gray(`  Category: ${options.category}`));
        console.log(chalk.gray(`  Provider: ${options.provider}`));
        console.log(chalk.gray(`  Model: ${options.model}`));
        console.log(chalk.gray(`  Samples: ${options.samples}\n`));
      }

      const result = await client.callTool(
        'openbench_run',
        {
          category: options.category,
          provider: options.provider,
          model: options.model,
          sample_limit: parseInt(options.samples, 10),
          use_cache: options.cache !== false,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Benchmark failed:'), result.content);
        process.exit(1);
      }

      // Parse and display score prominently
      const data = parseAPIResponse<BenchmarkRunResponse>(result.content);

      if (options.format === 'table') {
        const scoreColor = data.score >= 0.8 ? 'green' : data.score >= 0.6 ? 'yellow' : 'red';
        const scorePercent = (data.score * 100).toFixed(1);

        console.log(chalk.bold('\n📊 Benchmark Results\n'));
        console.log(`  ${chalk.cyan('Score:')} ${chalk[scoreColor](`${scorePercent}%`)}`);
        console.log(`  ${chalk.cyan('Category:')} ${data.category}`);
        console.log(`  ${chalk.cyan('Provider:')} ${data.provider}`);
        console.log(`  ${chalk.cyan('Model:')} ${data.model}`);
        console.log(`  ${chalk.cyan('Samples:')} ${data.samples_evaluated}`);
        console.log(`  ${chalk.cyan('Duration:')} ${data.duration_seconds?.toFixed(2) || 'N/A'}s`);
        console.log(`  ${chalk.cyan('Timestamp:')} ${data.timestamp}`);

        if (data.metrics && Object.keys(data.metrics).length > 0) {
          console.log(chalk.bold('\n📈 Detailed Metrics:'));
          for (const [key, value] of Object.entries(data.metrics)) {
            console.log(`  ${chalk.gray(key)}: ${JSON.stringify(value)}`);
          }
        }

        if (data.errors && data.errors.length > 0) {
          console.log(chalk.bold('\n⚠️  Errors:'));
          data.errors.forEach((err: string) => console.log(`  ${chalk.yellow(err)}`));
        }
      } else {
        formatOutput(result.content, options.format);
      }
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// benchmark corpus - Evaluate a custom corpus
benchmarkCommand
  .command('corpus')
  .description('Evaluate a Deposium corpus for search/retrieval quality')
  .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
  .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
  .option('-q, --queries <json>', 'Query-document pairs JSON file or inline JSON')
  .option('-p, --provider <name>', 'LLM provider', 'groq')
  .option('-m, --model <name>', 'Model name', 'llama-3.1-8b-instant')
  .option('-n, --samples <number>', 'Maximum samples', '100')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.silent) {
        console.log(chalk.bold('\n🔬 Evaluating Corpus Quality\n'));
        console.log(chalk.gray(`  Tenant: ${options.tenant}`));
        console.log(chalk.gray(`  Space: ${options.space}\n`));
      }

      // Parse queries from JSON or file
      let queries: Array<{ query: string; relevant_docs: string[]; context?: string }> = [];

      if (options.queries) {
        try {
          // Try parsing as inline JSON first
          queries = safeParseJSON<typeof queries>(options.queries, '--queries');
        } catch {
          // If that fails, try reading as file
          const fs = await import('fs/promises');
          const content = await fs.readFile(options.queries, 'utf-8');
          queries = safeParseJSON<typeof queries>(content, '--queries (file)');
        }
      } else {
        // Default example queries for demo
        queries = [
          {
            query: 'Example search query',
            relevant_docs: ['Expected relevant document content'],
          },
        ];
        console.log(
          chalk.yellow('⚠️  No queries provided, using example. Use --queries to specify.')
        );
      }

      const result = await client.callTool(
        'openbench_corpus_eval',
        {
          tenant_id: options.tenant,
          space_id: options.space,
          queries,
          provider: options.provider,
          model: options.model,
          sample_limit: parseInt(options.samples, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Corpus evaluation failed:'), result.content);
        process.exit(1);
      }

      // Parse and display results
      const data = parseAPIResponse<BenchmarkRunResponse>(result.content);

      if (options.format === 'table') {
        const scoreColor = data.score >= 0.8 ? 'green' : data.score >= 0.6 ? 'yellow' : 'red';
        const scorePercent = (data.score * 100).toFixed(1);

        console.log(chalk.bold('\n📊 Corpus Evaluation Results\n'));
        console.log(`  ${chalk.cyan('Score:')} ${chalk[scoreColor](`${scorePercent}%`)}`);
        console.log(`  ${chalk.cyan('Tenant:')} ${data.metrics?.tenant_id || options.tenant}`);
        console.log(`  ${chalk.cyan('Space:')} ${data.metrics?.space_id || options.space}`);
        console.log(`  ${chalk.cyan('Samples:')} ${data.samples_evaluated}`);
        console.log(`  ${chalk.cyan('Duration:')} ${data.duration_seconds?.toFixed(2) || 'N/A'}s`);

        if (data.metrics) {
          console.log(chalk.bold('\n📈 Quality Metrics:'));
          const { tenant_id, space_id, ...otherMetrics } = data.metrics;
          for (const [key, value] of Object.entries(otherMetrics)) {
            if (typeof value === 'number') {
              console.log(`  ${chalk.gray(key)}: ${(value as number).toFixed(3)}`);
            } else {
              console.log(`  ${chalk.gray(key)}: ${JSON.stringify(value)}`);
            }
          }
        }
      } else {
        formatOutput(result.content, options.format);
      }
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// benchmark compare - Compare multiple models (future)
benchmarkCommand
  .command('compare')
  .description('Compare benchmark results across multiple models')
  .option('-c, --category <name>', 'Benchmark category', 'search')
  .option('--models <list>', 'Comma-separated list of models', 'llama-3.1-8b-instant,gpt-4o-mini')
  .option('-n, --samples <number>', 'Samples per model', '50')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    const models = options.models.split(',').map((m: string) => m.trim());

    if (!options.silent) {
      console.log(chalk.bold('\n🔄 Comparing Models\n'));
      console.log(chalk.gray(`  Category: ${options.category}`));
      console.log(chalk.gray(`  Models: ${models.join(', ')}\n`));
    }

    const results: Array<{ model: string; score: number; duration: number }> = [];

    for (const model of models) {
      try {
        if (!options.silent) {
          console.log(chalk.cyan(`  Running benchmark for ${model}...`));
        }

        // Determine provider from model name
        let provider = 'groq';
        if (model.includes('gpt')) provider = 'openai';
        if (model.includes('claude')) provider = 'anthropic';

        const result = await client.callTool(
          'openbench_run',
          {
            category: options.category,
            provider,
            model,
            sample_limit: parseInt(options.samples, 10),
            use_cache: true,
          },
          { spinner: false }
        );

        if (!result.isError) {
          const data = parseAPIResponse<BenchmarkRunResponse>(result.content);
          results.push({
            model,
            score: data.score,
            duration: data.duration_seconds ?? 0,
          });
        }
      } catch (error: unknown) {
        console.log(chalk.yellow(`  ⚠️  ${model}: ${getErrorMessage(error)}`));
      }
    }

    // Sort by score and display comparison
    results.sort((a, b) => b.score - a.score);

    console.log(chalk.bold('\n📊 Comparison Results\n'));
    console.log(
      '  ' +
        chalk.gray('Rank') +
        '  ' +
        chalk.gray('Model'.padEnd(30)) +
        '  ' +
        chalk.gray('Score') +
        '  ' +
        chalk.gray('Duration')
    );
    console.log('  ' + '-'.repeat(55));

    results.forEach((r, i) => {
      const rank = (i + 1).toString().padStart(2);
      const scoreColor = r.score >= 0.8 ? 'green' : r.score >= 0.6 ? 'yellow' : 'red';
      const scoreStr = (r.score * 100).toFixed(1) + '%';
      console.log(
        `  ${rank}.  ${r.model.padEnd(30)}  ${chalk[scoreColor](scoreStr.padStart(6))}  ${r.duration?.toFixed(2) || 'N/A'}s`
      );
    });

    if (options.format === 'json') {
      console.log('\n' + JSON.stringify(results, null, 2));
    }
  });
