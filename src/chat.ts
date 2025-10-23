import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import { getConfig } from './utils/config';
import { formatOutput } from './utils/formatter';
import { ensureAuthenticated } from './utils/auth';
import { ChatHistory } from './utils/chat-history';

export async function startChat(): Promise<void> {
  console.log(chalk.bold.cyan('\n💬 Deposium AI Chat\n'));
  console.log(chalk.gray('Chat with AI continuously. Commands:'));
  console.log(chalk.gray('  /exit    - Exit chat'));
  console.log(chalk.gray('  /clear   - Clear conversation history'));
  console.log(chalk.gray('  /history - View conversation history\n'));

  const config = getConfig();

  // Ensure user is authenticated
  const apiKey = await ensureAuthenticated(config.mcpUrl!);

  const client = new MCPClient(config.mcpUrl!, apiKey);
  const chatHistory = new ChatHistory(10);

  while (true) {
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: 'You:',
      },
    ]);

    const trimmedMessage = message.trim();

    // Handle commands
    if (trimmedMessage === '/exit') {
      console.log(chalk.green('\n👋 Goodbye!\n'));
      break;
    }

    if (trimmedMessage === '/clear') {
      chatHistory.clear();
      console.log(chalk.yellow('🗑️  Conversation history cleared\n'));
      continue;
    }

    if (trimmedMessage === '/history') {
      chatHistory.display();
      continue;
    }

    if (!trimmedMessage) {
      continue;
    }

    // Add user message to history
    chatHistory.addUserMessage(trimmedMessage);

    // Get conversation context as a string
    const context = chatHistory.getContext(6);

    try {
      const result = await client.callTool(
        'compound_analyze',
        {
          query: trimmedMessage,
          context, // Pass context as string directly
        },
        { spinner: true }
      );

      if (result.isError) {
        console.error(chalk.red('\n❌ AI Error:'), result.content);
        // Remove the user message from history since we failed
        const messages = chatHistory.getMessages();
        if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
          messages.pop();
        }
        continue;
      }

      // Add AI response to history
      const responseText =
        typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      chatHistory.addAssistantMessage(responseText);

      // Display the response
      console.log(chalk.green('\n🤖 AI:\n'));
      formatOutput(result.content, 'markdown');

      // Show message count
      console.log(chalk.gray(`\n[${chatHistory.getMessages().length / 2} exchanges]\n`));
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      // Remove the user message from history since we failed
      const messages = chatHistory.getMessages();
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages.pop();
      }
    }
  }
}
