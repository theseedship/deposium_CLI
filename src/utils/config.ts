import 'dotenv/config';
import Conf from 'conf';
import path from 'path';
import os from 'os';
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
 * Validate URL security - warn if non-localhost URL uses HTTP instead of HTTPS
 */
export function validateUrlSecurity(url: string, silent: boolean = false): void {
  if (!url) return;

  try {
    const parsed = new URL(url);

    // Skip validation for localhost/development URLs
    if (isLocalhostUrl(url)) return;

    // Warn if production URL uses HTTP instead of HTTPS
    if (parsed.protocol === 'http:') {
      if (!silent) {
        console.warn(
          chalk.yellow('\n⚠️  Security Warning: ') +
            chalk.white(`Using insecure HTTP for ${parsed.hostname}\n`) +
            chalk.gray('   Production URLs should use HTTPS to protect data in transit.\n') +
            chalk.gray(`   Consider using: ${chalk.cyan(url.replace('http:', 'https:'))}\n`)
        );
      }
    }
  } catch {
    // Invalid URL, will be caught elsewhere
  }
}

export interface DeposiumConfig {
  deposiumUrl?: string; // Unified URL for Deposium API (SolidStart server)
  mcpUrl?: string; // @deprecated - Use deposiumUrl instead. Kept for backward compatibility.
  apiKey?: string;
  defaultTenant?: string;
  defaultSpace?: string;
  outputFormat?: 'json' | 'table' | 'markdown';
  silentMode?: boolean;
}

const config = new Conf<DeposiumConfig>({
  projectName: 'deposium-cli',
  configName: 'config',
  cwd: path.join(os.homedir(), '.deposium'),
});

export function getConfig(): DeposiumConfig {
  // Priority: Environment variables > Config file > Defaults
  return {
    deposiumUrl: process.env.DEPOSIUM_URL ?? config.get('deposiumUrl'),
    mcpUrl: process.env.DEPOSIUM_MCP_URL ?? config.get('mcpUrl'), // @deprecated
    apiKey: process.env.DEPOSIUM_API_KEY ?? config.get('apiKey'),
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
 * @param options.validateSecurity - If true, warn about insecure HTTP on non-localhost URLs (default: true)
 * @param options.silent - If true, suppress security warnings (default: false)
 */
export function getBaseUrl(
  cfg?: DeposiumConfig,
  options: { validateSecurity?: boolean; silent?: boolean } = {}
): string {
  const c = cfg ?? getConfig();
  const url = c.deposiumUrl ?? c.mcpUrl ?? 'http://localhost:3003';

  // Validate URL security by default (can be disabled for testing)
  const { validateSecurity = true, silent = c.silentMode } = options;
  if (validateSecurity) {
    validateUrlSecurity(url, silent);
  }

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

// API Key specific helpers
export function getApiKey(): string | undefined {
  return config.get('apiKey');
}

export function setApiKey(key: string): void {
  config.set('apiKey', key);
}

export function deleteApiKey(): void {
  config.delete('apiKey');
}

export function hasApiKey(): boolean {
  const key = config.get('apiKey');
  return key !== undefined && key !== null && key !== '';
}
