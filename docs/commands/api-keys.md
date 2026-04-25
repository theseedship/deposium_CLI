> Revision: 2026-04-25

# API Keys Command

The `api-keys` command manages **server-side API keys** on your Deposium
account — creating new keys, listing them, rotating, or deleting.

> **Difference vs `deposium auth`** : `auth` manages the key **stored
> locally** in `~/.deposium/credentials` (the one you authenticate with).
> `api-keys` manages the keys that exist **on your account** (server-side).
> You'll typically use `api-keys create` to mint a key, then `auth login`
> with that key to start using it.

## Plan-gated

Creation, deletion, rotation, and usage stats require the **`api_access`
feature** on your account's plan. On insufficient plans the server returns
`{ code: "FEATURE_LOCKED" }` and the CLI surfaces that as an error message.
The `list` subcommand works on all plans (returns an empty list if no
keys exist).

## Usage

```bash
deposium api-keys [subcommand] [options]
```

## Subcommands

### `list` (alias: `ls`)

List all API keys on your account.

```bash
deposium api-keys list
deposium api-keys ls --format json
```

**Options:**

- `-f, --format <type>` — `json`, `table` (default), `markdown`
- `--silent` — Suppress progress messages

The list never includes the secret value — only `id`, `name`, `prefix`
(first chars of the key), `scopes`, `rate_limit_tier`, `created_at`,
`last_used_at`, `expires_at`.

### `create` (alias: `new`)

Create a new API key.

```bash
deposium api-keys create --name "CI/CD"
deposium api-keys create --name "Read-only bot" --scopes read
deposium api-keys create --name "Admin tool" --scopes "read,write,admin" --tier pro
deposium api-keys new -n "Quick test" -s read,execute
```

**Options:**

- `-n, --name <name>` — **required**, human-readable name
- `-s, --scopes <list>` — Comma-separated scopes:
  - `read` — Read-only access (search, list)
  - `write` — Create / update content
  - `execute` — Run code (sandbox)
  - `execute:network` — Code execution with network access
  - `admin` — Admin operations (varies by feature)
- `-t, --tier <tier>` — `free` / `pro` / `enterprise`. Server may override
  based on your plan.
- `-f, --format <type>` — Output format (default `json`)
- `--silent` — Suppress progress messages

**⚠️ Important — secret shown ONCE:**

The CLI prints a loud warning + the full secret on success:

```
⚠️  Save this secret NOW. It will not be shown again.

  dep_live_AbCdEfGh1234567890...
```

After this output, the secret is unrecoverable. Save it to a vault, env
var, or your password manager **before** the terminal scrolls.

### `delete` (alias: `rm`)

Delete an API key. Asks for confirmation by default.

```bash
deposium api-keys delete <id>
deposium api-keys delete <id> --yes
deposium api-keys rm <id> --yes
```

**Options:**

- `-y, --yes` — Skip confirmation prompt
- `--silent` — Suppress success message

**Behavior:**

- Without `--yes`: prompts `Delete API key X? Any application using it
will stop working immediately.` (default `n`).
- Irreversible — once deleted, applications using that secret start
  getting `401 Unauthorized` immediately.

### `rotate`

Generate a new secret for an existing API key. The old secret is
invalidated immediately.

```bash
deposium api-keys rotate <id>
deposium api-keys rotate <id> --yes
```

**Options:**

- `-y, --yes` — Skip confirmation prompt
- `-f, --format <type>` — Output format (default `json`)
- `--silent` — Suppress progress messages

**Same one-time-only secret warning as `create`** — save the new value
before the terminal scrolls.

**When to rotate:**

- Suspected leak (key in a Slack message, public repo, etc.)
- Periodic rotation for compliance (e.g. every 90 days)
- After a contractor leaves a project

### `usage`

Show usage statistics for an API key.

```bash
deposium api-keys usage <id>
deposium api-keys usage <id> --format table
```

**Options:**

- `-f, --format <type>` — Output format (default `json`)
- `--silent` — Suppress progress messages

The exact fields depend on the server version — typically includes
request counters per day/month and the most recent request timestamps.

## Common workflow

```bash
# 1. Create a key for your CI pipeline
deposium api-keys create --name "GitHub Actions" --scopes "read,write" --silent --format json
#    ↑ outputs a JSON object with { id, secret, ... }

# 2. Save the secret in your CI vault (GitHub Secrets, etc.)

# 3. Later, audit usage
deposium api-keys list
deposium api-keys usage <key-id>

# 4. Periodic rotation
deposium api-keys rotate <key-id> --yes
#    Update the CI vault with the new secret

# 5. Decommission
deposium api-keys delete <key-id> --yes
```

## See also

- [`auth`](auth.md) — Authenticate the CLI itself with a key (local
  credentials store)
- [`config`](config.md) — Manage local CLI configuration
