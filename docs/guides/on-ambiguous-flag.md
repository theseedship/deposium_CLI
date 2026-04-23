# `--on-ambiguous` — HITL policy for `deposium chat`

**Sprint**: Phase I Item 5 (2026-04-23) · [[internal-doc].md §Phase I](../../../[private-server-repo]/docs/2026/0-HITL-results/[internal-doc].md)

When the Deposium server is unsure how to handle a query, the agent runtime
pauses and emits a `chat_prompt` SSE event asking the caller to pick an
option (or confirm an action). In the browser, this renders as a `ChatBus`
picker. In the CLI, `--on-ambiguous=<mode>` controls the response policy.

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

> **Phase W.1 note**: resume currently routes directly to MCPs
> (`$DEPOSIUM_MCP_DIRECT_URL/api/agent-resume`). Once the Edge Runtime
> `/agent-resume` twin ships, the CLI will route through the edge
> transparently with auth + rate-limiting.

## Related

- [`[internal-doc].md`](../../../[private-server-repo]/docs/2026/0-HITL-results/[internal-doc].md) — full Phase I/W plan
- [`[internal-phase-doc].md`](../../../[private-server-repo]/docs/2026/[internal-phase-doc].md) — server-side `intent_disambiguate` trigger
- `src/chat.ts` · `src/client/mcp-client.ts` — CLI implementation
