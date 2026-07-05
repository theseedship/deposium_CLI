/**
 * Tests for Phase I Item 5 — CLI HITL handling
 *
 * Covers:
 *   - `--on-ambiguous` mode dispatch (prompt | fail | dump | pick-first)
 *   - TTY-aware default mode resolution
 *   - SSEChatPrompt parsing through MCPClient
 *   - resumeAgent() POST shape
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentResumePayload, SSEChatPrompt } from '../client/mcp-client';

// Silence chalk in assertions
vi.mock('chalk', () => {
  const identity = (s: string) => s;
  return {
    default: {
      cyan: identity,
      green: identity,
      red: identity,
      yellow: identity,
      gray: identity,
      bold: identity,
      white: identity,
    },
  };
});

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ succeed: () => {}, fail: () => {}, text: '' }) }),
}));

// ============================================================================
// Fixtures
// ============================================================================

function makeChoicePrompt(overrides: Partial<SSEChatPrompt> = {}): SSEChatPrompt {
  return {
    prompt_id: 'cid-choice',
    correlation_id: 'cid-choice',
    type: 'choice',
    title: 'How should I handle this query?',
    message: 'Your question could be interpreted in several ways.',
    waiting_for: 'intent_disambiguate',
    step_id: 'pre_pipeline',
    config: {
      layout: 'horizontal',
      options: [
        { value: 'rag', label: '📄 Documents', description: 'Search local space' },
        { value: 'web_search', label: '🌐 Web Search', description: 'Search the web' },
      ],
    },
    ...overrides,
  };
}

function makeConfirmPrompt(overrides: Partial<SSEChatPrompt> = {}): SSEChatPrompt {
  return {
    prompt_id: 'cid-confirm',
    correlation_id: 'cid-confirm',
    type: 'confirm',
    message: 'Execute web_search now?',
    waiting_for: 'confirm_action',
    step_id: 'step_2',
    ...overrides,
  };
}

// ============================================================================
// resolveOnAmbiguousMode — TTY-aware default
// ============================================================================

describe('resolveOnAmbiguousMode', () => {
  const originalIsTTY = process.stdin.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  test('explicit value wins over default', async () => {
    const { resolveOnAmbiguousMode } = await import('../chat');
    expect(resolveOnAmbiguousMode('dump')).toBe('dump');
    expect(resolveOnAmbiguousMode('fail')).toBe('fail');
  });

  test('defaults to prompt in TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const { resolveOnAmbiguousMode } = await import('../chat');
    expect(resolveOnAmbiguousMode()).toBe('prompt');
  });

  test('defaults to fail without TTY (CI, pipes, scripts)', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const { resolveOnAmbiguousMode } = await import('../chat');
    expect(resolveOnAmbiguousMode()).toBe('fail');
  });
});

// ============================================================================
// handleChatPrompt — mode dispatcher
// ============================================================================

describe('handleChatPrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('fail mode — throws with correlation_id in message', async () => {
    const { handleChatPrompt } = await import('../chat');
    const prompt = makeChoicePrompt();

    await expect(handleChatPrompt(prompt, 'fail')).rejects.toThrow(/cid-choice/);
    await expect(handleChatPrompt(prompt, 'fail')).rejects.toThrow(/intent_disambiguate/);
  });

  test('dump mode — writes JSON to stdout then exits 0', async () => {
    const { handleChatPrompt } = await import('../chat');
    const prompt = makeChoicePrompt();

    // The implementation uses process.stdout.write(json, cb) + cb→exit(0).
    // Wait for process.exit to actually be called rather than relying on
    // a fixed number of microtask ticks — that pattern would break
    // silently if a future refactor inserted an `await` upstream of the
    // write call.
    const written: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown, cbOrEnc?: unknown, cb?: unknown) => {
        written.push(String(chunk));
        const callback =
          typeof cbOrEnc === 'function' ? cbOrEnc : typeof cb === 'function' ? cb : undefined;
        (callback as ((err?: Error | null) => void) | undefined)?.();
        return true;
      });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('exit never called')), 1000);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        clearTimeout(timer);
        resolve();
        throw new Error('__TEST_EXIT__');
      });
      handleChatPrompt(prompt, 'dump').catch(() => {});
      // Cleanup after resolve runs.
      void exitSpy;
    });

    expect(written).toHaveLength(1);
    const payload = JSON.parse(written[0].trim());
    expect(payload.chat_prompt.correlation_id).toBe('cid-choice');

    writeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  test('pick-first mode — auto-selects options[0].value for choice', async () => {
    const { handleChatPrompt } = await import('../chat');
    const decision = await handleChatPrompt(makeChoicePrompt(), 'pick-first');
    expect(decision).toEqual({ value: 'rag' });
  });

  // v1.5.0: `pick-first` on confirm gates now returns the server's safe
  // default (`skip`) rather than the hardcoded `approve`. Reason: on
  // confirm-before-action gates the server declares `default_choice='skip'`,
  // and `approve` is the UNSAFE branch — auto-executing the side-effecting
  // step the server intended to withhold on unattended runs.
  test('pick-first mode — returns safe default "skip" for confirm gate without default_choice', async () => {
    const { handleChatPrompt } = await import('../chat');
    const decision = await handleChatPrompt(makeConfirmPrompt(), 'pick-first');
    expect(decision).toEqual({ value: 'skip' });
  });

  test('pick-first mode — honors server-supplied default_choice over options[0]', async () => {
    const { handleChatPrompt } = await import('../chat');
    // Server declares `skip` as safe default on a choice gate whose
    // options[0] would be `rag` (the UNSAFE hardcoded pre-v1.5 pick).
    const prompt = makeChoicePrompt({
      default_choice: { value: 'skip', reason: 'unattended run' },
    });
    const decision = await handleChatPrompt(prompt, 'pick-first');
    expect(decision).toEqual({ value: 'skip' });
  });

  test('pick-first mode — form gate with default_choice resolves from it', async () => {
    const { handleChatPrompt } = await import('../chat');
    // Form gate with no default_choice would throw; with default_choice
    // it resolves cleanly (server's escape hatch for unattended runs).
    const prompt = makeChoicePrompt({
      type: 'form',
      config: { fields: [] },
      default_choice: { value: 'cancel' },
    });
    const decision = await handleChatPrompt(prompt, 'pick-first');
    expect(decision).toEqual({ value: 'cancel' });
  });

  test('pick-first mode — form gate without default_choice throws', async () => {
    const { handleChatPrompt } = await import('../chat');
    const prompt = makeChoicePrompt({ type: 'form', config: { fields: [] } });

    await expect(handleChatPrompt(prompt, 'pick-first')).rejects.toThrow(/form/);
  });

  test('pick-first mode — throws if choice has no options', async () => {
    const { handleChatPrompt } = await import('../chat');
    const prompt = makeChoicePrompt({ config: { options: [] } });

    await expect(handleChatPrompt(prompt, 'pick-first')).rejects.toThrow(/no options/);
  });

  test('prompt mode — delegates to injected prompter (test seam)', async () => {
    const { handleChatPrompt } = await import('../chat');
    const prompt = makeChoicePrompt();

    const prompter = vi
      .fn<(p: SSEChatPrompt) => Promise<AgentResumePayload>>()
      .mockResolvedValue({ value: 'web_search' });

    const decision = await handleChatPrompt(prompt, 'prompt', prompter);

    expect(prompter).toHaveBeenCalledWith(prompt);
    expect(decision).toEqual({ value: 'web_search' });
  });

  // v1.5.0: `type='form'` gates (connector-config, report-parameters)
  // used to throw "not yet supported" from the inquirer prompt. They now
  // render per-field using the same pattern as `validate-hitl-form.ts`
  // and return `{ values: {…} }`.
  test('prompt mode — form gate delegates per-field via injected prompter', async () => {
    const { handleChatPrompt } = await import('../chat');
    const formPrompt: SSEChatPrompt = {
      prompt_id: 'form-1',
      type: 'form',
      title: 'Configure GitHub connector',
      config: {
        fields: [
          { name: 'repo', label: 'Repository', type: 'text', required: true },
          {
            name: 'branch',
            label: 'Branch',
            type: 'select',
            default: 'main',
            options: [
              { value: 'main', label: 'main' },
              { value: 'dev', label: 'dev' },
            ],
          },
        ],
      },
    };

    const prompter = vi
      .fn<(p: SSEChatPrompt) => Promise<AgentResumePayload>>()
      .mockResolvedValue({ values: { repo: 'foo/bar', branch: 'main' } });

    const decision = await handleChatPrompt(formPrompt, 'prompt', prompter);

    // The injected prompter override is honored (test seam), so we
    // don't have to mock inquirer.prompt for the per-field flow.
    expect(prompter).toHaveBeenCalledWith(formPrompt);
    expect(decision).toEqual({ values: { repo: 'foo/bar', branch: 'main' } });
  });
});

// ============================================================================
// MCPClient — chat_prompt dispatch + resumeAgent POST shape
// ============================================================================

describe('MCPClient.resumeAgent', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('POSTs to /api/agent-resume with correlation_id + response', async () => {
    const { MCPClient } = await import('../client/mcp-client');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: makeSSEBody([{ event: 'done', data: { total_duration_ms: 12 } }]),
    }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://ignored', 'dep_test_key');
    await client.resumeAgent(
      'http://mcps:4001',
      'cid-xyz',
      { value: 'web_search' },
      { onToken: () => {} }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://mcps:4001/api/agent-resume');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-API-Key']).toBe('dep_test_key');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      correlation_id: 'cid-xyz',
      response: { value: 'web_search' },
    });
  });

  test('dispatches chat_prompt SSE event to onChatPrompt', async () => {
    const { MCPClient } = await import('../client/mcp-client');
    const promptPayload = {
      prompt_id: 'cid-abc',
      correlation_id: 'cid-abc',
      type: 'choice',
      config: { options: [{ value: 'rag', label: 'Docs' }] },
    };

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: makeSSEBody([
        { event: 'token', data: { token: 'thinking...' } },
        { event: 'chat_prompt', data: promptPayload },
        { event: 'done', data: { total_duration_ms: 5 } },
      ]),
    })) as unknown as typeof globalThis.fetch;

    const onToken = vi.fn();
    const onChatPrompt = vi.fn();

    const client = new MCPClient('http://x', 'dep_test_key');
    await client.resumeAgent(
      'http://mcps:4001',
      'cid-abc',
      { value: 'rag' },
      {
        onToken,
        onChatPrompt,
      }
    );

    expect(onToken).toHaveBeenCalledWith('thinking...');
    expect(onChatPrompt).toHaveBeenCalledTimes(1);
    expect(onChatPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: 'cid-abc',
        type: 'choice',
      })
    );
  });

  test('throws on 401 with auth hint', async () => {
    const { MCPClient } = await import('../client/mcp-client');

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '',
    })) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://x', 'bad-key');
    await expect(
      client.resumeAgent('http://mcps:4001', 'cid', { value: 'x' }, { onToken: () => {} })
    ).rejects.toThrow(/Authentication failed \(401\)/);
  });

  test('throws on 429 with Retry-After hint', async () => {
    const { MCPClient } = await import('../client/mcp-client');

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
      text: async () => '',
    })) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://x', 'k');
    await expect(
      client.resumeAgent('http://mcps:4001', 'cid', { value: 'x' }, { onToken: () => {} })
    ).rejects.toThrow(/Retry after 30 seconds/);
  });
});

// ============================================================================
// runChatTurn — orchestrates initial stream + HITL resume loop
// ============================================================================

describe('runChatTurn', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /**
   * Build a fake MCPClient just rich enough for runChatTurn to drive.
   * Each "step" is a list of SSE-like events to deliver via the callbacks
   * configured by runChatTurn. The client invokes them synchronously.
   */
  function makeFakeClient(steps: Array<Array<{ kind: string; data: unknown }>>) {
    let stepIndex = 0;
    const calls: { method: string; args: unknown[] }[] = [];

    function deliver(events: Array<{ kind: string; data: unknown }>, opts: any) {
      for (const ev of events) {
        if (ev.kind === 'token') opts.onToken?.(ev.data as string);
        else if (ev.kind === 'citation') opts.onCitation?.(ev.data);
        else if (ev.kind === 'chat_prompt') opts.onChatPrompt?.(ev.data);
        else if (ev.kind === 'error') opts.onError?.(ev.data);
        else if (ev.kind === 'answer_replace') opts.onAnswerReplace?.(ev.data);
        else if (ev.kind === 'answer_verified') opts.onAnswerVerified?.(ev.data);
        else if (ev.kind === 'verification') opts.onVerification?.(ev.data);
        else if (ev.kind === 'answer_blocked') opts.onAnswerBlocked?.(ev.data);
      }
    }

    return {
      calls,
      chatStream: vi.fn(async (streamUrl: string, message: string, opts: any) => {
        calls.push({ method: 'chatStream', args: [streamUrl, message, opts] });
        deliver(steps[stepIndex++] ?? [], opts);
      }),
      resumeAgent: vi.fn(async (url: string, cid: string, decision: unknown, opts: any) => {
        calls.push({ method: 'resumeAgent', args: [url, cid, decision, opts] });
        deliver(steps[stepIndex++] ?? [], opts);
      }),
    };
  }

  // v1.5.0 — SSE catch-up. The v1.4.3 CLI dropped these events
  // entirely, so `fullResponse` was the raw pre-verification draft
  // (chart-JSON dumps, un-swapped Guardian text) and got persisted
  // to chat history + fed back next turn, compounding divergence.
  test('answer_replace — returned response is the cleaned final_answer, not the streamed draft', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [
        { kind: 'token', data: '```chart\n{"raw":"draft"}\n```' },
        {
          kind: 'answer_replace',
          data: { id: 'a1', final_answer: 'The population is 67M.', reason: 'guardian-swap' },
        },
      ],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    // fullResponse is the canonical answer — NOT the pre-verification draft.
    expect(response).toBe('The population is 67M.');
  });

  test('answer_blocked (no fallback) — returned response is empty (draft suppressed)', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'Unverified hallucination.' },
        { kind: 'answer_blocked', data: { id: 'a1', reason: 'guardian:unsupported_claim' } },
      ],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    // Blocked with no fallback → empty response so the caller drops
    // the assistant slot from history rather than persisting an
    // unverified draft.
    expect(response).toBe('');
  });

  test('answer_blocked with fallback — returns the safe fallback_answer', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'Bad draft.' },
        {
          kind: 'answer_blocked',
          data: { id: 'a1', reason: 'guardian', fallback_answer: 'I cannot confirm this.' },
        },
      ],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    // Fallback is a safe answer the server explicitly offered → persist it.
    expect(response).toBe('I cannot confirm this.');
  });

  test('verification with action=human_review keeps the answer + surfaces issues', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'Answer with caveats.' },
        {
          kind: 'verification',
          data: {
            validated: true,
            passed: false,
            action: 'human_review',
            issues: [{ severity: 'warning', message: 'partial citation' }],
            recommendation: 'Ask for more sources.',
          },
        },
      ],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    // human_review keeps the answer as-is — the caveats are surfaced
    // alongside but the answer is still returned + persistable.
    expect(response).toBe('Answer with caveats.');
  });

  test('single turn (no chat_prompt) — calls chatStream once, returns full response', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'Hello ' },
        { kind: 'token', data: 'world' },
      ],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Hi',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    expect(response).toBe('Hello world');
    expect(client.chatStream).toHaveBeenCalledTimes(1);
    expect(client.resumeAgent).not.toHaveBeenCalled();
  });

  test('one chat_prompt → handle then resume once', async () => {
    const { runChatTurn } = await import('../chat');
    const choicePrompt = makeChoicePrompt();
    const client = makeFakeClient([
      // initial stream emits a token then pauses
      [
        { kind: 'token', data: 'Thinking... ' },
        { kind: 'chat_prompt', data: choicePrompt },
      ],
      // resume stream emits final tokens
      [{ kind: 'token', data: 'Done.' }],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'pick-first',
    });

    expect(response).toBe('Thinking... Done.');
    expect(client.chatStream).toHaveBeenCalledTimes(1);
    expect(client.resumeAgent).toHaveBeenCalledTimes(1);
    // first option of choicePrompt is `rag`
    const resumeCall = client.calls.find((c) => c.method === 'resumeAgent')!;
    // Resume must hit the SAME URL as the initial stream (H1 fix —
    // Edge Runtime in non-direct mode, direct MCP otherwise).
    expect(resumeCall.args[0]).toBe('http://edge:9000');
    expect(resumeCall.args[1]).toBe(choicePrompt.correlation_id);
    expect(resumeCall.args[2]).toEqual({ value: 'rag' });
  });

  // v1.5.0 — inline `/chat-stream` gates (scope, source, exhaustive-
  // confirm, S4, S5, clarification) carry no `correlation_id`. The
  // v1.4.3 CLI POST'd `/api/agent-resume { correlation_id: undefined }`
  // → hard 400 → the user's decision was silently discarded. The fix
  // branches on presence: absent → re-POST /chat-stream with
  // `chatPromptContext { original_query, selected_value, prompt_type }`.
  test('inline gate (no correlation_id) → re-POSTs /chat-stream with chatPromptContext', async () => {
    const { runChatTurn } = await import('../chat');
    const inlinePrompt = makeChoicePrompt({
      correlation_id: undefined,
      waiting_for: 'scope',
    });
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'Which scope? ' },
        { kind: 'chat_prompt', data: inlinePrompt },
      ],
      [{ kind: 'token', data: 'Done.' }],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Search for X',
      conversationHistory: [],
      onAmbiguous: 'pick-first',
    });

    expect(response).toBe('Which scope? Done.');
    // Resume must go through chatStream (NOT resumeAgent), with the
    // original message and a fully-populated chatPromptContext.
    expect(client.resumeAgent).not.toHaveBeenCalled();
    expect(client.chatStream).toHaveBeenCalledTimes(2);
    const resumeCall = client.calls.filter((c) => c.method === 'chatStream')[1];
    expect(resumeCall.args[1]).toBe('Search for X');
    const resumeOpts = resumeCall.args[2] as { chatPromptContext?: unknown };
    expect(resumeOpts.chatPromptContext).toEqual({
      original_query: 'Search for X',
      selected_value: 'rag',
      prompt_type: 'choice',
    });
  });

  test('chained chat_prompts (disambiguate → confirm → done) → resumes twice', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [{ kind: 'chat_prompt', data: makeChoicePrompt({ correlation_id: 'c1' }) }],
      [{ kind: 'chat_prompt', data: makeConfirmPrompt({ correlation_id: 'c2' }) }],
      [{ kind: 'token', data: 'final' }],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'pick-first',
    });

    expect(response).toBe('final');
    expect(client.resumeAgent).toHaveBeenCalledTimes(2);
    // first resume: choice → 'rag' (options[0], no default_choice),
    // second resume: confirm → 'skip' (safe default for confirm gates
    // without server-supplied default_choice — see v1.5.0 pick-first
    // safety fix).
    const resumeCalls = client.calls.filter((c) => c.method === 'resumeAgent');
    expect(resumeCalls[0].args[2]).toEqual({ value: 'rag' });
    expect(resumeCalls[1].args[2]).toEqual({ value: 'skip' });
  });

  test('citations are collected and printed', async () => {
    const { runChatTurn } = await import('../chat');
    const citation = { document_name: 'doc-A.pdf', page: 12, content: 'snippet' };
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'answer' },
        { kind: 'citation', data: citation },
      ],
    ]);

    await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    const logs = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logs).toContain('Sources');
    expect(logs).toContain('doc-A.pdf');
    expect(logs).toContain('p.12');
  });

  test('passes directMcp flag and streamUrl through to chatStream', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([[{ kind: 'token', data: 'ok' }]]);

    await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://mcps:4001',
      directMcp: true,
      message: 'Q',
      conversationHistory: [{ role: 'user', content: 'prev' }],
      onAmbiguous: 'fail',
    });

    const [streamUrl, , opts] = client.calls[0].args as [string, string, Record<string, unknown>];
    expect(streamUrl).toBe('http://mcps:4001');
    expect(opts.directMcp).toBe(true);
    expect(opts.conversationHistory).toEqual([{ role: 'user', content: 'prev' }]);
    expect(opts.language).toBe('fr');
  });

  test('onError callback writes to console.error without aborting', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([
      [
        { kind: 'token', data: 'partial ' },
        { kind: 'error', data: { error: 'transient', message: 'flaky' } },
        { kind: 'token', data: 'recovered' },
      ],
    ]);

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
    });

    expect(response).toBe('partial recovered');
    const errors = consoleErrorSpy.mock.calls.flat().map(String).join('\n');
    expect(errors).toContain('flaky');
  });

  test('uses custom prompter for prompt mode', async () => {
    const { runChatTurn } = await import('../chat');
    const choicePrompt = makeChoicePrompt();
    const client = makeFakeClient([
      [{ kind: 'chat_prompt', data: choicePrompt }],
      [{ kind: 'token', data: 'done' }],
    ]);

    const customPrompter = vi
      .fn<(p: SSEChatPrompt) => Promise<AgentResumePayload>>()
      .mockResolvedValue({ value: 'web_search' });

    const response = await runChatTurn({
      client: client as unknown as import('../client/mcp-client').MCPClient,
      streamUrl: 'http://edge:9000',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'prompt',
      prompter: customPrompter,
    });

    expect(response).toBe('done');
    expect(customPrompter).toHaveBeenCalledWith(choicePrompt);
    const resumeCall = client.calls.find((c) => c.method === 'resumeAgent')!;
    expect(resumeCall.args[2]).toEqual({ value: 'web_search' });
  });

  test('fail mode propagates the error from handleChatPrompt', async () => {
    const { runChatTurn } = await import('../chat');
    const client = makeFakeClient([[{ kind: 'chat_prompt', data: makeChoicePrompt() }]]);

    await expect(
      runChatTurn({
        client: client as unknown as import('../client/mcp-client').MCPClient,
        streamUrl: 'http://edge:9000',
        mcpDirectUrl: 'http://mcps:4001',
        directMcp: false,
        message: 'Q',
        conversationHistory: [],
        onAmbiguous: 'fail',
      })
    ).rejects.toThrow(/Agent paused/);

    expect(client.resumeAgent).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeSSEBody(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}
