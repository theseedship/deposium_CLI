> Revision: 2026-11-09

# Health Command

The `health` command checks the connectivity and status of the Deposium API and its services.

## Usage

```bash
deposium health [options]
```

## Options

- `-v, --verbose`: Show detailed health information (calls `system_health` tool for deeper inspection).
- `--context`: Include effective language, safe instance origins and catalogue-checked default-space status (CLI 1.8.0+).
- `-f, --format <type>`: Output format (`json` or `table`) (default: `table`).

`--format json` retains the original health response (or verbose details) on stdout.
Only explicit `--context` adds a `{ health, context }` envelope; with `--verbose`,
that envelope also includes `details`. See [Settings](settings.md). Progress and dashboard formatting are suppressed; failures go to
stderr and return a nonzero exit code.
Format names are case-insensitive. JSON mode never prompts for credentials; use
`deposium auth login` separately if authentication is required.

## Description

- **Standard run**: Displays reported service status plus the effective CLI context. Missing service details are stated rather than turned into an empty health score. A successful endpoint response does not prove every service is healthy.
- **Verbose mode**: Calls `system_health` for the details available to the account; the server can refuse this operation. Context lookup failure is reported separately from endpoint health.
