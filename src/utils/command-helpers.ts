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
import { getErrorMessage as _getErrorMessage } from './errors';

/**
 * Re-export of the error-message extractor — many command modules need
 * it alongside the rest of this module's helpers, and pulling it from
 * here lets them import everything from one place.
 *
 * NOTE: `isErrorWithCode` / `hasErrorCauseWithCode` are NOT re-exported
 * here. They were once, but no consumer used the re-export — everyone
 * imports them directly from `./errors`. See `./errors.ts` for those.
 */
export const getErrorMessage = _getErrorMessage;

interface CommandContext {
  config: DeposiumConfig;
  baseUrl: string;
  apiKey: string;
  client: MCPClient;
}

// initializeCommand's options are forwarded verbatim to MCPClient.
type InitializeOptions = MCPClientOptions;

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
    validateSecurity: true,
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
/**
 * Exported because `command-helpers.test.ts` unit-tests this directly
 * (silent flag, DEBUG stack-trace mode). Not used by any command file —
 * commands go through `withErrorHandling` below.
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

/**
 * Standardized "call tool → bail on isError → return content" pattern
 * that ~60 command call-sites used to spell out by hand.
 *
 * On `result.isError`, prints `chalk.red('\n❌ <label> failed:')` followed
 * by the error content (which may be a string or a `{ message, … }`
 * object) and `process.exit(1)`. This format is load-bearing — existing
 * tests assert on the exact wording, and changing it across the suite
 * is an explicit decision, not a side-effect of a callsite migration.
 *
 * On success, returns `result.content` unwrapped so the caller can pass
 * it directly to `formatOutput` (or do whatever post-processing it
 * needs — see `compound analyze` which appends to chat history before
 * formatting).
 *
 * NOT a fit when the caller needs to keep going on error (e.g.
 * `benchmark compare` skips failed models silently and continues to
 * the next one). Those sites stay inline.
 *
 * @param client    The MCPClient from `initializeCommand()`.
 * @param toolName  The MCP tool to invoke.
 * @param args      Tool arguments forwarded to `callTool`.
 * @param opts      `label` is the verb shown in the error banner
 *                  ("Search", "Analysis", "Stats", …). `spinner`
 *                  defaults to `true` because most invocations are
 *                  interactive; pass `false` when iterating in a loop.
 * @returns The unwrapped `result.content` on success. On error, never
 *          returns — `process.exit(1)` is called inside.
 *
 * @example
 * ```typescript
 * const content = await runMcpTool(
 *   client,
 *   'corpus_evaluate',
 *   { tenant_id, space_id, metric },
 *   { label: 'Evaluation' }
 * );
 * formatOutput(content, options.format);
 * ```
 */
export async function runMcpTool<T = unknown>(
  client: MCPClient,
  toolName: string,
  args: Record<string, unknown>,
  opts: { label: string; spinner?: boolean }
): Promise<T> {
  // No try/catch around callTool — if it rejects (network down, auth
  // error, retry exhausted), the rejection propagates to the caller's
  // withErrorHandling wrapper which formats and exits. The isError
  // branch below covers the case where the SERVER returned a
  // tool-level error (HTTP 200 with isError: true in the body).
  const result = await client.callTool(toolName, args, { spinner: opts.spinner ?? true });
  if (result.isError) {
    console.error(chalk.red(`\n❌ ${opts.label} failed:`), result.content);
    process.exit(1);
  }
  return result.content as T;
}
