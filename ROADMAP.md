# Deposium CLI - Roadmap

> Revision: 2026-04-24

Enterprise-grade CLI for Deposium MCP API.

## Current State (v1.0.0)

| Metric           | Status         |
| ---------------- | -------------- |
| Commands         | 19 operational |
| Tests            | 142 (Vitest)   |
| Security Score   | 10/10          |
| Production Ready | Yes            |

### Core Features

- MCP API integration with 128+ tools
- Semantic, full-text, fuzzy, and graph search
- Interactive chat mode with streaming via Edge Runtime
- Knowledge graph operations
- Batch document uploads
- DSPy and LeanRAG integration

### Security (completed: secure-CLI-2026)

- Config encrypted AES-256-GCM (Conf encryptionKey, scryptSync)
- API key isolated in `~/.deposium/credentials` (encrypted, chmod 0600)
- TLS enforced on non-localhost URLs (`--insecure` to override)
- Chat streams routed via Edge Runtime gateway (auth + rate-limiting)

## Short-term (v1.1)

- [ ] Session compaction (token-aware chat history, inspired by claw-code)
- [ ] Chat session persistence (resume after restart)
- [ ] `/compact`, `/export`, `/cost` chat commands
- [ ] Tab completion support

## Medium-term (v1.2)

- [ ] Pre/post command hooks (shell-based, JSON stdin, exit codes)
- [ ] Project-level config (`.deposium/config.json` in project root)
- [ ] Enhanced batch operations
- [ ] Custom output templates

## Long-term (v2.0)

- [ ] Interactive TUI mode (full-screen interface)
- [ ] Offline mode with local cache and sync
- [ ] Multi-tenant management UI
- [ ] Configuration profiles (dev/staging/prod)
- [ ] API key rotation utilities

---

## Environment Variables

| Variable            | Description                           | Default                 |
| ------------------- | ------------------------------------- | ----------------------- |
| `DEPOSIUM_API_KEY`  | API authentication key                | -                       |
| `DEPOSIUM_URL`      | Deposium server URL                   | `http://localhost:3003` |
| `DEPOSIUM_EDGE_URL` | Edge Runtime gateway URL (chat, auth) | `http://localhost:9000` |
| `DEPOSIUM_INSECURE` | Allow HTTP to non-localhost (`true`)  | `false`                 |
| `DEPOSIUM_TENANT`   | Default tenant ID                     | -                       |
| `DEPOSIUM_SPACE`    | Default space ID                      | -                       |
| `DEPOSIUM_OUTPUT`   | Default output format                 | `table`                 |
| `DEPOSIUM_SILENT`   | Suppress non-essential output         | `false`                 |

> `DEPOSIUM_MCP_URL` and `DEPOSIUM_MCP_DIRECT_URL` are deprecated.

---

## Testing Strategy

### Unit Tests

```
src/__tests__/
  auth.test.ts              # Authentication module
  config.test.ts            # Configuration + encryption + credentials
  formatter.test.ts         # Output formatting
  mcp-client.test.ts        # API client + SSE streaming + 429
  command-helpers.test.ts   # Command initialization + error handling
```

### Integration Tests

```
src/__tests__/commands/
  search.test.ts      # Search command
  health.test.ts      # Health check
  config.test.ts      # Config subcommands
  tools.test.ts       # Tools listing
```

### Running Tests

```bash
npm test               # All tests (142)
npm run test:coverage  # With coverage
npm run test:watch     # Watch mode
```

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.
