# Corpus Command

The `corpus` command allows you to inspect and evaluate your knowledge base.

## Usage

```bash
deposium corpus [command] [options]
```

## Subcommands

### `stats`

Get statistics about the corpus (document counts, entity counts, etc.).

```bash
deposium corpus stats [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format (`json`, `table`).

### `evaluate`

Evaluate corpus quality using LLM-as-a-judge metrics.

```bash
deposium corpus evaluate [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--metric <name>`: Evaluation metric (`relevance`, `coherence`, `diversity`).
- `-f, --format <type>`: Output format.
