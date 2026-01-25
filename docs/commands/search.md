# Search Command

The `search` command performs document search using various strategies (vector, full-text, fuzzy).

## Usage

```bash
deposium search <query> [options]
```

## Options

- `-t, --tenant <id>`: Tenant ID (default: from config).
- `-s, --space <id>`: Space ID (default: from config).
- `-k, --top-k <number>`: Number of results (default: 10).
- `--vector`: Use vector search (semantic).
- `--fts`: Use full-text search.
- `--fuzzy`: Use fuzzy matching (typo-tolerant).
- `--graph`: Include graph traversal in search.
- `-f, --format <type>`: Output format: `json`, `table`, or `markdown` (default: `table`).
- `--silent`: Suppress progress messages.

## Examples

```bash
# Basic search
deposium search "machine learning"

# Semantic search with filters
deposium search "deep neural networks" --vector --tenant=research --top-k=20

# Full-text exact match
deposium search "exact phrase match" --fts

# Fuzzy search for typos
deposium search "machne lerning" --fuzzy
```
