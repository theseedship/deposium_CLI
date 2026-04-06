> Revision: 2026-04-06

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

### Use Silent Mode in CI/CD

```bash
# Avoid spinner output in CI
DEPOSIUM_SILENT=true deposium search "query" --format json
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
DEPOSIUM_URL=https://api.yourcompany.com

# Load in scripts
source .env
deposium search "query"
```

### TLS Enforcement

```bash
# HTTPS is enforced for non-localhost URLs
DEPOSIUM_URL=https://api.deposium.com  # Good

# HTTP to non-localhost is rejected by default
# DEPOSIUM_URL=http://api.deposium.com  # Throws error

# Override for staging/self-signed certs (with warning)
deposium --insecure health
# Or: DEPOSIUM_INSECURE=true deposium health
```

### Encrypted Configuration

Configuration files (`~/.deposium/config.json`, `~/.deposium/credentials`)
are encrypted with AES-256-GCM. API keys are stored in a separate
`credentials` file (chmod 0600) to prevent accidental exposure.

---

## Development Workflow

### Testing Changes

```bash
# Run full test suite before committing
npm test

# Run specific test file
npm test -- src/__tests__/auth.test.ts

# Watch mode during development
npm run test:watch
```

### Type Safety

```bash
# Check types before building
npm run typecheck

# Build with type checking
npm run build
```

### Code Style

```bash
# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format
```

---

## Error Handling

### Common Error Solutions

| Error                              | Solution                                          |
| ---------------------------------- | ------------------------------------------------- |
| `Authentication failed`            | Check API key, run `deposium auth`                |
| `Connection refused`               | Verify server URL, check network                  |
| `Insecure HTTP connection refused` | Use HTTPS or pass `--insecure`                    |
| `Rate limit exceeded (429)`        | Wait for Retry-After period, or upgrade plan tier |
| `Timeout exceeded`                 | Check server and network                          |

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
ENV DEPOSIUM_URL="https://api.deposium.com"
ENV LOG_LEVEL="info"

RUN npm install -g @deposium/cli
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

## Output Formats

```bash
# Machine-parseable JSON (ideal for scripts/CI)
deposium search "query" --format json | jq .

# Table (default, human-readable)
deposium search "query" --format table

# Markdown
deposium search "query" --format markdown
```
