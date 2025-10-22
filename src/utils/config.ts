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
  return {
    mcpUrl: config.get('mcpUrl'),
    apiKey: config.get('apiKey'),
    defaultTenant: config.get('defaultTenant'),
    defaultSpace: config.get('defaultSpace'),
    outputFormat: config.get('outputFormat', 'table'),
    silentMode: config.get('silentMode', false),
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
