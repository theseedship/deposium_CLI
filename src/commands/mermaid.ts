import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput, safeParseJSON } from '../utils/formatter';
import { initializeCommand, withErrorHandling, resolveTenantSpace } from '../utils/command-helpers';

export const mermaidCommand = new Command('mermaid').description(
  'Extract, generate, and query Mermaid diagrams'
);

// mermaid.parse - Extract diagrams
mermaidCommand
  .command('parse')
  .description('Extract Mermaid diagrams from documents')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('--doc-id <id>', 'Specific document ID to parse')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'markdown')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n🔍 Parsing Mermaid diagrams...\n'));

      const result = await client.callTool(
        'mermaid_parse',
        {
          tenant_id: tenantId,
          space_id: spaceId,
          doc_id: options.docId ? parseInt(options.docId, 10) : undefined,
        },
        { spinner: !options.silent }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ Parse failed:'), result.content);
        process.exit(1);
      }

      formatOutput(result.content, options.format);
    })
  );

// mermaid.generate - Generate diagrams
mermaidCommand
  .command('generate')
  .description('Generate Mermaid diagram from data')
  .argument('<type>', 'Diagram type (flowchart|sequence|class|er|gantt|pie)')
  .option('--data <json>', 'Data JSON for diagram generation (required)')
  .option('--title <text>', 'Diagram title')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'markdown')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (type: string, options) => {
      const { client } = await initializeCommand();

      if (!options.data) {
        console.error(chalk.red('❌ --data is required'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🎨 Generating Mermaid diagram...\n'));

      const data = safeParseJSON<Record<string, unknown>>(options.data, '--data');

      const result = await client.callTool(
        'mermaid_generate',
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
    })
  );

// mermaid.query - Query by diagram content
mermaidCommand
  .command('query')
  .description('Query documents by diagram content')
  .argument('<query>', 'Query text to search in diagrams')
  .option('-t, --tenant <id>', 'Tenant ID')
  .option('-s, --space <id>', 'Space ID')
  .option('--diagram-type <type>', 'Filter by diagram type')
  .option('-k, --top-k <number>', 'Number of results', '10')
  .option('-f, --format <type>', 'Output format (json|table|markdown)', 'table')
  .option('--silent', 'Suppress progress messages')
  .action(
    withErrorHandling(async (query: string, options) => {
      const { config, client } = await initializeCommand();
      const { tenantId, spaceId } = resolveTenantSpace(options, config);

      console.log(chalk.bold('\n🔎 Querying diagrams...\n'));

      const result = await client.callTool(
        'mermaid_query',
        {
          tenant_id: tenantId,
          space_id: spaceId,
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
    })
  );
