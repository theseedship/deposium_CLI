import 'dotenv/config';
import Conf from 'conf';
import path from 'path';
import os from 'os';

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
    deposiumUrl: process.env.DEPOSIUM_URL || config.get('deposiumUrl'),
    mcpUrl: process.env.DEPOSIUM_MCP_URL || config.get('mcpUrl'), // @deprecated
    apiKey: process.env.DEPOSIUM_API_KEY || config.get('apiKey'),
    defaultTenant: process.env.DEPOSIUM_TENANT || config.get('defaultTenant'),
    defaultSpace: process.env.DEPOSIUM_SPACE || config.get('defaultSpace'),
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
 */
export function getBaseUrl(cfg?: DeposiumConfig): string {
  const c = cfg || getConfig();
  return c.deposiumUrl || c.mcpUrl || 'http://localhost:3003';
}

export function setConfig(key: keyof DeposiumConfig, value: any): void {
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
