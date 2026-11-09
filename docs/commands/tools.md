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
- `--show <name>`: Show the complete description and top-level input parameters of one exact tool name (CLI 1.7.1+).
- `--json`: Output the full list as raw JSON, or one complete entry when combined with `--show`.

## Read an individual tool (CLI 1.7.1+)

```bash
deposium tools --show deposium_search
deposium tools --show deposium_search --json
```

The readable view preserves the complete server description, including its later
instructions. It shows the reported top-level parameter types, required/optional
status, allowed values and defaults when supplied. Nested or conditional constraints
remain in the complete input schema available with `--json`.

In `deposium interactive`, choose **Tools**, select a tool, then read its full
reference. You can inspect another tool or return to the main menu. This replaces
the previous menu table that cut each description at 100 characters.

This is a reference browser. It does not invoke the selected tool, test its rights,
run a model or modify data. For document questions, return to **Chat** or **Search**.
Descriptions come from the connected server; a model name mentioned in one is not
proof of which model an actual request used. Availability and authorization remain
server decisions at execution time.

`--show` requires an exact name from the returned catalogue and cannot be combined
with `--search` or `--category`. An unknown name is an error, including when the
catalogue is empty. Without `--show`, `--json` retains the existing array format;
with `--show`, it returns the original single tool object, including its schema.

## Output

Without `--show`, the command displays a categorized table of tools with their descriptions.

`--json` writes only the result array to stdout, including `[]` for an empty
catalogue. Category filters recognize both legacy names such as `search_hub`
and the current facade name `deposium_search`.
JSON mode never prompts for credentials; use `deposium auth login` separately if
authentication is required. Authentication diagnostics go to stderr.
