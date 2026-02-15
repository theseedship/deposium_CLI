> Revision: 15/02/2025

# Changelog

All notable changes to the Deposium CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Dependencies**: Major upgrades - conf 13->15, glob 11->13, mime-types 2->3, inquirer 12->13
- **Dependencies**: Patch/minor updates for all packages, 0 npm audit vulnerabilities
- **Node.js**: Minimum version bumped from 20 to 22 (engines field + CI)
- **CI**: Removed Node 20 from matrix, single Node 22 target
- **CI**: Fixed TruffleHog secret scanning (duplicate flag error)
- **Code quality**: Resolved all ESLint warnings (67 -> 0) via `||` -> `??` and complexity refactoring
- **Documentation**: Full audit and update of all docs against codebase (revision 15/02/2025)
- **Documentation**: Added missing graph subcommands (search, multihop, variable-path, khop)
- **Documentation**: Added missing corpus subcommands (improve, realtime-eval, monitor, freshness, drift)
- **Documentation**: Fixed environment variable names (`DEPOSIUM_URL` instead of `DEPOSIUM_API_URL`)

### Fixed
- CVE fix: axios <=1.13.4 DoS via `__proto__` (GHSA-43fc-jf86-j433)
- CVE fix: @isaacs/brace-expansion 5.0.0 ReDoS (GHSA-7h2j-956f-4vf2)
- Refactored `interactive.ts` for inquirer v13 (`type: 'list'` -> `type: 'select'`)
- Reduced cyclomatic complexity in 6 files (upload-batch, interactive, benchmark, mcp-client, formatter, auth)

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
  - `deposium graph` - Knowledge graph operations (7 subcommands)
  - `deposium corpus` - Corpus statistics and monitoring (7 subcommands)

- **AI Commands**
  - `deposium compound` - Compound AI reasoning
  - `deposium intelligence` - Intelligence analysis
  - `deposium dspy` - DSPy pipeline execution
  - `deposium leanrag` - LeanRAG operations
  - `deposium chat` - Interactive AI chat mode
  - `deposium interactive` - REPL interactive mode

- **Data Commands**
  - `deposium upload-batch` - Batch document uploads
  - `deposium evaluate` - RAG evaluation
  - `deposium benchmark` - Model benchmarking (list, run, corpus, compare)
  - `deposium duckdb` - DuckDB integration
  - `deposium mermaid` - Diagram generation
  - `deposium query-history` - Query tracking
  - `deposium logs` - Server log management
  - `deposium ui` - Interactive dashboards

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

---

## Links

- [README](../README.md) - Installation and usage guide
- [ROADMAP](../ROADMAP.md) - Future plans and best practices
- [Contributing](development/contributing.md) - Contribution guidelines
