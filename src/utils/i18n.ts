import french from './locales/fr.json';

export type CliLanguage = 'en' | 'fr';
export type LanguagePreference = CliLanguage | 'auto';
export type LanguageSource = 'flag' | 'saved' | 'locale' | 'default';

let language: CliLanguage = 'en';
let source: LanguageSource = 'default';
let override: CliLanguage | undefined;
let environment: NodeJS.ProcessEnv = {};

/** Only supported language preferences can be persisted. */
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'fr' || value === 'en' || value === 'auto';
}

/** Respect POSIX locale precedence, including C/POSIX forcing the English fallback. */
export function localeLanguage(env: NodeJS.ProcessEnv): CliLanguage | undefined {
  const value = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find(
    (item) => item !== undefined && item !== ''
  );
  const match = value?.match(/^(fr|en)(?:[_\-.@]|$)/i);
  return match?.[1].toLowerCase() as CliLanguage | undefined;
}

/** Establish process-local presentation only; never write preferences or change API scope. */
export function initializeLanguage(
  saved?: unknown,
  flag?: CliLanguage,
  env: NodeJS.ProcessEnv = process.env
): void {
  override = flag;
  environment = { LC_ALL: env.LC_ALL, LC_MESSAGES: env.LC_MESSAGES, LANG: env.LANG };
  const stored = saved === 'fr' || saved === 'en' ? saved : undefined;
  const locale = localeLanguage(environment);
  language = flag ?? stored ?? locale ?? 'en';
  source = flag ? 'flag' : stored ? 'saved' : locale ? 'locale' : 'default';
}

/** Apply a saved setting immediately while retaining an explicit invocation override. */
export function updateSavedLanguage(saved: LanguagePreference): void {
  initializeLanguage(saved, override, environment);
}

/** Effective language shared by UI and the chat's default answer language. */
export function getLanguage(): CliLanguage {
  return language;
}

/** Explain which preference won without exposing configuration secrets. */
export function getLanguageSource(): LanguageSource {
  return source;
}

/** Extract the global language option before help and the optional startup update. */
export function readLanguageOption(args: readonly string[]): CliLanguage | undefined {
  let selected: CliLanguage | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') break;
    if (arg !== '--lang' && !arg.startsWith('--lang=')) continue;
    const value = arg === '--lang' ? args[++index] : arg.slice('--lang='.length);
    if (value !== 'fr' && value !== 'en') throw new Error(tr('Choose --lang fr or --lang en.'));
    selected = value;
  }
  return selected;
}

/** Translate CLI-owned presentation; interpolate values once, without translating server data. */
export function tr(message: string, ...values: unknown[]): string {
  const template =
    language === 'fr' && Object.hasOwn(french, message)
      ? (french as Record<string, string>)[message]
      : message;
  return template.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : match
  );
}
