import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';

export const evaluateCommand = new Command('evaluate')
  .alias('eval')
  .description('Evaluation metrics, dashboards, and feedback');

// eval.metrics - Get evaluation metrics
evaluateCommand
  .command('metrics')
  .description('Get evaluation metrics for user query history')
  .option('--user-id <id>', 'User ID for metrics')
  .option('--include-global', 'Include system-wide metrics')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n📊 Fetching evaluation metrics...\n'));

      const result = await client.callTool(
        'eval_metrics',
        {
          userId: options.userId,
          includeGlobal: options.includeGlobal || false,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Metrics failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// eval.dashboard - Generate evaluation dashboard
evaluateCommand
  .command('dashboard')
  .description('Generate evaluation dashboard with visualizations')
  .option('--user-id <id>', 'User ID for dashboard')
  .option('--time-range <range>', 'Time range (24h|7d|30d)', '24h')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n📈 Generating dashboard...\n'));

      const result = await client.callTool(
        'eval_dashboard',
        {
          userId: options.userId,
          timeRange: options.timeRange,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Dashboard generation failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// eval.feedback - Submit quality feedback
evaluateCommand
  .command('feedback')
  .description('Submit feedback for query quality improvement')
  .option('--query-id <id>', 'Query ID (required)')
  .option('--user-id <id>', 'User ID (required)')
  .option('--score <number>', 'Quality score 0-1 (required)')
  .option('--feedback <text>', 'Feedback text')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.queryId || !options.userId || !options.score) {
        console.error(chalk.red('❌ --query-id, --user-id, and --score are required'));
        process.exit(1);
      }

      console.log(chalk.bold('\n💬 Submitting feedback...\n'));

      const result = await client.callTool(
        'eval_feedback',
        {
          queryId: options.queryId,
          userId: options.userId,
          score: parseFloat(options.score),
          feedback: options.feedback,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Feedback submission failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// evaluate.code - E2B sandboxed code execution
evaluateCommand
  .command('code')
  .description('Execute and evaluate code in sandboxed environment')
  .argument('<code>', 'Code to execute')
  .option('--language <lang>', 'Programming language', 'javascript')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '30000')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (code: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n⚡ Executing code in sandbox...\n'));

      const result = await client.callTool(
        'analyze_code',
        {
          code,
          language: options.language,
          timeout: parseInt(options.timeout, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Code execution failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// evaluate.graph - Graph visualization and metrics
evaluateCommand
  .command('graph')
  .description('Generate graph visualization and quality metrics')
  .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant || 'default')
  .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace || 'default')
  .option('--max-nodes <number>', 'Maximum nodes to visualize', '100')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🕸️  Generating graph visualization...\n'));

      const result = await client.callTool(
        'generate_security_report',
        {
          tenant_id: options.tenant,
          space_id: options.space,
          max_nodes: parseInt(options.maxNodes, 10),
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Graph evaluation failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });

// evaluate.quality - Code quality assessment
evaluateCommand
  .command('quality')
  .description('Assess code quality with test cases')
  .argument('<code>', 'Code to assess')
  .option('--test-cases <json>', 'Test cases JSON')
  .option('--language <lang>', 'Programming language', 'javascript')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (code: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🔍 Assessing code quality...\n'));

      const testCases = options.testCases ? JSON.parse(options.testCases) : undefined;

      const result = await client.callTool(
        'scan_vulnerabilities',
        {
          code,
          test_cases: testCases,
          language: options.language,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Quality assessment failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      process.exit(1);
    }
  });
