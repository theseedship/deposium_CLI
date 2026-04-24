/**
 * Command Helper Utilities
 *
 * Provides common initialization patterns for CLI commands to reduce code duplication.
 * All commands that need API access can use initializeCommand() to get a configured client.
 */

import chalk from 'chalk';
import { MCPClient, MCPClientOptions } from '../client/mcp-client';
import { getConfig, getBaseUrl, isInsecureMode, DeposiumConfig } from './config';
import { ensureAuthenticated } from './auth';
import {
  getErrorMessage as _getErrorMessage,
  isErrorWithCode,
  hasErrorCauseWithCode,
} from './errors';

/**
 * Re-exports of error type guards and the error-message extractor from
 * `./errors`. Re-exposed here so command authors can import everything
 * they need from a single module (`command-helpers`) without learning
 * the internal layout.
 *
 * See `./errors.ts` for full docs on each.
 */
export { isErrorWithCode, hasErrorCauseWithCode };
export const getErrorMessage = _getErrorMessage;

export interface CommandContext {
  config: DeposiumConfig;
  baseUrl: string;
  apiKey: string;
  client: MCPClient;
}

export interface InitializeOptions extends MCPClientOptions {
  /** Skip TLS enforcement entirely (default: false, use for tests only) */
  skipSecurityValidation?: boolean;
}

/**
 * Initialize a command with API client
 *
 * This is the standard initialization pattern for all commands that need API access.
 * It handles:
 * - Loading configuration (with env var priority)
 * - Getting the base URL (with HTTPS validation)
 * - Ensuring authentication (prompts for API key if missing)
 * - Creating an MCP client with retry logic
 *
 * @param options - Optional client configuration
 * @returns CommandContext with config, baseUrl, apiKey, and client
 *
 * @example
 * ```typescript
 * .action(async (options) => {
 *   const { client } = await initializeCommand();
 *   const result = await client.callTool('my_tool', { ... });
 * });
 * ```
 */
export async function initializeCommand(options: InitializeOptions = {}): Promise<CommandContext> {
  const config = getConfig();
  const baseUrl = getBaseUrl(config, {
    validateSecurity: !options.skipSecurityValidation,
    insecure: isInsecureMode(),
  });
  const apiKey = await ensureAuthenticated(baseUrl);
  const client = new MCPClient(baseUrl, apiKey, options);

  return { config, baseUrl, apiKey, client };
}

/**
 * Resolve tenant and space IDs from command options, config, and defaults.
 *
 * Priority (per field):
 *   1. Command-line option (`--tenant`, `--space`)
 *   2. Configured default (`defaultTenant`, `defaultSpace` in config)
 *   3. Literal fallback (`'default'`)
 *
 * @param options - Command options object (must have optional tenant/space fields)
 * @param config - Loaded config (usually from `initializeCommand()`)
 * @returns Resolved `{ tenantId, spaceId }`
 *
 * @example
 * ```typescript
 * const { client, config } = await initializeCommand();
 * const { tenantId, spaceId } = resolveTenantSpace(options, config);
 * ```
 */
export function resolveTenantSpace(
  options: { tenant?: string; space?: string },
  config: DeposiumConfig
): { tenantId: string; spaceId: string } {
  return {
    tenantId: options.tenant ?? config.defaultTenant ?? 'default',
    spaceId: options.space ?? config.defaultSpace ?? 'default',
  };
}

/**
 * Standard error handler for command actions
 *
 * Provides consistent error formatting across all commands.
 *
 * @param error - The error to handle
 * @param silent - If true, suppress detailed error output
 */
export function handleCommandError(error: unknown, silent: boolean = false): never {
  const message = error instanceof Error ? getErrorMessage(error) : String(error);

  if (!silent) {
    console.error(chalk.red('\n❌ Error:'), message);

    // Show stack trace only in debug mode
    if (process.env.DEBUG && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
  }

  process.exit(1);
}

/**
 * Wrapper for command actions that provides standard error handling
 *
 * Use this to wrap your command action for consistent error handling.
 *
 * @param action - The command action to execute
 * @returns A wrapped action with error handling
 *
 * @example
 * ```typescript
 * .action(withErrorHandling(async (query, options) => {
 *   const { client } = await initializeCommand();
 *   const result = await client.callTool('search', { query });
 *   formatOutput(result.content, options.format);
 * }));
 * ```
 */
export function withErrorHandling<T extends unknown[]>(
  action: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      handleCommandError(error);
    }
  };
}
