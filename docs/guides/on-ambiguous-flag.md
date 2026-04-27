# `--on-ambiguous` — HITL policy for `deposium chat` and `deposium validate`

> Revision: 2026-04-27 · Human-In-The-Loop policy for the CLI chat + validate streams

When the Deposium server is unsure how to handle a query (chat) or pauses a
macro for a missing piece / classification correction / rule clarification
(validate), it emits a `chat_prompt` SSE event. In the browser, this renders
as an interactive picker or form. In the CLI, `--on-ambiguous=<mode>`
controls the response policy.

> **Two modes families** — `chat` accepts 4 modes (`prompt | fail | dump |
pick-first`); `validate` accepts the 3-mode subset (`prompt | fail | dump`)
> because Phase II PR-3 emits only `chat_prompt type='form'`, never `'choice'`,
> so `pick-first` has no semantic meaning.

## Modes

| Mode         | Behaviour                                                                   |
| ------------ | --------------------------------------------------------------------------- |
| `prompt`     | Render an `inquirer` picker; block until the user answers (default in TTY). |
| `fail`       | Exit with error + correlation ID (default outside TTY).                     |
| `dump`       | Print the `chat_prompt` payload as JSON to stdout and exit `0`.             |
| `pick-first` | Auto-select `config.options[0].value` (or `approve` for `confirm`).         |

Phase W.2 will add `resume-file` and `fail-with-token` (stateful modes that
need on-disk persistence and a `deposium resume <token>` subcommand).

## Default behaviour

The CLI inspects `process.stdin.isTTY` when no flag is passed:

- **TTY attached** (interactive terminal) → `prompt`
- **No TTY** (pipe, CI, script, `docker exec -T`) → `fail`

This ensures non-interactive contexts never silently hang waiting for input.

## Examples

**Interactive chat, default picker:**

```bash
deposium chat
# ...
# You: Que disent les documents sur la biodiversité ?
# AI: [server pauses with chat_prompt]
# ? How should I handle this query?
# ❯ 📄 Documents  — Search the local document space
#   🌐 Web Search  — Search the web (Tavily) + synthesize
```

**CI pipeline, fail-fast:**

```bash
deposium chat --on-ambiguous=fail < scripted-questions.txt
# Exits with code 1 on the first ambiguous query and prints the
# correlation ID so the operator can re-run manually.
```

**Inspect `chat_prompt` payloads for debugging:**

```bash
echo "météo à Paris" | deposium chat --on-ambiguous=dump | jq
# Prints the raw chat_prompt JSON, including config.options[] and
# waiting_for. Useful for verifying MCPs emission shape.
```

**Scripted batch with deterministic first-option selection:**

```bash
deposium chat --on-ambiguous=pick-first < queries.txt
# Agent picks options[0] (currently "rag" for intent_disambiguate).
# Guarantees forward progress but may misroute — pair with audit logs.
```

## How resume works

On a `chat_prompt`, the CLI POSTs to the MCPs backend:

```
POST /api/agent-resume
Content-Type: application/json
X-API-Key: dep_...

{
  "correlation_id": "agent_rag_...",
  "response": { "value": "web_search" }
}
```

The response is a fresh SSE stream that continues the paused pipeline.
That stream may itself emit another `chat_prompt` (e.g. a confirmation
step after disambiguation) — the CLI loops until the stream closes with
`done`.

> **Note**: resume currently routes directly to the MCP server. Once the
> Edge Runtime ships an `/agent-resume` twin, the CLI will route through
> the edge transparently with auth + rate-limiting. Set via
> `DEPOSIUM_EDGE_URL` when available.

## Resume in `deposium validate` (Phase II PR-3)

`validate` uses a different resume protocol from chat: instead of POST
`/api/agent-resume`, the CLI re-calls `tools/call deposium_validate_foncier`
with the same `run_id`. Two modes (ADR-010 §4.2):

- **Mode A** (response to `waiting_for=missing_document`) — the CLI
  uploads the file to Solid's `/api/v2/files/batch-upload` first, then
  re-calls `tools/call` _without_ a `hitl_response`. MCPs detects
  `status='paused'`, re-classifies the dossier, and resumes the failing
  thematic.
- **Mode B** (response to `classification_correction` / `rule_clarification`)
  — the CLI re-calls `tools/call` with `hitl_response` carrying the form
  values. MCPs branches on the field keys, applies the response, and
  advances the paused step.

Both paths reuse `--on-ambiguous` to gate interactivity (`prompt` collects
form input; `fail` exits non-zero; `dump` prints the prompt JSON for
inspection).

## Related

- `src/chat.ts` · `src/client/mcp-client.ts` — CLI implementation of
  `--on-ambiguous` for chat (4 modes) and validate (3 modes).
- `src/utils/validate-hitl-form.ts` — form rendering per `waiting_for`
  discriminant in validate.
- [`docs/commands/validate.md`](../commands/validate.md) — full command
  reference for the validate macro.
