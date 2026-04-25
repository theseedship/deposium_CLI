/**
 * Tests for src/client/mcp-client.ts
 *
 * Tests MCP client functionality including retry logic,
 * error handling, and API communication.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { MCPClient } from '../client/mcp-client';

// Mock ora
vi.mock('ora', () => ({
  default: () => ({
    start: () => ({
      succeed: () => {},
      fail: () => {},
      text: '',
    }),
  }),
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
  },
}));

describe('MCPClient', () => {
  describe('constructor', () => {
    test('should remove trailing slash from baseUrl', () => {
      const client = new MCPClient('http://localhost:3000/', 'api-key');
      // Access private field via any for testing
      expect((client as unknown as { baseUrl: string }).baseUrl).toBe('http://localhost:3000');
    });

    test('should use default options', () => {
      const client = new MCPClient('http://localhost:3000', 'api-key');
      expect((client as unknown as { maxRetries: number }).maxRetries).toBe(3);
      expect((client as unknown as { retryBaseDelay: number }).retryBaseDelay).toBe(1000);
    });

    test('should accept custom options', () => {
      const client = new MCPClient('http://localhost:3000', 'api-key', {
        maxRetries: 5,
        retryBaseDelay: 500,
        timeout: 60000,
      });
      expect((client as unknown as { maxRetries: number }).maxRetries).toBe(5);
      expect((client as unknown as { retryBaseDelay: number }).retryBaseDelay).toBe(500);
    });
  });

  describe('callTool', () => {
    let axiosPostSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      axiosPostSpy = vi.spyOn(axios, 'create').mockReturnValue({
        post: vi.fn(() =>
          Promise.resolve({
            data: { result: { success: true }, isError: false },
          })
        ),
        get: vi.fn(() => Promise.resolve({ data: { status: 'ok' } })),
        defaults: { headers: { common: {} } },
      } as unknown as ReturnType<typeof axios.create>);
    });

    afterEach(() => {
      axiosPostSpy.mockRestore();
    });

    test('should return successful result', async () => {
      const client = new MCPClient('http://localhost:3000', 'api-key');
      const result = await client.callTool('test_tool', { arg: 'value' });

      expect(result.isError).toBe(false);
      expect(result.content).toEqual({ success: true });
    });

    test('should handle API error response', async () => {
      axiosPostSpy.mockReturnValue({
        post: vi.fn(() =>
          Promise.resolve({
            data: { result: 'Error message', isError: true },
          })
        ),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      } as unknown as ReturnType<typeof axios.create>);

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const result = await client.callTool('test_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content).toBe('Error message');
    });
  });

  describe('retry logic', () => {
    test('should not retry on successful response', async () => {
      let callCount = 0;

      const mockAxios = {
        post: vi.fn(() => {
          callCount++;
          return Promise.resolve({
            data: { result: 'success', isError: false },
          });
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      await client.callTool('test', {});

      expect(callCount).toBe(1);
    });

    test('should retry on 503 error', async () => {
      let callCount = 0;

      const mockAxios = {
        post: vi.fn(() => {
          callCount++;
          if (callCount < 3) {
            const error = new AxiosError('Service Unavailable');
            error.response = {
              status: 503,
              statusText: 'Service Unavailable',
              data: {},
              headers: {},
              config: { headers: new AxiosHeaders() },
            };
            return Promise.reject(error);
          }
          return Promise.resolve({
            data: { result: 'success', isError: false },
          });
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key', {
        retryBaseDelay: 10, // Speed up test
      });

      const result = await client.callTool('test', {}, { spinner: false });

      expect(callCount).toBe(3);
      expect(result.isError).toBe(false);
    });

    test('should not retry on 401 error', async () => {
      let callCount = 0;

      const mockAxios = {
        post: vi.fn(() => {
          callCount++;
          const error = new AxiosError('Unauthorized');
          error.response = {
            status: 401,
            statusText: 'Unauthorized',
            data: { message: 'Invalid API key' },
            headers: {},
            config: { headers: new AxiosHeaders() },
          };
          return Promise.reject(error);
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');

      await expect(client.callTool('test', {})).rejects.toThrow('Authentication failed');
      expect(callCount).toBe(1); // No retries
    });

    test('should not retry on 404 error', async () => {
      let callCount = 0;

      const mockAxios = {
        post: vi.fn(() => {
          callCount++;
          const error = new AxiosError('Not Found');
          error.response = {
            status: 404,
            statusText: 'Not Found',
            data: { message: 'Tool not found' },
            headers: {},
            config: { headers: new AxiosHeaders() },
          };
          return Promise.reject(error);
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const result = await client.callTool('test', {});

      expect(callCount).toBe(1); // No retries
      expect(result.isError).toBe(true);
    });

    test('should respect maxRetries setting', async () => {
      let callCount = 0;

      const mockAxios = {
        post: vi.fn(() => {
          callCount++;
          const error = new AxiosError('Service Unavailable');
          error.response = {
            status: 503,
            statusText: 'Service Unavailable',
            data: {},
            headers: {},
            config: { headers: new AxiosHeaders() },
          };
          return Promise.reject(error);
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key', {
        maxRetries: 2,
        retryBaseDelay: 10,
      });

      const result = await client.callTool('test', {}, { spinner: false });

      // 1 initial + 2 retries = 3 total
      expect(callCount).toBe(3);
      expect(result.isError).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should throw on ECONNREFUSED', async () => {
      const mockAxios = {
        post: vi.fn(() => {
          const error = new AxiosError('Connection refused');
          error.code = 'ECONNREFUSED';
          return Promise.reject(error);
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');

      await expect(client.callTool('test', {})).rejects.toThrow('Cannot connect to Deposium API');
    });

    test('should not expose stack traces in error response', async () => {
      const mockAxios = {
        post: vi.fn(() => {
          const error = new AxiosError('Server Error');
          error.response = {
            status: 500,
            statusText: 'Internal Server Error',
            data: {
              message: 'Something went wrong',
              stack: 'Error: at Function.xyz\n    at Object.<anonymous>',
              error: {
                message: 'Inner error',
                stack: 'Inner stack trace',
                code: 'ERR_INTERNAL',
              },
            },
            headers: {},
            config: { headers: new AxiosHeaders() },
          };
          return Promise.reject(error);
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const result = await client.callTool('test', {});

      expect(result.isError).toBe(true);
      expect(result.content.message).toBe('Something went wrong');
      expect(result.content.stack).toBeUndefined(); // Stack should be removed
      expect(result.content.error?.stack).toBeUndefined(); // Nested stack should be removed
      expect(result.content.error?.code).toBe('ERR_INTERNAL'); // Safe fields preserved
    });

    test('should include requestId in error response', async () => {
      const mockAxios = {
        post: vi.fn(() => {
          const error = new AxiosError('Server Error');
          error.response = {
            status: 500,
            statusText: 'Internal Server Error',
            data: { message: 'Error' },
            headers: {},
            config: { headers: new AxiosHeaders() },
          };
          return Promise.reject(error);
        }),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const result = await client.callTool('test', {});

      expect(result.content.requestId).toBeDefined();
      expect(result.content.requestId).toMatch(/^cli-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('listTools', () => {
    test('should return tools array on success', async () => {
      const mockTools = [{ name: 'tool1' }, { name: 'tool2' }];

      const mockAxios = {
        post: vi.fn(() =>
          Promise.resolve({
            data: { result: { tools: mockTools }, isError: false },
          })
        ),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const tools = await client.listTools();

      expect(tools).toEqual(mockTools);
    });

    test('should return empty array on error', async () => {
      const mockAxios = {
        post: vi.fn(() =>
          Promise.resolve({
            data: { result: 'Error', isError: true },
          })
        ),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const tools = await client.listTools();

      expect(tools).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  describe('health', () => {
    test('should return health data on success', async () => {
      const healthData = { status: 'healthy', services: { mcp: 'up' } };

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: healthData })),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const result = await client.health();

      expect(result).toEqual(healthData);
    });

    test('should throw on connection refused', async () => {
      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => {
          const error = new AxiosError('Connection refused');
          error.code = 'ECONNREFUSED';
          return Promise.reject(error);
        }),
        defaults: { headers: { common: {} } },
      };

      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');

      await expect(client.health()).rejects.toThrow('Cannot connect to Deposium API');
    });
  });

  describe('chatStream', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    function makeSSE(events: Array<{ event: string; data: unknown }>): string {
      return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
    }

    function mockFetchSSE(sseBody: string, status = 200, headers: Record<string, string> = {}) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody));
          controller.close();
        },
      });

      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: new Headers(headers),
        body: stream,
        text: () => Promise.resolve(''),
      } as Response);
    }

    test('should use /chat-stream path for Edge Runtime (default)', async () => {
      const sse = makeSSE([
        { event: 'token', data: { token: 'Hello' } },
        { event: 'done', data: { total_duration_ms: 100, tools_called: [] } },
      ]);
      mockFetchSSE(sse);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const tokens: string[] = [];

      await client.chatStream('http://localhost:9000', 'test message', {
        onToken: (t) => tokens.push(t),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:9000/chat-stream',
        expect.objectContaining({ method: 'POST' })
      );
      expect(tokens).toEqual(['Hello']);
    });

    test('should use /api/chat-stream path with directMcp=true', async () => {
      const sse = makeSSE([
        { event: 'token', data: { token: 'Direct' } },
        { event: 'done', data: { total_duration_ms: 50, tools_called: [] } },
      ]);
      mockFetchSSE(sse);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const tokens: string[] = [];

      await client.chatStream('http://localhost:4001', 'test', {
        directMcp: true,
        onToken: (t) => tokens.push(t),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:4001/api/chat-stream',
        expect.objectContaining({ method: 'POST' })
      );
      expect(tokens).toEqual(['Direct']);
    });

    test('should include X-API-Key header in request', async () => {
      mockFetchSSE(makeSSE([{ event: 'done', data: { total_duration_ms: 0, tools_called: [] } }]));

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'my-secret-key');
      await client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} });

      const fetchCall = fetchSpy!.mock.calls[0];
      const reqInit = fetchCall[1] as RequestInit;
      expect((reqInit.headers as Record<string, string>)['X-API-Key']).toBe('my-secret-key');
    });

    test('should throw on 401 authentication error', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: () => Promise.resolve(''),
      } as Response);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'bad-key');

      await expect(
        client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} })
      ).rejects.toThrow('Authentication failed (401)');
    });

    test('should throw on 429 with Retry-After header', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '30' }),
        text: () => Promise.resolve(''),
      } as Response);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');

      await expect(
        client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} })
      ).rejects.toThrow(/Rate limit exceeded.*429/);

      // Verify the error message includes the Retry-After value
      try {
        await client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} });
      } catch (error) {
        expect((error as Error).message).toContain('30 seconds');
        expect((error as Error).message).toContain('rate-limit tier');
      }
    });

    test('should default Retry-After to 60 seconds when header missing', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers(),
        text: () => Promise.resolve(''),
      } as Response);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');

      try {
        await client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} });
      } catch (error) {
        expect((error as Error).message).toContain('60 seconds');
      }
    });

    test('should dispatch citation events', async () => {
      const citation = {
        document_id: 'doc-1',
        document_name: 'Guide.pdf',
        page: 5,
        snippet: 'relevant text',
        score: 0.95,
      };
      const sse = makeSSE([
        { event: 'token', data: { token: 'See: ' } },
        { event: 'citation', data: citation },
        { event: 'done', data: { total_duration_ms: 200, tools_called: [] } },
      ]);
      mockFetchSSE(sse);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      const citations: unknown[] = [];

      await client.chatStream('http://localhost:9000', 'question', {
        onToken: () => {},
        onCitation: (c) => citations.push(c),
      });

      expect(citations).toHaveLength(1);
      expect(citations[0]).toMatchObject({
        document_id: 'doc-1',
        document_name: 'Guide.pdf',
        page: 5,
      });
    });

    test('should strip trailing slash from streamBaseUrl', async () => {
      mockFetchSSE(makeSSE([{ event: 'done', data: { total_duration_ms: 0, tools_called: [] } }]));

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');
      await client.chatStream('http://localhost:9000/', 'hi', { onToken: () => {} });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:9000/chat-stream', // No double slash
        expect.any(Object)
      );
    });

    test('should throw on generic HTTP errors with status and body', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers(),
        text: () => Promise.resolve('upstream error'),
      } as Response);

      const mockAxios = {
        post: vi.fn(() => Promise.resolve({ data: {} })),
        get: vi.fn(() => Promise.resolve({ data: {} })),
        defaults: { headers: { common: {} } },
      };
      vi.spyOn(axios, 'create').mockReturnValue(
        mockAxios as unknown as ReturnType<typeof axios.create>
      );

      const client = new MCPClient('http://localhost:3000', 'api-key');

      await expect(
        client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} })
      ).rejects.toThrow(/Chat stream error.*502.*upstream error/);
    });
  });
});

describe('MCPAuthError (structured 401 from /api/cli/mcp)', () => {
  test('errorCode defaults to "unknown" when missing in body', async () => {
    const { MCPAuthError } = await import('../client/mcp-client');
    const err = new MCPAuthError({ message: 'Whatever' });
    expect(err.errorCode).toBe('unknown');
    expect(err.message).toContain('Whatever');
  });

  test('formats hint + docs into the message', async () => {
    const { MCPAuthError } = await import('../client/mcp-client');
    const err = new MCPAuthError({
      message: 'Invalid API key format',
      error_code: 'format_invalid',
      hint: 'Key must match `dep_(live|test)_<43 base64url chars>`.',
      docs: 'https://docs.deposium.io/api-authentication',
    });
    expect(err.errorCode).toBe('format_invalid');
    expect(err.hint).toContain('dep_(live|test)');
    expect(err.docsUrl).toBe('https://docs.deposium.io/api-authentication');
    expect(err.message).toContain('💡');
    expect(err.message).toContain('📖');
    expect(err.name).toBe('MCPAuthError');
  });

  test('SSE 401 with structured body throws MCPAuthError', async () => {
    const { MCPClient, MCPAuthError } = await import('../client/mcp-client');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          error: 'MCP Auth Error',
          message: 'Key revoked',
          error_code: 'key_invalid',
          hint: 'Generate a new key via `deposium api-keys create`.',
        }),
    } as Response);

    const mockAxios = {
      post: vi.fn(() => Promise.resolve({ data: {} })),
      get: vi.fn(() => Promise.resolve({ data: {} })),
      defaults: { headers: { common: {} } },
    };
    vi.spyOn(axios, 'create').mockReturnValue(
      mockAxios as unknown as ReturnType<typeof axios.create>
    );

    const client = new MCPClient('http://localhost:3000', 'revoked-key');

    let caught: unknown;
    try {
      await client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(MCPAuthError);
    const err = caught as InstanceType<typeof MCPAuthError>;
    expect(err.errorCode).toBe('key_invalid');
    expect(err.hint).toContain('api-keys create');

    fetchSpy.mockRestore();
  });

  test('SSE 401 with non-structured body falls back to plain Error', async () => {
    const { MCPClient, MCPAuthError } = await import('../client/mcp-client');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'token expired' }),
    } as Response);

    const mockAxios = {
      post: vi.fn(() => Promise.resolve({ data: {} })),
      get: vi.fn(() => Promise.resolve({ data: {} })),
      defaults: { headers: { common: {} } },
    };
    vi.spyOn(axios, 'create').mockReturnValue(
      mockAxios as unknown as ReturnType<typeof axios.create>
    );

    const client = new MCPClient('http://localhost:3000', 'expired-key');

    let caught: unknown;
    try {
      await client.chatStream('http://localhost:9000', 'hi', { onToken: () => {} });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(MCPAuthError);
    expect((caught as Error).message).toContain('token expired');

    fetchSpy.mockRestore();
  });
});
