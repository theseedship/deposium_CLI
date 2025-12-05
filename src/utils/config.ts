import 'dotenv/config';
import Conf from 'conf';
import path from 'path';
import os from 'os';

export interface DeposiumConfig {
  mcpUrl?: string;
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
    mcpUrl: process.env.DEPOSIUM_MCP_URL || config.get('mcpUrl'),
    apiKey: process.env.DEPOSIUM_API_KEY || config.get('apiKey'),
    defaultTenant: process.env.DEPOSIUM_TENANT || config.get('defaultTenant'),
    defaultSpace: process.env.DEPOSIUM_SPACE || config.get('defaultSpace'),
    outputFormat:
      (process.env.DEPOSIUM_OUTPUT as 'json' | 'table' | 'markdown') ||
      config.get('outputFormat', 'table'),
    silentMode: process.env.DEPOSIUM_SILENT === 'true' || config.get('silentMode', false),
  };
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
