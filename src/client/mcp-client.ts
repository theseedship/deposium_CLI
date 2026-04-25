/**
 * MCP Client Module
 *
 * HTTP client for communicating with the Deposium MCP (Model Context Protocol) API.
 * Provides methods for calling tools, listing available tools, health checks,
 * self-service workspace/document/API-key management, and SSE chat streaming.
 *
 * Features:
 * - Automatic retry with exponential backoff for transient errors
 * - Request tracing with unique request IDs
 * - Configurable timeouts
 * - Spinner support for long-running operations
 *
 * @module client/mcp-client
 *
 * @example
 * ```typescript
 * import { MCPClient } from './client/mcp-client';
 *
 * const client = new MCPClient('https://api.deposium.io', 'your-api-key');
 *
 * // Call a tool
 * const result = await client.callTool('search_hub', {
 *   query_text: 'machine learning',
 *   top_k: 10
 * });
 *
 * // List available tools
 * const tools = await client.listTools();
 *
 * // Check health
 * const health = await client.health();
 * ```
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import chalk from 'chalk';
import ora from 'ora';

import pkg from '../../package.json';

/** CLI version for User-Agent header */
const CLI_VERSION = pkg.version;

/** CLI name for User-Agent header */
const CLI_NAME = pkg.name;

// Re-export public types from ./types so existing imports
// `import { MCPTool } from './client/mcp-client'` keep working.
export type {
  MCPToolCall,
  MCPToolResult,
  MCPTool,
  MCPHealthService,
  MCPHealthResponse,
  SSEMetadata,
  SSEToolCall,
  SSECitation,
  SSEDone,
  SSEError,
  SSEChatPromptOption,
  SSEChatPrompt,
  ChatStreamOptions,
  AgentResumePayload,
  MCPSpace,
  MCPDocument,
  MCPDocumentDetail,
  MCPDocumentPagination,
  MCPApiKey,
  MCPApiKeyCreated,
  MCPApiKeyUsage,
  MCPClientOptions,
} from './types';

import type {
  MCPToolResult,
  MCPTool,
  MCPHealthResponse,
  SSEMetadata,
  SSEToolCall,
  SSECitation,
  SSEDone,
  SSEError,
  SSEChatPrompt,
  ChatStreamOptions,
  AgentResumePayload,
  MCPSpace,
  MCPDocument,
  MCPDocumentDetail,
  MCPDocumentPagination,
  MCPApiKey,
  MCPApiKeyCreated,
  MCPApiKeyUsage,
  MCPClientOptions,
} from './types';

// Re-export auth-error types/class so existing imports still resolve.
export { MCPAuthError, type MCPAuthErrorCode, buildAuthError } from './auth-error';

import { buildAuthError } from './auth-error';
import { generateRequestId, isRetryableError, sleep, createAxiosErrorResult } from './internals';

/**
 * HTTP client for the Deposium MCP API
 *
 * Provides methods for calling MCP tools, listing available tools,
 * and performing health checks. Includes automatic retry logic with
 * exponential backoff for transient errors.
 *
 * @example
 * ```typescript
 * const client = new MCPClient('https://api.deposium.io', 'your-api-key');
 *
 * // Search documents
 * const results = await client.callTool('search_hub', {
 *   query_text: 'AI research',
 *   top_k: 10
 * });
 *
 * // Check API health
 * const health = await client.health();
 * console.log(`Status: ${health.status}`);
 * ```
 */
export class MCPClient {
  /** Axios HTTP client instance */
  private readonly client: AxiosInstance;

  /** Base URL of the Deposium API */
  private readonly baseUrl: string;

  /** API key for authentication */
  private readonly apiKey?: string;

  /** Maximum number of retry attempts */
  private readonly maxRetries: number;

  /** Base delay for exponential backoff (ms) */
  private readonly retryBaseDelay: number;

  /**
   * Create a new MCP client instance
   *
   * @param baseUrl - Base URL of the Deposium API (e.g., 'https://api.deposium.io')
   * @param apiKey - API key for authentication
   * @param options - Additional client configuration options
   */
  constructor(baseUrl: string, apiKey?: string, options: MCPClientOptions = {}) {
    // Remove trailing slash to avoid double-slash issues with axios
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelay = options.retryBaseDelay ?? 1000;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': `${CLI_NAME}/${CLI_VERSION} (Node.js ${process.version})`,
    };

