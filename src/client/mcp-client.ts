/**
 * MCP Client Module
 *
 * HTTP client for communicating with the Deposium MCP (Model Context Protocol) API.
 * Provides methods for calling tools, listing available tools, and health checks.
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

/**
 * Represents a tool call request
 */
export interface MCPToolCall {
  /** Name of the tool to call */
  name: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
}

/**
 * Result returned from a tool call
 */
export interface MCPToolResult {
  /** The response content from the tool */
  content: unknown;
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

/**
 * Description of an available MCP tool
 */
export interface MCPTool {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Tool category (e.g., 'search', 'graph', 'compound') */
  category?: string;
  /** JSON Schema describing the tool's input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * Status information for a Deposium service
 */
export interface MCPHealthService {
  /** Service name */
  name: string;
  /** Current status */
  status: 'healthy' | 'online' | 'offline' | 'degraded' | string;
  /** Response latency in milliseconds */
  latency?: number;
  /** Additional status message */
  message?: string;
}

/**
 * Health check response from the Deposium API
 */
export interface MCPHealthResponse {
  /** Overall system status */
  status: string;
  /** Individual service statuses */
  services?: MCPHealthService[];
  /** API version */
  version?: string;
  /** Timestamp of the health check */
  timestamp?: string;
}

// ============================================================================
// SSE Event Types (matches MCP /api/chat-stream events)
// ============================================================================

/**
 * `metadata` SSE event — emitted once at the start of a chat stream with
 * the resolved intent and routing decision.
 */
export interface SSEMetadata {
  intent: string;
  confidence: number;
  method: 'bed-llm' | 'keywords';
  model: string;
  language: string;
  timestamp: string;
}

/**
 * `tool_call` SSE event — emitted when the agent invokes a tool, both at
 * `started` and `completed` (with duration on completion).
 */
export interface SSEToolCall {
  tool: string;
  status: 'started' | 'completed';
  duration_ms?: number;
}

/**
 * `citation` SSE event — a source document the agent referenced during
 * response generation. Multiple citations may be emitted per turn.
 */
export interface SSECitation {
  document_id: string;
  document_name: string;
  page?: number;
  snippet: string;
  score?: number;
  full_content?: string;
}

/**
 * `done` SSE event — emitted at the end of a stream with totals.
 * Always the last event of a successful stream.
 */
export interface SSEDone {
  total_duration_ms: number;
  tokens_generated?: number;
  tools_called: string[];
}

/**
 * `error` SSE event — non-fatal stream-level error. Streams may continue
 * after an error event. For terminal errors, the connection is closed.
 */
export interface SSEError {
  message: string;
  error?: string;
  code?: string;
}

/**
 * HITL chat_prompt event — emitted when the pipeline pauses for user input
 * (intent disambiguation, step confirmation, scratchpad form, ...).
 *
 * The CLI responds by POSTing to `/api/agent-resume` with
 * `{ correlation_id, response: { value } }` (or `{ values }` for forms),
 * which opens a fresh SSE stream that continues the pipeline.
 */
/**
 * One option for `type='choice'` chat prompts.
 * `value` is what gets sent back to the server in the resume payload.
 */
export interface SSEChatPromptOption {
  value: string;
  label: string;
  description?: string;
}

export interface SSEChatPrompt {
  prompt_id: string;
  type: 'choice' | 'confirm' | 'form';
  title?: string;
  message?: string;
  config?: {
    options?: SSEChatPromptOption[];
    layout?: 'horizontal' | 'vertical';
    fields?: Array<Record<string, unknown>>;
  };
  correlation_id: string;
  waiting_for?: string;
  step_id?: string;
}

/**
 * Options accepted by `MCPClient.chatStream()` and `MCPClient.resumeAgent()`.
 *
 * Only `onToken` is required — everything else is opt-in for the events the
 * caller cares about. Set callbacks default to no-op when not provided.
 */
export interface ChatStreamOptions {
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  spaceIds?: string[];
  documentsOnly?: boolean;
  language?: 'fr' | 'en';
  confidenceThreshold?: number;
  onToken: (token: string) => void;
  onMetadata?: (data: SSEMetadata) => void;
  onCitation?: (data: SSECitation) => void;
  onToolCall?: (data: SSEToolCall) => void;
  onDone?: (data: SSEDone) => void;
  onError?: (data: SSEError) => void;
  onChatPrompt?: (data: SSEChatPrompt) => void;
}

/**
 * Payload accepted by POST /api/agent-resume.
 *
 * - `value`: single-answer choice/confirm response (e.g. `"web_search"`, `"approve"`)
 * - `values`: multi-field form response (e.g. `{ theme: "titre_propriete" }`)
 */
export interface AgentResumePayload {
  value?: string;
  values?: Record<string, string>;
}

/**
 * A workspace ("space") as exposed by `GET /api/spaces`.
 *
 * Spaces are the primary unit of content organization on Deposium —
 * documents, embeddings, graphs, and chat history are all scoped per space.
 */
export interface MCPSpace {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  created_at: string;
}

/**
 * A document/file as listed by `GET /api/v1/documents/`.
 *
 * Documents can be regular files (PDFs, docs, etc.) or "connector" entries
 * representing live data sources (e.g. web search, Notion, etc. — `doc_type`
 * indicates which).
 */
export interface MCPDocument {
  id: number;
  file_name: string;
  mime_type: string;
  size: number;
  doc_type: string;
  doc_status: string;
  num_pages: number;
  characters_count: number;
  keywords?: string[] | null;
  is_private: boolean;
  space_id?: string | null;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Full document detail returned by `GET /api/v1/documents/:id`.
 *
 * Adds storage metadata, search-enablement flags, connector config (when
 * applicable), and the per-call access summary.
 */
export interface MCPDocumentDetail extends MCPDocument {
  search_enabled?: boolean;
  s3_path?: string | null;
  bucket_name?: string | null;
  bucket_path?: string | null;
  file_infos?: Record<string, unknown>;
  _access?: { type: string; can_edit: boolean; can_delete: boolean };
}

/**
 * Pagination envelope returned alongside filtered document lists.
 */
export interface MCPDocumentPagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Configuration options for MCPClient
 */
export interface MCPClientOptions {
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryBaseDelay?: number;
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `cli-${timestamp}-${random}`;
}

/**
 * Check if an error is retryable (transient network/server errors)
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response received)
  if (!error.response) {
    return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';
  }

  // Server errors that are typically transient
  const status = error.response.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize error data to remove stack traces
 */
function sanitizeErrorData(
  errorData: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!errorData) return {};

