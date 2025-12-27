# Configuration Guide

Complete reference for configuring Deposium CLI.

## Configuration Priority

Settings are loaded in this order (later sources override earlier):

1. Default values (built-in)
2. Configuration file (`~/.deposium/config.json`)
3. Environment variables
4. Command-line arguments

## Environment Variables

| Variable           | Description            | Default                    | Example                     |
| ------------------ | ---------------------- | -------------------------- | --------------------------- |
| `DEPOSIUM_API_KEY` | API authentication key | -                          | `sk-abc123...`              |
| `DEPOSIUM_API_URL` | MCP server URL         | `https://api.deposium.com` | `https://api.mycompany.com` |
| `DEPOSIUM_TENANT`  | Default tenant ID      | -                          | `tenant-123`                |
| `DEPOSIUM_SPACE`   | Default space ID       | -                          | `space-456`                 |
| `DEPOSIUM_TIMEOUT` | Request timeout (ms)   | `300000`                   | `600000`                    |
| `LOG_LEVEL`        | Logging verbosity      | `info`                     | `debug`, `warn`, `error`    |
| `LOG_JSON`         | JSON log format        | `false`                    | `true`                      |
| `LOG_FILE`         | Enable file logging    | `false`                    | `true`                      |
| `LOG_PATH`         | Log file location      | `~/.deposium/logs/cli.log` | `/var/log/deposium.log`     |

## Configuration File

Location: `~/.deposium/config.json`

### Full Example

```json
{
  "apiUrl": "https://api.deposium.com",
  "defaultTenant": "my-tenant",
  "defaultSpace": "my-space",
  "timeout": 300000,
  "retryAttempts": 3,
  "retryDelay": 1000
}
```

### Managing Configuration

```bash
# View current configuration
deposium config list

# Set a value
deposium config set defaultTenant my-tenant

# Get a specific value
deposium config get apiUrl

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

API keys are stored in `~/.deposium/config.json`. Ensure this file is:

- Not committed to version control
- Has appropriate permissions (`chmod 600`)

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

## Timeout Configuration

### Global Timeout

```bash
# Environment variable (milliseconds)
export DEPOSIUM_TIMEOUT=600000  # 10 minutes

# Configuration file
deposium config set timeout 600000
```

### Per-Command Timeout

Some commands support `--timeout`:

```bash
deposium health --timeout 5000
```

## Logging Configuration

### Log Levels

| Level   | Description               |
| ------- | ------------------------- |
| `debug` | Verbose debugging info    |
| `info`  | Normal operation messages |
| `warn`  | Warnings only             |
| `error` | Errors only               |

```bash
# Set via environment
export LOG_LEVEL=debug

# Or per-command
LOG_LEVEL=debug deposium search "query"
```

### File Logging

```bash
# Enable
export LOG_FILE=true

# Custom path
export LOG_PATH=/var/log/deposium.log
```

### JSON Output

```bash
# Enable JSON logs
export LOG_JSON=true

# Parse with jq
LOG_JSON=true deposium search "query" 2>&1 | jq .
```

## Network Configuration

### Proxy Support

```bash
# HTTP proxy
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# No proxy for specific hosts
export NO_PROXY=localhost,127.0.0.1,.internal.com
```

### SSL/TLS

```bash
# Disable certificate verification (NOT recommended for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

## Output Formats

### Available Formats

| Format    | Description                     |
| --------- | ------------------------------- |
| `table`   | Human-readable tables (default) |
| `json`    | Machine-parseable JSON          |
| `compact` | Minimal output                  |

```bash
# Set format
deposium search "query" --format json

# Default format via config
deposium config set defaultFormat json
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
DEPOSIUM_API_URL=http://localhost:3003
DEPOSIUM_API_KEY=dev-key
LOG_LEVEL=debug
DEPOSIUM_TIMEOUT=60000
```

### Production

```bash
# .env.production
DEPOSIUM_API_URL=https://api.deposium.com
DEPOSIUM_API_KEY=prod-key
LOG_LEVEL=warn
LOG_JSON=true
LOG_FILE=true
```

### CI/CD

```bash
# GitHub Actions / GitLab CI
DEPOSIUM_API_KEY=${{ secrets.DEPOSIUM_API_KEY }}
DEPOSIUM_SILENT=true
LOG_JSON=true
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

# Clear authentication
rm ~/.deposium/config.json
deposium auth
```

### Debug Mode

```bash
# Full debug output
LOG_LEVEL=debug DEBUG=true deposium search "query"
```
