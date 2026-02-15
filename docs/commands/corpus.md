> Revision: 15/02/2025

# Corpus Command

The `corpus` command allows you to inspect, evaluate, and monitor your knowledge base.

## Usage

```bash
deposium corpus [command] [options]
```

## Subcommands

### `stats`

Get statistics about the corpus (document counts, entity counts, etc.).

```bash
deposium corpus stats [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-f, --format <type>`: Output format (`json`, `table`).

### `evaluate`

Evaluate corpus quality using LLM-as-a-judge metrics.

```bash
deposium corpus evaluate [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--metric <name>`: Evaluation metric (`relevance`, `coherence`, `diversity`).
- `-f, --format <type>`: Output format.

### `improve`

Get improvement suggestions for corpus quality.

```bash
deposium corpus improve [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--focus <area>`: Focus area (`coverage`, `quality`, `diversity`).
- `-f, --format <type>`: Output format.

### `realtime-eval`

Real-time corpus evaluation with RSS feed monitoring.

```bash
deposium corpus realtime-eval [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--interval <seconds>`: Evaluation interval (default: `300`).
- `-f, --format <type>`: Output format.

### `monitor`

Monitor corpus quality with anomaly detection.

```bash
deposium corpus monitor [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--threshold <number>`: Anomaly threshold (default: `0.8`).
- `-f, --format <type>`: Output format.

### `freshness`

Check corpus freshness against external sources.

```bash
deposium corpus freshness [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--sources <json>`: External sources as JSON.
- `-f, --format <type>`: Output format.

### `drift`

Detect concept drift over time in corpus content.

```bash
deposium corpus drift [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--time-window <days>`: Time window for comparison (default: `30`).
- `-f, --format <type>`: Output format.
