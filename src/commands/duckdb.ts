import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';
import { getErrorMessage } from '../utils/command-helpers';

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
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🦆 Starting DuckDB MCP server...\n'));

      const result = await client.callTool(
        'duckdb.serve',
        {
          port: parseInt(options.port, 10),
          host: options.host,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Serve failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// duckdb.connect - Connect to external DuckDB
duckdbCommand
  .command('connect')
  .description('Connect to external DuckDB instance')
  .option('--url <url>', 'DuckDB connection URL (required)')
  .option('--name <name>', 'Connection name', 'external')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.url) {
        console.error(chalk.red('❌ --url is required'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🔗 Connecting to DuckDB...\n'));

      const result = await client.callTool(
        'duckdb.connect',
        {
          connection_url: options.url,
          connection_name: options.name,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Connect failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// duckdb.federate - Federate query across multiple DuckDB instances
duckdbCommand
  .command('federate')
  .description('Execute federated query across multiple DuckDB instances')
  .argument('<query>', 'SQL query to execute')
  .option('--sources <json>', 'Data sources JSON array (required)')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.sources) {
        console.error(chalk.red('❌ --sources is required'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🌐 Executing federated query...\n'));

      const sources = safeParseJSON<Record<string, unknown>[]>(options.sources, '--sources');

      const result = await client.callTool(
        'duckdb.federate',
        {
          query,
          sources,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Federated query failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// duckdb.expose - Expose local DuckDB via MCP
duckdbCommand
  .command('expose')
  .description('Expose local DuckDB database via MCP')
  .option('--database <path>', 'Database file path')
  .option('--readonly', 'Expose as read-only')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n📤 Exposing DuckDB via MCP...\n'));

      const result = await client.callTool(
        'duckdb.expose',
        {
          database_path: options.database,
          readonly: options.readonly || false,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Expose failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// duckdb.query_mcp - Query via MCP protocol
duckdbCommand
  .command('query')
  .description('Execute query via DuckDB MCP protocol')
  .argument('<query>', 'SQL query to execute')
  .option('--connection <name>', 'Connection name', 'default')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🔍 Executing MCP query...\n'));

      const result = await client.callTool(
        'duckdb.query_mcp',
        {
          query,
          connection_name: options.connection,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Query failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// duckdb.mcp_status - Get MCP server status
duckdbCommand
  .command('status')
  .description('Get DuckDB MCP server status')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n📊 Fetching MCP server status...\n'));

      const result = await client.callTool('duckdb_mcp_status', {}, { spinner: !options.silent });

      if (result.isError) {
        console.error(chalk.red('\n❌ Status check failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });
