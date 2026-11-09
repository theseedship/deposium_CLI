> Revision: 2026-11-09

# UI Command

These commands fetch MCP app resources for a compatible UI host. They do not open a dashboard in the terminal or start a local browser/server. Human-readable output in CLI 1.6.1 explains this requirement; JSON mode preserves the resource payload.

The `ui` command group provides access to interactive dashboards and visualizations powered by the Deposium MCP server.

## Usage

```bash
deposium ui [command] [options]
```

## Subcommands

### `dashboard`

Fetches the main HTML dashboard resource for a compatible MCP app host.

```bash
deposium ui dashboard [options]
```

**Options:**

- `--port <number>`: Server port (default: 8080)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `search-ui`

Fetches the visual search resource for a compatible MCP app host.

```bash
deposium ui search-ui [options]
```

**Options:**

- `--port <number>`: Server port (default: 8081)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `health-monitor`

Fetches the health-monitor resource; the CLI does not run its refresh loop.

```bash
deposium ui health-monitor [options]
```

**Options:**

- `--port <number>`: Server port (default: 8082)
- `--refresh <seconds>`: Refresh interval in seconds (default: 5)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `tools-explorer`

Fetches the tools-explorer resource. For a terminal reference, use `deposium tools`.

```bash
deposium ui tools-explorer [options]
```

**Options:**

- `--port <number>`: Server port (default: 8083)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

### `embeddings-monitor`

Fetches the embeddings-monitor resource for a compatible MCP app host.

```bash
deposium ui embeddings-monitor [options]
```

**Options:**

- `--port <number>`: Server port (default: 8084)
- `--refresh <seconds>`: Refresh interval in seconds (default: 10)
- `-f, --format <type>`: Output format (json|table|markdown) (default: table)
- `--silent`: Suppress progress messages

`--port` and `--refresh` are forwarded as resource-generation parameters. They
neither bind a local port nor start a local browser/server. JSON returns the raw
resource payload; human output describes its host requirement. A `ui://` URI is
not a local HTML application opened by this CLI.
