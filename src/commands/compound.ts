import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import { getConfig } from '../utils/config';
import { formatOutput } from '../utils/formatter';
import { ensureAuthenticated } from '../utils/auth';
import { ChatHistory } from '../utils/chat-history';

// Global chat history for the compound command (persists across calls in same session)
const globalChatHistory = new ChatHistory(10);

export const compoundCommand = new Command('compound')
  .description('Compound AI operations with Groq')
  .addCommand(
    new Command('analyze')
      .description('Deep reasoning with multi-tool orchestration')
      .argument('<query>', 'Complex query for analysis')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .option('-c, --clear', 'Clear conversation history before this query')
      .option('-s, --show-history', 'Show conversation history before query')
      .action(async (query, options) => {
        const config = getConfig();

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

        try {
          // Show history if requested
          if (options.showHistory && !globalChatHistory.isEmpty()) {
            globalChatHistory.display();
          }

          // Clear history if requested
          if (options.clear) {
            globalChatHistory.clear();
            console.log(chalk.yellow('🗑️  Conversation history cleared\n'));
          }

          // Add user message to history
          globalChatHistory.addUserMessage(query);

          // Get conversation context as a string
          const context = globalChatHistory.getContext(6);

          console.log(chalk.bold('\n🤖 Analyzing with Compound AI...\n'));

          const result = await client.callTool(
            'compound_analyze',
            {
              query,
              context, // Pass context as string directly
            },
            { spinner: true }
          );

          if (result.isError) {
            console.error(chalk.red('\n❌ Analysis failed:'), result.content);
            process.exit(1);
          }

          // Add AI response to history
          const responseText =
            typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
          globalChatHistory.addAssistantMessage(responseText);

          formatOutput(result.content, options.format);

          // Show message count
          console.log(
            chalk.gray(`\n💬 ${globalChatHistory.getMessages().length} messages in conversation\n`)
          );
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

        // Ensure user is authenticated
        const apiKey = await ensureAuthenticated(config.mcpUrl!);

        const client = new MCPClient(config.mcpUrl!, apiKey);

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
