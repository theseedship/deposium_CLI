import { tr } from '../utils/i18n';
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { MCPTool } from '../client/mcp-client';
import { initializeCommand, withErrorHandling } from '../utils/command-helpers';
import { printToolDetail } from '../utils/tool-catalogue';

export const toolsCommand = new Command('tools')
  .description('List and explore available MCP tools')
  .option('-c, --category <name>', 'Filter by category')
  .option('-s, --search <term>', 'Search tool names/descriptions')
  .option(
    '--show <name>',
    'Read one exact tool name, its complete description and input parameters'
  )
  .option('--json', 'Output as JSON')
  .action(
    withErrorHandling(async (options) => {
      const { client } = await initializeCommand({ machineReadable: options.json === true });

      if (!options.json) console.log(chalk.bold(tr('\n🛠️  Fetching Available MCP Tools...\n')));

      const tools = await client.listTools();

      if (options.show !== undefined) {
        showCatalogueEntry(tools, options);
        return;
      }

      if (tools?.length === 0) {
        console.log(options.json ? '[]' : chalk.yellow(tr('⚠️  No tools found')));
        return;
      }

      // Apply filters
      let filteredTools = tools;

      if (options.search) {
        const searchTerm = options.search.toLowerCase();
        filteredTools = filteredTools.filter(
          (tool) =>
            tool.name.toLowerCase().includes(searchTerm) ||
            tool.description?.toLowerCase().includes(searchTerm)
        );
      }

      if (options.category) {
        const category = options.category.toLowerCase();
        filteredTools = filteredTools.filter(
          (tool) =>
            tool.name.toLowerCase().startsWith(category) ||
            tool.name.toLowerCase().startsWith(`deposium_${category}`) ||
            (tool.category && tool.category.toLowerCase() === category)
        );
      }

      // Output as JSON
      if (options.json) {
        console.log(JSON.stringify(filteredTools, null, 2));
        return;
      }

      // Group tools by category
      const categories = new Map<string, MCPTool[]>();

      filteredTools.forEach((tool) => {
        const category = tool.name.replace(/^deposium_/, '').split(/[._]/)[0] ?? 'other';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)?.push(tool);
      });

      // Display tools by category
      console.log(chalk.bold.cyan(tr('📊 Found {0} tools:\n', filteredTools.length)));

      const sortedCategories = Array.from(categories.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      for (const [category, categoryTools] of sortedCategories) {
        console.log(chalk.bold.green(`\n${getCategoryIcon(category)} ${category.toUpperCase()}`));
        console.log(chalk.gray('─'.repeat(60)));

        const table = new Table({
          head: [chalk.cyan(tr('Tool')), chalk.cyan(tr('Description'))],
          colWidths: [30, 70],
          wordWrap: true,
          style: {
            head: [],
            border: ['gray'],
          },
        });

        categoryTools.forEach((tool) => {
          table.push([chalk.white(tool.name), chalk.gray(tool.description ?? 'No description')]);
        });

        console.log(table.toString());
      }

      // Summary statistics
      console.log(chalk.bold.cyan(tr('\n📈 Summary:')));
      console.log(chalk.white(tr('  Total tools: {0}', filteredTools.length)));
      console.log(chalk.white(tr('  Categories: {0}', categories.size)));

      if (options.search || options.category) {
        console.log(chalk.gray(tr('  (filtered from {0} total tools)', tools.length)));
      }

      console.log(chalk.gray(tr('\n💡 Tip: Use --search or --category to filter tools')));
      console.log(chalk.gray(tr('💡 Tip: Use --json for machine-readable output\n')));
    })
  );

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    search: '🔍',
    graph: '🔗',
    corpus: '📚',
    smart: '🧠',
    compound: '🤖',
    ui: '🎨',
    eval: '📊',
    evaluate: '📊',
    dspy: '🧭',
    leanrag: '🎯',
    mermaid: '📐',
    query: '📝',
    log: '📜',
    logs: '📜',
    view: '👀',
    duckdb: '🦆',
    system: '⚙️',
    embed: '🔢',
    vector: '📐',
    consolidate: '📦',
    update: '🔄',
  };

  return icons[category] || '🔧';
}

function showCatalogueEntry(
  tools: MCPTool[],
  options: { show: string; search?: string; category?: string; json?: boolean }
): void {
  if (!options.show.trim()) throw new Error('--show requires a non-empty exact tool name.');
  if (options.search || options.category)
    throw new Error('--show selects one exact tool; use it without --search or --category.');
  const tool = tools.find((entry) => entry.name === options.show);
  if (!tool)
    throw new Error('Tool not found in the returned catalogue. Use deposium tools to list names.');
  if (options.json) console.log(JSON.stringify(tool, null, 2));
  else printToolDetail(tool);
}
