> Revision: 2026-04-25

# Files Command

The `files` command manages individual documents and files inside Deposium —
listing, inspecting, validating, and deleting. For uploading multiple files
at once, see [`upload-batch`](upload-batch.md).

## Usage

```bash
deposium files [subcommand] [options]
```

## Subcommands

### `list` (alias: `ls`)

List documents accessible to your API key.

```bash
deposium files list                                    # all documents
deposium files list --space <space-id>                 # filter by space
deposium files list --limit 20 --offset 40 --silent    # paginated
deposium files ls --format json --silent | jq '.[].id' # pipe IDs
```

**Options:**

- `-s, --space <id>` — Filter by space UUID
- `--limit <number>` — Page size (server default 50)
- `--offset <number>` — Pagination offset (default 0)
- `-f, --format <type>` — `json`, `table` (default), `markdown`
- `--silent` — Suppress progress messages

**Output fields** (one row per document):

| Field        | Description                                     |
| ------------ | ----------------------------------------------- |
| `id`         | Numeric document ID (used by other subcommands) |
| `file_name`  | Original file name                              |
| `mime_type`  | MIME type (e.g. `application/pdf`)              |
| `size`       | Bytes                                           |
| `doc_type`   | `document` or `connector` (live data source)    |
| `doc_status` | `ready`, `completed`, `processing`, `failed`    |
| `num_pages`  | Page count (PDFs)                               |
| `space_id`   | UUID of containing space, or `null`             |
| `folder_id`  | UUID of containing folder                       |
| `created_at` | ISO timestamp                                   |

### `show <id>` (alias: `info`)

Show full details of a specific document.

```bash
deposium files show 2459
deposium files info 2459 --format json
```

In addition to the list fields, `show` returns:

- `s3_path`, `bucket_name`, `bucket_path` — storage location (if not a connector)
- `file_infos` — connector config (for connector documents)
- `_access` — `{ type, can_edit, can_delete }` — what your key can do with it

### `check <id>` (alias: `validate`) — _experimental_

Validate file integrity by calling the MCP `check_file` tool. Returns
checksum, parsing status, and indexation health.

```bash
deposium files check 2459
deposium files validate 2459 --format json
```

**Same caveat as `space create`:** routes through MCP. In some local/dev
deployments the MCP layer rejects CLI keys with `401 "Invalid API key
format"` — production typically works.

### `rm <id>` (alias: `delete`)

Delete a document. Asks for confirmation by default.

```bash
deposium files rm 2459               # interactive (shows preview + prompt)
deposium files rm 2459 --yes         # skip prompt (e.g. in scripts)
deposium files delete 2459 --yes
```

**Options:**

- `-y, --yes` — Skip confirmation prompt (dangerous in scripts — double-check the ID)
- `--silent` — Suppress success message

**Behavior:**

- Without `--yes`: fetches the document, prints a preview (id, name, size, type),
  then asks `Delete document #N? This cannot be undone.` (default `n`).
- With `--yes`: no fetch, no prompt, immediate `DELETE /api/v1/documents/:id`.
- Exits with code 1 on permission errors or HTTP 4xx/5xx after retries.

## What's not yet supported

- `files download <id>` — the underlying `GET /api/download/file/:id`
  endpoint requires session-based auth (HttpOnly cookie), not API keys.
  Use the web UI for now or open a feature request to add API-key auth
  on that endpoint.
- `files move <id> --space <new-id>` — server doesn't expose a move
  operation. Document → space mapping is currently rebuilt server-side
  via `update_spaces` MCP tools (admin-only).
- `files upload <path>` — use the existing [`upload-batch`](upload-batch.md)
  command, which handles glob patterns, mime detection, and progress UI.

## See also

- [`space`](space.md) — List and manage workspaces
- [`upload-batch`](upload-batch.md) — Batch file upload
- [`search`](search.md) — Full-text/semantic search across documents
