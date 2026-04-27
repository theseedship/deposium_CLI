/**
 * Tests for MCPClient.validateFoncier + fetchValidateReport.
 *
 * Mock the underlying `fetch` (for /mcp SSE) and the axios instance (for
 * /api/v1/reports) and exercise the orchestration loop:
 *   - Single-stream happy path → validate:complete terminal
 *   - Failure path → validate:failed terminal
 *   - Pause + Mode A resume (no hitl_response in second call)
 *   - Pause + Mode B resume (hitl_response carried in second call)
 *   - fetchValidateReport: 200 / 401 / 404
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('chalk', () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ succeed: () => {}, fail: () => {}, text: '' }) }),
}));

import { MCPClient } from '../client/mcp-client';
import type { ValidateChatPrompt } from '../client/validate-types';

// ---------------------------------------------------------------------------
// Helpers — build SSE responses + decorate fetch.
// ---------------------------------------------------------------------------

/**
 * Encode a list of (event, payload) pairs as a single SSE body string,
 * wrap in a ReadableStream, and return a Response-shaped fake.
 */
function makeSSEResponse(chunks: Array<{ event: string; data: unknown }>): Response {
  const encoder = new TextEncoder();
  const body = chunks.map((c) => `event: ${c.event}\ndata: ${JSON.stringify(c.data)}\n\n`).join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers(),
  } as unknown as Response;
}

const RUN_ID = 'run-validate-1';
const CORR_ID = 'corr-1';

const startEvent = {
  event: 'validate:start',
  data: {
    run_id: RUN_ID,
    dossier_id: 'd-1',
    level: 'both',
    thematics: [{ key: 't1', label_fr: 'T1' }],
    document_count: 1,
    started_at: '2026-04-27T10:00:00Z',
  },
};

const completeEvent = {
  event: 'validate:complete',
  data: {
    run_id: RUN_ID,
    status: 'complete',
    verdicts_summary: { thematic_pass: 1, thematic_fail: 0 },
    finished_at: '2026-04-27T10:05:00Z',
  },
};

const failedEvent = {
  event: 'validate:failed',
  data: {
    run_id: RUN_ID,
    error: { message: 'timeout', code: 'EXTRACT_TIMEOUT' },
    failed_at: { thematic_key: 't1' },
    resumable: true,
  },
};

const chatPromptMissingDoc: { event: string; data: ValidateChatPrompt } = {
  event: 'chat_prompt',
  data: {
    type: 'chat_prompt',
    run_id: RUN_ID,
    correlation_id: CORR_ID,
    waiting_for: 'missing_document',
    prompt_type: 'form',
    title: 'Upload missing piece',
    description: 'DPE manquant',
    fields: [
      {
        type: 'file_upload',
        name: 'dpe_file',
        label: 'Upload DPE:',
        accept: 'application/pdf',
        max_size_mb: 10,
        multiple: false,
        required: true,
      },
    ],
    submit_label: 'Upload',
    context: { run_id: RUN_ID, thematic_key: 'diagnostics_techniques', iteration_index: 1 },
  },
};

const chatPromptClassif: { event: string; data: ValidateChatPrompt } = {
  event: 'chat_prompt',
  data: {
    type: 'chat_prompt',
    run_id: RUN_ID,
    correlation_id: CORR_ID,
    waiting_for: 'classification_correction',
    prompt_type: 'form',
    title: 'Quel type de pièce ?',
    description: 'doc-inconnu.pdf',
    fields: [
      {
        type: 'select',
        name: 'thematic_key',
        label: 'Choose thematic',
        options: [
          { value: 'titre_propriete', label: 'Titre' },
          { value: 'skip', label: 'Skip' },
        ],
        required: true,
      },
    ],
    submit_label: 'Submit',
    context: { run_id: RUN_ID, iteration_index: 1 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPClient.validateFoncier — single stream', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(() => Promise.resolve({ data: {} })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
      defaults: { headers: { common: {} } },
    } as unknown as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('happy path: dispatches every event and terminates on validate:complete', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeSSEResponse([startEvent, completeEvent])));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const events: string[] = [];
    const client = new MCPClient('http://localhost:3000', 'dep_live_test');
    const result = await client.validateFoncier(
      { dossier_id: 'd-1', level: 'both', on_ambiguity: 'prompt' },
      {
        onEvent: (name) => {
          events.push(name);
        },
        onChatPrompt: async () => {
          throw new Error('should not be called');
        },
      }
    );

    expect(result).toEqual({ run_id: RUN_ID, status: 'complete' });
    expect(events).toEqual(['validate:start', 'validate:complete']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('terminal validate:failed propagates status=failed', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeSSEResponse([startEvent, failedEvent]))
    ) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://localhost:3000', 'dep_live_test');
    const result = await client.validateFoncier(
      { dossier_id: 'd-1', level: 1, on_ambiguity: 'prompt' },
      { onEvent: () => {}, onChatPrompt: async () => ({ mode: 'a' }) }
    );

    expect(result.status).toBe('failed');
  });

  test('first request body wraps the input in a JSON-RPC tools/call envelope', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return Promise.resolve(makeSSEResponse([startEvent, completeEvent]));
    }) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://localhost:3000', 'dep_live_test');
    await client.validateFoncier(
      { dossier_id: 'd-1', level: 'both', on_ambiguity: 'prompt', language: 'fr' },
      { onEvent: () => {}, onChatPrompt: async () => ({ mode: 'a' }) }
    );

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.method).toBe('tools/call');
    expect(parsed.params.name).toBe('deposium_validate_foncier');
    expect(parsed.params.arguments).toEqual({
      dossier_id: 'd-1',
      level: 'both',
      on_ambiguity: 'prompt',
      language: 'fr',
    });
  });

  test('POST goes to ${baseUrl}/mcp', async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve(makeSSEResponse([completeEvent]));
    }) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://localhost:3000', 'k');
    await client.validateFoncier(
      { dossier_id: 'd-1', level: 1, on_ambiguity: 'prompt' },
      { onEvent: () => {}, onChatPrompt: async () => ({ mode: 'a' }) }
    );

    expect(capturedUrl).toBe('http://localhost:3000/mcp');
  });
});

