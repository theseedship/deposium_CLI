# Deposium CLI - Roadmap

Enterprise-grade CLI for Deposium MCP API.

## Current State (v1.0.0)

| Metric           | Status         |
| ---------------- | -------------- |
| Commands         | 19 operational |
| Tests            | 137 (Vitest)   |
| Security Score   | 9/10           |
| Production Ready | Yes            |

### Core Features

- MCP API integration with 82+ tools
- Semantic, full-text, fuzzy, and graph search
- Interactive chat mode with streaming
- Knowledge graph operations
- Batch document uploads
- DSPy and LeanRAG integration

## Short-term (v2.1)

- [ ] Plugin system for custom commands
- [ ] Enhanced batch operations
- [ ] Improved error messages with suggestions
- [ ] Tab completion support

## Medium-term (v2.2)

- [ ] Interactive TUI mode (full-screen interface)
- [ ] Offline mode with local cache and sync
- [x] Multi-file batch processing
- [ ] Custom output templates
- [ ] WebSocket support for real-time updates

## Long-term (v3.0)

- [ ] Multi-tenant management UI
- [ ] Configuration profiles (dev/staging/prod)
- [ ] Performance dashboard
- [ ] Self-hosted MCP server support
- [ ] API key rotation utilities

---

## Best Practices

### Configuration

| Practice          | Description                                           |
| ----------------- | ----------------------------------------------------- |
| Use HTTPS         | Always use `https://` URLs in production              |
| Env vars priority | `DEPOSIUM_API_KEY` > config file > interactive prompt |
| Silent mode       | Use `--silent` or `DEPOSIUM_SILENT=true` in CI/CD     |

### Development

```bash
# Before every commit
npm test

# Check types
npm run typecheck

# Lint and format
npm run lint:fix
```

### Security

| Rule                                   | Why                                   |
| -------------------------------------- | ------------------------------------- |
| Never commit `~/.deposium/config.json` | Contains API keys                     |
| Validate inputs with Zod               | Prevents injection attacks            |
| Use `--silent` in scripts              | Avoids leaking sensitive data to logs |

### Performance

| Tip                  | Impact                                |
| -------------------- | ------------------------------------- |
| Use `--top-k` wisely | Lower values = faster responses       |
| Batch uploads        | Use `upload-batch` for multiple files |
| Enable caching       | Set appropriate cache headers         |

---

## Environment Variables

| Variable           | Description            | Default                 |
| ------------------ | ---------------------- | ----------------------- |
| `DEPOSIUM_API_KEY` | API authentication key | -                       |
| `DEPOSIUM_URL`     | Deposium server URL    | `http://localhost:3003` |
| `DEPOSIUM_TENANT`  | Default tenant ID      | -                       |
| `DEPOSIUM_SPACE`   | Default space ID       | -                       |
| `DEPOSIUM_OUTPUT`  | Default output format  | `table`                 |
| `DEPOSIUM_SILENT`  | Suppress output        | `false`                 |
| `LOG_LEVEL`        | Logging level          | `info`                  |

---

## Testing Strategy

### Unit Tests

```
src/__tests__/
  auth.test.ts        # Authentication module
  config.test.ts      # Configuration management
  formatter.test.ts   # Output formatting
  mcp-client.test.ts  # API client
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
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Contributing

See [docs/development/contributing.md](docs/development/contributing.md) for guidelines.

### Quick Start

1. Fork and clone
2. `npm install`
3. Create feature branch
4. Write tests
5. Submit PR

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.
