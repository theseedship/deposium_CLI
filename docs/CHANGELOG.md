> Revision: 2026-04-06

# Changelog

All notable changes to the Deposium CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Phase I Item 5 (2026-04-23)
- **HITL**: `chat_prompt` SSE event type + `onChatPrompt` callback in `MCPClient` (`src/client/mcp-client.ts`)
- **HITL**: `MCPClient.resumeAgent(url, correlationId, { value | values })` — POST to `/api/agent-resume`, streams the continuation
- **HITL**: `deposium chat --on-ambiguous=<prompt|fail|dump|pick-first>` (TTY-aware default)
- **HITL**: `inquirer` picker rendering for `type='choice'` and `type='confirm'` prompts
- **Testing**: 14 new tests in `src/__tests__/chat-hitl.test.ts` (mode dispatch, TTY defaults, resumeAgent POST shape, SSE chat_prompt parsing)
- **Docs**: `docs/guides/on-ambiguous-flag.md` — user-facing policy reference

### Added — Sprint secure-CLI-2026
- **Security**: Config encryption via `Conf({ encryptionKey })` with AES-256-GCM (scryptSync machine-derived key)
- **Security**: API key isolated in separate `~/.deposium/credentials` file (encrypted, chmod 0600)
- **Security**: `enforceUrlSecurity()` — non-localhost HTTP connections refused by default
- **Security**: `--insecure` global flag + `DEPOSIUM_INSECURE` env var for override
- **Security**: Config directory chmod 0700, config files chmod 0600
- **Security**: Automatic migration of plaintext config to encrypted (backup `.plaintext.bak`)
- **Networking**: Chat streams routed via Edge Runtime gateway (`/chat-stream`) with auth + rate-limiting
- **Networking**: `DEPOSIUM_EDGE_URL` env var + `edgeUrl` config key (default `localhost:9000`)
- **Networking**: `--direct` flag on chat command for dev bypass (with warning)
- **Networking**: 429 rate-limit handling with Retry-After header and tier info
- **Deprecation**: `DEPOSIUM_MCP_DIRECT_URL` / `mcpDirectUrl` marked deprecated (use `DEPOSIUM_EDGE_URL`)

### Changed
- **Dependencies**: Major upgrades - conf 13->15, glob 11->13, mime-types 2->3, inquirer 12->13
- **Dependencies**: Patch/minor updates for all packages, 0 npm audit vulnerabilities
- **Dependencies**: Security overrides: minimatch >=10.2.4 (ReDoS), rollup >=4.59.0 (path traversal)
- **Node.js**: Minimum version bumped from 20 to 22 (engines field + CI)
- **Code quality**: Resolved all ESLint warnings (67 -> 0) via `||` -> `??` and complexity refactoring
- **Code quality**: Removed dead logger module (344L) + dead code cleanup
- **Testing**: 142 tests (was 137), added TLS enforcement, SSE streaming, encryption, credentials tests
- **Documentation**: Full audit of all docs against codebase (revision 2026-04-06)
- **Documentation**: Removed dead logger references (LOG_LEVEL, LOG_JSON, LOG_FILE, LOG_PATH)

### Fixed
- CVE fix: minimatch ReDoS (CVE-2026-26996)
- CVE fix: rollup path traversal
- CVE fix: axios <=1.13.4 DoS via `__proto__` (GHSA-43fc-jf86-j433)
- `--silent` no longer suppresses security warnings/errors

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
