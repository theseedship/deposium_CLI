# Best Practices

Tips and recommendations for using Deposium CLI effectively.

## Search Optimization

### Choose the Right Search Mode

| Mode                 | Use When               | Example                          |
| -------------------- | ---------------------- | -------------------------------- |
| `--vector` (default) | Semantic similarity    | "documents about climate change" |
| `--fts`              | Exact keyword matching | "error code 500"                 |
| `--fuzzy`            | Typo tolerance         | "developement" (typo)            |
| `--graph`            | Relationship queries   | "connected to X"                 |

### Combine Modes for Best Results

```bash
# Semantic + full-text for comprehensive search
deposium search "machine learning" --vector --fts

# Fuzzy for user-facing search
deposium search "$USER_INPUT" --fuzzy --fts
```

### Optimize Result Count

```bash
# Quick check (fewer results, faster)
deposium search "query" --top-k 5

# Comprehensive analysis (more results)
deposium search "query" --top-k 50
```

---

## Performance Tips

### Batch Operations

```bash
# Upload multiple files at once
deposium upload-batch ./documents/*.pdf

# Instead of
for file in ./documents/*.pdf; do
  deposium upload "$file"  # Slower!
done
```

### Use Silent Mode in Scripts

```bash
# CI/CD pipelines
deposium search "query" --silent --format json | jq .

# Avoid spinner and progress output
DEPOSIUM_SILENT=true deposium upload file.pdf
```

### Set Appropriate Timeouts

```bash
# For large operations
export DEPOSIUM_TIMEOUT=600000  # 10 minutes

# Quick health checks
deposium health --timeout 5000
```

---

## Security Guidelines

### API Key Management

```bash
# Good: Environment variable
export DEPOSIUM_API_KEY="your-key"

# Bad: Command line argument (visible in history)
# deposium --api-key "your-key" search "query"  # DON'T DO THIS
```

### Use .env Files

```bash
# .env (add to .gitignore!)
DEPOSIUM_API_KEY=your-key
DEPOSIUM_API_URL=https://api.yourcompany.com

# Load in scripts
source .env
deposium search "query"
```

### Validate URLs

```bash
# Always use HTTPS in production
DEPOSIUM_API_URL=https://api.deposium.com  # Good
# DEPOSIUM_API_URL=http://api.deposium.com  # Rejected in production
```

---

## Development Workflow

### Testing Changes

```bash
# Run full test suite before committing
pnpm test

# Run specific test file
pnpm test -- auth.test.ts

# Watch mode during development
pnpm test -- --watch
```

### Type Safety

```bash
# Check types before building
pnpm typecheck

# Build with type checking
pnpm build
```

### Code Style

```bash
# Auto-fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

---

## Error Handling

### Common Error Solutions

| Error                   | Solution                           |
| ----------------------- | ---------------------------------- |
| `Authentication failed` | Check API key, run `deposium auth` |
| `Connection refused`    | Verify server URL, check network   |
| `Timeout exceeded`      | Increase `DEPOSIUM_TIMEOUT`        |
| `Invalid JSON`          | Check input format with `--help`   |

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug deposium search "query"

# View full error stack traces
DEBUG=true deposium search "query"
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Deposium Search
  env:
    DEPOSIUM_API_KEY: ${{ secrets.DEPOSIUM_API_KEY }}
  run: |
    deposium search "test query" --silent --format json > results.json
```

### Docker

```dockerfile
ENV DEPOSIUM_API_KEY=""
ENV DEPOSIUM_API_URL="https://api.deposium.com"
ENV LOG_LEVEL="info"

RUN npm install -g deposium-cli
CMD ["deposium", "health"]
```

### Kubernetes

```yaml
env:
  - name: DEPOSIUM_API_KEY
    valueFrom:
      secretKeyRef:
        name: deposium-secrets
        key: api-key
```

---

## Interactive Mode Tips

### Keyboard Shortcuts

| Key       | Action                   |
| --------- | ------------------------ |
| `Tab`     | Autocomplete command     |
| `Up/Down` | Navigate history         |
| `Ctrl+C`  | Cancel current operation |
| `Ctrl+D`  | Exit interactive mode    |

### Quick Commands

```
> /help         # Show all commands
> /config       # View current configuration
> /clear        # Clear screen
> /exit         # Exit interactive mode
```

---

## Logging Configuration

### Log Levels

```bash
# Debug (verbose)
LOG_LEVEL=debug deposium search "query"

# Info (default)
LOG_LEVEL=info deposium search "query"

# Warn (minimal)
LOG_LEVEL=warn deposium search "query"

# Error only
LOG_LEVEL=error deposium search "query"
```

### Log to File

```bash
# Enable file logging
LOG_FILE=true deposium search "query"

# Custom log path
LOG_PATH=/var/log/deposium.log deposium search "query"
```

### JSON Logs (for parsing)

```bash
LOG_JSON=true deposium search "query" 2>&1 | jq .
```
