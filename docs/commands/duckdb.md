# DuckDB Command

The `duckdb` (or `db`) command group integrates with the DuckDB MCP server for SQL querying, federation, and database management.

## Usage

```bash
deposium duckdb [command] [options]
# Alias
deposium db [command] [options]
```

## Subcommands

### `serve`

Start a DuckDB MCP server instance for external access.

```bash
deposium duckdb serve [options]
```

**Options:**

- `--port <number>`: Server port (default: 5432).
- `--host <host>`: Server host (default: 0.0.0.0).
- `-f, --format <type>`: Output format.

### `connect`

Connect to an external DuckDB instance.

```bash
deposium duckdb connect [options]
```

**Options:**

- `--url <url>`: **Required**. DuckDB connection URL.
- `--name <name>`: Connection name (default: `external`).
- `-f, --format <type>`: Output format.

### `federate`

Execute a federated SQL query across multiple DuckDB instances.

```bash
deposium duckdb federate <query> [options]
```

**Arguments:**

- `query`: The SQL query to execute.

**Options:**

- `--sources <json>`: **Required**. JSON array of data sources.
- `-f, --format <type>`: Output format.

### `expose`

Expose a local DuckDB database file via the MCP protocol.

```bash
deposium duckdb expose [options]
```

**Options:**

- `--database <path>`: Database file path.
- `--readonly`: Expose as read-only.
- `-f, --format <type>`: Output format.

### `query`

Execute a SQL query via the DuckDB MCP protocol.

```bash
deposium duckdb query <query> [options]
```

**Arguments:**

- `query`: The SQL query to execute.

**Options:**

- `--connection <name>`: Connection name to use (default: `default`).
- `-f, --format <type>`: Output format.

### `status`

Get the status of the DuckDB MCP server.

```bash
deposium duckdb status [options]
```

**Options:**

- `-f, --format <type>`: Output format.
