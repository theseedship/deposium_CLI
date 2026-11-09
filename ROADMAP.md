# Deposium CLI - Roadmap

> Revision: 2026-11-09

Enterprise-grade CLI for Deposium MCP API. Open-source on npm: [`@deposium/cli`](https://www.npmjs.com/package/@deposium/cli).

## Current State

CLI 1.8.0 is public on npm. The 1.9.0 candidate adds live chat commands and
roomier menus; publication is confirmed by `npm view @deposium/cli version`.
See [qualification](docs/guides/qualification.md) for evidence and limits, and
[the changelog](docs/CHANGELOG.md) for shipped behavior. Historical coverage
percentages are not a current release qualification.

### Core Features

- MCP API integration with the authenticated public server catalogue
- Semantic (vector), full-text (BM25), and graph search
- Interactive chat mode with streaming via Edge Runtime + HITL `--on-ambiguous`
- Knowledge graph operations
- Batch document uploads
- DSPy and LeanRAG integration

### Self-service management (v1.1)

- `space` — list, show, create workspaces (delete pending server support)
- `files` — list, show, validate, rm documents
- `api-keys` — list, create, delete, rotate, usage stats (plan-gated)

### Security (completed: secure-CLI-2026)

- Config encrypted AES-256-GCM (Conf encryptionKey, scryptSync)
- API key isolated in `~/.deposium/credentials` (encrypted, chmod 0600)
- TLS enforced on non-localhost URLs (`--insecure` to override)
- Chat streams routed via Edge Runtime gateway (auth + rate-limiting)

## Short-term (v1.2 candidates)

- [x] **`deposium validate` command** (dossier validation) —
      client-side shipped: types + SSE renderer + HITL form + multipart
      upload + `validateDossier` orchestrator + `--json` mode + 79 unit
      tests against the frozen `validate:*` event contract. End-to-end
      integration with the live server-side macro lands once that
      backend rolls out.
- [ ] `files download` once the server exposes API-key auth on `/api/download/*`
- [ ] `space delete` + `space update` once MCP exposes those operations
- [ ] Pre-upload validation pass via `check_file` integrated into `upload-batch`
- [x] Live slash-command completion inside Chat (1.9.0 candidate).
- [ ] Shell-level completion for command-line arguments (separate from Chat).
- [ ] Connector commands (`deposium connectors data.gouv.fr`, `clinical`, `notion`, `leexi`)

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

| Variable            | Description                           | Default                    |
| ------------------- | ------------------------------------- | -------------------------- |
| `DEPOSIUM_API_KEY`  | API authentication key                | -                          |
| `DEPOSIUM_URL`      | Deposium server URL                   | `https://app.deposium.ai`  |
| `DEPOSIUM_EDGE_URL` | Edge Runtime gateway URL (chat, auth) | `https://edge.deposium.ai` |
| `DEPOSIUM_INSECURE` | Allow HTTP to non-localhost (`true`)  | `false`                    |
| `DEPOSIUM_TENANT`   | Default tenant ID                     | -                          |
| `DEPOSIUM_SPACE`    | Default space ID                      | -                          |

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
npm test               # All tests (429)
npm run test:coverage  # With coverage
npm run test:watch     # Watch mode
```

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.
