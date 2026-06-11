/**
 * SSE streaming helpers for the dossier validation macro.
 *
 * Unlike chat-mode SSE (see ./sse-stream), validate streams have a
 * pause/resume protocol: the server emits intermediate `validate:*`
 * events, then either pauses on `chat_prompt` (caller decides Mode A
 * upload-and-retry or Mode B structured response) or terminates with
 * `validate:complete` / `validate:failed`.
 *
 * `consumeValidateStream` reads one full response from the wire and
 * returns the next state: a terminal verdict, or a paused prompt the
 * caller will resolve via `validateDossier`'s outer loop.
 *
 * @module client/validate-stream
 */
import { parseSSEEvent } from './internals';
import type {
  ValidateChatPrompt,
  ValidateEvents,
  ValidateEventName,
  ValidateStreamHandlers,
} from './validate-types';

/**
 * One-pass consumer for a validate-stream response. Reads chunks,
 * dispatches per-event callbacks, and resolves as soon as the stream
 * either:
 *   - pauses (`chat_prompt`) — returns the prompt, caller resumes
 *   - terminates (`validate:complete` / `validate:failed`) — returns
 *     `{ run_id, status }` for the outer loop to surface.
 *
 * Throws if the stream closes without a terminal event (the server
 * never emitted complete/failed/chat_prompt).
 */
export async function consumeValidateStream(
  response: Response,
  handlers: ValidateStreamHandlers
): Promise<
  | { kind: 'terminal'; run_id: string; status: 'complete' | 'failed' }
  | { kind: 'paused'; prompt: ValidateChatPrompt }
> {
  const responseBody = response.body;
  if (!responseBody) {
    throw new Error('Validate stream has no body');
  }
  const reader = responseBody.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        const result = await handleValidateChunk(buffer, handlers);
        if (result) return result;
      }
      throw new Error('Validate stream ended without a terminal event');
    }

    buffer += value;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const result = await handleValidateChunk(part, handlers);
      if (result) {
        // Cancel the stream so the connection can close before we resume.
        reader.cancel().catch(() => {});
        return result;
      }
    }
  }
}

/**
 * Parse one validate-stream chunk and dispatch. Returns a paused or
 * terminal marker when the event is `chat_prompt`, `validate:complete`,
 * or `validate:failed`; returns null for intermediate events and the
 * caller continues consuming. Exported for direct unit testing.
 */
export async function handleValidateChunk(
  part: string,
  handlers: ValidateStreamHandlers
): Promise<
  | { kind: 'terminal'; run_id: string; status: 'complete' | 'failed' }
  | { kind: 'paused'; prompt: ValidateChatPrompt }
  | null
> {
  if (!part.trim()) return null;

  const { eventType, dataStr } = parseSSEEvent(part);
  if (!eventType || !dataStr) return null;

  let data: unknown;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return null; // Skip malformed JSON — non-terminal.
  }

  if (eventType === 'chat_prompt') {
    return { kind: 'paused', prompt: data as ValidateChatPrompt };
  }

  if (eventType === 'validate:complete' || eventType === 'validate:failed') {
    const payload = data as ValidateEvents['validate:complete'] | ValidateEvents['validate:failed'];
    await handlers.onEvent(eventType, payload as never);
    return {
      kind: 'terminal',
      run_id: payload.run_id,
      status: eventType === 'validate:complete' ? 'complete' : 'failed',
    };
  }

  // Other validate:* events or generic 'error' — dispatch and continue.
  await handlers.onEvent(eventType as ValidateEventName, data as never);
  return null;
}
