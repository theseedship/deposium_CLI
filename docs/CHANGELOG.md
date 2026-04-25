> Revision: 2026-04-25

# Changelog

All notable changes to the Deposium CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.6] - 2026-04-25

### Changed (internal refactor — no user-visible changes)

- `src/client/mcp-client.ts` split into 4 files for maintainability:
  - `src/client/types.ts` — all public type/interface declarations
    (`MCPTool`, `MCPSpace`, `MCPDocument`, `SSE*`, etc.)
  - `src/client/auth-error.ts` — `MCPAuthError`, `MCPAuthErrorCode`,
    `buildAuthError`
  - `src/client/internals.ts` — retry classification, request-id
    generation, axios-error normalization helpers
  - `src/client/mcp-client.ts` — `MCPClient` class only
- `mcp-client.ts` re-exports every moved symbol so existing imports
  (`import { MCPTool } from './client/mcp-client'`) keep working without
  changes. The new files are an additional import surface, not a breaking
  one.
- `MCPClient.authenticatedRequest` cyclomatic complexity reduced from 21
  to under the 15 ceiling by extracting `dispatchHttp` (HTTP method
  dispatch) and `throwForKnownAxiosError` (ECONNREFUSED / 401 / 404
  mapping) helpers.
- `MCPClient.parseSSEStream` no longer uses a non-null assertion on
  `response.body` — narrowed via an early-throw check.

### Tests

- New "Wire format guard" describe block in `mcp-client.test.ts` —
  pins HTTP method + path + body shape for all 13 public client methods
  (`callTool`, `listSpaces`, `listDocuments`, `getDocument`,
  `deleteDocument`, `listApiKeys`, `createApiKey`, `deleteApiKey`,
  `rotateApiKey`, `getApiKeyUsage`, plus query-string edge cases).
  Refactor was performed *after* this guard landed — server contract
  preserved bit-for-bit.
- 328 → 340 tests, all green.

## [1.1.5] - 2026-04-25

### Fixed

- `ensureAuthenticated()` now honors `DEPOSIUM_API_KEY` env var as a fast
  path, mirroring `getConfig().apiKey` resolution priority. Previously the
  helper checked only the stored credential, so CI/CD usage with env-only
  config triggered the interactive prompt despite the key being available.
  ([src/utils/auth.ts](../src/utils/auth.ts))

### Changed

- `deposium auth status` now displays the active key **source** —
  `DEPOSIUM_API_KEY env var` (with a "overrides stored credentials" hint) or
  `stored credentials`. Clarifies which credential is in effect when both
  are set.
- `docs/commands/auth.md` rewritten — was stale (Feb 2025 revision, referenced
  the legacy `~/.deposium/config.json` API key path before credentials store
  separation, wrong header case `X-Api-Key` instead of `X-API-Key`).
- `docs/guides/configuration.md` — new "Resolution Priority" section under
  Authentication clarifying env-var-wins behavior and the `auth logout`
  caveat (env var is not unset by logout).

### Tests

- 4 new tests in `auth.test.ts` covering the env-var fast path: short-circuit,
  whitespace trimming, env-over-stored priority, empty-env fallback to stored.
- 324 → 328 tests, all green.

## [1.1.3] - 2026-04-25

### Added — Structured MCP auth errors

The CLI now exposes structured authentication errors when the server returns
the new `/api/cli/mcp` 401 shape (deposium_solid commit `7af3a6a02`):

```json
{ "error": "MCP Auth Error", "message": "Invalid API key format",
  "error_code": "format_invalid", "hint": "...", "docs": "..." }
```

- New exported class `MCPAuthError extends Error` with `errorCode`, `hint`,
  `docsUrl` properties — switch on `errorCode` for stable programmatic handling.
- New exported type `MCPAuthErrorCode` — stable enum: `key_missing`,
  `format_invalid`, `key_invalid`, `permission_denied`, `rate_limited`,
  `auth_unavailable`, `auth_timeout`, `auth_internal_error`, `unknown`.
