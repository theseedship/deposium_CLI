# Graph Command

The `graph` command provides network analysis and graph traversal capabilities.

## Usage

```bash
deposium graph [command] [options]
```

## Subcommands

### `analyze`

Analyze graph structure and metrics.

```bash
deposium graph analyze [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format (`json` or `table`).

### `path`

Find the shortest path between two entities.

```bash
deposium graph path <from-id> <to-id> [options]
```

**Arguments:**

- `from-id`: Start node ID.
- `to-id`: End node ID.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format.

### `components`

Find strongly connected components in the graph.

```bash
deposium graph components [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format.
