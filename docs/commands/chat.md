> Revision: 15/02/2025

# AI Compound Chat Feature

The AI Compound feature now supports conversation history, allowing you to have contextual back-and-forth conversations with the AI. There's now a dedicated **continuous chat mode** that works just like Claude Code's chat interface! 💬

## How It Works

The chat system maintains a history of the last 10 messages (5 exchanges) and provides context from the last 6 messages to the AI with each new query. This allows the AI to:

- Remember previous questions and answers
- Build upon earlier context
- Provide more coherent multi-turn conversations

## Usage

### 🆕 Continuous Chat Mode (Recommended)

The easiest way to chat with the AI - a dedicated chat interface:

```bash
deposium chat
```

This opens a continuous chat interface where you can:

- Type messages continuously without returning to menus
- Use `/exit` to quit
- Use `/clear` to clear conversation history
- Use `/history` to view past messages

**Example:**

```
💬 Deposium AI Chat

Chat with AI continuously. Commands:
  /exit    - Exit chat
  /clear   - Clear conversation history
  /history - View conversation history

? You: What is TypeScript?
🤖 AI:
[AI explains TypeScript...]

[0.5 exchanges]

? You: How does it differ from JavaScript?
🤖 AI:
[AI explains differences with context from previous question...]

[1 exchanges]

? You: /exit
👋 Goodbye!
```

### Interactive Mode (Menu-based)

When using `deposium interactive` and selecting **Compound AI**:

1. **First prompt**: Just ask your question normally
2. **Subsequent prompts**: The AI will have context from previous messages
3. **View history**: When prompted, choose "Yes" to view conversation history
4. **Clear history**: Choose "Yes" when asked if you want to clear history to start fresh

Example flow:

```
? Enter your question: What is TypeScript?
[AI responds with explanation]
💬 2 messages in conversation

? Enter your question: How does it differ from JavaScript?
[AI responds with context from previous question]
💬 4 messages in conversation
```

### Command Line Mode

When using the `deposium compound analyze` command:

#### Basic usage (with history):

```bash
deposium compound analyze "What is TypeScript?"
deposium compound analyze "How does it differ from JavaScript?"
```

#### Show conversation history:

```bash
deposium compound analyze "continue from last topic" --show-history
```

#### Clear history before query:

```bash
deposium compound analyze "Start fresh topic" --clear
```

#### Combined options:

```bash
deposium compound analyze "New question" --show-history --clear
```

## Features

### Message History

- Stores up to 10 messages total (user + assistant)
- Provides last 6 messages as context to AI
- Persists throughout a session (until you exit the CLI)

### History Management

- **View**: See all previous messages in the conversation
- **Clear**: Start a fresh conversation anytime
- **Count**: See how many messages are in your conversation

### Context Awareness

Each message sent to the AI includes:

```
User: [previous question]
Assistant: [previous answer]
User: [previous question]
Assistant: [previous answer]
User: [current question]
```

This allows the AI to understand:

- What you asked before
- What it already explained
- How the current question relates to previous ones

## Example Conversations

### Building on Context

```bash
$ deposium compound analyze "Explain neural networks"
[AI explains neural networks]

$ deposium compound analyze "How would I implement one in Python?"
[AI provides Python code, knowing you want a neural network]

$ deposium compound analyze "What libraries would make this easier?"
[AI suggests TensorFlow/PyTorch, knowing you're doing neural networks in Python]
```

### Starting Fresh

```bash
$ deposium compound analyze "New topic about databases" --clear
[AI starts with clean context about databases]
```

## Technical Details

- **Storage**: In-memory (resets when CLI exits)
- **Max messages**: 10 total messages
- **Context window**: 6 most recent messages
- **Format**: Plain text with role prefixes (User: / Assistant:)

## Tips

1. **Use clear history** when switching topics completely
2. **View history** if you forgot what you asked earlier
3. **Build gradually** - ask follow-up questions to dive deeper
4. **Stay on topic** - context works best for related questions

## Future Enhancements

Potential improvements:

- Persistent storage (save conversations between sessions)
- Named conversations (switch between multiple conversation threads)
- Export conversations to files
- Configurable history length
- Token-based context management instead of message count
