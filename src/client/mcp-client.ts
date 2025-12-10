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

    // Add API key to headers if provided (consistent casing with server)
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 300000, // 5 minutes for long-running operations
      headers,
    });
  }

  /**
   * Call an MCP tool via HTTP (through SolidStart proxy)
   */
  async callTool(
    toolName: string,
    args: Record<string, any>,
    options: { silent?: boolean; spinner?: boolean } = {}
  ): Promise<MCPToolResult> {
    const spinner = options.spinner ? ora(`Calling ${chalk.cyan(toolName)}...`).start() : null;

    try {
      // Call SolidStart proxy endpoint (validates API key, forwards to MCP backend)
      const response = await this.client.post('/api/cli/mcp', {
        tool: toolName,
        params: args,
      });

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
    } catch (error: any) {
      if (spinner) spinner.fail(`Tool ${chalk.red(toolName)} failed`);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to Deposium API at ${this.baseUrl}\n` +
              'Make sure the Deposium server is running'
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
   *
   * Note: This calls through the SolidStart proxy using a special list_tools request.
   * The proxy forwards to the MCP backend which returns available tools.
   */
  async listTools(): Promise<any[]> {
    try {
      // Use the _list_tools pseudo-tool to get available tools via proxy
      const response = await this.client.post('/api/cli/mcp', {
        tool: '_list_tools',
        params: {},
      });

      // The proxy returns tools in the result field
      if (response.data.isError) {
        console.error(chalk.red('Failed to list tools:'), response.data.result);
        return [];
      }

      return response.data.result?.tools || response.data.result || [];
    } catch (error) {
      console.error(chalk.red('Failed to list tools:'), error);
      return [];
    }
  }

  /**
   * Check Deposium API health (validates API key and MCP backend connectivity)
   */
  async health(): Promise<any> {
    try {
      // GET /api/cli/mcp returns health status including MCP backend status
      const response = await this.client.get('/api/cli/mcp');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            `Cannot connect to Deposium API at ${this.baseUrl}\n` +
              'Make sure the Deposium server is running'
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
