> Revision: 15/02/2025

# Intelligence Command

The `intelligence` (or `smart`) command group offers AI-powered query analysis, suggestions, and result summarization.

## Usage

```bash
deposium intelligence [command] [options]
# Alias
deposium smart [command] [options]
```

## Subcommands

### `analyze`

Analyzes query intent and optimizes search parameters suitable for the backend.

```bash
deposium intelligence analyze <query> [options]
```

**Arguments:**

- `query`: The query text to analyze.

**Options:**

- `-f, --format <type>`: Output format (json|table|markdown).
- `--silent`: Suppress progress messages.

### `suggest`

Generates intelligent query suggestions and auto-completions based on partial input.

```bash
deposium intelligence suggest <partial> [options]
```

**Arguments:**

- `partial`: The partial query text.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format (json|table|markdown).
- `--silent`: Suppress progress messages.

### `summarize`

Generates intelligent summaries of search results.

```bash
deposium intelligence summarize <results> [options]
```

**Arguments:**

- `results`: JSON string of results to summarize.

**Options:**

- `--max-tokens <number>`: Maximum number of tokens for the summary (default: 500).
- `--focus <text>`: Specific area or topic to focus the summary on.
- `-f, --format <type>`: Output format (json|table|markdown) (default: markdown).
- `--silent`: Suppress progress messages.

### `elicit`

Detects if a query is ambiguous and generates clarifying questions.

```bash
deposium intelligence elicit <query> [options]
```

**Arguments:**

- `query`: The query text to check.

**Options:**

- `--search-results <number>`: Number of search results found (helps context).
- `--context <json>`: Context JSON string (e.g., previous queries, user history).
- `-f, --format <type>`: Output format (json|table|markdown).
- `--silent`: Suppress progress messages.
