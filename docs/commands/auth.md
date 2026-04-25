> Revision: 2026-04-25

# Authentication Command

The `auth` command handles API key management and authentication with the Deposium MCP Server.

## Usage

```bash
deposium auth [command] [options]
```

## Subcommands

### `login`

Interactively login or set your API key.

```bash
deposium auth login
```

- Prompts for API key securely (masked input).
- Validates the key with the server.
- Stores it in `~/.deposium/credentials` (AES-256-GCM, chmod 0600).
- Retries up to 3 times on failure.

### `logout`

Remove stored credentials.

```bash
deposium auth logout
```

- Removes the API key from `~/.deposium/credentials`.
- **Does not unset** `DEPOSIUM_API_KEY` env var. If the env var is set, it
  continues to authenticate after logout — `unset DEPOSIUM_API_KEY` to fully
  clear.

### `status`

Check current authentication status.

```bash
deposium auth status
```

- Reports the active API key source (`stored credentials` or
  `DEPOSIUM_API_KEY env var`).
- Validates the key with the server.
- Displays the configured Deposium URL.

## Authentication Flow

1.  **Resolution priority**: `DEPOSIUM_API_KEY` env var > stored credentials >
    interactive prompt. Setting the env var always overrides anything stored.
2.  **First use**: With no env var and no stored key, the CLI prompts
    interactively (max 3 attempts), validates, and saves on success.
3.  **Storage**: Stored keys live in `~/.deposium/credentials` (encrypted
    AES-256-GCM, chmod 0600). The encryption key is derived from
    hostname + username via `scryptSync`.
4.  **Transmission**: Key is sent via `X-API-Key` header with every request.
