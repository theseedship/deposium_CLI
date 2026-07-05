/**
 * SSE streaming helpers for chat / agent-resume.
 *
 * Extracted from MCPClient as standalone functions so the client class
 * stays focused on HTTP API methods. The chat-stream pipeline is:
 *
 *   postSSE(url, body, ctx)  →  Response
 *   parseSSEStream(response, options)  →  void (drives onToken / onCitation / …)
 *
 * Each function takes whatever transport state it needs explicitly
 * (api key, base URL for error messages) so they're trivially unit-
 * testable and can move to an SDK package later without dragging
 * MCPClient with them.
 *
 * @module client/sse-stream
 */
import { buildAuthError } from './auth-error';
import { connectionRefusedError } from './http-errors';
import { parseSSEEvent } from './internals';
import { hasErrorCauseWithCode } from '../utils/errors';
import type {
  ChatStreamOptions,
  SSEMetadata,
  SSEToolCall,
  SSECitation,
  SSEDone,
  SSEError,
  SSEChatPrompt,
  SSEAnswerReplace,
  SSEAnswerVerified,
  SSEVerification,
  SSEAnswerBlocked,
} from './types';

/**
 * Context bundle carried into each SSE call — covers what the helpers
 * need to identify the caller (User-Agent), authenticate (X-API-Key),
 * and surface friendly error messages (baseUrl for "Cannot connect").
 */
export interface SSEStreamContext {
  baseUrl: string;
  apiKey?: string;
  userAgent: string;
}

/**
 * Shared POST for SSE endpoints — sets headers, normalizes ECONNREFUSED
 * into the canonical connection-refused error, handles 401 / 429 / generic
 * non-2xx into typed errors, and returns the live response for streaming.
 *
 * `label` is used in non-401/429 error messages ("Chat stream error (500)")
 * so different callers get distinguishable diagnostics.
 */
export async function postSSE(
  url: string,
  body: string,
  ctx: SSEStreamContext,
  label: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // `/mcp` hard-requires both content types via its acceptHeaderGuard —
    // a bare fetch call defaults to `*/*` which the server 406s
    // (`accept_invalid`). Mirror the exact value the axios client sets
    // in the MCPClient constructor so both transports behave the same.
    Accept: 'application/json, text/event-stream',
    'User-Agent': ctx.userAgent,
    // Same caller tag as the constructor's axios default headers.
    // Mirrored explicitly here because this path uses native fetch
    // (axios path is separate) and would otherwise drop the header.
    'X-Client-Type': 'cli',
  };
  if (ctx.apiKey) {
    headers['X-API-Key'] = ctx.apiKey;
  }

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body });
  } catch (error) {
    // Native fetch wraps the underlying socket error in `cause`.
    if (hasErrorCauseWithCode(error, 'ECONNREFUSED')) {
      throw connectionRefusedError(ctx.baseUrl);
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 401) {
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }
      throw buildAuthError(parsed);
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') ?? '60';
      throw new Error(
        `Rate limit exceeded (429)\n` +
          `Retry after ${retryAfter} seconds.\n` +
          `Contact your administrator to upgrade your rate-limit tier.`
      );
    }
    const text = await response.text().catch(() => '');
    throw new Error(`${label} error (${response.status}): ${text || response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`No response body from ${label.toLowerCase()}`);
  }

  return response;
}

/**
 * Parse a chat-mode SSE stream and dispatch events. Shared between
 * `chatStream` and `resumeAgent`. Reads chunks, splits on `\n\n`,
 * delegates each chunk to `handleSSEChunk` / `dispatchSSEEvent`.
 *
 * Consumer callbacks (`onToken`, `onMetadata`, …) errors PROPAGATE —
 * only malformed JSON in a `data:` line is silently skipped. Swallowing
 * consumer errors here would mask real bugs in SDK callers.
 */
export async function parseSSEStream(
  response: Response,
  options: ChatStreamOptions
): Promise<void> {
  const responseBody = response.body;
  if (!responseBody) {
    throw new Error('SSE response has no body');
  }
  const reader = responseBody.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;

    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      handleSSEChunk(part, options);
    }
  }

  // Flush any trailing chunk that didn't end with \n\n (rare at stream close)
  if (buffer.trim()) {
    handleSSEChunk(buffer, options);
  }
}

/**
 * Parse one chat-mode SSE chunk and dispatch. Exported for testing —
 * `mcp-client.test.ts` exercises the catch-scope contract directly
 * (malformed JSON skipped, callback errors propagate).
 */
export function handleSSEChunk(part: string, options: ChatStreamOptions): void {
  if (!part.trim()) return;

  const { eventType, dataStr } = parseSSEEvent(part);
  if (!eventType || !dataStr) return;

  // Catch ONLY JSON parse failures — a malformed `data:` payload is
  // expected to be skipped (a warning event usually follows). Errors
  // thrown by consumer callbacks (`onToken`, `onChatPrompt`, …) must
  // propagate; swallowing them masks real bugs in SDK consumers and
  // makes the stream look like it's silently stalling.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    return;
  }
  dispatchSSEEvent(eventType, parsed, options);
}

/** Dispatch a parsed chat-mode SSE event to the appropriate callback. */
export function dispatchSSEEvent(
  eventType: string,
  data: Record<string, unknown>,
  options: ChatStreamOptions
): void {
  switch (eventType) {
    case 'token':
      options.onToken((data as unknown as { token: string }).token ?? '');
      break;
    case 'metadata':
      options.onMetadata?.(data as unknown as SSEMetadata);
      break;
    case 'citation':
      options.onCitation?.(data as unknown as SSECitation);
      break;
    case 'tool_call':
      options.onToolCall?.(data as unknown as SSEToolCall);
      break;
    case 'done':
      options.onDone?.(data as unknown as SSEDone);
      break;
    case 'error':
      options.onError?.(data as unknown as SSEError);
      break;
    case 'chat_prompt':
      if (options.onChatPrompt) {
        options.onChatPrompt(data as unknown as SSEChatPrompt);
      } else {
        // SDK consumers who don't register a handler would otherwise see
        // the stream silently stall. Surface the drop so they can wire
        // one up (or pass `--on-ambiguous=fail` from the CLI).
        console.warn(
          'Received chat_prompt event but no onChatPrompt handler was registered — the prompt was dropped. Register an onChatPrompt callback to respond to HITL pauses.'
        );
      }
      break;
    case 'answer_replace':
      options.onAnswerReplace?.(data as unknown as SSEAnswerReplace);
      break;
    case 'answer_verified':
      options.onAnswerVerified?.(data as unknown as SSEAnswerVerified);
      break;
    case 'verification':
      options.onVerification?.(data as unknown as SSEVerification);
      break;
    case 'answer_blocked':
      options.onAnswerBlocked?.(data as unknown as SSEAnswerBlocked);
      break;
  }
}
