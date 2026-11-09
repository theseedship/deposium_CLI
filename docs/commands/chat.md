> Revision: 2026-11-09

# AI Chat Mode

Interactive streaming conversation with Deposium AI. Chat streams are routed
via the **Edge Runtime gateway** (auth + rate-limiting) by default.

The space picker, `/` command menu and compact verification/source presentation
described here require **CLI 1.6.0 or newer**. Compare `deposium --version` with
`npm view @deposium/cli version`; the latest merged source can be newer than the
public npm package. See [installation and updates](../guides/installation.md#updates).

## Login and conversation lifetime

After `deposium auth login`, later commands reuse your stored API key. Returning
to the shell, entering `/exit`, or closing the terminal does not log you out.
Use `deposium auth logout` to remove the stored key. If `DEPOSIUM_API_KEY` is set,
it still supplies authentication; see the [auth guide](auth.md#logout).

Conversation history is different: it exists only while the chat process runs.
Starting `deposium chat` again starts a new conversation. `/clear` or a real
space change also clears that in-memory history.

## How It Works

The chat system maintains a conversation history and provides context from recent
messages to the AI with each new query. This allows the AI to:

- Remember previous questions and answers
- Build upon earlier context
- Provide more coherent multi-turn conversations

## Usage

### 🆕 Continuous Chat Mode (Recommended)

The easiest way to chat with the AI - a dedicated chat interface:

```bash
deposium chat
```

Options:

- `--space <id>` — Chat in an accessible space. Without this option, a configured `defaultSpace` is used; otherwise the terminal prompts for a space before the first question.
- `--verbose` — Show every verification note after the answer. By default, repeated notes are grouped into one compact summary; review and blocking decisions remain visible.
- `--direct` — Bypass Edge Runtime, connect directly to MCP server (dev only)
- `--on-ambiguous <mode>` — HITL policy when the server pauses for input. One of `prompt` | `fail` | `dump` | `pick-first`. Defaults to `prompt` in a TTY, `fail` otherwise. See [docs/guides/on-ambiguous-flag.md](../guides/on-ambiguous-flag.md) for full semantics (note: `pick-first` now returns the server's safe default and no longer auto-approves confirm gates).

This opens a continuous chat interface where you can:

- Type messages continuously without returning to menus
- Use `/exit` to quit
- Use `/clear` to clear conversation history
- Use `/history` to view past messages
- Use `/help` to list commands, or enter `/` then press Enter to open a command menu
- Use `/spaces` to list accessible spaces and `/space` to choose another
- Use `/space <id>` for an explicit scope change

The current space is shown when chat starts and whenever it changes. Changing
the space clears conversation history so context from another space is not sent
with the next question. Reselecting the same scope keeps history; a refused change
leaves the current scope and history intact. Commands such as `/help` and unknown
slash commands are handled locally and never sent as model questions. The `/`
menu currently opens after Enter; it is not live completion while typing.

Noninteractive callers must provide `--space <id>` or a configured `defaultSpace`;
an absent scope fails explicitly. This chat picker currently selects one space;
cross-space retrieval remains a separate server compatibility issue, not a
qualified option. Selecting a space is a client convenience, not an authority
grant: the authenticated server remains responsible for every document read.

Sources are grouped by document with their cited pages. Both `document_name`/`page`
and `file_name`/`page_number` source events are accepted; unavailable names use an
explicit fallback. Verification notes appear after the answer and sources, rather
than interrupting the streamed text. Use `deposium chat --verbose` for full details.

### Edge Runtime Routing

By default, chat streams route through the Edge Runtime gateway which provides:

- **Authentication** (API key validation via SHA-256)
- **Rate limiting** (free: 60/min, pro: 300/min, enterprise: 1000/min)
- **SSE proxy** to the MCP backend

For local development, use `--direct` to bypass the gateway:

```bash
deposium chat --direct
```

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

The standalone `deposium compound analyze` command is one-shot — each
invocation is a fresh process and does not carry conversation history
across calls. For multi-turn conversations with persistent history, use
the REPL via `deposium chat` or `deposium interactive`.

```bash
deposium compound analyze "What is TypeScript?"
deposium compound analyze "How does it differ from JavaScript?"  # independent process, no shared context
```

## Features

### Message History

The `deposium chat` REPL keeps up to 10 messages (user + assistant) in
memory for the duration of the session and sends the 6 most recent to
the backend as context.

### Context Awareness

Each message sent to the AI from the REPL includes:

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

## Example Conversation

```bash
$ deposium chat
> Explain neural networks
[AI explains neural networks]

> How would I implement one in Python?
[AI provides Python code, knowing you want a neural network]

> What libraries would make this easier?
[AI suggests TensorFlow/PyTorch, knowing the prior context]
```

## Technical Details

- **Storage**: In-memory (resets when CLI exits)
- **Max messages**: 10 total messages
- **Context window**: 6 most recent messages sent to backend
- **Streaming**: SSE via Edge Runtime (`/chat-stream`) or direct MCP (`/api/chat-stream`)
- **Rate limiting**: 429 responses display Retry-After and tier info

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
