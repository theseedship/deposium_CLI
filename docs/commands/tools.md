> Revision: 2026-11-09

# Tools Command

The `tools` command allows you to list and explore all available tools exposed by the connected Deposium MCP server.

## Usage

```bash
deposium tools [options]
```

## Options

- `-c, --category <name>`: Filter tools by category (e.g., `search`, `graph`, `smart`).
- `-s, --search <term>`: Search for tools by name or description.
- `--json`: Output the full list as raw JSON.

## Output

The command displays a categorized table of tools with their descriptions.

`--json` writes only the result array to stdout, including `[]` for an empty
catalogue. Category filters recognize both legacy names such as `search_hub`
and the current facade name `deposium_search`.