    // Add API key to headers if provided (consistent casing with server)
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeout ?? 300000, // 5 minutes for long-running operations
      headers,
    });
  }

  /**
   * Call an MCP tool via HTTP
   *
   * Sends a request to the Deposium API to execute the specified tool
   * with the given arguments. Includes automatic retry with exponential
   * backoff for transient network errors.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options: { silent?: boolean; spinner?: boolean } = {}
  ): Promise<MCPToolResult> {
    const spinner = options.spinner ? ora(`Calling ${chalk.cyan(toolName)}...`).start() : null;
    const requestId = generateRequestId();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Call SolidStart proxy endpoint (validates API key, forwards to MCP backend)
        const response = await this.client.post(
          '/api/cli/mcp',
          {
            tool: toolName,
            params: args,
          },
          {
            headers: {
              'X-Request-ID': requestId,
            },
          }
        );

        spinner?.succeed(`Tool ${chalk.green(toolName)} completed`);

        // New proxy returns { result, isError } format
        if (response.data.isError) {
          return {
            content: response.data.result ?? response.data.error,
            isError: true,
          };
        }

        return {
          content: response.data.result,
          isError: false,
        };
      } catch (error: unknown) {
        const axiosError = error as AxiosError;

        // Check if we should retry
        if (
          axios.isAxiosError(axiosError) &&
          isRetryableError(axiosError) &&
          attempt < this.maxRetries
        ) {
          const delay = this.retryBaseDelay * Math.pow(2, attempt); // Exponential backoff
          if (spinner)
            spinner.text = `Retry ${attempt + 1}/${this.maxRetries} for ${chalk.cyan(toolName)} (waiting ${delay}ms)...`;
          await sleep(delay);
          continue;
        }

        lastError = error as Error;
        break;
      }
    }

    // Handle the final error
    spinner?.fail(`Tool ${chalk.red(toolName)} failed`);
    return this.handleCallToolError(lastError, requestId);
  }

  /** Handle final error from callTool after retries exhausted */
  private handleCallToolError(lastError: Error | null, requestId: string): MCPToolResult {
    if (axios.isAxiosError(lastError)) {
      const { result, shouldThrow, errorToThrow } = createAxiosErrorResult(
        lastError,
        this.baseUrl,
        requestId
      );
      if (shouldThrow && errorToThrow) throw errorToThrow;
      return result;
    }

    return {
      content: { message: lastError?.message ?? 'Unknown error', requestId },
      isError: true,
    };
  }

  /**
   * List all available MCP tools
   */
  async listTools(): Promise<MCPTool[]> {
    const requestId = generateRequestId();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Use the _list_tools pseudo-tool to get available tools via proxy
        const response = await this.client.post(
          '/api/cli/mcp',
          {
            tool: '_list_tools',
            params: {},
          },
          {
            headers: { 'X-Request-ID': requestId },
          }
        );

        // The proxy returns tools in the result field
        if (response.data.isError) {
          console.error(chalk.red('Failed to list tools:'), response.data.result);
          return [];
        }

        return response.data.result?.tools ?? response.data.result ?? [];
      } catch (error) {
        const axiosError = error as AxiosError;
        if (
          axios.isAxiosError(axiosError) &&
          isRetryableError(axiosError) &&
          attempt < this.maxRetries
        ) {
          const delay = this.retryBaseDelay * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
        console.error(chalk.red('Failed to list tools:'), (error as Error).message);
        return [];
      }
    }
    return [];
  }

  /**
   * Check Deposium API health
   */
  async health(): Promise<MCPHealthResponse> {
    const requestId = generateRequestId();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // GET /api/cli/mcp returns health status including MCP backend status
        const response = await this.client.get('/api/cli/mcp', {
          headers: { 'X-Request-ID': requestId },
        });
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        if (
          axios.isAxiosError(axiosError) &&
          isRetryableError(axiosError) &&
          attempt < this.maxRetries
        ) {
          const delay = this.retryBaseDelay * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }

        if (axios.isAxiosError(axiosError)) {
          if (axiosError.code === 'ECONNREFUSED') {
            throw new Error(
              `Cannot connect to Deposium API at ${this.baseUrl}\n` +
                'Make sure the Deposium server is running'
            );
          }
          if (axiosError.response?.status === 401) {
            throw buildAuthError(axiosError.response?.data);
          }
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * List all workspaces ("spaces") accessible to the authenticated user.
   *
   * Calls `GET /api/spaces`. Response is unwrapped from the `{ data, count }`
   * envelope and returned as a plain array.
   */
  async listSpaces(): Promise<MCPSpace[]> {
    const requestId = generateRequestId();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.get<{ data: MCPSpace[]; count: number }>('/api/spaces', {
          headers: { 'X-Request-ID': requestId },
        });
        return response.data.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        if (
          axios.isAxiosError(axiosError) &&
          isRetryableError(axiosError) &&
          attempt < this.maxRetries
        ) {
          await sleep(this.retryBaseDelay * Math.pow(2, attempt));
          continue;
        }

        if (axios.isAxiosError(axiosError)) {
          if (axiosError.code === 'ECONNREFUSED') {
            throw new Error(
              `Cannot connect to Deposium API at ${this.baseUrl}\n` +
                'Make sure the Deposium server is running'
            );
          }
          if (axiosError.response?.status === 401) {
            throw buildAuthError(axiosError.response?.data);
          }
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * List documents/files. Calls `GET /api/v1/documents/`.
   *
   * Without a `spaceId` filter the server returns the user's full document
   * catalog (across all spaces). With a `spaceId` filter the response also
   * includes a pagination envelope.
   */
  async listDocuments(
    options: { spaceId?: string; limit?: number; offset?: number } = {}
  ): Promise<{ items: MCPDocument[]; pagination?: MCPDocumentPagination }> {
    const params = new URLSearchParams();
    if (options.spaceId) params.set('space_id', options.spaceId);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString();
    const path = `/api/v1/documents/${qs ? '?' + qs : ''}`;

    const data = await this.authenticatedRequest<{
      ok: boolean;
      data: { items: MCPDocument[]; pagination?: MCPDocumentPagination };
    }>('GET', path);
    return data.data;
  }

  /** Get full details of a single document by ID. Calls `GET /api/v1/documents/:id`. */
  async getDocument(id: number | string): Promise<MCPDocumentDetail> {
    const data = await this.authenticatedRequest<{ ok: boolean; data: MCPDocumentDetail }>(
      'GET',
      `/api/v1/documents/${id}`
    );
    return data.data;
  }

  /** Delete a document by ID. Calls `DELETE /api/v1/documents/:id`. */
  async deleteDocument(id: number | string): Promise<unknown> {
    return this.authenticatedRequest('DELETE', `/api/v1/documents/${id}`);
  }

  /** List API keys belonging to the authenticated account. Calls `GET /api/api-keys`. */
  async listApiKeys(): Promise<MCPApiKey[]> {
    const response = await this.authenticatedRequest<{ data: MCPApiKey[] }>('GET', '/api/api-keys');
    return response.data;
  }

  /**
   * Create a new API key. Calls `POST /api/api-keys`.
   *
   * The response includes the full secret value — this is the ONLY time
   * the secret is returned by the server. Save it immediately.
   *
   * Plan-gated: requires the `api_access` feature on the account's plan.
   */
  async createApiKey(input: {
    name: string;
    scopes?: string[];
    rate_limit_tier?: string;
  }): Promise<MCPApiKeyCreated> {
    return this.authenticatedRequest<MCPApiKeyCreated>('POST', '/api/api-keys', input);
  }

  /** Delete an API key. Calls `DELETE /api/api-keys/:id`. Irreversible. */
  async deleteApiKey(id: string): Promise<unknown> {
    return this.authenticatedRequest('DELETE', `/api/api-keys/${id}`);
  }

  /**
   * Rotate an API key — invalidates the old secret and generates a new one.
   * Calls `POST /api/api-keys/:id/rotate`. The response includes the new secret.
   */
  async rotateApiKey(id: string): Promise<MCPApiKeyCreated> {
    return this.authenticatedRequest<MCPApiKeyCreated>('POST', `/api/api-keys/${id}/rotate`);
  }

  /** Get usage stats for an API key. Calls `GET /api/api-keys/:id/usage`. */
  async getApiKeyUsage(id: string): Promise<MCPApiKeyUsage> {
    return this.authenticatedRequest<MCPApiKeyUsage>('GET', `/api/api-keys/${id}/usage`);
  }

  /**
   * Internal: HTTP request with the standard retry-on-transient-errors loop
   * + auth-error handling. Used by self-service methods (documents, api-keys).
   *
   * Method dispatch and known-error mapping live in two helpers
   * (`dispatchHttp` and `throwForKnownAxiosError`) so this loop stays under
   * the cyclomatic-complexity ceiling.
   */
  private async authenticatedRequest<T = unknown>(
    method: 'GET' | 'DELETE' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const requestId = generateRequestId();
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.dispatchHttp<T>(method, path, body, requestId);
      } catch (error) {
        const axiosError = error as AxiosError;
        const canRetry =
          axios.isAxiosError(axiosError) &&
          isRetryableError(axiosError) &&
          attempt < this.maxRetries;
        if (canRetry) {
          await sleep(this.retryBaseDelay * Math.pow(2, attempt));
          continue;
        }
        if (axios.isAxiosError(axiosError)) {
          this.throwForKnownAxiosError(axiosError, path);
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  /** Internal: dispatch the HTTP method to the underlying axios client. */
  private async dispatchHttp<T>(
    method: 'GET' | 'DELETE' | 'POST',
    path: string,
    body: unknown,
    requestId: string
  ): Promise<T> {
    const config = { headers: { 'X-Request-ID': requestId } };
    if (method === 'GET') {
      return (await this.client.get<T>(path, config)).data;
    }
    if (method === 'DELETE') {
      return (await this.client.delete<T>(path, config)).data;
    }
    return (await this.client.post<T>(path, body, config)).data;
  }

  /**
   * Internal: convert an axios error into a thrown domain error for the
   * standard cases (ECONNREFUSED, 401, 404). Falls through (re-throws the
   * original) for unknown axios shapes; the caller is responsible for the
   * non-axios path.
   */
  private throwForKnownAxiosError(error: AxiosError, path: string): never {
    if (error.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to Deposium API at ${this.baseUrl}\n` +
          'Make sure the Deposium server is running'
      );
    }
    if (error.response?.status === 401) {
      throw buildAuthError(error.response?.data);
    }
    if (error.response?.status === 404) {
      const data = error.response?.data as { error?: string; message?: string } | undefined;
      const detail = data?.error ?? data?.message ?? `Resource not found: ${path}`;
      throw new Error(`Not found (404): ${detail}`);
    }
    throw error;
  }

  /**
   * Stream chat responses via SSE.
   *
   * Routes through the Edge Runtime gateway (auth + rate-limiting) by default.
   * The Edge Runtime proxies to the MCP backend's /api/chat-stream.
   */
  async chatStream(
    streamBaseUrl: string,
    message: string,
    options: ChatStreamOptions & { directMcp?: boolean }
  ): Promise<void> {
    // Edge Runtime: /chat-stream | Direct MCP: /api/chat-stream
    const streamPath = options.directMcp ? '/api/chat-stream' : '/chat-stream';
    const url = `${streamBaseUrl.replace(/\/$/, '')}${streamPath}`;

    const body = JSON.stringify({
      message,
      conversation_history: options.conversationHistory,
      space_ids: options.spaceIds,
      documents_only: options.documentsOnly,
      language: options.language ?? 'fr',
      confidence_threshold: options.confidenceThreshold,
    });

    const response = await this.postStream(url, body, 'Chat stream');
    await this.parseSSEStream(response, options);
  }

  /**
   * Resume a paused agent pipeline by POSTing the user's decision to
   * `/api/agent-resume`. The response is a fresh SSE stream that continues
   * the pipeline (and may pause again with another `chat_prompt`).
   */
  async resumeAgent(
    resumeBaseUrl: string,
    correlationId: string,
    responsePayload: AgentResumePayload,
    options: ChatStreamOptions
  ): Promise<void> {
    const url = `${resumeBaseUrl.replace(/\/$/, '')}/api/agent-resume`;
    const body = JSON.stringify({
      correlation_id: correlationId,
      response: responsePayload,
    });

    const response = await this.postStream(url, body, 'Agent resume');
    await this.parseSSEStream(response, options);
  }

  /** Shared POST for SSE endpoints — sets headers, handles 401/429/generic errors */
  private async postStream(url: string, body: string, label: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `${CLI_NAME}/${CLI_VERSION} (Node.js ${process.version})`,
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, { method: 'POST', headers, body });

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

  /** Parse SSE stream and dispatch events. Shared between chatStream + resumeAgent. */
  private async parseSSEStream(response: Response, options: ChatStreamOptions): Promise<void> {
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
        this.handleSSEChunk(part, options);
      }
    }

    // Flush any trailing chunk that didn't end with \n\n (rare at stream close)
    if (buffer.trim()) {
      this.handleSSEChunk(buffer, options);
    }
  }

  private handleSSEChunk(part: string, options: ChatStreamOptions): void {
    if (!part.trim()) return;

    let eventType = '';
    let dataStr = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr = line.slice(6);
      // Ignore SSE comments (lines starting with ':') — heartbeats
    }

    if (!eventType || !dataStr) return;

    try {
      this.dispatchSSEEvent(eventType, JSON.parse(dataStr), options);
    } catch {
      // Skip malformed JSON — a warning event will follow if it matters
    }
  }

  /** Dispatch a parsed SSE event to the appropriate callback */
  private dispatchSSEEvent(
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
        options.onChatPrompt?.(data as unknown as SSEChatPrompt);
        break;
    }
  }
}
