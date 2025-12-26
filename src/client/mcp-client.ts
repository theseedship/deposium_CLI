import axios, { AxiosInstance, AxiosError } from 'axios';
import chalk from 'chalk';
import ora from 'ora';

// Package info for User-Agent
const CLI_VERSION = '1.0.0';
const CLI_NAME = '@deposium/cli';

export interface MCPToolCall {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  isError?: boolean;
}

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

export class MCPClient {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;

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
   * Call an MCP tool via HTTP (through SolidStart proxy)
   * Includes automatic retry with exponential backoff for transient errors
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
            content: response.data.result || response.data.error,
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
      if (lastError.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to Deposium API at ${this.baseUrl}\n` +
            'Make sure the Deposium server is running'
        );
      }

      // Check for authentication errors
      if (lastError.response?.status === 401) {
        throw new Error(
          'Authentication failed (401)\n' +
            (lastError.response?.data?.message || 'Invalid or missing API key')
        );
      }

      // Extract error information WITHOUT exposing stack traces
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorData = lastError.response?.data as Record<string, any> | undefined;
      const errorDetails: Record<string, unknown> = {
        message: errorData?.message || errorData?.error?.message || lastError.message,
        status: lastError.response?.status,
        requestId, // Include request ID for debugging
      };

      // Include safe error details (exclude stack traces)
      if (errorData?.error && typeof errorData.error === 'object') {
        const { stack: _stack, ...safeError } = errorData.error;
        if (Object.keys(safeError).length > 0) {
          errorDetails.error = safeError;
        }
      }
      if (errorData?.details) {
        errorDetails.details = errorData.details;
      }
      // Explicitly DO NOT include errorData.stack

      return {
        content: errorDetails,
        isError: true,
      };
    }

    return {
      content: { message: lastError?.message || 'Unknown error', requestId },
      isError: true,
    };
  }

  /**
   * List all available MCP tools
   *
   * Note: This calls through the SolidStart proxy using a special list_tools request.
   * The proxy forwards to the MCP backend which returns available tools.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listTools(): Promise<any[]> {
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

        return response.data.result?.tools || response.data.result || [];
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
   * Check Deposium API health (validates API key and MCP backend connectivity)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async health(): Promise<any> {
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
                ((axiosError.response?.data as { message?: string })?.message ||
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
