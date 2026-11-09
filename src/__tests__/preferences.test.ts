import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  initializeLanguage,
  getLanguage,
  getLanguageSource,
  localeLanguage,
  readLanguageOption,
  tr,
  updateSavedLanguage,
} from '../utils/i18n';
import french from '../utils/locales/fr.json';

beforeEach(() => initializeLanguage(undefined, undefined, {}));
afterEach(() => initializeLanguage(undefined, undefined, {}));

describe('language selection', () => {
  test.each([
    ['fr', 'en', { LANG: 'fr_FR.UTF-8' }, 'en', 'flag'],
    ['fr', undefined, { LANG: 'en_US.UTF-8' }, 'fr', 'saved'],
    ['auto', undefined, { LANG: 'fr_FR.UTF-8' }, 'fr', 'locale'],
    [undefined, undefined, { LC_ALL: 'C', LANG: 'fr_FR.UTF-8' }, 'en', 'default'],
    [undefined, undefined, { LC_MESSAGES: 'en_GB.UTF-8', LANG: 'fr_FR.UTF-8' }, 'en', 'locale'],
    [undefined, undefined, { LC_ALL: '', LC_MESSAGES: 'fr_CA.UTF-8' }, 'fr', 'locale'],
    ['broken', undefined, { LANG: 'de_DE.UTF-8' }, 'en', 'default'],
  ] as const)('resolves saved %s / flag %s / locale %j', (saved, flag, env, expected, source) => {
    initializeLanguage(saved, flag, env);
    expect(getLanguage()).toBe(expected);
    expect(getLanguageSource()).toBe(source);
  });
  test('a saved change cannot override this invocation; auto restores the terminal locale otherwise', () => {
    initializeLanguage('en', 'fr', { LANG: 'en_GB.UTF-8' });
    updateSavedLanguage('en');
    expect(getLanguage()).toBe('fr');
    initializeLanguage('en', undefined, { LANG: 'fr_FR.UTF-8' });
    updateSavedLanguage('auto');
    expect(getLanguage()).toBe('fr');
    expect(getLanguageSource()).toBe('locale');
  });
  test.each(['FR', 'fr_CA', 'en-GB.UTF-8'])('accepts a recognized locale %s', (value) => {
    expect(localeLanguage({ LANG: value })).toBe(
      value.toLowerCase().startsWith('fr') ? 'fr' : 'en'
    );
  });
  test('global flag handles equals, repeated flags, and the end-of-options delimiter', () => {
    expect(readLanguageOption(['--lang=fr', 'chat', '--lang', 'en'])).toBe('en');
    expect(readLanguageOption(['search', '--', '--lang', 'de'])).toBeUndefined();
    expect(readLanguageOption(['validate', '--language', 'fr'])).toBeUndefined();
    expect(() => readLanguageOption(['--lang', 'de'])).toThrow('--lang');
    expect(() => readLanguageOption(['--lang'])).toThrow('--lang');
  });
  test('translation does not recursively interpolate or translate server text', () => {
    initializeLanguage('fr');
    expect(tr('Instance: {0}', '{1}')).toBe('Instance : {1}');
    expect(tr('Untouched server message')).toBe('Untouched server message');
    expect(tr('constructor')).toBe('constructor');
    expect(tr('__proto__')).toBe('__proto__');
    expect(tr('Found {0} result(s)\n', 3)).toContain('3 résultat');
  });
  test('French messages retain exactly the same interpolation slots', () => {
    const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort();
    for (const [english, translation] of Object.entries(french)) {
      expect(slots(translation), english).toEqual(slots(english));
    }
  });
});
