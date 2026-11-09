> Revision: 2026-11-09

# Interactive terminal guide

The menu described here requires **CLI 1.6.1 or newer**. Compare `deposium --version`
with `npm view @deposium/cli version`: a merged change may still await npm approval.

After `deposium auth login`, run **`deposium`** in a terminal (CLI 1.7.2+).
`deposium interactive` and `deposium i` remain aliases for the same menu. Your
stored key is reused. No tenant or space UUID needs to be memorized for the menu.

Without a terminal, bare `deposium` prints offline help and exits. `--help` and
`--version` stay offline; unknown commands/options fail instead of opening a menu.
The startup wordmark appears once at menu entry, with a compact narrow-screen fallback.

## Choose an operation

| Operation         | Purpose                                                                   | What to expect                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat              | Ask questions about documents in an accessible space.                     | A conversation, answer, citations and verification notices.                                                                                                                                     |
| Search            | Find passages in an accessible space.                                     | Search results, not a generated answer.                                                                                                                                                         |
| Corpus statistics | Inspect the selected space's indexed corpus.                              | Counts reported by the server, including documents, pages and graph data when available. Counts are not a content-quality score or proof that every document finished indexing.                 |
| Health            | Inspect the connected service's health response.                          | Reported status, including degraded/unknown states; a successful HTTP request is not proof that all services are healthy.                                                                       |
| Tools             | Inspect the server's tool catalogue.                                      | CLI 1.7.1+: select a tool to read its complete description and input parameters, then inspect another or go back. Inspection does not execute the tool. A failed catalogue request is an error. |
| Settings          | Configure language and one authorized default space (CLI 1.8.0+).         | Offline language preferences; catalogue-backed space picker; no credential or permission changes.                                                                                               |
| Advanced          | Access reasoning, query diagnostics, graph exploration and MCP resources. | An explanation before each operation; see below.                                                                                                                                                |

For scoped operations, select an accessible space by **name**. A configured default
is preselected if it remains accessible; you can choose another space. If the
default is no longer accessible, you must explicitly select an available space. The server resolves and
authorizes its tenant. An empty or unavailable catalogue never becomes an all-space
query. Ambiguous duplicate names include the space ID for identification.

## Advanced operations

- **General AI (Compound)** uses server reasoning and may use web tools. It does not
  select a document space; choose Chat to summarize or question your files. Only successful
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

CLI **1.8.0+** adds [Settings](../commands/settings.md): saved FR/EN/automatic
language, an authorized default space shared by scoped commands, and effective
configuration in Health. `--lang fr|en` overrides this invocation only. Chat uses
the effective language by default; original server text and technical identifiers
are preserved. CLI 1.9.0 adds live `/` completion as described below. See the
[qualification and limitations](qualification.md) for the exact tested surface.

For complete tool reference and raw input schemas, see the [Tools guide](../commands/tools.md).

## Comfortable menus and chat commands — CLI 1.9.0+

Feature menus show all their entries when the terminal has room, including the
Advanced and Settings submenus. Icons on the main menu complement text labels;
no action depends on recognizing an icon. Menus stop at the first/last item
rather than wrapping unexpectedly. Space, source and tool catalogues show up to
15 items at a time, reduced on shorter terminals; arrow keys reach the rest.

In Chat, type `/` at the beginning of the input to see local commands immediately.
Type more letters to filter them (for example `/sp` for spaces or `/so` for sources).

| Key       | Action                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| Up / Down | Select a suggestion; no request is sent.                                                 |
| Tab       | Complete the selected command in the input without running it.                           |
| Enter     | Run the selected suggestion, or submit the text when no suggestion is visible.           |
| Escape    | Hide suggestions while preserving the input. Editing the text enables suggestions again. |

An exact command is preferred over longer matches: `/source` reads one citation,
whereas `/sources` lists sources. After a space, arguments stay untouched:
`/source 2` and `/space <id>` still work. A slash inside an ordinary question does
not open the menu. Unknown slash commands remain local errors, never model questions.
Bracketed multiline paste is kept in the input until you explicitly press Enter.
Pasted tabs/line breaks become spaces without changing word order. Paste does
not select a completion: a pasted partial command stays a partial command.

In scripts, CI and `TERM=dumb`, the standard input prompt remains available;
enter `/` then press Enter for the existing command picker. Suggestions do not
fetch a catalogue, call a model, change the selected space or persist a setting.
