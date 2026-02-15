> Revision: 15/02/2025

# UI Command

The `ui` command group provides access to interactive dashboards and visualizations powered by the Deposium MCP server.

## Usage

```bash
deposium ui [command] [options]
```

## Subcommands

### `dashboard`

Opens the main interactive HTML dashboard for the Deposium platform.

```bash
deposium ui dashboard [options]
```

**Options:**

- `--port <number>`: Server port (default: 8080)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `search-ui`

Opens a visual search interface.

```bash
deposium ui search-ui [options]
```

**Options:**

- `--port <number>`: Server port (default: 8081)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `health-monitor`

Opens a real-time health monitor dashboard.

```bash
deposium ui health-monitor [options]
```

**Options:**

- `--port <number>`: Server port (default: 8082)
- `--refresh <seconds>`: Refresh interval in seconds (default: 5)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `tools-explorer`

Opens an explorer for available MCP tools.

```bash
deposium ui tools-explorer [options]
```

**Options:**

- `--port <number>`: Server port (default: 8083)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `embeddings-monitor`

Opens a monitor for the embeddings queue.

```bash
deposium ui embeddings-monitor [options]
```

**Options:**

- `--port <number>`: Server port (default: 8084)
- `--refresh <seconds>`: Refresh interval in seconds (default: 10)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages
