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

import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import ora from 'ora';

import pkg from '../../package.json';

/** CLI version for User-Agent header */
const CLI_VERSION = pkg.version;

/** CLI name for User-Agent header */
const CLI_NAME = pkg.name;

/**
 * Default upstream tool name invoked by `validateDossier()`.
 *
 * Override per call via the `tool` option when the server-side macro
 * is renamed or when targeting a different validator that follows the
 * same `validate:*` SSE event contract.
 */
export const DEFAULT_VALIDATE_TOOL = 'deposium_validate_dossier';

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

// Re-export validate command types — consumers do
// `import { ValidateLevel } from '@deposium/cli'`.
export type {
  ValidateLevel,
  OnAmbiguousModeValidate,
  ValidateRunStatus,
  ValidateThematicVerdict,
  ValidateFolderVerdict,
  ValidateWaitingFor,
  HitlResponse,
  ValidateToolInput,
  ValidateStartEvent,
  ValidateClassificationEvent,
  ValidateThematicStartEvent,
  ValidateExtractionEvent,
  ValidateVerdictN1Event,
  ValidateThematicCompleteEvent,
  ValidateN1CompleteEvent,
  ValidateN2RuleVerdictEvent,
  ValidateCompleteEvent,
  ValidateFailedEvent,
  ValidateGenericErrorEvent,
  ValidateFormFieldSelect,
  ValidateFormFieldFileUpload,
  ValidateFormFieldText,
  ValidateFormField,
  ValidateChatPrompt,
  ValidateReportJson,
  ValidateEvents,
  ValidateEventName,
  ValidateStreamHandlers,
  HitlDecision,
} from './validate-types';

