> Revision: 2026-09-26

# Configuration Guide

Complete reference for configuring Deposium CLI.

For Deposium SaaS with CLI `1.5.2` or newer, no URL configuration is needed. Create a personal user API key in the [Deposium app's Billing page](https://app.deposium.ai/billing) under **API Keys**, then run `deposium auth login`.

## Which URL does the CLI use?

The CLI uses the Deposium app API for login, search, and other commands. Chat streaming uses the Edge gateway. Both addresses are built in for SaaS; you do not need to enter either one. An MCP integration URL for another client is a separate endpoint and is not a value for `DEPOSIUM_URL`. See the [auth command](../commands/auth.md) for login and the [chat command](../commands/chat.md) for chat modes.

## Configuration Priority

Settings are loaded in this order (later sources override earlier):

1. Default values (built-in)
2. Configuration file (`~/.deposium/config.json`)
3. Environment variables
4. Command-line arguments

## Environment Variables

| Variable            | Description                               | Default                    | Example                 |
| ------------------- | ----------------------------------------- | -------------------------- | ----------------------- |
| `DEPOSIUM_API_KEY`  | API authentication key (user-key)         | -                          | `dep_live_...`          |
| `DEPOSIUM_URL`      | Deposium server URL                       | `https://app.deposium.ai`  | `http://localhost:3003` |
| `DEPOSIUM_EDGE_URL` | Edge Runtime gateway URL (chat streaming) | `https://edge.deposium.ai` | `http://localhost:9000` |
| `DEPOSIUM_INSECURE` | Allow HTTP to non-localhost (`true`)      | `false`                    | `true`                  |
| `DEPOSIUM_TENANT`   | Default tenant ID                         | -                          | `tenant-123`            |
| `DEPOSIUM_SPACE`    | Default space ID                          | -                          | `space-456`             |

Output format and silent mode are per-invocation: pass `--format
json|table|markdown` and `--silent` on each command (there is no
global toggle).

> **Note:** Environment variables override stored values. Older stored URL settings can still override the SaaS defaults; run `deposium config get` to see the effective app URL. `DEPOSIUM_MCP_URL` and `DEPOSIUM_MCP_DIRECT_URL` are deprecated.

## Configuration File

Location: `~/.deposium/config.json` (encrypted AES-256-GCM)

The configuration file is automatically encrypted using a machine-derived key
(`scryptSync` with hostname + username). Existing plaintext configs are migrated
automatically on first run (backup saved as `.plaintext.bak`).

### Full Example

```bash
# Log in with a personal user key created in the Deposium app.
deposium auth login

# Optional defaults (stored encrypted). Keys are kebab-case.
deposium config set default-tenant my-tenant
```

### Valid Configuration Keys

Keys accepted by `deposium config set` (kebab-case on input, stored internally as camelCase):

| Key              | Type   | Description                                                                                                  |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `api-key`        | string | API authentication key (`dep_live_...`). Stored in the separate credentials file. Service-keys are rejected. |
| `deposium-url`   | string | Deposium server URL                                                                                          |
| `default-tenant` | string | Default tenant ID                                                                                            |
| `default-space`  | string | Default space ID                                                                                             |

> **Note:** `mcp-url` is a deprecated alias for `deposium-url` — still accepted for backwards compatibility.
>
> The Edge Runtime URL (`DEPOSIUM_EDGE_URL` env var, used by chat streaming) is configurable **only via environment variable**, not via `deposium config set`. Login and API-key validation use the app URL.

### Managing Configuration

```bash
# View current configuration and the effective app URL
deposium config get

# Set a value (kebab-case on the command line)
deposium config set default-tenant my-tenant

# Get a specific value (kebab-case key)
deposium config get deposium-url

# Delete a value
deposium config delete default-space

# Reset to defaults
deposium config reset
```

## Authentication

### API Key Setup

```bash
# Interactive authentication with an existing personal user key
deposium auth login

# Or set via environment
export DEPOSIUM_API_KEY="YOUR_PERSONAL_USER_KEY"
```

### Token Storage

API keys are stored in a separate encrypted file: `~/.deposium/credentials`
(AES-256-GCM, chmod 0600). This file is separate from config to allow sharing
configuration without exposing credentials.

The `~/.deposium/` directory is automatically set to chmod 0700.

### Key types

The CLI accepts user-keys only:

- ✅ `dep_live_*` — production user-key (web UI)
- ✅ `dep_test_*` — test user-key (web UI, dev tenants)
- ❌ `dep_svc_*` — **rejected at startup**. Service-keys are for
  server-side inter-process authentication only; the CLI is invoked
  by humans and must use a user-key. The check fires for env-var,
  stored credential, and `auth login` paste paths.

See [`auth` — Key types](../commands/auth.md#key-types--user-key-vs-service-key)
for the full rejection message and remediation.

### Resolution Priority

`DEPOSIUM_API_KEY` env var **always wins** over the stored credential. CI/CD
pipelines that export the env var bypass the interactive prompt and stored
file entirely — useful for ephemeral runners.

`deposium auth status` shows the active source:

```text
🔐 Authentication Status
Deposium URL: https://app.deposium.ai
Authentication: ✅ Logged in
API Key: dep_live_...
Source: DEPOSIUM_API_KEY env var (overrides stored credentials)
```

`deposium auth logout` only removes the **stored** credential — it does not
unset the env var. If `auth status` still shows "Logged in" after logout,
the env var is set: `unset DEPOSIUM_API_KEY` to fully clear.

## Tenant and Space

### Setting Defaults

```bash
# Via configuration
deposium config set default-tenant my-tenant
deposium config set default-space my-space

# Via environment
export DEPOSIUM_TENANT=my-tenant
export DEPOSIUM_SPACE=my-space
```

### Command Override

```bash
# Override for single command
deposium search "query" --tenant other-tenant --space other-space
```

## Network Configuration

### Older CLI versions and local development

CLI versions through `1.5.1` predate the SaaS URL defaults. If you must use an older version against SaaS, set `DEPOSIUM_URL=https://app.deposium.ai` and `DEPOSIUM_EDGE_URL=https://edge.deposium.ai` explicitly. For local development, set `DEPOSIUM_URL=http://localhost:3003` and `DEPOSIUM_EDGE_URL=http://localhost:9000` instead. Version `1.5.2` or newer needs neither override for SaaS.

The CLI's app URL is not the standalone MCP integration URL. Keep `DEPOSIUM_URL` pointed at the app API, even when a separate MCP client uses an MCP endpoint.

### TLS Enforcement

Non-localhost HTTP connections are **refused by default** in production.
The CLI throws an error with actionable guidance:

```bash
# This will be rejected:
DEPOSIUM_URL=http://api.example.com deposium health
# Error: Insecure HTTP connection refused for api.example.com

# Override for staging/self-signed certs:
deposium --insecure health
# Or via env var:
DEPOSIUM_INSECURE=true deposium health
```

Localhost URLs (`localhost`, `127.0.0.1`, `*.local`) are always allowed over HTTP.

### Proxy Support

```bash
# HTTP proxy
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# No proxy for specific hosts
export NO_PROXY=localhost,127.0.0.1,.internal.com
```

## Output Formats

### Available Formats

| Format     | Description                     |
| ---------- | ------------------------------- |
| `table`    | Human-readable tables (default) |
| `json`     | Machine-parseable JSON          |
| `markdown` | Markdown-formatted output       |

```bash
# Set format per command (no global toggle)
deposium search "query" --format json
```

## Silent Mode

Suppress non-essential output per command (no global toggle):

```bash
deposium search "query" --silent
```

## Example Configurations

### Development

```bash
# .env.development
DEPOSIUM_URL=http://localhost:3003
DEPOSIUM_EDGE_URL=http://localhost:9000
DEPOSIUM_API_KEY=dep_test_REPLACE_WITH_YOUR_USER_KEY
```

### SaaS and CI/CD

```bash
# Provide an existing personal user key; SaaS URLs use built-in defaults.
export DEPOSIUM_API_KEY="YOUR_PERSONAL_USER_KEY"
```

In CI, inject `DEPOSIUM_API_KEY` from a secret store. Pass `--silent` on each command if you need quieter logs.

## Troubleshooting

### HTTP 403 responses

The CLI reports a plan feature lock (`FEATURE_LOCKED`), a Cloudflare browser challenge, or an API-key permission failure separately. For a feature lock, check your plan and enabled features. A browser challenge cannot be completed by the CLI; contact Deposium support. For other permission failures, check the key's scopes and account permissions.

### Verify Configuration

```bash
# Show effective configuration
deposium config get

# Test connectivity
deposium health --verbose
```

### Reset Configuration

```bash
# Reset to defaults
deposium config reset

# Check the existing credential (reset does not remove it)
deposium auth status
```
