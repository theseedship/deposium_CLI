> Revision: 2026-11-09

# Qualification and known limits

This page distinguishes the CLI's behavior from the server's capabilities. A
working menu or a green unit test does not establish that every tool is enabled
for every account. Versions described in documentation can await npm approval;
check `deposium --version` and `npm view @deposium/cli version` separately.

## What the current qualification checks

| Surface                    | Evidence and boundary                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command/reference coverage | 122 offline help invocations cover the 105 inventory declarations plus entrypoints/aliases; 42 Markdown files and 210 literal command examples were checked for known commands/options and broken local links. Help never proves an actual backend operation succeeded. |
| Developer demo             | The source-only `npm run demo:ui` completes using current helper exports and synthetic fixtures on both Node versions; `typecheck` includes the demo and CI runs it. No server calls or model streaming are simulated as real observations.                             |
| Startup                    | Bare terminal menu, explicit aliases, offline help/version, scripts/CI/dumb terminals, unknown options and clean exit. Wordmark appears at entry, not inside results.                                                                                                   |
| Main menu                  | Named space selection, failed/empty catalogues, shared Compound request contract, internal operation refusal and local navigation have CPU tests and terminal recipes.                                                                                                  |
| Chat                       | Token delivery as received, activity cleanup, canonical replacements, HITL safe defaults, blocked answers, final-stream source receipts, verification notices and local source commands have regression tests.                                                          |
| Tool catalogue             | Real ordinary-key catalogue: 15 entries with schemas. Full description/schema retained, including a 3,546-character description. Picker/read/back verified in a native terminal. Inspection does not execute a tool.                                                    |
| JSON                       | Existing space/files/search/corpus/tool tests plus dedicated general-AI and legacy subcommand contracts check parseable stdout, disabled spinners and noninteractive authentication. Mutating commands are exercised with fake transports, not by modifying production. |
| API scope                  | Ordinary authenticated reads are qualified separately from admin rights. An omitted tenant is server-resolved. Space choices do not grant document access. No cross-tenant exhaustive security qualification is claimed.                                                |
| Delivery                   | npm staged artifact/source/hash, public version and `latest` are separate checks. A matching stable GitHub Release triggers docs synchronization; verify the Docs deployment afterward.                                                                                 |

The 1.7.2 qualification passed **878 tests across 57 files** on Node 22.13 and 24. This includes 37 parameterized legacy JSON command cases, two Compound JSON
cases, startup/renderer/branding checks and mutation-refusal coverage. A native
terminal recipe opens the bare command with its logo, navigates and exits; a
separate rendering fixture verifies formatted general-AI output without the old
warning, repeated logo or confidence bar.

An ordinary-key read-only SaaS recipe also checked health, the authorized space
catalogue, corpus counts, BM25 retrieval and one fresh document question. The
answer matched the expected subject and supplied a final-stream citation, about
11 seconds in that single run. This is functional evidence, not a general latency
benchmark or a claim that all production operations or roles were exercised.

## Choose the right operation

- **Chat:** questions and synthesis using documents in an accessible space.
- **Search:** matching passages without a generated synthesis.
- **Corpus statistics:** server-reported counts, not a content summary or accuracy score.
- **General AI (Compound):** no selected document space; optional server reasoning/web tools.
- **Query intent:** classifies your question; does not summarize documents.
- **Tools:** reference descriptions/input schemas; selecting an entry does not execute it.
- **MCP app resources:** require a compatible host, not a terminal dashboard.

A model or tool name in metadata is reported by the server. It is not an independent
trace proving every stage used that model. Zero reported tools does not attest a
private-document search. The CLI does not supply local TurboV3/LLM engines by itself.

## Still not delivered or universally qualified

- Live slash completion remains roadmap work. CLI 1.8.0 adds saved language and
  default-space preferences for the core flows described in [Settings](../commands/settings.md).
  Historical advanced-command output, server data and library keyboard hints are
  not all localized. Chat now sends the effective UI language by default.
- Some server paths deliver a whole answer in a burst. An activity indicator does
  not make generation faster or provide true producer streaming.
- Full narrow-table/resize/reflow behavior and standalone Bun binaries are not
  newly qualified across macOS, Windows and Linux by this Node release.
- Local interruption is not a receipt that remote work stopped. Help/examples do
  not imply production uploads, deletion, key rotation, code execution, monitor
  mutation or paid evaluations were run during this qualification.
- Backend-dependent operations can require additional permissions/features. A
  server refusal remains an error; internal routes are not made public to make
  an old CLI command pass.

See the [command reference](../commands/README.md), [interactive guide](interactive.md)
and [release procedure](../development/releases.md). Historical development/audit
records retain their original dates and test counts; they are not current release claims.

## Preferences qualification — CLI 1.8.0

**914 tests / 61 files** pass on Node 22.13 and 24, including the existing
credential, JSON, HITL and canonical-answer tests. A real terminal recipe verifies
French startup → Settings → Back → clean exit without changing the user's
preferences. An ordinary-key read-only probe observes 22 authorized spaces and
confirms access to the selected recipe space via a fresh catalogue, with Health
`ok` and the requested French invocation language. No model call or business-data
mutation is needed for this preferences qualification.

The static documentation check covers **126 offline help invocations**, 43
Markdown files and 221 literal examples, with no unknown command/option or missing
local file target. This is distinct from executing every backend operation.

Language priority, locale precedence, automatic mode and invocation-only overrides
are checked independently. Process tests use isolated temporary homes to verify
persistence across launches, encrypted storage and unchanged synthetic credentials.
They exercise real command parsing, offline settings, translated help and clean
JSON, including invalid flags and conflicting scope options. No real user
preferences are modified by those tests.

Catalogue fixtures cover authorized, revoked, empty and failed lookups, explicit
versus saved scope, environment precedence, noninteractive refusal and preserving
prior settings on failure. Health JSON without `--context` retains its existing
contract; explicit context distinguishes unavailable catalogue data from endpoint
health and strips credential-bearing URL components. Chat tests verify the actual
request language with the selected scope/history retained. Catalogue tests check
translation coverage and interpolation slots, without translating result data.