import { buildAuthError } from './auth-error';
import { connectionRefusedError, throwForKnownAxiosError } from './http-errors';
import { generateRequestId, createAxiosErrorResult, withRetry } from './internals';
import { postSSE, parseSSEStream, type SSEStreamContext } from './sse-stream';
import { consumeValidateStream } from './validate-stream';
import { hasErrorCauseWithCode } from '../utils/errors';
import type {
  ValidateToolInput,
  ValidateReportJson,
  ValidateStreamHandlers,
} from './validate-types';

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
      // Caller tag used by the server for telemetry partitioning and
      // selective canaries. Server sanitizes against a closed-set
      // allowlist; an off-allowlist value falls back to 'unknown'.
      'X-Client-Type': 'cli',
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

    try {
      const responseData = await withRetry<{
        result?: unknown;
        error?: unknown;
        isError?: boolean;
      }>(
        async (id) => {
          const response = await this.client.post(
            '/api/cli/mcp',
            { tool: toolName, params: args },
            { headers: { 'X-Request-ID': id } }
          );
          return response.data;
        },
        {
          requestId,
          maxRetries: this.maxRetries,
          retryBaseDelay: this.retryBaseDelay,
          onRetry: (attempt, delay) => {
            if (spinner) {
              spinner.text = `Retry ${attempt}/${this.maxRetries} for ${chalk.cyan(
                toolName
              )} (waiting ${delay}ms)...`;
            }
          },
        }
      );

      spinner?.succeed(`Tool ${chalk.green(toolName)} completed`);

      if (responseData.isError) {
        return {
          content: responseData.result ?? responseData.error,
          isError: true,
        };
      }
      return { content: responseData.result, isError: false };
    } catch (error) {
      spinner?.fail(`Tool ${chalk.red(toolName)} failed`);
      return this.handleCallToolError(error as Error, requestId);
    }
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
    try {
      return await withRetry<MCPTool[]>(
        async (requestId) => {
          const response = await this.client.post(
            '/api/cli/mcp',
            { tool: '_list_tools', params: {} },
            { headers: { 'X-Request-ID': requestId } }
          );
          if (response.data.isError) {
            console.error(chalk.red('Failed to list tools:'), response.data.result);
            return [];
          }
          return response.data.result?.tools ?? response.data.result ?? [];
        },
        { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay }
      );
    } catch (error) {
      console.error(chalk.red('Failed to list tools:'), (error as Error).message);
      return [];
    }
  }

  /**
   * Check Deposium API health
   */
  async health(): Promise<MCPHealthResponse> {
    try {
      return await withRetry<MCPHealthResponse>(
        async (requestId) => {
          const response = await this.client.get('/api/cli/mcp', {
            headers: { 'X-Request-ID': requestId },
          });
          return response.data;
        },
        { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throwForKnownAxiosError(error, this.baseUrl, '/api/cli/mcp');
      }
      throw error;
    }
  }

  /**
   * List all workspaces ("spaces") accessible to the authenticated user.
   *
   * Calls `GET /api/spaces`. Response is unwrapped from the `{ data, count }`
   * envelope and returned as a plain array.
   */
  async listSpaces(): Promise<MCPSpace[]> {
    try {
      const data = await withRetry<{ data: MCPSpace[]; count: number }>(
        async (requestId) => {
          const response = await this.client.get<{ data: MCPSpace[]; count: number }>(
            '/api/spaces',
            { headers: { 'X-Request-ID': requestId } }
          );
          return response.data;
        },
        { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay }
      );
      return data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throwForKnownAxiosError(error, this.baseUrl, '/api/spaces');
      }
      throw error;
    }
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
      `/api/v1/documents/${encodeURIComponent(String(id))}`
    );
    return data.data;
  }

  /** Delete a document by ID. Calls `DELETE /api/v1/documents/:id`. */
  async deleteDocument(id: number | string): Promise<unknown> {
    return this.authenticatedRequest(
      'DELETE',
      `/api/v1/documents/${encodeURIComponent(String(id))}`
    );
  }

  /**
   * Upload one or more files via the gateway's batch-upload endpoint.
   *
   * Each file is streamed sequentially through `fs.createReadStream` →
   * `Blob` so peak memory stays bounded by the largest single file
   * rather than the sum of all files (the previous JSON+base64 path
   * loaded everything at once).
   *
   * Routes through `MCPClient` (rather than a raw fetch in the command
   * layer) so TLS enforcement, the service-key guardrail, and the
   * standard ECONNREFUSED message all apply consistently.
   */
  async uploadBatch(
    files: Array<{ path: string; name: string; mimeType: string }>,
    options: { spaceId?: string; folderId?: string } = {}
  ): Promise<unknown> {
    const { readFileSync } = await import('node:fs');
    const form = new FormData();
    for (const file of files) {
      // Read sync per-iteration so the previous Blob is eligible for GC
      // before the next file is loaded. Node's FormData copies the buffer
      // into its own storage, so we can release the local reference after
      // append().
      const buffer = readFileSync(file.path);
      form.append('files', new Blob([new Uint8Array(buffer)], { type: file.mimeType }), file.name);
    }
    if (options.spaceId) form.append('space_id', options.spaceId);
    if (options.folderId) form.append('folder_id', options.folderId);

    const url = `${this.baseUrl}/api/v2/files/batch-upload`;
    const headers: Record<string, string> = {
      'User-Agent': `${CLI_NAME}/${CLI_VERSION} (Node.js ${process.version})`,
      'X-Client-Type': 'cli',
    };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body: form });
    } catch (error) {
      if (hasErrorCauseWithCode(error, 'ECONNREFUSED')) {
        throw connectionRefusedError(this.baseUrl);
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
      const text = await response.text().catch(() => '');
      throw new Error(`Batch upload failed (${response.status}): ${text || response.statusText}`);
    }

    return response.json();
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
    return this.authenticatedRequest('DELETE', `/api/api-keys/${encodeURIComponent(id)}`);
  }

  /**
   * Rotate an API key — invalidates the old secret and generates a new one.
   * Calls `POST /api/api-keys/:id/rotate`. The response includes the new secret.
   */
  async rotateApiKey(id: string): Promise<MCPApiKeyCreated> {
    return this.authenticatedRequest<MCPApiKeyCreated>(
      'POST',
      `/api/api-keys/${encodeURIComponent(id)}/rotate`
    );
  }

  /** Get usage stats for an API key. Calls `GET /api/api-keys/:id/usage`. */
  async getApiKeyUsage(id: string): Promise<MCPApiKeyUsage> {
    return this.authenticatedRequest<MCPApiKeyUsage>(
      'GET',
      `/api/api-keys/${encodeURIComponent(id)}/usage`
    );
  }

  /**
   * Internal: HTTP request with the standard retry-on-transient-errors loop
   * + auth-error handling. Used by self-service methods (documents, api-keys).
   *
   * Method dispatch and known-error mapping live in two helpers
   * (`dispatchHttp` and `throwForKnownAxiosError`) so this method stays
   * a thin wrapper over `withRetry`.
   */
  private async authenticatedRequest<T = unknown>(
    method: 'GET' | 'DELETE' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    try {
      return await withRetry<T>(
        (requestId) => this.dispatchHttp<T>(method, path, body, requestId),
        { maxRetries: this.maxRetries, retryBaseDelay: this.retryBaseDelay }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throwForKnownAxiosError(error, this.baseUrl, path);
      }
      throw error;
    }
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

    const response = await postSSE(url, body, this.sseContext(), 'Chat stream');
    await parseSSEStream(response, options);
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

    const response = await postSSE(url, body, this.sseContext(), 'Agent resume');
    await parseSSEStream(response, options);
  }

  /**
   * Run a dossier-validation macro over `/mcp` (JSON-RPC over SSE).
   * Manages the full pause/resume loop: stream events into the caller's
   * handlers, pause on `chat_prompt`, re-call the same tool with the same
   * `run_id` (Mode A: re-classify after upload — Mode B: structured
   * `hitl_response`), continue.
   *
   * Returns when the macro emits `validate:complete` or `validate:failed`.
   * The full report JSON is NOT in the stream — call `fetchValidateReport`
   * with the returned `run_id` to retrieve it.
   *
   * @param input    Tool input — initial call. The internal loop manages
   *                 `run_id` and `hitl_response` for resumes; callers do
   *                 not need to set them.
   * @param handlers Event + chat_prompt callbacks.
   * @param options  Override the upstream tool name (defaults to the
   *                 currently-deployed dossier validator). Pass a custom
   *                 `tool` to call a different server-side validator that
   *                 follows the same `validate:*` SSE event contract.
   *
   * @example
   * ```typescript
   * const { run_id, status } = await client.validateDossier(
   *   { dossier_id: 'd1', level: 'both', on_ambiguity: 'prompt' },
   *   {
   *     onEvent: (name, payload) => console.log(name, payload),
   *     onChatPrompt: async (prompt) => {
   *       // ... collect user input, upload file if needed ...
   *       return { mode: 'a' }; // or { mode: 'b', hitlResponse: ... }
   *     },
   *   }
   * );
   * if (status === 'complete') {
   *   const report = await client.fetchValidateReport(run_id);
   * }
   * ```
   */
  async validateDossier(
    input: ValidateToolInput,
    handlers: ValidateStreamHandlers,
    options: { tool?: string } = {}
  ): Promise<{ run_id: string; status: 'complete' | 'failed' }> {
    const url = `${this.baseUrl}/mcp`;
    const toolName = options.tool ?? DEFAULT_VALIDATE_TOOL;
    let currentInput: ValidateToolInput = input;

    while (true) {
      const requestId = generateRequestId();
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: currentInput,
        },
      });

      const response = await postSSE(url, body, this.sseContext(), 'Validate stream');
      const result = await consumeValidateStream(response, handlers);

      if (result.kind === 'terminal') {
        return { run_id: result.run_id, status: result.status };
      }

      // result.kind === 'paused' — chat_prompt event
      const decision = await handlers.onChatPrompt(result.prompt);
      currentInput = {
        ...input,
        run_id: result.prompt.run_id,
        ...(decision.mode === 'b' ? { hitl_response: decision.hitlResponse } : {}),
      };
    }
  }

  /**
   * Fetch the full validate report JSON from
   * `GET /api/v1/reports/<run_id>?format=json`.
   *
   * The report lives behind a separate idempotent endpoint to keep the
   * SSE stream lean (large `chat_history` and N2 evidence stay off the
   * wire). Call after `validate:complete` to get the canonical report;
   * or in `--json` mode after consuming the stream.
   */
  async fetchValidateReport(runId: string): Promise<ValidateReportJson> {
    const requestId = generateRequestId();
    try {
      const response = await this.client.get<ValidateReportJson>(
        `/api/v1/reports/${encodeURIComponent(runId)}?format=json`,
        { headers: { 'X-Request-ID': requestId } }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw connectionRefusedError(this.baseUrl);
        }
        if (error.response?.status === 401) {
          throw buildAuthError(error.response?.data);
        }
        // Custom 404 wording specific to this endpoint — not delegated
        // to throwForKnownAxiosError which uses a generic "Not found".
        if (error.response?.status === 404) {
          throw new Error(
            `Report not found for run_id=${runId}. The run may not exist or may not be complete yet.`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Build the SSE context (User-Agent, X-API-Key, baseUrl for errors)
   * that `postSSE` from ./sse-stream needs. Kept private — these are
   * implementation details of how the class authenticates.
   */
  private sseContext(): SSEStreamContext {
    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      userAgent: `${CLI_NAME}/${CLI_VERSION} (Node.js ${process.version})`,
    };
  }
}
