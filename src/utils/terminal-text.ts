import { stripVTControlCharacters } from 'node:util';

/** Preserve readable server text while removing terminal controls consistently on Node 22/24. */
export function terminalText(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Remove OSC payloads before standalone BEL characters: BEL can terminate an OSC,
  // but on Node 22 it can also make the native stripper consume adjacent prose.
  /* eslint-disable no-control-regex */
  const withoutOsc = value.replace(/(?:\u001b\]|\u009d)[\s\S]*?(?:\u0007|\u001b\\|\u009c|$)/g, '');
  const withoutC0 = withoutOsc.replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, '');
  return stripVTControlCharacters(withoutC0).replace(/[\u001b\u0080-\u009f]/g, '');
  /* eslint-enable no-control-regex */
}
