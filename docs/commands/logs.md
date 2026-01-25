# Logs Command

The `logs` command group allows viewing, searching, and managing MCP server logs directly from the CLI.

## Usage

```bash
deposium logs [command] [options]
```

## Subcommands

### `view`

View recent MCP server logs.

```bash
deposium logs view [options]
```

**Options:**

- `--level <level>`: Filter by log level (`error`, `warn`, `info`, `debug`) (default: `info`).
- `--limit <number>`: Number of log entries to retrieve (default: 100).
- `--tail`: Tail logs in real-time.
- `-f, --format <type>`: Output format (json|table|markdown).

### `stats`

Get statistics and summaries of the logs.

```bash
deposium logs stats [options]
```

**Options:**

- `--time-range <range>`: Time range for stats (`1h`, `24h`, `7d`, `30d`) (default: `24h`).
- `-f, --format <type>`: Output format (json|table|markdown).

### `search`

Search logs for a specific pattern or regex.

```bash
deposium logs search <pattern> [options]
```

**Arguments:**

- `pattern`: Text or regex pattern to search for.

**Options:**

- `--level <level>`: Filter by log level.
- `--limit <number>`: Maximum number of results (default: 100).
- `--context <lines>`: Number of context lines to show before/after match (default: 2).
- `-f, --format <type>`: Output format.

### `clear`

Clear MCP server logs.

```bash
deposium logs clear [options]
```

**Options:**

- `--confirm`: Skip confirmation prompt.
- `-f, --format <type>`: Output format.
