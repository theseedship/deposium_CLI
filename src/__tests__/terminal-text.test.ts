import { expect, test } from 'vitest';
import { terminalText } from '../utils/terminal-text';

test.each([
  ['\x1b[2JDescription\x07', 'Description'],
  ['\x1b]52;c;AAAA\x07Visible', 'Visible'],
  ['\x1b]52;c;AAAA\x1b\\Visible', 'Visible'],
  ['\u009d52;c;AAAA\u009cVisible', 'Visible'],
  ['Visible\x1b]unterminated', 'Visible'],
  ['Été\nnext\tcell\x00', 'Été\nnext\tcell'],
])('terminal controls in %j cannot erase surrounding text or execute', (input, expected) => {
  expect(terminalText(input)).toBe(expected);
});
