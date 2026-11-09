> Revision: 2026-11-09

# Authentication Command

The `auth` command saves a personal user API key for the CLI and validates it with the Deposium app API.

## Usage

```bash
deposium auth [command] [options]
```

## Subcommands

### `login`

Enter an existing personal user API key. For your first key, open **API Keys** on the [Deposium app's Billing page](https://app.deposium.ai/billing), create a key, and save it when shown. CLI access is included in the [Pro, Teams, and Enterprise plans](https://deposium.ai/en/pricing).

```bash
deposium auth login
```

- Prompts for API key securely (masked input).
- Validates the key with the Deposium app API.
- Stores it in `~/.deposium/credentials` (AES-256-GCM, chmod 0600).
- Retries up to 3 times on failure.

You do not need to log in before each command: later CLI processes reuse the
stored key. Finishing a command or closing the terminal does not log you out.
Chat conversation history is kept only in the running chat process; it is not
part of the saved credential. A key that is revoked, expired or refused by the
server can still require authentication again. To replace a stored key, run
`deposium auth logout` before `deposium auth login`.

`auth login` saves the key, not a server URL. CLI `1.5.2` and newer connect to SaaS automatically unless an environment variable or older stored URL overrides the defaults. See the [configuration guide](../guides/configuration.md#which-url-does-the-cli-use).

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

<a id="key-types"></a>

## Key types — user-key vs service-key

Deposium issues two API key families:

| Prefix       | Audience                                               | CLI accepts? |
| ------------ | ------------------------------------------------------ | ------------ |
| `dep_live_*` | Production user-keys (provisioned via Deposium web UI) | ✅           |
| `dep_test_*` | Test user-keys (Deposium web UI, dev tenants)          | ✅           |
| `dep_svc_*`  | **Service-keys** for server-side agent traffic         | ❌           |

The CLI **rejects `dep_svc_*` at startup** with an actionable message,
because:

- The CLI is invoked by a human, who has a user-key.
- Service-keys are for inter-process auth on the server side only.
  A leaked user-key revokes one user; a leaked service-key compromises
  the agent fleet.
- This rejection happens before any HTTP call — failing fast keeps a
  misconfigured CI pipeline from leaking the key in retries / logs.

If you see the rejection message:

```text
DEPOSIUM_API_KEY env var is a service-key (dep_svc_*).
Service-keys are for server-side agent traffic only and cannot be used by the CLI.
Provision a user-key (dep_live_* or dep_test_*) from the Deposium UI and use that instead.
```

…provision a user-key from the Deposium web UI and replace the env var or
stored credential. The same check fires whether the key comes from
`DEPOSIUM_API_KEY`, `~/.deposium/credentials`, or `auth login` paste.