describe('MCPClient.validateFoncier — Mode A resume (re-classify)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      defaults: { headers: { common: {} } },
    } as unknown as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('chat_prompt → onChatPrompt returns mode=a → second call has run_id, no hitl_response', async () => {
    const bodies: string[] = [];
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      bodies.push(init?.body as string);
      // First call: emit chat_prompt (pause). Second call: terminal.
      if (bodies.length === 1) {
        return Promise.resolve(makeSSEResponse([startEvent, chatPromptMissingDoc]));
      }
      return Promise.resolve(makeSSEResponse([startEvent, completeEvent]));
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const onChatPrompt = vi.fn().mockResolvedValue({ mode: 'a' });

    const client = new MCPClient('http://localhost:3000', 'k');
    const result = await client.validateFoncier(
      { dossier_id: 'd-1', level: 'both', on_ambiguity: 'prompt' },
      { onEvent: () => {}, onChatPrompt }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(onChatPrompt).toHaveBeenCalledOnce();
    expect(result).toEqual({ run_id: RUN_ID, status: 'complete' });

    // Second call body: same dossier + run_id, no hitl_response.
    const secondCall = JSON.parse(bodies[1]);
    expect(secondCall.params.arguments.run_id).toBe(RUN_ID);
    expect(secondCall.params.arguments.hitl_response).toBeUndefined();
  });
});

describe('MCPClient.validateFoncier — Mode B resume (structured response)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      defaults: { headers: { common: {} } },
    } as unknown as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('chat_prompt → mode=b → second call carries hitl_response', async () => {
    const bodies: string[] = [];
    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
      bodies.push(init?.body as string);
      if (bodies.length === 1) {
        return Promise.resolve(makeSSEResponse([startEvent, chatPromptClassif]));
      }
      return Promise.resolve(makeSSEResponse([completeEvent]));
    }) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://localhost:3000', 'k');
    const result = await client.validateFoncier(
      { dossier_id: 'd-1', level: 1, on_ambiguity: 'prompt' },
      {
        onEvent: () => {},
        onChatPrompt: async () => ({
          mode: 'b',
          hitlResponse: {
            correlation_id: CORR_ID,
            fields: { thematic_key: 'titre_propriete' },
          },
        }),
      }
    );

    expect(result.status).toBe('complete');
    const secondCall = JSON.parse(bodies[1]);
    expect(secondCall.params.arguments.run_id).toBe(RUN_ID);
    expect(secondCall.params.arguments.hitl_response).toEqual({
      correlation_id: CORR_ID,
      fields: { thematic_key: 'titre_propriete' },
    });
  });
});

describe('MCPClient.validateFoncier — error propagation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      defaults: { headers: { common: {} } },
    } as unknown as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('stream that ends without a terminal event throws', async () => {
    globalThis.fetch = vi.fn(
      () => Promise.resolve(makeSSEResponse([startEvent])) // no complete/failed
    ) as unknown as typeof globalThis.fetch;

    const client = new MCPClient('http://localhost:3000', 'k');
    await expect(
      client.validateFoncier(
        { dossier_id: 'd-1', level: 1, on_ambiguity: 'prompt' },
        { onEvent: () => {}, onChatPrompt: async () => ({ mode: 'a' }) }
      )
    ).rejects.toThrow(/ended without a terminal event/);
  });
});

describe('MCPClient.fetchValidateReport', () => {
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSpy = vi.fn();
    vi.spyOn(axios, 'create').mockReturnValue({
      get: getSpy,
      post: vi.fn(),
      delete: vi.fn(),
      defaults: { headers: { common: {} } },
    } as unknown as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('GET /api/v1/reports/<run_id>?format=json on success', async () => {
    const fakeReport = {
      run_id: RUN_ID,
      dossier_id: 'd-1',
      level_requested: 1,
      status: 'complete',
    };
    getSpy.mockResolvedValueOnce({ data: fakeReport });

    const client = new MCPClient('http://localhost:3000', 'k');
    const report = await client.fetchValidateReport(RUN_ID);

    expect(getSpy).toHaveBeenCalledWith(
      `/api/v1/reports/${RUN_ID}?format=json`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Request-ID': expect.any(String) }),
      })
    );
    expect(report).toEqual(fakeReport);
  });

  test('404 throws a descriptive error mentioning the run_id', async () => {
    const err = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    getSpy.mockRejectedValueOnce(err);
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    const client = new MCPClient('http://localhost:3000', 'k');
    await expect(client.fetchValidateReport(RUN_ID)).rejects.toThrow(
      new RegExp(`Report not found for run_id=${RUN_ID}`)
    );
  });
});
