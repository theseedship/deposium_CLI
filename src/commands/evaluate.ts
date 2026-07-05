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

export const evaluateCommand = new Command('evaluate')
  .alias('eval')
  .description('Evaluation metrics, dashboards, and feedback');

// eval.metrics - Get evaluation metrics
evaluateCommand
  .command('metrics')
  .description('Get evaluation metrics for user query history')
  .requiredOption('--user-id <id>', 'User ID for metrics (required by backend schema)')
  .option('--include-global', 'Include system-wide metrics')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📊 Fetching evaluation metrics...\n'));

      const content = await runMcpTool(
        client,
        'eval_metrics',
        {
          // Backend `evalMetricsSchema` requires camelCase — `user_id`
          // was silently stripped, causing `userId: Required` 400s.
          userId: options.userId,
          includeGlobal: options.includeGlobal ?? false,
        },
        { label: 'Metrics', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// eval.dashboard - Generate evaluation dashboard
evaluateCommand
  .command('dashboard')
  .description('Generate evaluation dashboard with visualizations')
  .option('--user-id <id>', 'User ID for dashboard')
  .option('--time-range <range>', 'Time range (24h|7d|30d)', '24h')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📈 Generating dashboard...\n'));

      const content = await runMcpTool(
        client,
        'eval_dashboard',
        {
          // Backend `evalDashboardSchema` uses camelCase — snake_case
          // keys were dropped, so `--time-range 7d` always returned
          // the default 24h period and `--user-id` was ignored.
          userId: options.userId,
          timeRange: options.timeRange,
        },
        { label: 'Dashboard generation', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// eval.feedback - Submit quality feedback
evaluateCommand
  .command('feedback')
  .description('Submit feedback for query quality improvement')
  .requiredOption('--query-id <id>', 'Query ID')
  .requiredOption('--user-id <id>', 'User ID')
  .requiredOption('--score <number>', 'Quality score 0-1')
  .requiredOption('--feedback <text>', 'Feedback text (required by backend schema)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n💬 Submitting feedback...\n'));

      const content = await runMcpTool(
        client,
        'eval_feedback',
        {
          // Backend `evalFeedbackSchema` requires camelCase queryId/userId
          // (unlike the rest of the API surface, which is snake_case).
          // A prior comment here rationalized snake_case as consistency,
          // but the Zod schema silently stripped both and 400'd on
          // `queryId: Required`. No feedback was ever recorded.
          queryId: options.queryId,
          userId: options.userId,
          score: parseFloatOrThrow(options.score, '--score'),
          feedback: options.feedback,
        },
        { label: 'Feedback submission', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// evaluate.code - E2B sandboxed code execution
evaluateCommand
  .command('code')
  .description('Execute and evaluate code in sandboxed environment')
  .argument('<code>', 'Code to execute')
  .option('--language <lang>', 'Programming language', 'javascript')
  .option('--timeout <ms>', 'Execution timeout in milliseconds', '30000')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (code: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n⚡ Executing code in sandbox...\n'));

      const content = await runMcpTool(
        client,
        // `analyze_code` (Greptile) runs static analysis on a Git repo
        // — it never executed the user's code. The correct tool is
        // `evaluate_code` (E2B sandbox), whose schema exactly matches
        // the `{ code, language, timeout }` shape below.
        'evaluate_code',
        {
          code,
          language: options.language,
          timeout: parseIntOrThrow(options.timeout, '--timeout'),
        },
        { label: 'Code execution', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// evaluate.graph - Graph visualization and metrics
evaluateCommand
  .command('graph')
  .description('Generate graph visualization and quality metrics')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('--max-nodes <number>', 'Maximum nodes to visualize', '100')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n🕸️  Generating graph visualization...\n'));

      const content = await runMcpTool(
        client,
        'evaluate_graph',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          max_nodes: parseIntOrThrow(options.maxNodes, '--max-nodes'),
        },
        { label: 'Graph evaluation', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// evaluate.quality - Code quality assessment
evaluateCommand
  .command('quality')
  .description('Assess code quality with test cases')
  .argument('<code>', 'Code to assess')
  .option('--test-cases <json>', 'Test cases JSON')
  .option('--language <lang>', 'Programming language', 'javascript')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (code: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🔍 Assessing code quality...\n'));

      const testCases = options.testCases
        ? safeParseJSON<unknown[]>(options.testCases, '--test-cases')
        : undefined;

      const content = await runMcpTool(
        client,
        'evaluate_quality',
        {
          code,
          test_cases: testCases,
          language: options.language,
        },
        { label: 'Quality assessment', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );
