import { getConfig, getBaseUrl, setConfig } from './config';
import type { DeposiumConfig } from './config';
import type { MCPClient } from '../client/mcp-client';
import {
  getLanguage,
  getLanguageSource,
  isLanguagePreference,
  tr,
  updateSavedLanguage,
} from './i18n';
import { terminalText } from './terminal-text';

export interface CliContext {
  instance: string;
  edge: string;
  language: 'fr' | 'en';
  language_source: string;
  saved_language: string;
  space: {
    source: 'environment' | 'saved' | 'none';
    status: 'none' | 'unverified' | 'accessible' | 'inaccessible' | 'unavailable';
    id?: string;
    name?: string;
  };
}

/** A diagnostic URL never includes embedded credentials, query values or fragments. */
export function diagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid_url';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return terminalText(url.origin);
  } catch {
    return 'invalid_url';
  }
}

/** Save a validated language setting without altering credentials or invocation overrides. */
export function saveLanguage(value: string): void {
  if (!isLanguagePreference(value)) throw new Error(tr('Choose fr, en or auto.'));
  setConfig('language', value);
  updateSavedLanguage(value);
}

/** Read effective presentation/scope settings without leaking a key or querying the server. */
export function cliContext(config: DeposiumConfig = getConfig()): CliContext {
  const id = config.defaultSpace?.trim();
  return {
    instance: diagnosticUrl(getBaseUrl(config, { validateSecurity: false })),
    edge: diagnosticUrl(config.edgeUrl ?? config.mcpDirectUrl ?? 'https://edge.deposium.ai'),
    language: getLanguage(),
    language_source: getLanguageSource(),
    saved_language: config.language ?? 'auto',
    space: {
      source: id ? (process.env.DEPOSIUM_SPACE !== undefined ? 'environment' : 'saved') : 'none',
      status: id ? 'unverified' : 'none',
      ...(id ? { id: terminalText(id) } : {}),
    },
  };
}

/** Check the configured space against this account's fresh catalogue, without selecting a replacement. */
export async function verifiedCliContext(
  client: Pick<MCPClient, 'listSpaces'>,
  config: DeposiumConfig
): Promise<CliContext> {
  const context = cliContext(config);
  if (!config.defaultSpace?.trim()) return context;
  try {
    const spaces = await client.listSpaces();
    const selected = spaces.find(
      (space) => space.id.toLowerCase() === config.defaultSpace?.trim().toLowerCase()
    );
    context.space = {
      ...context.space,
      status: selected ? 'accessible' : 'inaccessible',
      ...(selected ? { name: terminalText(selected.name) } : {}),
    };
  } catch {
    // Connectivity of /health does not attest catalogue access.
    context.space.status = 'unavailable';
  }
  return context;
}

/** Human context view. Machine consumers keep the stable keys of CliContext. */
export function printCliContext(context: CliContext): void {
  console.log(tr('Instance: {0}', context.instance));
  console.log(tr('Chat gateway: {0}', context.edge));
  console.log(
    tr(
      'Language: {0} (source: {1}; saved: {2})',
      context.language,
      tr(context.language_source),
      context.saved_language
    )
  );
  console.log(
    tr(
      'Default space: {0} (status: {1}; source: {2})',
      context.space.name ?? context.space.id ?? tr('not set'),
      tr(context.space.status),
      tr(context.space.source)
    )
  );
}
