import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { MCPClient, MCPTool } from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { ensureAuthenticated } from '../utils/auth';
import { getErrorMessage } from '../utils/command-helpers';

export const toolsCommand = new Command('tools')
  .description('List and explore available MCP tools')
  .option('-c, --category <name>', 'Filter by category')
  .option('-s, --search <term>', 'Search tool names/descriptions')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const config = getConfig();
    const baseUrl = getBaseUrl(config);
    const apiKey = await ensureAuthenticated(baseUrl);
    const client = new MCPClient(baseUrl, apiKey);

    try {
      console.log(chalk.bold('\n🛠️  Fetching Available MCP Tools...\n'));

      const tools = await client.listTools();

      if (tools?.length === 0) {
        console.log(chalk.yellow('⚠️  No tools found'));
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
        const category = tool.name.split('.')[0] || 'other';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(tool);
      });

      // Display tools by category
      console.log(chalk.bold.cyan(`📊 Found ${filteredTools.length} tools:\n`));

      const sortedCategories = Array.from(categories.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      for (const [category, categoryTools] of sortedCategories) {
        console.log(chalk.bold.green(`\n${getCategoryIcon(category)} ${category.toUpperCase()}`));
        console.log(chalk.gray('─'.repeat(60)));

        const table = new Table({
          head: [chalk.cyan('Tool'), chalk.cyan('Description')],
          colWidths: [30, 70],
          wordWrap: true,
          style: {
            head: [],
            border: ['gray'],
          },
        });

        categoryTools.forEach((tool) => {
          table.push([chalk.white(tool.name), chalk.gray(tool.description || 'No description')]);
        });

        console.log(table.toString());
      }

      // Summary statistics
      console.log(chalk.bold.cyan(`\n📈 Summary:`));
      console.log(chalk.white(`  Total tools: ${filteredTools.length}`));
      console.log(chalk.white(`  Categories: ${categories.size}`));

      if (options.search || options.category) {
        console.log(chalk.gray(`  (filtered from ${tools.length} total tools)`));
      }

      console.log(chalk.gray('\n💡 Tip: Use --search or --category to filter tools'));
      console.log(chalk.gray('💡 Tip: Use --json for machine-readable output\n'));
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      process.exit(1);
    }
  });

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
