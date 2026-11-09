> Revision: 2026-11-09

# Health Command

The `health` command checks the connectivity and status of the Deposium API and its services.

## Usage

```bash
deposium health [options]
```

## Options

- `-v, --verbose`: Show detailed health information (calls `system_health` tool for deeper inspection).
- `-f, --format <type>`: Output format (`json` or `table`) (default: `table`).

`--format json` writes only the health response to stdout in both standard and
verbose mode. Progress and dashboard formatting are suppressed; failures go to
stderr and return a nonzero exit code.

## Description

- **Standard Run**: Checks connectivity to the server and displays a high-level status summary for connected services (Database, API, etc.) using a visual dashboard.
- **Verbose Mode**: Retrieves a detailed JSON report of all internal system health metrics.
