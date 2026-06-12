import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
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
      .action(
        withErrorHandling(async (query, options) => {
          const { client } = await initializeCommand();

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

          const content = await runMcpTool(
            client,
            'compound_analyze',
            {
              query,
              context, // Pass context as string directly
            },
            { label: 'Analysis' }
          );

          // Add AI response to history
          const responseText = typeof content === 'string' ? content : JSON.stringify(content);
          globalChatHistory.addAssistantMessage(responseText);

          formatOutput(content, options.format);

          // Show message count
          console.log(
            chalk.gray(`\n💬 ${globalChatHistory.getMessages().length} messages in conversation\n`)
          );
        })
      )
  )
  .addCommand(
    new Command('research')
      .description('Topic research with web search')
      .argument('<topic>', 'Research topic')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .action(
        withErrorHandling(async (topic, options) => {
          const { client } = await initializeCommand();

          console.log(chalk.bold(`\n🔬 Researching: ${topic}...\n`));

          const content = await runMcpTool(
            client,
            'compound_research',
            {
              topic,
              depth: 'comprehensive',
            },
            { label: 'Research' }
          );

          formatOutput(content, options.format);
        })
      )
  );
