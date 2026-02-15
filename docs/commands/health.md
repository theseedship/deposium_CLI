> Revision: 15/02/2025

# Health Command

The `health` command checks the connectivity and status of the Deposium API and its services.

## Usage

```bash
deposium health [options]
```

## Options

- `-v, --verbose`: Show detailed health information (calls `system_health` tool for deeper inspection).
- `-f, --format <type>`: Output format (`json` or `table`) (default: `table`).

## Description

- **Standard Run**: Checks connectivity to the server and displays a high-level status summary for connected services (Database, API, etc.) using a visual dashboard.
- **Verbose Mode**: Retrieves a detailed JSON report of all internal system health metrics.
