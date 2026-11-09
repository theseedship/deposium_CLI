import { afterEach, expect, test, vi } from 'vitest';
import { runChatTurn } from '../chat';
import type { MCPClient, ChatStreamOptions } from '../client/mcp-client';
const activity = () => ({ start: vi.fn(), phase: vi.fn(), stop: vi.fn() });
afterEach(() => vi.restoreAllMocks());

test('tokens are written as received, with activity stopped before writing', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const output: string[] = [];
  const progress = activity();
  vi.spyOn(process.stdout, 'write').mockImplementation((value: unknown) => {
    if (String(value).includes('first')) expect(progress.stop).toHaveBeenCalled();
    output.push(String(value));
    return true;
  });
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = {
    chatStream: vi.fn(async (_url: string, _message: string, options: ChatStreamOptions) => {
      options.onMetadata?.({} as never);
      options.onToolCall?.({ tool: 'search', status: 'started' });
      options.onToken('first');
      await pause;
      options.onToken(' second');
    }),
  };
  const turn = runChatTurn({
    client: client as unknown as MCPClient,
    streamUrl: 'https://edge.example.test',
    directMcp: false,
    message: 'Q',
    conversationHistory: [],
    onAmbiguous: 'fail',
    activity: progress,
  });
  expect(output.join('')).toContain('first');
  expect(output.join('')).not.toContain('second');
  expect(progress.phase).toHaveBeenCalledWith('Working with tools');
  release();
  expect(await turn).toBe('first second');
});

test('stream failure stops activity and does not publish partial source details', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const progress = activity();
  const details = vi.fn();
  const client = {
    chatStream: vi.fn(async (_url: string, _message: string, options: ChatStreamOptions) => {
      options.onCitation?.({ citation_id: 1, file_id: 1, snippet: 'Partial source' });
      throw new Error('disconnected');
    }),
  };
  await expect(
    runChatTurn({
      client: client as unknown as MCPClient,
      streamUrl: 'https://edge.example.test',
      directMcp: false,
      message: 'Q',
      conversationHistory: [],
      onAmbiguous: 'fail',
      activity: progress,
      onDetails: details,
    })
  ).rejects.toThrow('disconnected');
  expect(progress.stop).toHaveBeenCalled();
  expect(details).toHaveBeenCalledWith({ citations: [], verifications: [] });
});

test('empty tokens do not hide activity and reported stream errors invalidate source inspection', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const progress = activity();
  const details = vi.fn();
  const client = {
    chatStream: vi.fn(async (_url: string, _message: string, options: ChatStreamOptions) => {
      options.onToken('');
      expect(progress.stop).not.toHaveBeenCalled();
      options.onCitation?.({ citation_id: 1, file_id: 1, snippet: 'Partial' });
      options.onError?.({ message: 'Stream interrupted' });
    }),
  };
  await runChatTurn({
    client: client as unknown as MCPClient,
    streamUrl: 'https://edge.example.test',
    directMcp: false,
    message: 'Q',
    conversationHistory: [],
    onAmbiguous: 'fail',
    activity: progress,
    onDetails: details,
  });
  expect(details).toHaveBeenCalledWith({ citations: [], verifications: [] });
});

test.each([false, true])('source inspection requires final stream done (%s)', async (done) => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const details = vi.fn();
  const citation = { citation_id: 1, file_id: 1, snippet: 'Emitted source' };
  const verification = { passed: false, issues: [{ type: 'amount_mismatch', severity: 'high' }] };
  const client = {
    chatStream: vi.fn(async (_url: string, _message: string, options: ChatStreamOptions) => {
      options.onToken('Answer');
      options.onCitation?.(citation);
      options.onVerification?.(verification);
      if (done) options.onDone?.({ total_duration_ms: 1 });
    }),
  };
  await runChatTurn({
    client: client as unknown as MCPClient,
    streamUrl: 'https://edge.example.test',
    directMcp: false,
    message: 'Q',
    conversationHistory: [],
    onAmbiguous: 'fail',
    activity: activity(),
    onDetails: details,
  });
  expect(details).toHaveBeenCalledWith({
    citations: done ? [citation] : [],
    verifications: [verification],
  });
});

test('a gate stream done does not certify a truncated resumed stream', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const details = vi.fn();
  const client = {
    chatStream: vi.fn(async (_url: string, _message: string, options: ChatStreamOptions) => {
      options.onChatPrompt?.({
        type: 'confirm',
        correlation_id: 'gate',
        message: 'Continue?',
      } as never);
      options.onDone?.({ total_duration_ms: 1 });
    }),
    resumeAgent: vi.fn(
      async (_url: string, _id: string, _decision: unknown, options: ChatStreamOptions) => {
        options.onToken('Partial');
        options.onCitation?.({ citation_id: 1, file_id: 1, snippet: 'Partial source' });
        // Transport EOF, deliberately no final done receipt.
      }
    ),
  };
  await runChatTurn({
    client: client as unknown as MCPClient,
    streamUrl: 'https://edge.example.test',
    directMcp: false,
    message: 'Q',
    conversationHistory: [],
    onAmbiguous: 'prompt',
    prompter: async () => ({ action: 'confirm', confirmed: true }),
    activity: activity(),
    onDetails: details,
  });
  expect(client.resumeAgent).toHaveBeenCalledOnce();
  expect(details).toHaveBeenCalledWith({ citations: [], verifications: [] });
});
