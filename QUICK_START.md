# 🚀 Deposium CLI - Quick Start Guide

## Prerequisites

- Fullstack running: `cd ~/dev/deposium_fullstack && make up`
- MCP server running on port 4001
- CLI built: `cd ~/dev/deposium_CLI && npm run build`

## Quick Commands

### Health Check

```bash
deposium health
```

### Search

```bash
# Basic search
deposium search "your query" --tenant test --space default

# Vector search
deposium search "semantic query" --vector

# JSON output
deposium search "query" --format json
```

### Graph Analysis

```bash
deposium graph components --tenant test --space default
```

### Authentication

```bash
deposium auth status
deposium auth login
```

### Configuration

```bash
deposium config get
deposium config set mcp-url http://localhost:4001
```

## Current Configuration

- **MCP URL:** http://localhost:4001
- **API Key:** 06759d85... (configured in ~/.deposium/config.json)
- **Default Tenant:** test
- **Default Space:** default

## Test Script

```bash
cd ~/dev/deposium_CLI
./test-mcp-tools.sh
```

## Interactive Mode

```bash
deposium interactive
```

## Available Tools (20+)

- system_health
- search_hub
- smart_analyze
- smart_suggest
- smart_elicit
- leanrag_analyze
- graph_components
- vector_search
- corpus_stats
- And more!

## Documentation

- `MCP_CLI_TEST_RESULTS.md` - Full test results
- `DEMO_COMPLETE.md` - Integration summary
- `QUICK_START.md` - This file

## Support

- Health issues? Check: `deposium health`
- Auth issues? Check: `deposium auth status`
- Need help? Run: `deposium --help`

---

**Status:** ✅ Fully Operational
**Last Updated:** 2025-10-23
