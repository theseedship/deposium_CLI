> Revision: 2026-04-25

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

## Self-service Workflows

End-to-end recipes combining the management commands (`space`, `files`,
`api-keys`) with the data commands (`upload-batch`, `search`).

### Onboarding a new corpus

```bash
# 1. Create a dedicated space for the project
SPACE_ID=$(deposium space create "Q1 Reports" \
  --description "Quarterly financial reports" \
  --format json --silent | jq -r '.id')

# 2. Bulk-upload the source documents
deposium upload-batch "./reports/*.pdf" --space-id "$SPACE_ID"

# 3. Verify ingestion succeeded
deposium files list --space "$SPACE_ID" --format json --silent \
  | jq '[.[] | {id, file_name, doc_status}]'

# 4. Sanity-check one document was processed
DOC_ID=$(deposium files list --space "$SPACE_ID" --limit 1 \
  --format json --silent | jq -r '.[0].id')
deposium files check "$DOC_ID"

# 5. Run a smoke search to confirm the corpus is queryable
deposium search "executive summary" --space "$SPACE_ID" --top-k 3
```

### API key lifecycle for CI/CD

```bash
# 1. Mint a scoped read-only key for GitHub Actions
deposium api-keys create \
  --name "github-actions-prod" \
  --scopes "read" \
  --tier pro \
  --format json --silent > /tmp/new-key.json

#    The secret is shown ONCE in the JSON output — save it.
SECRET=$(jq -r '.secret // .key' /tmp/new-key.json)
KEY_ID=$(jq -r '.id' /tmp/new-key.json)

# 2. Push the secret into GitHub repo secrets
gh secret set DEPOSIUM_API_KEY --body "$SECRET"
shred -u /tmp/new-key.json    # nuke the file

# 3. Quarterly: audit which keys exist + their last use
deposium api-keys list

# 4. Rotate before the 90-day mark
deposium api-keys rotate "$KEY_ID" --yes --format json --silent \
  | jq -r '.secret' | gh secret set DEPOSIUM_API_KEY

# 5. Decommission when the project ends
deposium api-keys delete "$KEY_ID" --yes
```

### Inventory cleanup

```bash
# 1. Find empty spaces (no files) — candidates for deletion
deposium space list --format json --silent | jq '.[] | .id' \
  | while read id; do
      count=$(deposium files list --space "$id" --format json --silent \
              | jq 'length')
      [ "$count" = "0" ] && echo "Empty: $id"
    done

# 2. Find failed-status documents to retry or remove
deposium files list --format json --silent \
  | jq '.[] | select(.doc_status == "failed") | .id'

# 3. Bulk-delete stale documents (with confirmation per doc)
deposium files list --format json --silent \
  | jq -r '.[] | select(.created_at < "2025-01-01") | .id' \
  | while read id; do
      deposium files rm "$id"   # interactive confirmation per doc
    done

# 4. Or skip prompts when you're sure (use carefully)
deposium files rm 1234 --yes
```

### Pre-flight health check

```bash
# Run before a long batch job to fail fast on misconfig
deposium health --silent || exit 1
deposium space list --silent --format json | jq 'length' || exit 1

# Now safe to start the actual work
deposium upload-batch "./big-corpus/*.pdf" --space-id "$SPACE_ID"
```

---

## Security Guidelines

### API Key Management

```bash
# Good: Environment variable
export DEPOSIUM_API_KEY="dep_live_..."

# Bad: Command line argument (visible in history)
# deposium --api-key "your-key" search "query"  # DON'T DO THIS
```

### Use a user-key, never a service-key

Deposium issues two key families: user-keys (`dep_live_*` / `dep_test_*`,
provisioned via the Solid UI) and service-keys (`dep_svc_*`, issued by
`edge_runtime` for server-side agent traffic). **The CLI rejects
`dep_svc_*` keys at startup** — service-keys belong to long-running
server processes (Mastra agents, internal orchestrators), not to a
human's terminal. A leaked user-key revokes one user; a leaked
service-key compromises the agent fleet.

If your pipeline imports `DEPOSIUM_API_KEY` from a shared secret store,
verify the upstream value is a user-key before plumbing it through.

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
