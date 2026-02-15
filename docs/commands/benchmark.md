> Revision: 15/02/2025

# Benchmark Command

The `benchmark` command runs OpenBench LLM benchmarking and evaluation.

## Usage

```bash
deposium benchmark [command] [options]
```

## Subcommands

### `list`

List available benchmark categories.

```bash
deposium benchmark list [options]
```

**Options:**

- `--details`: Show detailed info.
- `-f, --format <type>`: Output format (`json`, `table`, `markdown`).

**Categories:**

- `knowledge`: General knowledge (MMLU, TriviaQA)
- `coding`: Code generation (HumanEval, MBPP)
- `math`: Mathematical reasoning (GSM8K, MATH)
- `reasoning`: Logic and deduction (ARC, HellaSwag)
- `cybersecurity`: Security-related tasks
- `search`: Retrieval and search quality

### `run`

Run a standardized LLM benchmark.

```bash
deposium benchmark run -c <category> [options]
```

**Options:**

- `-c, --category <name>`: Benchmark category (default: `search`).
- `-p, --provider <name>`: LLM provider: `groq`, `openai`, `anthropic` (default: `groq`).
- `-m, --model <name>`: Model name (default: `llama-3.1-8b-instant`).
- `-n, --samples <number>`: Max samples to evaluate (default: 100).
- `--no-cache`: Disable result caching.
- `-f, --format <type>`: Output format.

### `corpus`

Evaluate a specific Deposium corpus for retrieval quality with custom query-document pairs.

```bash
deposium benchmark corpus [options]
```

**Options:**

- `-t, --tenant <id>`: Tenant ID.
- `-s, --space <id>`: Space ID.
- `-q, --queries <file>`: JSON file with query-document pairs.
- `-p, --provider <name>`: LLM provider.
- `-m, --model <name>`: Model name.

### `compare`

Compare benchmark results across multiple models.

```bash
deposium benchmark compare [options]
```

**Options:**

- `--models <list>`: Comma-separated list of model names (e.g., `model1,model2`).
- `-c, --category <name>`: Filter by category.
- `-n, --samples <number>`: Samples limit.

## Query Format for Corpus Benchmark

`queries.json` should look like:

```json
[
  {
    "query": "What is machine learning?",
    "relevant_docs": ["Machine learning is a subset of AI..."],
    "context": "Technical documentation"
  }
]
```
