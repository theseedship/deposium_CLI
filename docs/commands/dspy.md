> Revision: 15/02/2025

# DSPy Command

The `dspy` command group handles intelligent query routing and optimization using the DSPy framework logic.

## Usage

```bash
deposium dspy [command] [options]
```

## Subcommands

### `route`

Routes a query to the optimal execution engine (SQL, PGQ, or Cypher) based on analysis.

```bash
deposium dspy route <query> [options]
```

**Arguments:**

- `query`: The query string to route.

**Options:**

- `--user-id <id>`: User ID context for routing decisions.
- `--params <json>`: Additional parameters as a JSON string.
- `--evaluate`: detailed evaluation of the routing result quality.
- `-f, --format <type>`: Output format (json|table|markdown) (default: table).
- `--silent`: Suppress progress messages.

### `analyze`

Analyzes user query intent to suggest optimizations or rewrites.

```bash
deposium dspy analyze <query> [options]
```

**Arguments:**

- `query`: The query text to analyze.

**Options:**

- `--include-templates`: Include query templates in the output.
- `-f, --format <type>`: Output format (json|table|markdown) (default: table).
- `--silent`: Suppress progress messages.
