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

## Activity and source inspection (CLI 1.7.0+)

Interactive terminals show an elapsed-time indicator while waiting for the server.
It stops before answer text, user prompts and errors. The client writes token
fragments as they arrive; some server paths deliver a completed answer in a burst.
The indicator does not promise faster generation or invent a completion percentage.
Scripts, CI and dumb terminals do not receive an animated indicator.

After an answer:

- `/sources` lists received document/page references and their citation numbers.
- `/source 7` reads the passage emitted for citation 7. `/source` offers a picker.
- `/verify` shows detailed verification notes and recommendations on request.

The source view uses cached passages from the last answer. It does not fetch a
new document, open a browser or download a whole PDF. An unavailable reference
stays unavailable. Changing space, clearing history or starting another question
clears old reference details. Failed streams or EOF without the final `done` receipt do not expose partial
source details. A receipt before an interactive gate cannot certify its resumed
stream.

By default, familiar verification codes are grouped into understandable categories,
such as amounts requiring a source check or names not linked in the graph.
An unmatched graph name alone is not proof of an invented fact. Review/block
verdicts and important unknown checks remain visible; `/verify` or `--verbose`
provides the original diagnostic detail. Neither grouping nor an activity indicator
changes the server's verdict or authorizes a blocked answer.

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
- Use `/help` to list commands; CLI 1.9.0+ shows suggestions as soon as you type `/` in a terminal
- Use `/spaces` to list accessible spaces and `/space` to choose another
- Use `/space <id>` for an explicit scope change

The current space is shown when chat starts and whenever it changes. Changing
the space clears conversation history so context from another space is not sent
with the next question. Reselecting the same scope keeps history; a refused change
leaves the current scope and history intact. Commands such as `/help` and unknown
slash commands are handled locally and never sent as model questions. In CLI 1.9.0+, type a prefix such as `/sp`, use Up/Down to choose, Tab to complete
without sending, Enter to run, or Escape to hide suggestions while keeping your input.
Exact command names take priority, and arguments are never completed. The standard
`/` + Enter picker remains the fallback in scripts, CI and dumb terminals.
See the [interactive guide](../guides/interactive.md#comfortable-menus-and-chat-commands-cli-190).

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

In CLI 1.6.1+, open `deposium interactive` → **Advanced operations** →
**Compound reasoning**. This is multi-tool reasoning, not a space-scoped document
chat; use **Chat with documents** for that. Compound may use external tools.

When returning to Compound during the same interactive session:

1. **First prompt**: Ask your question.
2. **Continue with previous exchanges**: Reuse successful earlier exchanges as context.
3. **View previous exchanges**: Inspect that context before continuing.
4. **Start fresh**: Clear Compound history. **Back** leaves without another request.

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

## Language and remembered space — CLI 1.8.0+

[Settings](settings.md) controls the UI and the default answer language. Use
`deposium --lang fr chat` for a one-off override. A saved default space is checked
against the current catalogue; an explicit `--space` is never replaced silently.
The default space remains separate from a temporary `/space` change in the chat.
