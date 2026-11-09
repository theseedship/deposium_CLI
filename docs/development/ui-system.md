> Revision: 2026-11-09

# Terminal presentation contracts

This is the current developer reference for CLI 1.7.2+. It replaces the older
visual mockups, which described behavior that was not consistently implemented.
See the [user guide](../guides/interactive.md) and [qualification](../guides/qualification.md).

## Startup and navigation

- Bare `deposium` opens the menu in an interactive stdin/stdout terminal, outside
  CI and `TERM=dumb`. Noninteractive bare invocation prints offline help.
- `deposium i` and `deposium interactive` explicitly open the same menu.
- `createWelcomeBanner` owns the existing gradient wordmark at menu entry. Narrow
  terminals receive a compact title. Result formatters never print the wordmark.
- Commands and unknown options retain Commander dispatch/error behavior. Help and
  version must not authenticate, query the server or open the menu.

## Results and Markdown

`formatOutput` decodes bounded MCP content envelopes for human output, separates
resource metadata and leaves explicit JSON payloads unchanged. Use the named
`markedTerminal` extension from `marked-terminal`; its default export is a
renderer class, not the extension factory. The local type declaration must match
that real export. Each render uses its own `Marked` instance and terminal width;
there is no global renderer stack accumulating per answer.

Sanitize untrusted terminal text before rendering. Markdown output must not fall
back to HTML or silently report that a failed renderer succeeded. Paragraph reflow
is bounded; arbitrary wide tables, resize and canonical streaming redraw are not
claimed as fully qualified on every terminal.

Compound is general server reasoning with no document space selected. A successful
request is labeled “Response received”, never a verified document analysis.
Reported model/tools/tokens/duration remain distinguishable from independent
observations. Do not present a generative confidence field as measured accuracy.
Do not repeat raw reasoning beneath the answer. Explicit JSON preserves the
underlying metadata for technical consumers.

## Progress and machine output

- `commandProgress(options)` disables banners/spinners for `--format json` and
  explicit `--silent`. Pass machine-readable mode into authentication too.
- JSON stdout contains the documented result shape only; diagnostics go to stderr.
- Never suppress a refusal and then return a successful operation. Clearing logs
  requires explicit `--confirm`; a refusal happens before authentication or a call.
- Chat activity is TTY-only, shows actual elapsed time and received phase events,
  and stops before text, prompts and errors. It does not simulate model reasoning,
  completion percentages or token streaming the server did not provide.

## Chat and source inspection

The chat menu opens on `/` followed by Enter. Live prefix/Tab completion is still
planned. `/sources`, `/source [number]` and `/verify` inspect last-turn data locally.
Only the final stream's `done` receipt permits cached source publication, including
a fresh receipt after HITL resume. Failed or unfinished streams preserve diagnostic
notes but do not expose partial cached sources. New question, clear or space change
clears references. Source inspection neither fetches a PDF nor executes a resource.

## Resource and status boundaries

`ui://` resources need a compatible MCP app host. Printing them does not open a
browser, bind a port or create a live dashboard. A returned HTTP response is not
proof that every backend service is healthy. Metric bars are for actual numeric
measurements; the helper's existence is not evidence those metrics were observed.

Retain `createTitleBox`, `createInfoBox`, `displayStatus`, `divider` and metric/tree
helpers where useful, but keep decorative output out of scripts. Test the actual
rendered output and transitions, not merely that `console.log` was called.
