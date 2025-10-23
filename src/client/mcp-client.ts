import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import ora from 'ora';

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: any;
  isError?: boolean;
}

export class MCPClient {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    // Remove trailing slash to avoid double-slash issues with axios
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // Add API key to headers if provided
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 300000, // 5 minutes for long-running operations
      headers,
    });
  }

  /**
   * Call an MCP tool via HTTP
   */
  async callTool(
    toolName: string,
    args: Record<string, any>,
    options: { silent?: boolean; spinner?: boolean } = {}
  ): Promise<MCPToolResult> {
    const spinner = options.spinner ? ora(`Calling ${chalk.cyan(toolName)}...`).start() : null;

    try {
      const response = await this.client.post('/mcp', {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: Date.now(),
      });

      if (spinner) spinner.succeed(`Tool ${chalk.green(toolName)} completed`);

      if (response.data.error) {
        return {
          content: response.data.error,
          isError: true,
        };
      }

      return {
        content: response.data.result?.content || response.data.result,
        isError: false,
      };
    } catch (error: any) {
      if (spinner) spinner.fail(`Tool ${chalk.red(toolName)} failed`);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to MCP Server at ${this.baseUrl}\n` +
              'Make sure the MCP server is running (npm run dev in deposium_MCPs)'
          );
        }

        // Check for authentication errors
        if (error.response?.status === 401) {
          throw new Error(
            'Authentication failed (401)\n' +
              (error.response?.data?.message || 'Invalid or missing API key')
          );
        }

        // Extract detailed error information
        const errorData = error.response?.data;
        const errorDetails = {
          message: errorData?.message || errorData?.error?.message || error.message,
          status: error.response?.status,
          // Include additional error details if available
          ...(errorData?.error && { error: errorData.error }),
          ...(errorData?.details && { details: errorData.details }),
          ...(errorData?.stack && { stack: errorData.stack }),
        };

        return {
          content: errorDetails,
          isError: true,
        };
      }

      return {
        content: { message: error.message },
        isError: true,
      };
    }
  }

  /**
   * List all available MCP tools
   */
  async listTools(): Promise<any[]> {
    try {
      const response = await this.client.post('/mcp', {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      });

      return response.data.result?.tools || [];
    } catch (error) {
      console.error(chalk.red('Failed to list tools:'), error);
      return [];
    }
  }

  /**
   * Check MCP server health
   */
  async health(): Promise<any> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to MCP Server at ${this.baseUrl}\n` + 'Make sure the server is running'
          );
        }
        // Check for authentication errors
        if (error.response?.status === 401) {
          throw new Error(
            'Authentication failed (401)\n' +
              (error.response?.data?.message || 'Invalid or missing API key')
          );
        }
      }
      throw error;
    }
  }
}
