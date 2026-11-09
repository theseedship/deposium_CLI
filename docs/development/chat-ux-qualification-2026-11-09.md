# Chat activity, verification and sources — U3 qualification

Baseline: CLI 1.6.1, `ba92589c`; candidate: 1.7.0. This lot changes the terminal
consumer, not MCP authorization, retrieval, generation or the verifier verdict.

## Observed boundary

One short question in the user-reported authorized space, through the normal
stored API key and Edge route, produced the following times from probe start
(including about 0.5 s of catalogue/authentication preparation):

- first metadata at about 2.9 s; tool events at 3.2 s and 7.1 s;
- 93 token fragments / 314 characters received within about 1 ms at 12.4 s;
- two citations, two verification events, completion around 15.1 s.

The client already wrote `onToken` immediately. Earlier control events prove that
this request was not entirely held until completion. The observation does not
locate all token coalescing between generation, SSE writing and intermediaries.
MCP's `progressive-stream.ts` can split an already completed string; Edge's success
path forwards the SSE body. True incremental generation needs a separately scoped
producer investigation, preserving canonical replacements and verifier blocking.
No general speedup or provider/model comparison follows from this single probe.
No source text, credential or raw private identifier is recorded here.

## Candidate behavior and checks

- Native terminal fixture: three TTY streams, real elapsed spinner, delayed fake
  tokens, clean transition to the answer, grouped notices and citation inspection;
  process exits normally. This fixture tests rendering, not production latency.
- Full suite: 802 tests across 51 files. CPU tests cover token output before the next fragment arrives, cleanup on disconnect,
  bounded/non-executable cached passages, exact emitted citation IDs, missing and
  superseded/unavailable references, same-space versus changed-space handling,
  explicit detailed verification and noninteractive silence.
- Existing HITL, canonical-answer replacement, blocked-answer/fallback and history
  tests remain in the suite. No permission, scope or safe-default bypass added.
- `/source` shows a passage supplied with the answer, with filename/page when
  available. It neither authenticates a new read nor claims to open the full file.
- Known verifier categories have concise labels. Unknown important notes and
  blocking decisions remain visible. Raw detailed diagnoses are opt-in.

Remaining: real multi-platform terminal qualification, FR/EN preferences, live `/`
completion, rich final Markdown/reflow and a separately justified producer streaming
change. The inherited canonical multiline redraw still counts explicit newlines,
not all soft-wrapped screen rows; no stronger terminal-reflow guarantee is made.
