> Revision: 2026-07-05

# Search Command

The `search` command performs document search using vector (semantic) and full-text (BM25) strategies.

## Usage

```bash
deposium search <query> [options]
```

## Options

- `-t, --tenant <id>`: Tenant ID (default: from config).
- `-s, --space <id>`: Space ID (default: from config).
- `-k, --top-k <number>`: Number of results (default: 10).
- `--vector`: Use vector search (semantic).
- `--fts`: Use full-text search (BM25 relevance-ranked, via `search_bm25_ranked`).
- `--fuzzy`: Not yet supported — prints a warning and falls back to vector search.
- `--graph`: Include graph traversal in search.
- `-f, --format <type>`: Output format: `json`, `table`, or `markdown` (default: `table`).
- `--silent`: Suppress progress messages.

## Examples

```bash
# Basic search
deposium search "machine learning"

# Semantic search with filters
deposium search "deep neural networks" --vector --tenant=research --top-k=20

# Full-text (BM25 relevance-ranked) search
deposium search "neural network training" --fts

# --fuzzy is not yet supported; it warns and falls back to vector search
deposium search "machine learning" --fuzzy
```
