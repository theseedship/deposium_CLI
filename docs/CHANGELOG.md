> Revision: 2026-04-25

# Changelog

All notable changes to the Deposium CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.4] - 2026-04-25

### Added — Test expansion
- **Tests**: `src/__tests__/chat-history.test.ts` — 28 new unit tests (was 0% covered, now 100%)
- **Tests**: 12 new tests in `auth.test.ts` for `ensureAuthenticated` + `promptApiKey` (auth.ts: 26% → ~100%)
- **Tests**: 8 new tests in `chat-hitl.test.ts` for `runChatTurn` HITL orchestration (chat.ts: 20% → 47%)

### Changed
- **Testing**: Suite total 156 → 204 tests
- **Coverage**: Statements 72% → 76% globally

## [1.0.3] - 2026-04-25

### Added
- **Helper**: `resolveTenantSpace(options, config)` exported from `command-helpers.ts` — replaces 22 duplicated lines across 8 commands
- **Docs**: JSDoc on 8 public exports of `src/utils/config.ts` (setConfig, deleteConfig, resetConfig, getConfigPath, setApiKey, deleteApiKey, hasApiKey, getCredentialsPath)
- **Docs**: JSDoc block on re-exports in `command-helpers.ts` (isErrorWithCode, hasErrorCauseWithCode, getErrorMessage)

### Changed
- **Type safety**: `MCPClient.callTool` args type tightened (`Record<string, any>` → `Record<string, unknown>`); removed `eslint-disable` comment
- **Refactor**: 8 commands (benchmark, corpus, evaluate, graph, intelligence, leanrag, mermaid, search) now use `resolveTenantSpace` helper
- **Comments**: Clarified intent of try/catch-as-control-flow in benchmark.ts and upload-batch.ts
- **Docs**: CLAUDE.md sync — version bump, test count, removed stale `logger.ts` reference, added `chat-history.ts`

## [1.0.2] - 2026-04-25

### Changed
- **Dependencies**: Updated 9 packages within semver range (no breaking changes)
  - @typescript-eslint/* 8.56.1 → 8.59.0
  - @vitest/coverage-v8, vitest 4.0.18 → 4.1.5
  - dotenv 17.3.1 → 17.4.2
  - inquirer 13.3.0 → 13.4.2
  - lint-staged 16.3.1 → 16.4.0
  - ora 9.3.0 → 9.4.0
  - prettier 3.8.1 → 3.8.3

### Fixed
- 3 moderate vulnerabilities resolved via `npm audit fix`:
  - axios — Cloud Metadata Exfiltration via Header Injection Chain (GHSA-fvcv-3m26-pcqx)
  - brace-expansion — Zero-step ReDoS (GHSA-f886-m6hf-6m8v)
  - follow-redirects — Auth headers leaked to cross-domain redirects (GHSA-r4q5-vmmm-2653)

## [1.0.1] - 2026-04-24

### Added — First public open-source release on npm

#### Phase I Item 5 — HITL chat (Human-In-The-Loop)
- **HITL**: `chat_prompt` SSE event type + `onChatPrompt` callback in `MCPClient` (`src/client/mcp-client.ts`)
- **HITL**: `MCPClient.resumeAgent(url, correlationId, { value | values })` — POST to `/api/agent-resume`, streams the continuation
- **HITL**: `deposium chat --on-ambiguous=<prompt|fail|dump|pick-first>` (TTY-aware default)
- **HITL**: `inquirer` picker rendering for `type='choice'` and `type='confirm'` prompts
- **Tests**: 14 tests in `chat-hitl.test.ts` (mode dispatch, TTY defaults, resumeAgent POST shape, SSE chat_prompt parsing)
- **Docs**: `docs/guides/on-ambiguous-flag.md` — user-facing policy reference

#### Sprint secure-CLI-2026 — Security hardening
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

#### Open-source publication plumbing
- **Project**: LICENSE (MIT), SECURITY.md, CODE_OF_CONDUCT.md
- **Project**: GitHub Actions `publish.yml` — npm publish with provenance on tag `v*.*.*`
- **Project**: package.json `files` (scope tarball), `publishConfig.access=public`, `homepage`, `bugs`
- **Project**: Discord community link in security/conduct contacts
- **Cleanup**: Removed cross-repo references to private `deposium_MCPs`; rewrote git history via filter-repo to scrub names + paths from earlier commits

### Changed
- **Dependencies**: Major upgrades — conf 13→15, glob 11→13, mime-types 2→3, inquirer 12→13
- **Dependencies**: Patch/minor updates across the board
- **Dependencies**: Security overrides — minimatch >=10.2.4 (ReDoS), rollup >=4.59.0 (path traversal)
- **Node.js**: Minimum version bumped from 20 to 22 (engines field + CI)
- **Code quality**: All ESLint warnings resolved (67 → 0), `||` → `??` for nullish defaults
- **Code quality**: Removed dead logger module (344 LOC)
- **Tests**: 142 tests (was 137 pre-secure-CLI sprint)

### Fixed
- CVE fix: minimatch ReDoS (CVE-2026-26996)
- CVE fix: rollup path traversal
- CVE fix: axios `__proto__` DoS (GHSA-43fc-jf86-j433)
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
