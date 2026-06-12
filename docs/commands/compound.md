> Revision: 2026-04-24

# Compound Command

The `compound` command enables multi-tool reasoning and complex AI workflows using Groq.

It maintains an in-session conversation history (up to 10 messages, last 6 sent
as context) shared with the `chat` command — see [chat.md](chat.md) for details.

## Usage

```bash
deposium compound [command] [options]
```

## Subcommands

### `analyze`

Deep reasoning with multi-tool orchestration. The CLI command is one-shot —
each invocation is a fresh process and does not carry conversation history
across calls. Use `deposium chat` or `deposium interactive` for a REPL with
persistent history.

```bash
deposium compound analyze "Explain quantum computing"
```

**Options:**

- `-f, --format <type>` — Output format (`json`, `markdown`) (default: `markdown`)

**Examples:**

```bash
# Single-turn deep analysis
deposium compound analyze "Explain neural networks"
deposium compound analyze "How would I implement one in Python?"
```

### `research`

Topic research with web search capabilities. Does not use conversation history.

```bash
deposium compound research "Latest trends in AI"
```

**Options:**

- `-f, --format <type>` — Output format (`json`, `markdown`) (default: `markdown`)
