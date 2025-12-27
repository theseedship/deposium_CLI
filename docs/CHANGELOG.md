# Changelog

All notable changes to the Deposium CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- MindsDB integration commands
- Macro management commands
- Interactive TUI mode
- Plugin system for custom commands

## [1.0.0] - 2024-12-27

### Added
- **Core Commands**
  - Authentication (`deposium auth login`, `deposium auth logout`)
  - Configuration management (`deposium config set/get/delete/reset`)
  - Health check (`deposium health`)
  - Tools listing (`deposium tools`)

- **Search Commands**
  - `deposium search` - Multi-mode search (vector, FTS, fuzzy, graph)
  - `deposium graph` - Knowledge graph operations
  - `deposium corpus` - Corpus statistics

- **AI Commands**
  - `deposium compound` - Compound AI reasoning
  - `deposium intelligence` - Intelligence analysis
  - `deposium dspy` - DSPy pipeline execution
  - `deposium leanrag` - LeanRAG operations

- **Data Commands**
  - `deposium upload-batch` - Batch document uploads
  - `deposium evaluate` - RAG evaluation
  - `deposium benchmark` - Model benchmarking

- **Infrastructure**
  - 137 unit/integration tests (Vitest)
  - Structured logging with levels
  - Retry logic with exponential backoff
  - Graceful shutdown handlers
  - HTTPS validation in production
  - CI/CD with GitHub Actions

## [0.1.0] - 2024-10-01

### Added
- **Initial Release**
  - Authentication (`deposium login`, `deposium logout`)
  - Configuration management (`deposium config`)
  - MCP tool invocation via HTTP
  - Multiple output formats (json, table, markdown)
  - Auto-update mechanism
  - Shell completions (bash, zsh, fish)

---

## Links

- [README](../README.md) - Installation and usage guide
- [ROADMAP](../ROADMAP.md) - Future plans and best practices
- [Contributing](CONTRIBUTING.md) - Contribution guidelines