  const result: Record<string, unknown> = {};

  // Use top-level message first, fallback to nested error.message
  if (errorData.message) {
    result.message = errorData.message;
  } else if ((errorData.error as Record<string, unknown>)?.message) {
    result.message = (errorData.error as Record<string, unknown>).message;
  }

  // Include safe error details (exclude stack traces)
  if (errorData.error && typeof errorData.error === 'object') {
    const { stack: _stack, ...safeError } = errorData.error as Record<string, unknown>;
    if (Object.keys(safeError).length > 0) {
      result.error = safeError;
    }
  }

  if (errorData.details) result.details = errorData.details;

  return result;
}

/**
 * Create an error result from an Axios error
 */
function createAxiosErrorResult(
  error: AxiosError,
  baseUrl: string,
  requestId: string
): { result: MCPToolResult; shouldThrow: boolean; errorToThrow?: Error } {
  if (error.code === 'ECONNREFUSED') {
    return {
      result: { content: null, isError: true },
      shouldThrow: true,
      errorToThrow: new Error(
        `Cannot connect to Deposium API at ${baseUrl}\nMake sure the Deposium server is running`
      ),
    };
  }

  if (error.response?.status === 401) {
    return {
      result: { content: null, isError: true },
      shouldThrow: true,
      errorToThrow: new Error(
        'Authentication failed (401)\n' +
          ((error.response?.data as Record<string, unknown>)?.message ??
            'Invalid or missing API key')
      ),
    };
  }

  const errorData = error.response?.data as Record<string, unknown> | undefined;
  const sanitized = sanitizeErrorData(errorData);

  return {
    result: {
      content: {
        message: sanitized.message ?? error.message,
        status: error.response?.status,
        requestId,
        ...sanitized,
      },
      isError: true,
    },
    shouldThrow: false,
  };
}

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
   *
   * @example
   * ```typescript
   * // Basic usage
   * const client = new MCPClient('https://api.deposium.io', 'your-api-key');
   *
   * // With custom options
   * const client = new MCPClient('https://api.deposium.io', 'your-api-key', {
   *   timeout: 60000,
   *   maxRetries: 5
   * });
   * ```
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
   *
   * @param toolName - Name of the tool to call (e.g., 'search_hub', 'compound_analyze')
   * @param args - Tool arguments as key-value pairs
   * @param options - Optional settings for the call
   * @param options.silent - Suppress console output
   * @param options.spinner - Show a loading spinner
   * @returns Promise resolving to the tool result
   *
   * @throws Error if the API call fails after all retry attempts
   *
   * @example
   * ```typescript
   * // Search for documents
   * const result = await client.callTool('search_hub', {
   *   query_text: 'machine learning papers',
   *   tenant_id: 'default',
   *   space_id: 'research',
   *   top_k: 10
   * }, { spinner: true });
   *
   * if (!result.isError) {
   *   console.log('Results:', result.content);
   * }
   * ```
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
   *
   * Retrieves a list of all tools available in the Deposium MCP API,
   * including their names, descriptions, categories, and input schemas.
   *
   * @returns Promise resolving to an array of tool descriptions
   *
   * @throws Error if the API call fails
   *
   * @example
   * ```typescript
   * const tools = await client.listTools();
   *
   * // Display tools by category
   * const categories = new Map<string, MCPTool[]>();
   * tools.forEach(tool => {
   *   const cat = tool.name.split('_')[0];
   *   if (!categories.has(cat)) categories.set(cat, []);
   *   categories.get(cat)!.push(tool);
   * });
   *
   * for (const [category, categoryTools] of categories) {
   *   console.log(`${category}: ${categoryTools.length} tools`);
   * }
   * ```
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
   *
   * Performs a health check on the Deposium API, validating the API key
   * and checking connectivity to all backend services.
   *
   * @returns Promise resolving to the health status of all services
   *
   * @throws Error if the API is unreachable or authentication fails
   *
   * @example
   * ```typescript
   * const health = await client.health();
   *
   * console.log(`Overall status: ${health.status}`);
   *
   * if (health.services) {
   *   health.services.forEach(service => {
   *     console.log(`${service.name}: ${service.status}`);
   *   });
   * }
   * ```
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
          // Check for authentication errors
          if (axiosError.response?.status === 401) {
            throw new Error(
              'Authentication failed (401)\n' +
                ((axiosError.response?.data as { message?: string })?.message ??
                  'Invalid or missing API key')
            );
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
   *
   * @returns Array of spaces ordered by the server (typically by recency).
   * @throws If authentication fails (401) or the API is unreachable.
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
            throw new Error(
              'Authentication failed (401)\n' +
                ((axiosError.response?.data as { message?: string })?.message ??
                  'Invalid or missing API key')
            );
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
   *
   * @param options.spaceId - Filter by space (UUID). Omit for full catalog.
   * @param options.limit - Page size (server default 50)
   * @param options.offset - Page offset
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

  /**
   * Get full details of a single document by ID.
   * Calls `GET /api/v1/documents/:id`.
   */
  async getDocument(id: number | string): Promise<MCPDocumentDetail> {
    const data = await this.authenticatedRequest<{ ok: boolean; data: MCPDocumentDetail }>(
      'GET',
      `/api/v1/documents/${id}`
    );
    return data.data;
  }

  /**
   * Delete a document by ID. Calls `DELETE /api/v1/documents/:id`.
   *
   * Returns the parsed response envelope (typically `{ ok: true }`). Throws
   * on 4xx/5xx after retries.
   */
  async deleteDocument(id: number | string): Promise<unknown> {
    return this.authenticatedRequest('DELETE', `/api/v1/documents/${id}`);
  }

  /**
   * Internal: HTTP request with the standard retry-on-transient-errors loop
   * + auth-error handling. Used by `listDocuments`, `getDocument`,
   * `deleteDocument`. The older `health()`, `listTools()`, `listSpaces()`
   * methods predate this helper and inline their own retry logic; they
   * could be refactored onto this helper later.
   */
  private async authenticatedRequest<T = unknown>(
    method: 'GET' | 'DELETE' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const requestId = generateRequestId();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response =
          method === 'GET'
            ? await this.client.get<T>(path, { headers: { 'X-Request-ID': requestId } })
            : method === 'DELETE'
              ? await this.client.delete<T>(path, { headers: { 'X-Request-ID': requestId } })
              : await this.client.post<T>(path, body, {
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
            throw new Error(
              'Authentication failed (401)\n' +
                ((axiosError.response?.data as { message?: string })?.message ??
                  'Invalid or missing API key')
            );
          }
          if (axiosError.response?.status === 404) {
            const detail =
              (axiosError.response?.data as { error?: string; message?: string })?.error ??
              (axiosError.response?.data as { message?: string })?.message ??
              `Resource not found: ${path}`;
            throw new Error(`Not found (404): ${detail}`);
          }
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Stream chat responses via SSE.
   *
   * Routes through the Edge Runtime gateway (auth + rate-limiting) by default.
   * The Edge Runtime proxies to the MCP backend's /api/chat-stream.
   *
   * @param streamBaseUrl - Base URL for streaming (Edge Runtime or direct MCP)
   * @param message - User message to send
   * @param options - Streaming callbacks and request options
   * @param options.directMcp - If true, use /api/chat-stream (direct MCP path)
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
   *
   * Phase I routes directly to MCPs (`/api/agent-resume`). Once Phase W.1
   * lands the edge twin, this method will transparently use the edge URL.
   *
   * @param resumeBaseUrl - Base URL for the resume endpoint (MCPs direct)
   * @param correlationId - Correlation ID from the original chat_prompt
   * @param responsePayload - `{ value }` for choice/confirm, `{ values }` for forms
   * @param options - SSE callbacks (same vocabulary as chatStream)
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
        throw new Error('Authentication failed (401)\nInvalid or missing API key');
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
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
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
