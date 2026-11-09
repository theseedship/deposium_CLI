# Public CLI surface audit — 9 November 2026

Scope: U1 candidate after CLI 1.6.0, not a declaration that every command works in
production. The [static inventory](command-surface-inventory.json) captures 105
command declarations in 25 files, literal MCP tool references and dynamic calls.
Source inspection, fixtures, terminal behavior and live service evidence are
separate qualification levels. No production write, native model or admin-key
substitution was used for this lot.

## Disposition by command family

| Family             | Purpose / boundary                                     | U1 disposition and remaining qualification                                                                                                           |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth               | Save a personal API key locally; validate it remotely. | Existing tests; key storage preserved. No new authentication mechanism.                                                                              |
| config             | Manage local configuration.                            | Existing tests; unified language/settings deferred to U2.                                                                                            |
| chat / interactive | Document conversation / terminal menu.                 | Public menu rebuilt; scope selection tested. Chat loader and live `/` completion remain U3/U4.                                                       |
| search             | Scoped passage retrieval.                              | Named menu selection; existing direct-command tests. No claim that a search equals a synthesis.                                                      |
| corpus             | Statistics, evaluation and improvement.                | Statistics decoded and qualified live; other operations have source/fixture coverage only. No live evaluation/mutation in this audit.                |
| graph              | Traverse or inspect relations.                         | Removed fabricated scope defaults. Menu offers components and path with source input; broader live graph qualification remains.                      |
| compound           | Server multi-tool reasoning.                           | Menu sends optional prior text context; failed turns excluded from history. CPU fixtures; no new live LLM call.                                      |
| intelligence       | Query intent, suggestions and result summarization.    | Menu now offers intent inspection with explicit purpose. Direct subcommands remain technical, with existing fixtures; no blanket live qualification. |
| dspy               | Routing diagnostics.                                   | Internal `route` hidden and refused locally. Direct `analyze` remains separately available; not newly qualified live.                                |
| duckdb             | Database administration/federation.                    | Internal operations hidden from root help and refused by the CLI helper; server restrictions unchanged.                                              |
| leanrag            | Specialized retrieval.                                 | Shared scope fix; existing fixtures. Removed from the novice menu pending a usable, qualified user journey.                                          |
| mermaid            | Graph/diagram utilities.                               | Shared scope fix; direct commands retained. Removed incomplete menu shortcuts; no automatic HTML execution.                                          |
| ui                 | MCP app resources.                                     | Help no longer claims to open terminal dashboards. Human rendering explains the required compatible host.                                            |
| health             | Service diagnostics.                                   | Menu no longer declares unconditional health. Detailed service/session preference qualification remains separate.                                    |
| tools              | Catalogue discovery.                                   | A transport/tool/schema failure rejects; an actual empty list remains valid.                                                                         |
| files              | List/show/check/remove documents.                      | Prior JSON/read tests retained; no new live removal.                                                                                                 |
| space              | List/show/create spaces.                               | List/show/create formatting respects JSON mode; empty JSON list tested. Listing qualified live; no live creation.                                    |
| api-keys           | Server-side key management.                            | Existing fixtures only; no real key rotation, creation or deletion in this lot.                                                                      |
| upload-batch       | Upload files.                                          | Existing real-glob/transport fixtures retained; no production upload.                                                                                |
| query-history      | Inspect/export query history.                          | Internal cleanup hidden and refused. Other direct operations retained; no production history modification.                                           |
| logs               | Inspect server logs.                                   | Direct commands retained subject to server permissions; no unconditional menu exposure or new log export.                                            |
| benchmark          | Run benchmark/evaluation jobs.                         | Shared scope fix; tenant display distinguishes server resolution. No benchmark launched.                                                             |
| evaluate           | Quality metrics and feedback.                          | Existing outbound fixtures; no production feedback submitted.                                                                                        |
| validate           | Dossier validation with HITL.                          | Existing suites preserved; no dossier run or auto-approval.                                                                                          |
| temporal-assertion | Offline fixture oracle.                                | Existing offline suite retained; no server authority involved.                                                                                       |

## Concrete evidence

- Reported Compound context mismatch reproduced structurally: object in the old
  menu versus optional string in MCP's `compoundAnalyzeSchema`. Tests now cover
  absent context, textual follow-up context and failed-turn exclusion.
- Observed nested Corpus response decoded into one business object and a separate
  resource. Human output does not count protocol blocks as documents. HTML remains
  a resource; no execution or browser launch.
- A normal authorized production catalogue returned 22 spaces. The user-reported
  space was present. A candidate `corpus stats --space … --format json` exited 0,
  with parseable stdout, empty stderr and 126 documents. No tenant override sent.
  No cross-tenant union or exhaustive corpus authorization qualification claimed.
- Protocol error envelopes, absent results, invalid catalogues and excess decoding
  depth fail explicitly. Business document text is not recursively interpreted.
- `npm audit` and GitHub Dependabot rechecked: zero reported vulnerabilities/open
  alerts. Available major dependency upgrades are not security findings; assess
  them separately without silently dropping Node 22.13/24 compatibility.

## Remaining work

U1's first lot addresses the reported menu failures and shared protocol/scope
causes. It does not close the whole roadmap. Remaining direct subcommands require
per-operation payload/role/JSON checks and bounded real recipes where appropriate.
Keep mutations opt-in, prefer CPU fixtures, and never make an internal tool public
merely to make an old menu entry pass. U2 adds saved settings/language; U3 adds
activity and richer results; U4 adds live slash completion; U5 verifies delivery.
