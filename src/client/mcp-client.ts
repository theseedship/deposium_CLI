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

/** CLI version for User-Agent header */
const CLI_VERSION = '1.0.0';

/** CLI name for User-Agent header */
const CLI_NAME = '@deposium/cli';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: Record<string, any>,
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

        if (spinner) spinner.succeed(`Tool ${chalk.green(toolName)} completed`);

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
          if (spinner) {
            spinner.text = `Retry ${attempt + 1}/${this.maxRetries} for ${chalk.cyan(toolName)} (waiting ${delay}ms)...`;
          }
          await sleep(delay);
          continue;
        }

        lastError = error as Error;
        break;
      }
    }

    // Handle the final error
    if (spinner) spinner.fail(`Tool ${chalk.red(toolName)} failed`);

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
}
