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

## Key types — user-key vs service-key

Deposium issues two API key families:

| Prefix       | Audience                                        | CLI accepts? |
| ------------ | ----------------------------------------------- | ------------ |
| `dep_live_*` | Production user-keys (provisioned via Solid UI) | ✅           |
| `dep_test_*` | Test user-keys (Solid UI, dev tenants)          | ✅           |
| `dep_svc_*`  | **Service-keys** for server-side agent traffic  | ❌           |

The CLI **rejects `dep_svc_*` at startup** with an actionable message,
because:

- The CLI is invoked by a human, who has a user-key.
- Service-keys are for inter-process auth on the server side (Mastra
  agents, future GLiNER 2 wrapper). A leaked user-key revokes one user;
  a leaked service-key compromises the agent fleet.
- This rejection happens before any HTTP call — failing fast keeps a
  misconfigured CI pipeline from leaking the key in retries / logs.

If you see the rejection message:

```text
DEPOSIUM_API_KEY env var is a service-key (dep_svc_*).
Service-keys are for server-side agent traffic only and cannot be used by the CLI.
Provision a user-key (dep_live_* or dep_test_*) from the Deposium UI and use that instead.
```

…provision a user-key from the Solid UI and replace the env var or
stored credential. The same check fires whether the key comes from
`DEPOSIUM_API_KEY`, `~/.deposium/credentials`, or `auth login` paste.
