import 'dotenv/config';
import Conf from 'conf';
import path from 'path';
import os from 'os';
import { scryptSync } from 'node:crypto';
import fs from 'node:fs';
import chalk from 'chalk';

/**
 * Check if a URL is a localhost/development URL
 */
function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.local') ||
      parsed.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * Check if insecure mode is enabled (via --insecure flag or DEPOSIUM_INSECURE env var)
 */
export function isInsecureMode(): boolean {
  return process.env.DEPOSIUM_INSECURE === 'true';
}

/**
 * Enforce URL security - block non-TLS connections to non-localhost URLs
 *
 * Behavior:
 * - Non-localhost + HTTP without --insecure → throws Error (connection refused)
 * - Non-localhost + HTTP with --insecure → console.warn (always visible, not suppressible)
 * - Localhost + HTTP → allowed (development)
 * - HTTPS → always allowed
 *
 * @param url - URL to validate
 * @param options - Enforcement options
 * @param options.insecure - Allow insecure HTTP (from --insecure flag)
 */
export function enforceUrlSecurity(url: string, options: { insecure?: boolean } = {}): void {
  if (!url) return;

  try {
    const parsed = new URL(url);

    // Skip validation for localhost/development URLs
    if (isLocalhostUrl(url)) return;

    // Non-localhost HTTP is blocked unless --insecure
    if (parsed.protocol === 'http:') {
      const insecure = options.insecure ?? isInsecureMode();

      if (insecure) {
        // --insecure: warn but allow (warning is NEVER suppressible by --silent)
        console.warn(
          chalk.yellow('\n⚠️  Security Warning: ') +
            chalk.white(`Using insecure HTTP for ${parsed.hostname} (--insecure)\n`) +
            chalk.gray(`   Consider using: ${chalk.cyan(url.replace('http:', 'https:'))}\n`)
        );
      } else {
        // No --insecure: block the connection
        throw new Error(
          `Insecure HTTP connection refused for ${parsed.hostname}\n` +
            `Production URLs must use HTTPS to protect data in transit.\n` +
            `Use ${chalk.cyan(url.replace('http:', 'https:'))} instead,\n` +
            `or pass ${chalk.yellow('--insecure')} / set ${chalk.yellow('DEPOSIUM_INSECURE=true')} to override.`
        );
      }
    }
  } catch (error) {
    // Re-throw our own security errors
    if (error instanceof Error && error.message.includes('Insecure HTTP connection refused')) {
      throw error;
    }
    // Swallow URL parse errors — will be caught elsewhere
  }
}

// ============================================================================
// Config encryption (AES-256-GCM via Conf encryptionKey)
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.deposium');

/**
 * Derive a deterministic encryption key from machine identity.
 *
 * Uses scryptSync with hostname + username as salt.
 * Same user on same machine always gets the same key.
 * Different users or machines get different keys.
 */
export function deriveEncryptionKey(): string {
  const hostname = os.hostname();
  let username: string;
  try {
    username = os.userInfo().username;
  } catch {
    // Fallback for containerized environments where /etc/passwd is missing
    username = process.env.USER ?? process.env.USERNAME ?? 'default';
  }
  const salt = `${hostname}:${username}:deposium`;
  return scryptSync('deposium-cli-config-v1', salt, 32).toString('hex');
}

/**
 * Migrate plaintext config to encrypted format.
 *
 * If the config file exists as valid JSON (plaintext), reads its data,
 * renames the old file to `.plaintext.bak`, and returns the data
 * for re-insertion into the encrypted Conf store.
 *
 * @param filePath - Path to the config file to check
 * @returns Parsed config data if migration is needed, null otherwise
 */
export function migrateIfPlaintext(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    // Valid JSON object → plaintext config that needs migration
    fs.renameSync(filePath, `${filePath}.plaintext.bak`);
    return data as Record<string, unknown>;
  } catch {
    // Not valid JSON → already encrypted or fresh install
    return null;
  }
}

// ============================================================================

export interface DeposiumConfig {
  deposiumUrl?: string; // Unified URL for Deposium API (SolidStart server)
  edgeUrl?: string; // Edge Runtime gateway URL (auth, rate-limiting, SSE proxy)
  mcpUrl?: string; // @deprecated - Use deposiumUrl instead. Kept for backward compatibility.
  mcpDirectUrl?: string; // @deprecated - Use edgeUrl instead. Direct MCP server bypass.
  apiKey?: string;
  defaultTenant?: string;
  defaultSpace?: string;
  outputFormat?: 'json' | 'table' | 'markdown';
  silentMode?: boolean;
}

// Migrate plaintext config before creating encrypted store
const configFilePath = path.join(CONFIG_DIR, 'config.json');
const _migrationData = migrateIfPlaintext(configFilePath);

// Ensure config directory has restricted permissions (owner-only)
try {
  if (fs.existsSync(CONFIG_DIR)) {
    fs.chmodSync(CONFIG_DIR, 0o700);
  }
} catch {
  // Ignore permission errors (Windows, read-only FS)
}

const encryptionKey = deriveEncryptionKey();

const config = new Conf<DeposiumConfig>({
  projectName: 'deposium-cli',
  configName: 'config',
  cwd: CONFIG_DIR,
  encryptionKey,
  configFileMode: 0o600, // Owner read/write only
});

// Separate encrypted store for credentials (API key)
interface CredentialsStore {
  apiKey?: string;
}

const credentials = new Conf<CredentialsStore>({
  projectName: 'deposium-cli',
  configName: 'credentials',
  cwd: CONFIG_DIR,
  encryptionKey,
  configFileMode: 0o600,
});

