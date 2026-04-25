> Revision: 2026-04-25

# Space Command

The `space` command manages workspaces ("spaces") — the top-level unit of
content organization on Deposium. Documents, embeddings, knowledge graphs,
and chat history are all scoped per space.

## Usage

```bash
deposium space [subcommand] [options]
```

## Subcommands

### `list` (alias: `ls`)

List all spaces accessible to your API key.

```bash
deposium space list
deposium space ls --format json
```

**Options:**

- `-f, --format <type>` — Output format: `json`, `table` (default), `markdown`
- `--silent` — Suppress progress messages

**Example output (table):**

```
┌──────────────────────────────┬────────────┬─────────────────────────┬─────────────────────┐
│ id                           │ tenant_id  │ name                    │ created_at          │
├──────────────────────────────┼────────────┼─────────────────────────┼─────────────────────┤
│ 7a6af433-ac1d-4c76-ac99-ebc… │ default    │ BM25 Test Space         │ 2026-04-25T03:48Z   │
│ 254598ae-70c1-4933-b4cc-467… │ default    │ All available           │ 2026-04-25T03:48Z   │
└──────────────────────────────┴────────────┴─────────────────────────┴─────────────────────┘
```

The `--format json` output is suitable for piping into other tools:

```bash
deposium space list --format json --silent | jq '.[] | .id'
```

### `show <id>` (alias: `info`)

Display the details of a specific space by its UUID.

```bash
deposium space show 7a6af433-ac1d-4c76-ac99-ebc8c26d1fc6
deposium space info 7a6af433-ac1d-4c76-ac99-ebc8c26d1fc6 --format json
```

**Arguments:**

- `<id>` — Space UUID (required)

**Options:**

- `-f, --format <type>` — Output format (same as `list`)
- `--silent` — Suppress progress messages

**Behavior notes:**

- The server doesn't currently expose a dedicated `GET /api/spaces/:id` endpoint,
  so the CLI fetches the full list and filters client-side. This is fine for
  typical workspace counts but may be slow if you have hundreds of spaces.
- For richer per-space info (file counts, entity counts, drift metrics), use
  the existing `corpus stats --space <id>` command.
- Exits with code 1 if the space ID is not found.

### `create <name>` (alias: `new`) — _experimental_

Create a new space.

```bash
deposium space create "Research notes"
deposium space create "Q1 reports" --description "Quarterly financial reports"
```

**Arguments:**

- `<name>` — Space name (required)

**Options:**

- `-d, --description <text>` — Optional description
- `-f, --format <type>` — Output format (same as `list`)
- `--silent` — Suppress progress messages

**Important — beta status:**

This subcommand routes through the MCP `deposium_admin` macro tool with
`operation=create_space`. It depends on the MCP backend being reachable
**and** accepting CLI API keys for admin operations. In some local/dev
deployments the MCP layer rejects CLI keys with `401 "Invalid API key
format"` even when the same key works for REST endpoints — this is a
server-side configuration issue, not a CLI bug. Production deployments
typically work correctly.

If you need to create a space and the CLI fails, fall back to the web UI
or contact your Deposium administrator.

## What's not yet supported

- `space delete` — the MCP server doesn't yet expose a delete operation. Use
  the web UI for now. Will be added once the server-side endpoint ships.
- `space update` (rename, edit metadata) — same status as delete.
- Folder management within a space — the platform doesn't currently model
  folders as separate entities; documents are organized via the `space_id`
  reference only.

## See also

- [`corpus`](corpus.md) — Statistics and quality metrics per space
- [`upload-batch`](upload-batch.md) — Upload files into a space
- [`search`](search.md) — Search documents within a space (with `--space`)
