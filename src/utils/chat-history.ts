import chalk from 'chalk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class ChatHistory {
  private messages: ChatMessage[] = [];
  private maxMessages: number;

  constructor(maxMessages: number = 10) {
    this.maxMessages = maxMessages;
  }

  /**
   * Add a user message to the history
   */
  addUserMessage(content: string): void {
    this.addMessage('user', content);
  }

  /**
   * Add an assistant message to the history
   */
  addAssistantMessage(content: string): void {
    this.addMessage('assistant', content);
  }

  /**
   * Add a message to the history
   */
  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // Keep only the last N messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  /**
   * Get the conversation context for the AI
   * Returns the last N messages formatted for context
   */
  getContext(lastN: number = 6): string {
    if (this.messages.length === 0) {
      return '';
    }

    const recentMessages = this.messages.slice(-lastN);

    return recentMessages
      .map((msg) => {
        const prefix = msg.role === 'user' ? 'User' : 'Assistant';
        return `${prefix}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Get all messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear the conversation history
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Check if history is empty
   */
  isEmpty(): boolean {
    return this.messages.length === 0;
  }

  /**
   * Display the conversation history
   */
  display(count?: number): void {
    const messagesToDisplay = count ? this.messages.slice(-count) : this.messages;

    if (messagesToDisplay.length === 0) {
      console.log(chalk.gray('\n📝 No conversation history yet.\n'));
      return;
    }

    console.log(chalk.bold('\n📜 Conversation History:\n'));
    messagesToDisplay.forEach((msg, idx) => {
      const roleColor = msg.role === 'user' ? chalk.cyan : chalk.green;
      const roleLabel = msg.role === 'user' ? '👤 You' : '🤖 AI';

      console.log(roleColor(`${roleLabel}:`));
      console.log(chalk.gray(msg.content));

      if (idx < messagesToDisplay.length - 1) {
        console.log(''); // Add spacing between messages
      }
    });
    console.log('');
  }
}