// Re-insert migrated data into encrypted stores
if (_migrationData) {
  for (const [key, value] of Object.entries(_migrationData)) {
    if (value === undefined) continue;
    if (key === 'apiKey') {
      // API key goes to credentials store
      credentials.set('apiKey', value as string);
    } else {
      config.set(key as keyof DeposiumConfig, value as DeposiumConfig[keyof DeposiumConfig]);
    }
  }
}

// Migrate API key from config store to credentials store (one-time)
const legacyApiKey = config.get('apiKey');
if (legacyApiKey && !credentials.get('apiKey')) {
  credentials.set('apiKey', legacyApiKey);
  config.delete('apiKey');
}

export function getConfig(): DeposiumConfig {
  // Priority: Environment variables > Config file > Defaults
  return {
    deposiumUrl: process.env.DEPOSIUM_URL ?? config.get('deposiumUrl'),
    edgeUrl: process.env.DEPOSIUM_EDGE_URL ?? config.get('edgeUrl'),
    mcpUrl: process.env.DEPOSIUM_MCP_URL ?? config.get('mcpUrl'), // @deprecated
    mcpDirectUrl: process.env.DEPOSIUM_MCP_DIRECT_URL ?? config.get('mcpDirectUrl'), // @deprecated
    apiKey: process.env.DEPOSIUM_API_KEY ?? credentials.get('apiKey') ?? config.get('apiKey'),
    defaultTenant: process.env.DEPOSIUM_TENANT ?? config.get('defaultTenant'),
    defaultSpace: process.env.DEPOSIUM_SPACE ?? config.get('defaultSpace'),
    outputFormat:
      (process.env.DEPOSIUM_OUTPUT as 'json' | 'table' | 'markdown') ||
      config.get('outputFormat', 'table'),
    silentMode: process.env.DEPOSIUM_SILENT === 'true' || config.get('silentMode', false),
  };
}

/**
 * Get the base URL for Deposium API
 *
 * Priority: deposiumUrl > mcpUrl (deprecated) > default
 * Default is http://localhost:3003 (local SolidStart dev server)
 *
 * @param cfg - Optional config object
 * @param options - Options for URL validation
 * @param options.validateSecurity - If true, enforce HTTPS on non-localhost URLs (default: true)
 * @param options.insecure - If true, allow HTTP with a warning (from --insecure flag)
 */
export function getBaseUrl(
  cfg?: DeposiumConfig,
  options: { validateSecurity?: boolean; insecure?: boolean } = {}
): string {
  const c = cfg ?? getConfig();
  const url = c.deposiumUrl ?? c.mcpUrl ?? 'http://localhost:3003';

  // Enforce URL security by default (can be disabled for testing)
  const { validateSecurity = true, insecure } = options;
  if (validateSecurity) {
    enforceUrlSecurity(url, { insecure });
  }

  return url;
}

/**
 * Get the direct MCP server URL (bypasses SolidStart proxy)
 * Used for chat streaming via /api/chat-stream SSE endpoint.
 *
 * Default: http://localhost:4001
 *
 * @param cfg - Optional config object
 * @param options - Options for URL validation
 * @param options.insecure - If true, allow HTTP with a warning (from --insecure flag)
 */
export function getMcpDirectUrl(
  cfg?: DeposiumConfig,
  options: { insecure?: boolean } = {}
): string {
  const c = cfg ?? getConfig();
  const url = c.mcpDirectUrl ?? 'http://localhost:4001';
  enforceUrlSecurity(url, { insecure: options.insecure });
  return url;
}

/**
 * Get the Edge Runtime gateway URL
 *
 * The Edge Runtime provides auth, rate-limiting, and SSE proxy.
 * Used for chat streaming (replaces direct MCP connection).
 *
 * Priority: edgeUrl > mcpDirectUrl (deprecated) > default
 * Default: http://localhost:9000 (local Edge Runtime dev server)
 *
 * @param cfg - Optional config object
 * @param options - Options for URL validation
 * @param options.insecure - If true, allow HTTP with a warning (from --insecure flag)
 */
export function getEdgeUrl(cfg?: DeposiumConfig, options: { insecure?: boolean } = {}): string {
  const c = cfg ?? getConfig();
  const url = c.edgeUrl ?? c.mcpDirectUrl ?? 'http://localhost:9000';

  // Warn if falling back to deprecated mcpDirectUrl
  if (!c.edgeUrl && c.mcpDirectUrl) {
    console.warn(
      chalk.yellow('⚠️  DEPOSIUM_MCP_DIRECT_URL is deprecated. ') +
        chalk.white('Use DEPOSIUM_EDGE_URL instead.\n')
    );
  }

  enforceUrlSecurity(url, { insecure: options.insecure });
  return url;
}

export function setConfig(key: keyof DeposiumConfig, value: DeposiumConfig[typeof key]): void {
  config.set(key, value);
}

export function deleteConfig(key: keyof DeposiumConfig): void {
  config.delete(key);
}

export function resetConfig(): void {
  config.clear();
}

export function getConfigPath(): string {
  return config.path;
}

// API Key helpers — stored in separate credentials file
export function getApiKey(): string | undefined {
  // Priority: credentials store > legacy config store (backward compat)
  return credentials.get('apiKey') ?? config.get('apiKey');
}

export function setApiKey(key: string): void {
  credentials.set('apiKey', key);
}

export function deleteApiKey(): void {
  credentials.delete('apiKey');
}

export function hasApiKey(): boolean {
  const key = getApiKey();
  return key !== undefined && key !== null && key !== '';
}

export function getCredentialsPath(): string {
  return credentials.path;
}
