> Revision: 2026-11-09

# Interactive terminal guide

The menu described here requires **CLI 1.6.1 or newer**. Compare `deposium --version`
with `npm view @deposium/cli version`: a merged change may still await npm approval.

After `deposium auth login`, run `deposium interactive` (or `deposium i`). Your
stored key is reused. No tenant or space UUID needs to be memorized for the menu.

## Choose an operation

| Operation         | Purpose                                                                   | What to expect                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat              | Ask questions about documents in an accessible space.                     | A conversation, answer, citations and verification notices.                                                                                                                                     |
| Search            | Find passages in an accessible space.                                     | Search results, not a generated answer.                                                                                                                                                         |
| Corpus statistics | Inspect the selected space's indexed corpus.                              | Counts reported by the server, including documents, pages and graph data when available. Counts are not a content-quality score or proof that every document finished indexing.                 |
| Health            | Inspect the connected service's health response.                          | Reported status, including degraded/unknown states; a successful HTTP request is not proof that all services are healthy.                                                                       |
| Tools             | Inspect the server's tool catalogue.                                      | CLI 1.7.1+: select a tool to read its complete description and input parameters, then inspect another or go back. Inspection does not execute the tool. A failed catalogue request is an error. |
| Advanced          | Access reasoning, query diagnostics, graph exploration and MCP resources. | An explanation before each operation; see below.                                                                                                                                                |

For scoped operations, select an accessible space by **name**. A configured default
is preselected if it remains accessible; you can choose another space. If the
default is no longer accessible, you must explicitly select an available space. The server resolves and
authorizes its tenant. An empty or unavailable catalogue never becomes an all-space
query. Ambiguous duplicate names include the space ID for identification.

## Advanced operations

- **Compound reasoning** uses server reasoning and may use web tools. It is not
  the space-scoped document chat; choose Chat for that purpose. Only successful
  exchanges enter its in-memory context. Before another question, you can view
  previous exchanges, start fresh, explicitly continue, or return without sending.
- **Query intent** classifies the question and suggests parameters. It does not
  analyze or summarize document contents.
- **Graph components/path** inspects relations in a chosen space. Path exploration
  requires a source entity ID; it remains an advanced operation.
- **MCP app resources** returns resources such as `ui://deposium/health`. A terminal
  cannot render that embedded application. The CLI describes the resource and
  required host; it does not open a dashboard or execute downloaded HTML.

DSPy routing, DuckDB administration and query-retention cleanup are server-internal
operations. They are not public menu actions. Legacy CLI spellings are retained
for diagnostic compatibility, but cannot grant access to internal tools.

## Reading results and errors

The terminal unwraps bounded MCP content envelopes before displaying business data.
Protocol resources are shown separately: two response blocks do not mean two
matching documents. Corpus values are labeled; missing values are not invented.
Explicit `--format json` retains raw tool content for technical consumers.
`space list --format json` and `corpus stats --format json` omit progress banners.

When an operation fails, check the selected space, credentials and required
permissions. Returning to the menu does not log you out. Chat history exists only
in the running process; a new chat or a real space change starts fresh context.

The current terminal interface remains English. CLI 1.7.0 adds chat activity,
source inspection and grouped verification notes; see the [chat guide](../commands/chat.md#activity-and-source-inspection-cli-170).
A unified FR/EN setting, Health preference display and live `/` completion remain
separate roadmap milestones.

For complete tool reference and raw input schemas, see the [Tools guide](../commands/tools.md).
