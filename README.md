# 🚀 Deposium CLI

Official command-line interface for [Deposium](https://deposium.ai) — document search, knowledge graphs, and AI workflows, from your terminal.

[![npm](https://img.shields.io/npm/v/@deposium/cli.svg)](https://www.npmjs.com/package/@deposium/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

## 📋 Overview

Deposium CLI is the terminal interface to the Deposium platform. It exposes:

- 🔍 **Search**: DuckDB VSS, FTS, and fuzzy matching
- 🔗 **Graph**: Network analysis and path finding
- 📊 **Corpus**: Statistics and quality evaluation
- 🤖 **Compound AI**: Multi-tool reasoning with Groq
- 🎨 **Interactive mode**: REPL for exploration

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- **[Installation Guide](docs/guides/installation.md)**
- **[Configuration Guide](docs/guides/configuration.md)**
- **[Best Practices](docs/guides/best-practices.md)**

### Command Reference

| Command                                             | Description                           |
| :-------------------------------------------------- | :------------------------------------ |
| **[auth](docs/commands/auth.md)**                   | Manage API keys and sessions          |
| **[benchmark](docs/commands/benchmark.md)**         | Run LLM benchmarks (OpenBench)        |
| **[chat](docs/commands/chat.md)**                   | Interactive AI chat mode              |
| **[compound](docs/commands/compound.md)**           | Multi-tool logic and reasoning        |
| **[config](docs/commands/config.md)**               | CLI configuration management          |
| **[corpus](docs/commands/corpus.md)**               | Corpus stats and evaluation           |
| **[dspy](docs/commands/dspy.md)**                   | Intelligent query routing (DSPy)      |
| **[duckdb](docs/commands/duckdb.md)**               | Database connection and federation    |
| **[evaluate](docs/commands/evaluate.md)**           | Metrics, dashboards, and feedback     |
| **[files](docs/commands/files.md)**                 | Manage documents (list/show/check/rm) |
| **[graph](docs/commands/graph.md)**                 | Graph analysis and traversal          |
| **[health](docs/commands/health.md)**               | System health and connectivity        |
| **[intelligence](docs/commands/intelligence.md)**   | AI query analysis and hints           |
| **[leanrag](docs/commands/leanrag.md)**             | Optimized retrieval (LeanRAG)         |
| **[logs](docs/commands/logs.md)**                   | View and search server logs           |
| **[mermaid](docs/commands/mermaid.md)**             | Diagram generation and querying       |
| **[query-history](docs/commands/query-history.md)** | Track and analyze query history       |
| **[search](docs/commands/search.md)**               | Document search (Vector/FTS/Fuzzy)    |
| **[space](docs/commands/space.md)**                 | Manage workspaces (list/show/create)  |
| **[tools](docs/commands/tools.md)**                 | List available MCP tools              |
| **[ui](docs/commands/ui.md)**                       | Launch interactive dashboards         |
| **[upload-batch](docs/commands/upload-batch.md)**   | Batch file upload utility             |

## 📦 Quick Install

```bash
# Install globally via npm
npm install -g @deposium/cli

# Verify installation
deposium --version
```

See the [Installation Guide](docs/guides/installation.md) for Docker, Bun, and local development installation methods.

## 🤝 Contributing

See [Contributing Guide](docs/development/contributing.md) and [Development Guide](docs/development/ui-system.md) for details on how to get started.

## 🔒 Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for our disclosure policy.

## 📜 Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the release history.

## 📄 License

MIT - The Seed Ship. See [LICENSE](LICENSE).
