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
- `--metric <name>`: Evaluation metric (`relevance`, `faithfulness`, `answer_relevancy`, `context_recall`, `context_precision`, `diversity`, `coverage`, `freshness`, `currency`). Default: `relevance`.
- `-f, --format <type>`: Output format.

### `improve`

Get improvement suggestions for corpus quality.

```bash
deposium corpus improve [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--type <improvement_type>` (required): Improvement type (`add_missing_topics`, `remove_duplicates`, `enhance_metadata`, `optimize_chunking`, `improve_embeddings`, `update_stale_content`, `diversify_sources`).
- `--evaluation-results <json>`: Prior `corpus evaluate` output as JSON (chain with `corpus evaluate --format json`).
- `-f, --format <type>`: Output format.

### `eval-snapshot` (alias: `realtime-eval`)

Snapshot corpus evaluation — a one-shot call (not a recurring stream).
The `--interval` flag is the **window size in seconds** the server uses
to compute the snapshot, not a poll interval; the CLI calls once.

```bash
deposium corpus eval-snapshot [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--interval <seconds>`: Server-side window size (default: `300`).
- `-f, --format <type>`: Output format.

### `monitor`

Monitor corpus quality with anomaly detection.

```bash
deposium corpus monitor [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `--action <action>`: Monitor action (`start`, `stop`, `status`) (default: `status`).
- `--threshold <number>`: Alert threshold 0-1, maps to backend `alert_threshold` (default: `0.7`).
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
- `--time-window <days>`: Baseline is N days before today (default: `30`).
- `--sensitivity <level>`: Drift sensitivity (`low`, `medium`, `high`) (default: `medium`).
- `-f, --format <type>`: Output format.
