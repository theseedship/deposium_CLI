> Revision: 15/02/2025

# Evaluate Command

The `evaluate` (or `eval`) command group provides tools for gathering metrics, generating dashboards, and submitting feedback to improve the system.

## Usage

```bash
deposium evaluate [command] [options]
# Alias
deposium eval [command] [options]
```

## Subcommands

### `metrics`

Get evaluation metrics for user query history.

```bash
deposium evaluate metrics [options]
```

**Options:**

- `--user-id <id>`: User ID to fetch metrics for.
- `--include-global`: Include system-wide global metrics.
- `-f, --format <type>`: Output format.

### `dashboard`

Generate an evaluation dashboard with visualizations.

```bash
deposium evaluate dashboard [options]
```

**Options:**

- `--user-id <id>`: User ID.
- `--time-range <range>`: Time range (`24h`, `7d`, `30d`) (default: `24h`).
- `-f, --format <type>`: Output format.

### `feedback`

Submit quality feedback for a specific query result.

```bash
deposium evaluate feedback [options]
```

**Options:**

- `--query-id <id>`: **Required**. The ID of the query being evaluated.
- `--user-id <id>`: **Required**. The ID of the user submitting feedback.
- `--score <number>`: **Required**. Quality score (0.0 to 1.0).
- `--feedback <text>`: Optional text feedback.
- `-f, --format <type>`: Output format.

### `code`

Execute and evaluate code in a sandboxed environment (E2B).

```bash
deposium evaluate code <code> [options]
```

**Arguments:**

- `code`: The code string to execute.

**Options:**

- `--language <lang>`: Programming language (default: `javascript`).
- `--timeout <ms>`: Execution timeout in ms (default: 30000).
- `-f, --format <type>`: Output format.

### `graph`

Generate graph visualization and quality metrics.

```bash
deposium evaluate graph [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--max-nodes <number>`: Maximum nodes to visualize (default: 100).
- `-f, --format <type>`: Output format.

### `quality`

Assess code quality using test cases (vulnerability scanning).

```bash
deposium evaluate quality <code> [options]
```

**Arguments:**

- `code`: The code to assess.

**Options:**

- `--test-cases <json>`: JSON string of test cases.
- `--language <lang>`: Programming language.
- `-f, --format <type>`: Output format.
