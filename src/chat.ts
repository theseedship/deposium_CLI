import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import type { SSECitation } from './client/mcp-client';
import { getConfig, getBaseUrl, getMcpDirectUrl } from './utils/config';
import { createTitleBox } from './utils/formatter';
import { ensureAuthenticated } from './utils/auth';
import { ChatHistory } from './utils/chat-history';
import { getErrorMessage } from './utils/command-helpers';

export async function startChat(): Promise<void> {
  console.log(createTitleBox('AI CHAT', 'Streaming conversation with Deposium AI'));
  console.log(chalk.gray('Commands: /exit (quit) | /clear (reset) | /history (view)\n'));

  const config = getConfig();
  const baseUrl = getBaseUrl(config);
  const mcpUrl = getMcpDirectUrl(config);

  // Ensure user is authenticated (validates via SolidStart)
  const apiKey = await ensureAuthenticated(baseUrl);

  const client = new MCPClient(baseUrl, apiKey);
  const chatHistory = new ChatHistory(10);

  console.log(chalk.gray(`MCP: ${mcpUrl}\n`));

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

    // Stream tokens directly to stdout
    process.stdout.write(chalk.green('\nAI: '));

    let fullResponse = '';
    const citations: SSECitation[] = [];

    try {
      await client.chatStream(mcpUrl, trimmedMessage, {
        conversationHistory: chatHistory.toConversationHistory(6),
        language: 'fr',
        onToken: (token) => {
          process.stdout.write(token);
          fullResponse += token;
        },
        onCitation: (citation) => {
          citations.push(citation);
        },
        onError: (err) => {
          console.error(chalk.red('\n❌ ' + (err.message || err.error || 'Stream error')));
        },
      });

      process.stdout.write('\n');

      // Show citations if any
      if (citations.length > 0) {
        console.log(chalk.gray('\n📎 Sources:'));
        for (const c of citations) {
          const page = c.page ? ` p.${c.page}` : '';
          console.log(chalk.gray(`   - ${c.document_name}${page}`));
        }
      }

      chatHistory.addAssistantMessage(fullResponse);

      // Show exchange count
      const exchanges = Math.floor(chatHistory.getMessages().length / 2);
      console.log(chalk.gray(`\n💭 ${exchanges} exchange${exchanges !== 1 ? 's' : ''}\n`));
    } catch (error: unknown) {
      process.stdout.write('\n');
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      // Remove the failed user message from history
      const messages = chatHistory.getMessages();
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages.pop();
      }
    }
  }
}
