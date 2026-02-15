> Revision: 15/02/2025

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

- Prompts for API key securely.
- Validates the key with the server.
- Stores it in `~/.deposium/config.json`.
- Retries up to 3 times on failure.

### `logout`

Remove stored credentials.

```bash
deposium auth logout
```

- Removes the API key from the local configuration file.

### `status`

Check current authentication status.

```bash
deposium auth status
```

- Verifies if an API key is set.
- Checks validity with the server.
- Displays current user/tenant context if authenticated.

## Authentication Flow

1.  **First Use**: CLI prompts for API key automatically if not found.
2.  **Storage**: Key is stored in `~/.deposium/config.json` (permission restricted).
3.  **Environment Variables**: You can override the stored key using `DEPOSIUM_API_KEY`.
4.  **Transmission**: Key is sent via `X-Api-Key` header with every request.
