# Changelog

All notable changes to the Deposium CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- MindsDB integration commands
- Macro management commands

## [1.2.0] - 2025-12-21

### Added
- **Benchmark Commands**
  - `deposium benchmark list` - List available benchmark categories
  - `deposium benchmark run` - Run LLM benchmarks
  - `deposium benchmark corpus` - Evaluate corpus quality
  - `deposium benchmark compare` - Compare model performance

### Fixed
- Async cache service initialization in MCP client

## [1.1.0] - 2025-11-16

### Added
- **Space Management**
  - `deposium spaces list` - List all spaces
  - `deposium spaces create` - Create new space
  - `deposium spaces delete` - Delete space

- **Document Operations**
  - `deposium docs upload` - Upload documents
  - `deposium docs list` - List documents in space
  - `deposium docs search` - Search across documents

### Changed
- Improved error messages with actionable suggestions
- Added progress indicators for long operations

## [1.0.0] - 2025-10-01

### Added
- **Initial Release**
  - Authentication (`deposium login`, `deposium logout`)
  - Configuration management (`deposium config`)
  - MCP tool invocation via HTTP
  - Multiple output formats (json, table, markdown)
  - Auto-update mechanism
  - Shell completions (bash, zsh, fish)

---

## Links

- [README](README.md) - Installation and usage guide
- [Commands Reference](src/commands/) - Command implementations
