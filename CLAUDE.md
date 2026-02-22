# CLAUDE.md - Deposium CLI

This file provides guidance to Claude Code (claude.ai/claude-code) when working with this repository.

## Project Overview

Deposium CLI is an enterprise-grade command-line interface for the Deposium MCP (Model Context Protocol) API. It provides 19 operational commands for document search, knowledge graph operations, AI workflows, and batch processing.

**Package:** `@deposium/cli` v1.0.0
**Runtime:** Node.js 22+ or Bun 1.0+
**Test Framework:** Vitest (137 tests)

## Common Commands

```bash
# Development
npm run dev              # Run CLI in development mode (tsx)
npm run build            # Compile TypeScript to dist/
npm run typecheck        # Type check without emitting

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report

# Code Quality
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier formatting

# Build binaries
npm run build:bun        # Build single executable
npm run build:all        # Build for Linux, macOS, Windows
```

## Architecture

```
src/
├── cli.ts                 # Main entry point, Commander.js setup
├── chat.ts                # Interactive chat mode
├── interactive.ts         # Interactive prompts
├── client/
│   └── mcp-client.ts      # MCP API client with retry logic
├── commands/              # Command implementations (19 commands)
│   ├── auth.ts            # Authentication (login/logout)
│   ├── config.ts          # Configuration management
│   ├── search.ts          # Multi-mode search
│   ├── graph.ts           # Knowledge graph operations
│   └── ...                # Other commands
├── utils/
│   ├── auth.ts            # Token management
│   ├── config.ts          # Config file handling
│   ├── command-helpers.ts # Shared command utilities
│   ├── formatter.ts       # Output formatting
│   ├── logger.ts          # Structured logging
│   └── errors.ts          # Error types
├── types/                 # TypeScript declarations
└── __tests__/             # Unit and integration tests
    └── commands/          # Command integration tests
```

## Key Patterns

### Command Initialization

All commands use the `initializeCommand()` helper from `src/utils/command-helpers.ts`:

```typescript
import { initializeCommand, withErrorHandling } from '../utils/command-helpers.js';

export const myCommand = new Command('my-command').action(
  withErrorHandling(async (options) => {
    const { client, config } = await initializeCommand();
    // Command logic here
  })
);
```

### Error Handling

- Use `withErrorHandling()` wrapper for all command actions
- MCPClient has built-in retry logic with exponential backoff
- Errors are sanitized before display (no stack traces in production)

### Configuration Priority

1. Environment variables (`DEPOSIUM_API_KEY`, `DEPOSIUM_URL`, etc.)
2. Config file (`~/.deposium/config.json`)
3. Interactive prompts

### Security Requirements

- HTTPS is enforced in production (non-localhost URLs)
- API keys stored in user config directory
- JSON parsing uses Zod validation (`safeParseJSON`)
- No hardcoded credentials

## Testing Guidelines

- Tests located in `src/__tests__/` and `src/__tests__/commands/`
- Use `vi.mock()` for external dependencies
- MCPClient should be mocked in command tests
- Run tests before committing: `npm test`

## Environment Variables

| Variable                  | Description                   | Default                 |
| ------------------------- | ----------------------------- | ----------------------- |
| `DEPOSIUM_API_KEY`        | API authentication key        | -                       |
| `DEPOSIUM_URL`            | Deposium server URL           | `http://localhost:3003` |
| `DEPOSIUM_MCP_DIRECT_URL` | Direct MCP URL (chat stream)  | `http://localhost:4001` |
| `DEPOSIUM_TENANT`         | Default tenant ID             | -                       |
| `DEPOSIUM_SPACE`          | Default space ID              | -                       |
| `DEPOSIUM_OUTPUT`         | Default output format         | `table`                 |
| `DEPOSIUM_SILENT`         | Suppress non-essential output | `false`                 |
| `LOG_LEVEL`               | Logging level                 | `info`                  |

## Code Style

- Prefer nullish coalescing (`??`) over logical OR (`||`) for defaults
- Use strict TypeScript types (avoid `any`)
- Follow existing patterns in similar commands
- Add JSDoc comments to exported functions
- Keep cyclomatic complexity below 15

## Documentation

- Main docs in `docs/` directory
- `ROADMAP.md` - Vision and planned features
- `docs/CHANGELOG.md` - Version history
- `docs/guides/configuration.md` - Config guide
- `docs/guides/best-practices.md` - Development tips

<!-- gitnexus:start -->

# GitNexus MCP

This project is indexed by GitNexus as **deposium_CLI** (250 symbols, 818 relationships, 20 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task                                         | Read this skill file                               |
| -------------------------------------------- | -------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/refactoring/SKILL.md`     |

## Tools Reference

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `cypher`         | Raw graph queries (read `gitnexus://repo/{name}/schema` first)           |
| `list_repos`     | Discover indexed repos                                                   |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource                                       | Content                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `gitnexus://repo/{name}/context`               | Stats, staleness check                    |
| `gitnexus://repo/{name}/clusters`              | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members                              |
| `gitnexus://repo/{name}/processes`             | All execution flows                       |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace                        |
| `gitnexus://repo/{name}/schema`                | Graph schema for Cypher                   |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
