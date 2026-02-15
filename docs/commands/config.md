> Revision: 15/02/2025

# Config Command

The `config` command manages the local configuration for the Deposium CLI (e.g., default tenant, API URL).

## Usage

```bash
deposium config [command] [options]
```

## Subcommands

### `set`

Set a configuration value.

```bash
deposium config set <key> <value>
```

**Valid Keys:**

- `api-key`: API key for authentication.
- `deposium-url`: MCP Server endpoint.
- `default-tenant`: Default tenant ID.
- `default-space`: Default space ID.
- `output-format`: Default output format (`json`, `table`, `markdown`).
- `silent-mode`: Suppress progress messages (`true`/`false`).

### `get`

Get a configuration value or show all if key is omitted.

```bash
deposium config get [key]
```

### `delete`

Delete a configuration value (unset it).

```bash
deposium config delete <key>
```

### `reset`

Reset all configuration to defaults.

```bash
deposium config reset
```

### `path`

Show the path to the local configuration file.

```bash
deposium config path
```

## Configuration Priority

1.  **Environment Variables**: `DEPOSIUM_API_KEY`, `DEPOSIUM_URL`, etc.
2.  **Config File**: `~/.deposium/config.json`
3.  **Defaults**: Hardcoded defaults.
