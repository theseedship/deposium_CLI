> Revision: 15/02/2025

# Mermaid Command

The `mermaid` command group enables extracting, generating, and querying Mermaid diagrams within documents.

## Usage

```bash
deposium mermaid [command] [options]
```

## Subcommands

### `parse`

Extract Mermaid diagrams from existing documents.

```bash
deposium mermaid parse [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--doc-id <id>`: Specific document ID to parse.
- `-f, --format <type>`: Output format (default: markdown).

### `generate`

Generate a Mermaid diagram from structured JSON data.

```bash
deposium mermaid generate <type> [options]
```

**Arguments:**

- `type`: Diagram type (`flowchart`, `sequence`, `class`, `er`, `gantt`, `pie`).

**Options:**

- `--data <json>`: **Required**. JSON string containing the data for generation.
- `--title <text>`: Title of the diagram.
- `-f, --format <type>`: Output format (default: markdown).

### `query`

Query documents specifically by the content of their diagrams.

```bash
deposium mermaid query <query> [options]
```

**Arguments:**

- `query`: Text to search for within diagrams.

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--diagram-type <type>`: Filter by diagram type.
- `-k, --top-k <number>`: Number of results (default: 10).
- `-f, --format <type>`: Output format.
