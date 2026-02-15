> Revision: 15/02/2025

# LeanRAG Command

The `leanrag` command group provides optimized retrieval, aggregation, and analysis commands implementing the LeanRAG pattern.

## Usage

```bash
deposium leanrag [command] [options]
```

## Subcommands

### `retrieve`

Performs an optimized retrieval with optional ranking.

```bash
deposium leanrag retrieve <query> [options]
```

**Arguments:**

- `query`: The search query text.

**Options:**

- `-t, --tenant <id>`: Tenant ID (defaults to config).
- `-s, --space <id>`: Space ID (defaults to config).
- `-k, --top-k <number>`: Number of results to retrieve (default: 10).
- `--rerank`: Enable reranking of results.
- `-f, --format <type>`: Output format (json|table|markdown).
- `--silent`: Suppress progress messages.

### `aggregate`

Aggregates and ranks results from multiple sources or passes.

```bash
deposium leanrag aggregate <results> [options]
```

**Arguments:**

- `results`: JSON string of results to aggregate.

**Options:**

- `--strategy <type>`: Aggregation strategy: `reciprocal_rank` or `weighted` (default: `reciprocal_rank`).
- `-f, --format <type>`: Output format (json|table|markdown).
- `--silent`: Suppress progress messages.

### `analyze`

Analyzes a query using the LeanRAG method to determine the best retrieval properties.

```bash
deposium leanrag analyze <query> [options]
```

**Arguments:**

- `query`: The query text to analyze.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format (json|table|markdown).
- `--silent`: Suppress progress messages.
