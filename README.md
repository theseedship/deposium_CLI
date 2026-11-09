# 🚀 Deposium CLI

Official command-line interface for [Deposium](https://deposium.ai) — document search, knowledge graphs, and AI workflows, from your terminal.

[![npm](https://img.shields.io/npm/v/@deposium/cli.svg)](https://www.npmjs.com/package/@deposium/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📋 Overview

Deposium CLI is the terminal interface to the Deposium platform. It exposes:

- 🔍 **Search**: DuckDB vector (VSS) and full-text (BM25) search
- 🔗 **Graph**: Network analysis and path finding
- 📊 **Corpus**: Statistics and quality evaluation
- 🤖 **General AI (Compound)**: Server reasoning and optional web research, without a selected document space
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

| Command                                                       | Description                                    |
| :------------------------------------------------------------ | :--------------------------------------------- |
| **[api-keys](docs/commands/api-keys.md)**                     | Manage server-side API keys                    |
| **[auth](docs/commands/auth.md)**                             | Authenticate the CLI (local store)             |
| **[benchmark](docs/commands/benchmark.md)**                   | Run LLM benchmarks (OpenBench)                 |
| **[chat](docs/commands/chat.md)**                             | Interactive AI chat mode                       |
| **[compound](docs/commands/compound.md)**                     | Multi-tool logic and reasoning                 |
| **[config](docs/commands/config.md)**                         | CLI configuration management                   |
| **[corpus](docs/commands/corpus.md)**                         | Corpus stats and evaluation                    |
| **[dspy](docs/commands/dspy.md)**                             | Query intent diagnostics (routing is internal) |
| **[duckdb](docs/commands/duckdb.md)**                         | Server-internal database operations            |
| **[evaluate](docs/commands/evaluate.md)**                     | Metrics, dashboards, and feedback              |
| **[files](docs/commands/files.md)**                           | Manage documents (list/show/check/rm)          |
| **[graph](docs/commands/graph.md)**                           | Graph analysis and traversal                   |
| **[health](docs/commands/health.md)**                         | System health and connectivity                 |
| **[intelligence](docs/commands/intelligence.md)**             | AI query analysis and hints                    |
| **[leanrag](docs/commands/leanrag.md)**                       | Optimized retrieval (LeanRAG)                  |
| **[logs](docs/commands/logs.md)**                             | View and search server logs                    |
| **[mermaid](docs/commands/mermaid.md)**                       | Diagram generation and querying                |
| **[query-history](docs/commands/query-history.md)**           | Track and analyze query history                |
| **[search](docs/commands/search.md)**                         | Document search (Vector/BM25 FTS)              |
| **[space](docs/commands/space.md)**                           | Manage workspaces (list/show/create)           |
| **[temporal-assertion](docs/commands/temporal-assertion.md)** | Oracle: temporal-assertion fixtures            |
| **[tools](docs/commands/tools.md)**                           | List available MCP tools                       |
| **[ui](docs/commands/ui.md)**                                 | Fetch resources for a compatible MCP UI host   |
| **[upload-batch](docs/commands/upload-batch.md)**             | Batch file upload utility                      |
| **[validate](docs/commands/validate.md)**                     | Validate dossier (N1+N2+HITL)                  |

## 📦 Get started

Requires Node.js `^22.13.0 || >=24` (Node 23 is unsupported).

```bash
npm install -g @deposium/cli
deposium --version
```

Use CLI version `1.5.2` or newer for automatic connection to Deposium SaaS. No server URL setup is needed. If your installed version is older, see the [configuration guide](docs/guides/configuration.md#older-cli-versions-and-local-development).

API access depends on the features enabled for your account and server permissions.

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

### Choose how to use the CLI

- `deposium search "a phrase from your document" --space YOUR_SPACE_ID` runs one command and returns to your shell. Your stored login remains available for the next command.
- **`deposium` opens the menu in a terminal (CLI 1.7.2+).** `deposium interactive` and `deposium i` remain supported. Without a terminal, the bare command prints help.
- `deposium chat --space YOUR_SPACE_ID` starts a continuous conversation. In CLI 1.6.0+, enter `/` then press Enter for the chat command menu. Chat history lasts only for the current process; closing chat does not log you out.

See the [interactive terminal guide](docs/guides/interactive.md) and the
[qualification record](docs/guides/qualification.md) for version requirements and tested boundaries.

### Keep the CLI up to date

Starting with **CLI 1.6.0**, global npm installs offer a confirmed update and restart at interactive startup.
Scripts and JSON output stay noninteractive; `--no-update` disables the check.
Older versions need a manual `npm install -g @deposium/cli@latest` first.
Check `deposium --version` against `npm view @deposium/cli version` to distinguish your installed version from the latest public npm version. Changes merged in this repository may still await npm release approval.
See [updates and supported installations](docs/guides/installation.md#updates).

## Language and remembered space

CLI 1.8.0+ includes `deposium settings`: choose French, English or automatic
language, then select one authorized default space by name. `deposium --lang fr`
overrides only this invocation; `deposium health --context` explains the effective
configuration without showing credentials. See [Settings](docs/commands/settings.md).
Live slash completion remains planned.

## 🤝 Contributing

See [Contributing Guide](docs/development/contributing.md) and [Development Guide](docs/development/ui-system.md) for details on how to get started.

Merging a new package version into `main` automatically stages it on npm after the release checks pass. A maintainer must approve it with npm 2FA before it becomes public; see the [release guide](docs/development/releases.md).

## 🔒 Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for our disclosure policy.

## 📜 Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the release history.

## 📄 License

MIT - The Seed Ship. See [LICENSE](LICENSE).
