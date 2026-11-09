import { afterEach, expect, test, vi } from 'vitest';
import { stripVTControlCharacters } from 'node:util';
import { createWelcomeBanner } from '../utils/branding';
import { formatOutput } from '../utils/formatter';

afterEach(() => vi.restoreAllMocks());

test('the existing wordmark is a startup banner with a compact narrow-terminal fallback', () => {
  const wide = stripVTControlCharacters(createWelcomeBanner(80));
  expect(wide).toContain('██████');
  expect(wide).toContain('Document chat');
  const narrow = stripVTControlCharacters(createWelcomeBanner(40));
  expect(narrow).toContain('DEPOSIUM®');
  expect(Math.max(...narrow.split('\n').map((line) => line.length))).toBeLessThanOrEqual(40);
});

test('Markdown uses the real terminal extension without an HTML or warning fallback', () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
  formatOutput('# Heading\n\n**Important text**\n\n- First item', 'markdown');
  const text = stripVTControlCharacters(output.mock.calls.flat().join('\n'));
  expect(warnings).not.toHaveBeenCalled();
  expect(text).toContain('Important text');
  expect(text).toContain('First item');
  expect(text).not.toContain('<h1>');
  expect(text).not.toContain('<strong>');
});

test('a no-tool Compound answer does not claim document analysis, verified confidence or show duplicate reasoning/logo', () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const result = {
    success: true,
    answer: 'No document was searched.',
    tools_used: [],
    confidence: 0.6,
    reasoning: 'INTERNAL SUMMARY',
    model_used: 'reported-model',
    tokens_used: 100,
  };
  formatOutput(result, 'markdown');
  const text = stripVTControlCharacters(output.mock.calls.flat().join('\n'));
  expect(text).toContain('Response received');
  expect(text).toContain('does not establish that your documents were searched');
  expect(text).toContain('use Chat');
  expect(text).toContain('Model (reported): reported-model');
  expect(text).not.toContain('Analysis completed successfully');
  expect(text).not.toContain('60%');
  expect(text).not.toContain('INTERNAL SUMMARY');
  expect(text).not.toContain('██████');
  output.mockClear();
  formatOutput(result, 'json');
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual(result);
});
