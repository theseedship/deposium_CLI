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

Deep reasoning with multi-tool orchestration. Carries conversation history across calls.

```bash
deposium compound analyze "Explain quantum computing"
```

**Options:**

- `-f, --format <type>` — Output format (`json`, `markdown`) (default: `markdown`)
- `-c, --clear` — Clear conversation history before running this query (start fresh)
- `-s, --show-history` — Display conversation history before running the query

**Examples:**

```bash
# Build on previous context
deposium compound analyze "Explain neural networks"
deposium compound analyze "How would I implement one in Python?"

# Start a fresh topic
deposium compound analyze "New topic about databases" --clear

# Review history before asking
deposium compound analyze "Continue previous thread" --show-history
```

### `research`

Topic research with web search capabilities. Does not use conversation history.

```bash
deposium compound research "Latest trends in AI"
```

**Options:**

- `-f, --format <type>` — Output format (`json`, `markdown`) (default: `markdown`)
