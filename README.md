# 🚀 Deposium CLI

Official command-line interface for [Deposium](https://deposium.ai) — document search, knowledge graphs, and AI workflows, from your terminal.

[![npm](https://img.shields.io/npm/v/@deposium/cli.svg)](https://www.npmjs.com/package/@deposium/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📋 Overview

Deposium CLI is the terminal interface to the Deposium platform. It exposes:

- 🔍 **Search**: DuckDB vector (VSS) and full-text (BM25) search
- 🔗 **Graph**: Network analysis and path finding
- 📊 **Corpus**: Statistics and quality evaluation
- 🤖 **Compound AI**: Multi-tool reasoning with Groq
- 🎨 **Interactive mode**: REPL for exploration

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

**User guides:**

- **[Installation Guide](docs/guides/installation.md)**
- **[Configuration Guide](docs/guides/configuration.md)**
- **[Best Practices](docs/guides/best-practices.md)** (incl. self-service workflows)
- **[`--on-ambiguous` HITL flag](docs/guides/on-ambiguous-flag.md)**

**For SDK / programmatic consumers:**

- **[MCP Auth Error Codes](docs/development/error-codes.md)** — `MCPAuthError` class + stable `errorCode` enum
- **[Contributing](docs/development/contributing.md)**
- **[Release and npm staging guide](docs/development/releases.md)**
- **[CHANGELOG](docs/CHANGELOG.md)**

### Command Reference

| Command                                                       | Description                           |
| :------------------------------------------------------------ | :------------------------------------ |
| **[api-keys](docs/commands/api-keys.md)**                     | Manage server-side API keys           |
| **[auth](docs/commands/auth.md)**                             | Authenticate the CLI (local store)    |
| **[benchmark](docs/commands/benchmark.md)**                   | Run LLM benchmarks (OpenBench)        |
| **[chat](docs/commands/chat.md)**                             | Interactive AI chat mode              |
| **[compound](docs/commands/compound.md)**                     | Multi-tool logic and reasoning        |
| **[config](docs/commands/config.md)**                         | CLI configuration management          |
| **[corpus](docs/commands/corpus.md)**                         | Corpus stats and evaluation           |
| **[dspy](docs/commands/dspy.md)**                             | Intelligent query routing (DSPy)      |
| **[duckdb](docs/commands/duckdb.md)**                         | Database connection and federation    |
| **[evaluate](docs/commands/evaluate.md)**                     | Metrics, dashboards, and feedback     |
| **[files](docs/commands/files.md)**                           | Manage documents (list/show/check/rm) |
| **[graph](docs/commands/graph.md)**                           | Graph analysis and traversal          |
| **[health](docs/commands/health.md)**                         | System health and connectivity        |
| **[intelligence](docs/commands/intelligence.md)**             | AI query analysis and hints           |
| **[leanrag](docs/commands/leanrag.md)**                       | Optimized retrieval (LeanRAG)         |
| **[logs](docs/commands/logs.md)**                             | View and search server logs           |
| **[mermaid](docs/commands/mermaid.md)**                       | Diagram generation and querying       |
| **[query-history](docs/commands/query-history.md)**           | Track and analyze query history       |
| **[search](docs/commands/search.md)**                         | Document search (Vector/BM25 FTS)     |
| **[space](docs/commands/space.md)**                           | Manage workspaces (list/show/create)  |
| **[temporal-assertion](docs/commands/temporal-assertion.md)** | Oracle: temporal-assertion fixtures   |
| **[tools](docs/commands/tools.md)**                           | List available MCP tools              |
| **[ui](docs/commands/ui.md)**                                 | Launch interactive dashboards         |
| **[upload-batch](docs/commands/upload-batch.md)**             | Batch file upload utility             |
| **[validate](docs/commands/validate.md)**                     | Validate dossier (N1+N2+HITL)         |

## 📦 Get started

Requires Node.js `^22.13.0 || >=24` (Node 23 is unsupported).

```bash
npm install -g @deposium/cli
deposium --version
```

Use CLI version `1.5.2` or newer for automatic connection to Deposium SaaS. No server URL setup is needed. If your installed version is older, see the [configuration guide](docs/guides/configuration.md#older-cli-versions-and-local-development).

CLI access is included in the [Pro, Teams, and Enterprise plans](https://deposium.ai/en/pricing).

1. In the [Deposium app's Billing page](https://app.deposium.ai/billing), open **API Keys**, create a personal user API key, and save it when shown.
2. Run `deposium auth login` and paste that key at the masked prompt.
3. Check the connection:

   ```bash
   deposium auth status
   ```

4. If you do not have a space yet, [create one in the Deposium app](https://app.deposium.ai/datalake?tab=spaces) and upload a document to it. Wait for processing to finish, then list your spaces and search using a phrase from that document:

   ```bash
   deposium space list
   deposium search "a phrase from your document" --space YOUR_SPACE_ID
   ```

Use a space ID from `deposium space list` in the search command. `auth login` uses a key you already created; it does not create one.

For URL questions, older versions, and local development, see the [configuration guide](docs/guides/configuration.md). The [installation guide](docs/guides/installation.md) covers other installation methods.

## 🤝 Contributing

See [Contributing Guide](docs/development/contributing.md) and [Development Guide](docs/development/ui-system.md) for details on how to get started.

Merging a new package version into `main` automatically stages it on npm after the release checks pass. A maintainer must approve it with npm 2FA before it becomes public; see the [release guide](docs/development/releases.md).

## 🔒 Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for our disclosure policy.

## 📜 Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the release history.

## 📄 License

MIT - The Seed Ship. See [LICENSE](LICENSE).
