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

- `api-key`: API key for authentication. Stored in the encrypted
  credentials file (`~/.deposium/credentials`, chmod 0600), not the
  main config. Rejected if it starts with `dep_svc_` — those are
  server-side service keys.
- `deposium-url`: Deposium server endpoint.
- `default-tenant`: Default tenant ID.
- `default-space`: Default space ID.

Per-command output format and silent mode are set with `--format` and
`--silent` flags on each invocation.

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
