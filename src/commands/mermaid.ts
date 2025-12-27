import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';
import { getErrorMessage } from '../utils/command-helpers';

export const mermaidCommand = new Command('mermaid').description(
  'Extract, generate, and query Mermaid diagrams'
);

// mermaid.parse - Extract diagrams
mermaidCommand
  .command('parse')
  .description('Extract Mermaid diagrams from documents')
  .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant ?? 'default')
  .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace ?? 'default')
  .option('--doc-id <id>', 'Specific document ID to parse')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'markdown')
  .option('--silent', 'Suppress progress messages')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🔍 Parsing Mermaid diagrams...\n'));

      const result = await client.callTool(
        'mermaid.parse',
        {
          tenant_id: options.tenant,
          space_id: options.space,
          doc_id: options.docId ? parseInt(options.docId, 10) : undefined,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Parse failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// mermaid.generate - Generate diagrams
mermaidCommand
  .command('generate')
  .description('Generate Mermaid diagram from data')
  .argument('<type>', 'Diagram type (flowchart|sequence|class|er|gantt|pie)')
  .option('--data <json>', 'Data JSON for diagram generation (required)')
  .option('--title <text>', 'Diagram title')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'markdown')
  .option('--silent', 'Suppress progress messages')
  .action(async (type: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      if (!options.data) {
        console.error(chalk.red('❌ --data is required'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🎨 Generating Mermaid diagram...\n'));

      const data = safeParseJSON<Record<string, unknown>>(options.data, '--data');

      const result = await client.callTool(
        'mermaid.generate',
        {
          diagram_type: type,
          data,
          title: options.title,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Generation failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

// mermaid.query - Query by diagram content
mermaidCommand
  .command('query')
  .description('Query documents by diagram content')
  .argument('<query>', 'Query text to search in diagrams')
  .option('-t, --tenant <id>', 'Tenant ID', getConfig().defaultTenant ?? 'default')
  .option('-s, --space <id>', 'Space ID', getConfig().defaultSpace ?? 'default')
  .option('--diagram-type <type>', 'Filter by diagram type')
  .option('-k, --top-k <number>', 'Number of results', '10')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(async (query: string, options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🔎 Querying diagrams...\n'));

      const result = await client.callTool(
        'mermaid.query',
        {
          tenant_id: options.tenant,
          space_id: options.space,
          query_text: query,
          diagram_type: options.diagramType,
          top_k: parseInt(options.topK, 10),
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
