> Revision: 2026-04-27

# Validate Command

The `validate` command runs the foncier dossier validation macro
(`deposium_validate_foncier`) end-to-end: classifies each document by
thematic, runs N1 per-thematic requirement checks, optionally runs N2
cross-document rules, and produces a structured report. The CLI streams
status events live and pauses interactively for HITL prompts (missing
documents, ambiguous classifications, rule clarifications).

> **Status**: Phase II PR-3 client-side ships in v1.2.0 (Phase A — unit
> tested against the frozen ADR-010 §4 contract). Server-side macro lands
> in a follow-up sprint; integration-test once both sides converge.

## Usage

```bash
deposium validate <dossier_id> [options]
```

`<dossier_id>` is the UUID of the workspace ("space") that holds the dossier.

## Options

| Flag                                  | Default               | Description                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--level <1\|2\|both>`                | `both`                | N1 per-thematic, N2 cross-document, or the full pipeline.                                                                                                                                                                     |
| `--on-ambiguous <prompt\|fail\|dump>` | TTY-aware             | HITL policy. `prompt` interactively collects answers; `fail` exits non-zero on every pause; `dump` prints the raw `chat_prompt` JSON and exits 0 (for inspection / scripts). Defaults to `prompt` in a TTY, `fail` otherwise. |
| `--language <fr\|en>`                 | server default (`fr`) | Locale for server-side messages, hints, and form labels.                                                                                                                                                                      |
| `--run-id <run_id>`                   | —                     | Resume an existing paused run instead of starting a new one. The macro detects `status='paused'` and continues from the last step.                                                                                            |
| `--json`                              | off                   | Suppress per-event console output, run the stream silently, then fetch `GET /api/v1/reports/<run_id>?format=json` after `validate:complete` and pipe the report to stdout.                                                    |
| `--verbose`                           | off                   | Show per-document classification and per-requirement N1 verdicts (otherwise summarised at the thematic level).                                                                                                                |

## Examples

### End-to-end interactive run

```bash
deposium validate 89b04306-... --level both
```

Outputs phase banners, classification summary, thematic verdicts, then the
final global verdict + run_id. Pauses with `inquirer` prompts whenever
the macro emits `chat_prompt` (e.g. "Quel type de pièce ?", "Téléverser le
DPE manquant ?"). Files uploaded inline are POSTed to Solid's
`/api/v2/files/batch-upload` and the macro re-classifies the dossier
before resuming.

### Non-interactive batch (CI)

```bash
deposium validate 89b04306-... --level both --on-ambiguous fail --json \
  > /tmp/report.json \
  || cat /tmp/report.json | jq .verdicts
```

`--on-ambiguous fail` exits non-zero on any HITL pause (prevents a CI
runner from hanging silently). `--json` pipes the canonical report from
the dedicated reports endpoint — the SSE stream stays lean (no embedded
report) and the report is the single source of truth.

### Resume a paused run

```bash
deposium validate 89b04306-... --run-id 12abf-...
```

Sends the same `tools/call` again with `run_id` set; the server resumes
from where it paused (Mode A — re-classify after upload — or Mode B —
structured response, transparent to the caller).

### Dump a paused prompt for inspection

```bash
deposium validate 89b04306-... --on-ambiguous dump
```

When the macro pauses with `chat_prompt`, the CLI prints the full event
JSON to stdout and exits 0. Useful when designing forms server-side or
debugging a HITL flow without an interactive shell.

## Exit codes

| Code | Meaning                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `validate:complete` reached. In `--json` mode the same exit code applies regardless of run outcome — read `report.status` (`'complete'` or `'failed'`) for the verdict. |
| 1    | `validate:failed` reached, OR `--on-ambiguous=fail` paused on a `chat_prompt`. Suppressed in `--json` mode (consumers branch on `report.status`).                       |
| 2    | Argument parsing error (invalid `--level`, `--on-ambiguous`, `--language`).                                                                                             |

## Auth & key types

The `validate` command obeys the same key resolution as every other
command:

1. `DEPOSIUM_API_KEY` env var (priority).
2. Stored credential at `~/.deposium/credentials`.
3. Interactive prompt.

Service-keys (`dep_svc_*`) are rejected at startup — see the
[auth command Key types](./auth.md#key-types--user-key-vs-service-key)
section. Always use a user-key (`dep_live_*` or `dep_test_*`) provisioned
via the Solid UI.

## SSE event reference

The macro emits events on the `validate:*` namespace plus the generic
`chat_prompt` on HITL pauses. The wire payloads are defined in the
project's `ValidateEvents` type
([`src/client/validate-types.ts`](https://github.com/theseedship/deposium_CLI/blob/main/src/client/validate-types.ts))
which mirrors the upstream server contract bit-for-bit.

| Event                        | CLI rendering                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `validate:start`             | Header line with run_id, level, document count                                   |
| `validate:classification`    | One bullet per document (verbose only)                                           |
| `validate:thematic_start`    | `[N1/i/total]` banner                                                            |
| `validate:extraction`        | Extraction provenance + method (verbose only)                                    |
| `validate:verdict_n1`        | Per-requirement pass/fail + reason (verbose only)                                |
| `validate:thematic_complete` | Thematic-level verdict glyph (✓/✗/⚠/—) + summary                                 |
| `validate:n1_complete`       | N1 phase recap + N2-starting hint                                                |
| `validate:n2_rule_verdict`   | Per-N2-rule verdict + reason                                                     |
| `validate:complete`          | Final verdict + run_id (the report itself is fetched separately)                 |
| `validate:failed`            | Terminal failure with `resumable` hint pointing at `--run-id`                    |
| `error`                      | Generic non-terminal error envelope (rare; mostly subsumed by `validate:failed`) |
| `chat_prompt`                | HITL pause — pauses the CLI for `inquirer` form input                            |

Event ordering is guaranteed by the server contract: `validate:start`
fires first, `validate:complete` or `validate:failed` always fires last,
and within a run no events from another run interleave.

## Report fetch

The full JSON report is **not** embedded in the SSE stream (the stream
stays lean — large `chat_history` and N2 evidence payloads stay
out-of-band). After `validate:complete`, fetch it via:

```bash
curl -H "X-API-Key: $DEPOSIUM_API_KEY" \
  "$DEPOSIUM_URL/api/v1/reports/<run_id>?format=json"
```

In `--json` mode the CLI does this fetch automatically and pipes the
result to stdout. The endpoint is idempotent — retrying the GET with the
same `run_id` returns the same report.

## Programmatic use

`MCPClient.validateFoncier(input, handlers)` exposes the same flow for
SDK consumers. See `src/client/mcp-client.ts` for the implementation and
`src/client/validate-types.ts` for the `ValidateStreamHandlers` contract.

```typescript
import { MCPClient } from '@deposium/cli';

const client = new MCPClient(baseUrl, apiKey);
const { run_id, status } = await client.validateFoncier(
  { dossier_id: 'd-uuid', level: 'both', on_ambiguity: 'prompt' },
  {
    onEvent: (name, payload) => {
      // Render or accumulate
    },
    onChatPrompt: async (prompt) => {
      // Mode A (file already uploaded externally): { mode: 'a' }
      // Mode B (structured response):              { mode: 'b', hitlResponse: { ... } }
      return { mode: 'a' };
    },
  }
);
if (status === 'complete') {
  const report = await client.fetchValidateReport(run_id);
}
```
