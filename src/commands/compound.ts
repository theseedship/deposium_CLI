import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
import { ChatHistory } from '../utils/chat-history';

// Module-scope chat history. In the standalone `compound analyze` CLI
// command this resets every invocation (one-shot process); inside the
// interactive REPL it carries across turns. The `--clear` and
// `--show-history` flags that used to sit on the standalone command
// were no-ops in that mode and have been removed — the REPL provides
// the equivalent commands.
const globalChatHistory = new ChatHistory(10);

export const compoundCommand = new Command('compound')
  .description('Compound AI operations with Groq')
  .addCommand(
    new Command('analyze')
      .description('Deep reasoning with multi-tool orchestration')
      .argument('<query>', 'Complex query for analysis')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .action(
        withErrorHandling(async (query, options) => {
          const { client } = await initializeCommand();

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
