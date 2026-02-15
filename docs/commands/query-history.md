> Revision: 15/02/2025

# Query History Command

The `query-history` (or `qh`) command group tracks and analyzes user query performance and history.

## Usage

```bash
deposium query-history [command] [options]
# Alias
deposium qh [command] [options]
```

## Subcommands

### `log`

Log a query to the history tracking system manually.

```bash
deposium query-history log <query> [options]
```

**Arguments:**

- `query`: The query text to log.

**Options:**

- `--user-id <id>`: User ID associated with the query.
- `--engine <engine>`: Engine used (`sql`, `pgq`, `cypher`).
- `--results <number>`: Number of results returned.
- `--latency <ms>`: Query latency in milliseconds.
- `-f, --format <type>`: Output format (json|table|markdown).

### `export`

Export query history to a file (JSON or CSV).

```bash
deposium query-history export [options]
```

**Options:**

- `--user-id <id>`: Filter by user ID.
- `--format <type>`: Export format (`json` or `csv`) (default: `json`).
- `--output <path>`: Output file path.
- `--time-range <range>`: Time range (`1h`, `24h`, `7d`, `30d`) (default: `24h`).

### `retrieve`

Retrieve recent query history.

```bash
deposium query-history retrieve [options]
```

**Options:**

- `--user-id <id>`: Filter by user ID.
- `--limit <number>`: Number of queries to retrieve (default: 50).
- `--offset <number>`: Pagination offset (default: 0).
- `--engine <engine>`: Filter by engine.
- `-f, --format <type>`: Output format.

### `stats`

Get statistics on query history (e.g., query counts, average latency).

```bash
deposium query-history stats [options]
```

**Options:**

- `--user-id <id>`: Filter by user ID.
- `--time-range <range>`: Time range.
- `--group-by <field>`: Group by field (`engine`, `user`, `hour`, `day`).
- `-f, --format <type>`: Output format.

### `cleanup`

Cleanup old query history entries.

```bash
deposium query-history cleanup [options]
```

**Options:**

- `--older-than <days>`: Delete queries older than N days (default: 90).
- `--confirm`: Skip confirmation prompt.
- `-f, --format <type>`: Output format.
