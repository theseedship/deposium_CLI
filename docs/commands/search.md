> Revision: 2026-11-09

# Search Command

The `search` command performs document search using vector (semantic) and full-text (BM25) strategies.

## Usage

```bash
deposium search <query> [options]
```

## Options

- `-t, --tenant <id>`: Optional tenant override (default: from config, otherwise resolved by the server from your authenticated key). No `default` placeholder is sent. An explicit override remains subject to server authorization.
- `-s, --space <id>`: Space ID (default: from config). One is required; use `deposium space list` to discover IDs.
- `-k, --top-k <number>`: Number of results (default: 10).
- `--vector`: Use vector search (semantic).
- `--fts`: Use full-text search (BM25 relevance-ranked, via `search_bm25_ranked`).
- `--fuzzy`: Not yet supported — prints a warning and falls back to vector search.
- `--graph`: Include graph traversal in search.
- `-f, --format <type>`: Output format: `json`, `table`, or `markdown` (default: `table`).
- `--silent`: Suppress progress messages.

With `--format json`, stdout contains only the result JSON, including when progress
was not explicitly silenced. Warnings and errors remain on stderr. An absent space
fails explicitly instead of sending a fabricated `default` ID to the server.
Format names are case-insensitive. JSON mode never prompts for credentials: if
authentication is needed, run `deposium auth login` separately, then retry.

## Examples

```bash
# Basic search
deposium search "machine learning" --space YOUR_SPACE_ID

# Semantic search with filters
deposium search "deep neural networks" --vector --space YOUR_SPACE_ID --top-k=20

# Full-text (BM25 relevance-ranked) search
deposium search "neural network training" --fts --space YOUR_SPACE_ID

# --fuzzy is not yet supported; it warns and falls back to vector search
deposium search "machine learning" --fuzzy --space YOUR_SPACE_ID
```