- New helper `buildAuthError(responseData)` — internal, used in 5 401
  handlers (`callTool`, `listTools`, `health`, `listSpaces`,
  `authenticatedRequest`, SSE `chatStream`/`resumeAgent`). Returns `MCPAuthError`
  for structured responses, falls back to plain `Error` for legacy shapes.
- Error `message` includes `hint` (prefixed 💡) and `docs` URL (📖) — printable
  as-is for end-user output.
- `docs/development/error-codes.md` — full reference + switch-pattern example.

### Changed
- 5 inline 401 handlers in `src/client/mcp-client.ts` consolidated to use
  `buildAuthError()` — was duplicated 5x with slightly different fallbacks.

### Tests
- 4 new tests in `mcp-client.test.ts` covering structured/legacy/SSE paths
- 320 → 324 tests, all green

## [1.1.2] - 2026-04-25

### Removed
- `docs/sprints/secure-CLI-2026.md` — internal sprint planning doc, archived to deposium_MCPs
- `CODEBASE_ANALYSIS.md` — internal dead-code review note from PR #5, archived to deposium_MCPs

## [1.1.1] - 2026-04-25

### Added
- `docs/guides/best-practices.md` — new "Self-service Workflows" section with 4 end-to-end recipes (onboarding, API key lifecycle, inventory cleanup, pre-flight health check)

## [1.1.0] - 2026-04-25

### Added — Self-service management (3 new commands)

#### `deposium space` — workspace management

- `space list` (alias `ls`) — `GET /api/spaces`
- `space show <id>` (alias `info`) — filter list client-side (server has no `GET /api/spaces/:id` yet)
- `space create <name> [--description]` (alias `new`) — MCP `deposium_admin` macro with `operation=create_space` (experimental — depends on MCP layer accepting CLI keys)

#### `deposium files` — document management

- `files list [--space <id>] [--limit N] [--offset N]` (alias `ls`) — `GET /api/v1/documents/`
- `files show <id>` (alias `info`) — `GET /api/v1/documents/:id`
- `files check <id>` (alias `validate`) — MCP `check_file` tool (experimental, same caveat as `space create`)
- `files rm <id>` (alias `delete`) — `DELETE /api/v1/documents/:id` with inquirer confirmation (use `-y` to skip)

#### `deposium api-keys` — server-side API key management (plan-gated)

- `api-keys list` (alias `ls`) — `GET /api/api-keys`
- `api-keys create -n <name> [-s scopes] [-t tier]` (alias `new`) — `POST /api/api-keys` with one-time secret display
- `api-keys delete <id>` (alias `rm`) — `DELETE /api/api-keys/:id` with confirmation
- `api-keys rotate <id>` — `POST /api/api-keys/:id/rotate` with confirmation + new-secret display
- `api-keys usage <id>` — `GET /api/api-keys/:id/usage`

### Added — Client API surface

- 5 new public interfaces in `src/client/mcp-client.ts`: `MCPSpace`, `MCPDocument`, `MCPDocumentDetail`, `MCPDocumentPagination`, `MCPApiKey`, `MCPApiKeyCreated`, `MCPApiKeyUsage`
- 9 new client methods: `listSpaces`, `listDocuments`, `getDocument`, `deleteDocument`, `listApiKeys`, `createApiKey`, `deleteApiKey`, `rotateApiKey`, `getApiKeyUsage`
- Internal `authenticatedRequest` helper that factorizes the retry-on-transient-errors loop + 401/404 error mapping (used by all new methods; older inline-retry methods kept as-is for now)

### Added — Testing

- 50 new tests across `space.test.ts` (14), `files.test.ts` (19), `api-keys.test.ts` (17)
- Full suite: 270 → **320 tests** in 27 test files
- `vitest.config.ts` with `testTimeout: 15000` (vitest 4.x default of 5s was tight under load)

### Added — Documentation

- `docs/commands/space.md`, `docs/commands/files.md`, `docs/commands/api-keys.md` — full per-command references
- README + `docs/commands/README.md` updated for the 3 new commands
- ROADMAP.md "Self-service management" section + v1.2 candidates moved (`files download`, connector commands, etc.)

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
