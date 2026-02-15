> Revision: 15/02/2025

# Graph Command

The `graph` command provides network analysis and graph traversal capabilities.

## Usage

```bash
deposium graph [command] [options]
```

## Subcommands

### `search`

Search entities by pattern in the knowledge graph.

```bash
deposium graph search <pattern> [options]
```

**Arguments:**

- `pattern`: Entity search pattern.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--limit <number>`: Max results (default: `50`).
- `-f, --format <type>`: Output format (`json` or `table`).

### `analyze`

Cluster and centrality analysis of the graph structure.

```bash
deposium graph analyze [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--algorithm <type>`: Analysis algorithm (`pagerank`, `betweenness`, `clustering`).
- `-f, --format <type>`: Output format (`json` or `table`).

### `path`

Find the optimal path between two entities.

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

### `multihop`

Multi-hop queries with Kleene+ patterns for complex relationship traversal.

```bash
deposium graph multihop [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--source-pattern <pattern>`: Source entity pattern.
- `--target-pattern <pattern>`: Target entity pattern.
- `--min-hops <number>`: Minimum hops (default: `1`).
- `--max-hops <number>`: Maximum hops (default: `5`).
- `--edge-filters <json>`: Edge filters as JSON.
- `--limit <number>`: Max results (default: `100`).
- `-f, --format <type>`: Output format.

### `variable-path`

Variable-length path finding (1..n hops).

```bash
deposium graph variable-path <from-id> <to-id> [options]
```

**Arguments:**

- `from-id`: Start node ID.
- `to-id`: End node ID.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--min-hops <number>`: Minimum hops (default: `1`).
- `--max-hops <number>`: Maximum hops (default: `10`).
- `--avoid-cycles`: Avoid cycles in paths.
- `-f, --format <type>`: Output format.

### `khop`

K-hop neighborhood analysis around a node.

```bash
deposium graph khop <node-id> [options]
```

**Arguments:**

- `node-id`: Center node ID.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-k, --hops <number>`: Number of hops (default: `3`).
- `--include-properties`: Include node properties in output.
- `-f, --format <type>`: Output format.

### `components`

Find strongly connected components in the graph.

```bash
deposium graph components [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--min-size <number>`: Minimum component size (default: `2`).
- `-f, --format <type>`: Output format.
