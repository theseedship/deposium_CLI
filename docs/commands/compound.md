> Revision: 2026-11-09

# General AI (Compound)

Compound asks the server for general AI reasoning and optional web research. It
**does not select a document space**. To ask what your files contain, use
`deposium chat` and choose a space, or choose **Chat** from the main menu.
The provider/model is configured on the server, not selected by this CLI command.

## Analyze

```bash
deposium compound analyze "Explain quantum computing"
deposium compound analyze "Explain quantum computing" --format json
```

`-f, --format <type>` accepts `markdown` (default) or `json`. The direct command
is one-shot. Its in-memory history ends with the process. In the interactive
menu, **Advanced → General AI (Compound)** retains its own successful exchanges;
it does not share history with document Chat. You can inspect, clear, continue
or decline that context before another question.

## Research

```bash
deposium compound research "Recent work on a topic"
```

Research may use server web tools and has no conversation history. Available
sources and behavior depend on server capabilities and permissions. A request
can complete without calling any tool; this is not evidence that a private
corpus was searched.

## Read the result (CLI 1.7.2+)

The result shows the answer and **reported** model, tools, tokens and server
duration when present. “Response received” means the request returned, not that
its claims were independently verified. Zero or missing tool use is explicit.
The server confidence value is not a calibrated accuracy score, so the default
view no longer renders it as a quality gauge. Raw reasoning and metadata remain
in explicit JSON rather than being repeated beneath the answer.

Markdown is rendered in the terminal, without a repeated startup logo or a huge
answer box. JSON mode suppresses banners and spinners and returns the existing
raw MCP content shape. Authentication in JSON mode fails with instructions to
run `deposium auth login` rather than opening a credential prompt.
