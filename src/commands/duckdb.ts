import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
import { parseIntOrThrow } from '../utils/parsers';

export const duckdbCommand = new Command('duckdb')
  .alias('db')
  .description('DuckDB MCP server integration and federation');

// duckdb.serve - Start DuckDB MCP server
duckdbCommand
  .command('serve')
  .description('Start DuckDB MCP server for external access')
  .option('--port <number>', 'Server port', '5432')
  .option('--host <host>', 'Server host', '0.0.0.0')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🦆 Starting DuckDB MCP server...\n'));

      const content = await runMcpTool(
        client,
        'duckdb_serve',
        {
          port: parseIntOrThrow(options.port, '--port'),
          host: options.host,
        },
        { label: 'Serve', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// duckdb.connect - Connect to external DuckDB
duckdbCommand
  .command('connect')
  .description('Connect to external DuckDB instance')
  .requiredOption('--url <url>', 'DuckDB connection URL')
  .option('--name <name>', 'Connection name', 'external')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🔗 Connecting to DuckDB...\n'));

      const content = await runMcpTool(
        client,
        'duckdb_connect',
        {
          connection_url: options.url,
          connection_name: options.name,
        },
        { label: 'Connect', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// duckdb.federate - Federate query across multiple DuckDB instances
duckdbCommand
  .command('federate')
  .description('Execute federated query across multiple DuckDB instances')
  .argument('<query>', 'SQL query to execute')
  .requiredOption('--sources <json>', 'Data sources JSON array')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🌐 Executing federated query...\n'));

      const sources = safeParseJSON<Record<string, unknown>[]>(options.sources, '--sources');

      const content = await runMcpTool(
        client,
        'duckdb_federate',
        {
          query,
          sources,
        },
        { label: 'Federated query', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// duckdb.expose - Expose local DuckDB via MCP
duckdbCommand
  .command('expose')
  .description('Expose local DuckDB database via MCP')
  .option('--database <path>', 'Database file path')
  .option('--readonly', 'Expose as read-only')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📤 Exposing DuckDB via MCP...\n'));

      const content = await runMcpTool(
        client,
        'duckdb_expose',
        {
          database_path: options.database,
          readonly: options.readonly ?? false,
        },
        { label: 'Expose', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// duckdb.query_mcp - Query via MCP protocol
duckdbCommand
  .command('query')
  .description('Execute query via DuckDB MCP protocol')
  .argument('<query>', 'SQL query to execute')
  .option('--connection <name>', 'Connection name', 'default')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n🔍 Executing MCP query...\n'));

      const content = await runMcpTool(
        client,
        'duckdb_query_mcp',
        {
          query,
          connection_name: options.connection,
        },
        { label: 'Query', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );

// duckdb.mcp_status - Get MCP server status
duckdbCommand
  .command('status')
  .description('Get DuckDB MCP server status')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand();

      console.log(chalk.bold('\n📊 Fetching MCP server status...\n'));

      const content = await runMcpTool(
        client,
        'duckdb_mcp_status',
        {},
        { label: 'Status check', spinner: !options.silent }
      );

      formatOutput(content, options.format);
    })
  );
