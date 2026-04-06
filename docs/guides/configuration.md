> Revision: 2026-04-06

# Configuration Guide

Complete reference for configuring Deposium CLI.

## Configuration Priority

Settings are loaded in this order (later sources override earlier):

1. Default values (built-in)
2. Configuration file (`~/.deposium/config.json`)
3. Environment variables
4. Command-line arguments

## Environment Variables

| Variable            | Description                           | Default                 | Example                     |
| ------------------- | ------------------------------------- | ----------------------- | --------------------------- |
| `DEPOSIUM_API_KEY`  | API authentication key                | -                       | `sk-abc123...`              |
| `DEPOSIUM_URL`      | Deposium server URL                   | `http://localhost:3003` | `https://api.mycompany.com` |
| `DEPOSIUM_EDGE_URL` | Edge Runtime gateway URL (chat, auth) | `http://localhost:9000` | `https://edge.deposium.vip` |
| `DEPOSIUM_INSECURE` | Allow HTTP to non-localhost (`true`)  | `false`                 | `true`                      |
| `DEPOSIUM_TENANT`   | Default tenant ID                     | -                       | `tenant-123`                |
| `DEPOSIUM_SPACE`    | Default space ID                      | -                       | `space-456`                 |
| `DEPOSIUM_OUTPUT`   | Default output format                 | `table`                 | `json`, `markdown`          |
| `DEPOSIUM_SILENT`   | Suppress non-essential output         | `false`                 | `true`                      |

> **Note:** `DEPOSIUM_MCP_URL` and `DEPOSIUM_MCP_DIRECT_URL` are deprecated. Use `DEPOSIUM_URL` and `DEPOSIUM_EDGE_URL` instead.

## Configuration File

Location: `~/.deposium/config.json` (encrypted AES-256-GCM)

The configuration file is automatically encrypted using a machine-derived key
(`scryptSync` with hostname + username). Existing plaintext configs are migrated
automatically on first run (backup saved as `.plaintext.bak`).

### Full Example

```bash
# Set values via CLI (stored encrypted)
deposium config set deposiumUrl https://api.deposium.com
deposium config set edgeUrl https://edge.deposium.vip
deposium config set defaultTenant my-tenant
```

### Valid Configuration Keys

| Key             | Type    | Description                               |
| --------------- | ------- | ----------------------------------------- |
| `deposiumUrl`   | string  | Deposium server URL                       |
| `edgeUrl`       | string  | Edge Runtime gateway URL                  |
| `defaultTenant` | string  | Default tenant ID                         |
| `defaultSpace`  | string  | Default space ID                          |
| `outputFormat`  | string  | Output format (`json`/`table`/`markdown`) |
| `silentMode`    | boolean | Suppress non-essential output             |

> **Note:** `mcpDirectUrl` is deprecated. Use `edgeUrl` instead.

### Managing Configuration

```bash
# View current configuration
deposium config list

# Set a value
deposium config set defaultTenant my-tenant

# Get a specific value
deposium config get deposiumUrl

# Delete a value
deposium config delete defaultSpace

# Reset to defaults
deposium config reset
```

## Authentication

### API Key Setup

```bash
# Interactive authentication
deposium auth

# Or set via environment
export DEPOSIUM_API_KEY="your-api-key"
```

### Token Storage

API keys are stored in a separate encrypted file: `~/.deposium/credentials`
(AES-256-GCM, chmod 0600). This file is separate from config to allow sharing
configuration without exposing credentials.

The `~/.deposium/` directory is automatically set to chmod 0700.

## Tenant and Space

### Setting Defaults

```bash
# Via configuration
deposium config set defaultTenant my-tenant
deposium config set defaultSpace my-space

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
# Set format per command
deposium search "query" --format json

# Default format via environment
export DEPOSIUM_OUTPUT=json
```

## Silent Mode

Suppress all non-essential output:

```bash
# Via flag
deposium search "query" --silent

# Via environment
export DEPOSIUM_SILENT=true
```

## Example Configurations

### Development

```bash
# .env.development
DEPOSIUM_URL=http://localhost:3003
DEPOSIUM_EDGE_URL=http://localhost:9000
DEPOSIUM_API_KEY=dev-key
```

### Production

```bash
# .env.production
DEPOSIUM_URL=https://api.deposium.com
DEPOSIUM_EDGE_URL=https://edge.deposium.vip
DEPOSIUM_API_KEY=prod-key
```

### CI/CD

```bash
# GitHub Actions / GitLab CI
DEPOSIUM_API_KEY=${{ secrets.DEPOSIUM_API_KEY }}
DEPOSIUM_URL=https://api.deposium.com
DEPOSIUM_SILENT=true
```

## Troubleshooting

### Verify Configuration

```bash
# Show effective configuration
deposium config list

# Test connectivity
deposium health --verbose
```

### Reset Configuration

```bash
# Reset to defaults
deposium config reset

# Re-authenticate
deposium auth
```
