import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';

export const compoundCommand = new Command('compound')
  .description('Compound AI operations with Groq')
  .addCommand(
    new Command('analyze')
      .description('Deep reasoning with multi-tool orchestration')
      .argument('<query>', 'Complex query for analysis')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .action(async (query, options) => {
        const config = getConfig();
        const client = new MCPClient(config.mcpUrl!);

        try {
          console.log(chalk.bold('\n🤖 Analyzing with Compound AI...\n'));

          const result = await client.callTool(
            'compound_analyze',
            {
              query,
              context: {},
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Analysis failed:'), result.content);
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
    new Command('research')
      .description('Topic research with web search')
      .argument('<topic>', 'Research topic')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .action(async (topic, options) => {
        const config = getConfig();
        const client = new MCPClient(config.mcpUrl!);

        try {
          console.log(chalk.bold(`\n🔬 Researching: ${topic}...\n`));

          const result = await client.callTool(
            'compound_research',
            {
              topic,
              depth: 'comprehensive',
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Research failed:'), result.content);
            process.exit(1);
          }

          formatOutput(result.content, options.format);
        } catch (error: any) {
          console.error(chalk.red('\n❌ Error:'), error.message);
          process.exit(1);
        }
      })
  );
