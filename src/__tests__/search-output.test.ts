import { afterEach, expect, test, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { formatOutput } from '../utils/formatter';
import { initializeLanguage } from '../utils/i18n';
import { useCompiledCli } from './helpers/compiled-cli';

const compiledModule = useCompiledCli();

const result = {
  documents: [{ file_name: 'Guide.pdf', content: 'DUPLICATE BODY' }],
  blocks: [
    {
      file_name: 'Guide.pdf',
      page: 2,
      text: 'A useful matching passage.',
      file_id: 'physical-file',
    },
  ],
  total_results: 1,
  cache_trace: { technical: 'INTERNAL TRACE' },
};
function capture() {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => stripVTControlCharacters(spy.mock.calls.flat().join('\n'));
}
afterEach(() => {
  vi.restoreAllMocks();
  initializeLanguage(undefined, 'en', {});
});

test('shows passages, names, pages and physical IDs without dumping duplicate bodies, technical metadata or UI resources', () => {
  const out = capture();
  formatOutput({
    content: [
      { type: 'text', text: JSON.stringify(result) },
      { type: 'resource', resource: { uri: 'ui://search/demo' } },
    ],
  });
  expect(out()).toContain('Search returned 1 passage(s)');
  expect(out()).toContain('[1] Guide.pdf — p.2');
  expect(out()).toContain('A useful matching passage.');
  expect(out()).toContain('File ID: physical-file');
  expect(out()).toContain('Choose Chat');
  expect(out()).not.toMatch(/DUPLICATE BODY|INTERNAL TRACE|MCP resource/);
});
test('retains numeric physical file IDs for passages sharing the same name', () => {
  const out = capture();
  formatOutput({
    documents: [],
    blocks: [
      { file_name: 'Same.pdf', text: 'First', file_id: 42 },
      { file_name: 'Same.pdf', text: 'Second', file_id: 43 },
    ],
  });
  expect(out()).toContain('File ID: 42');
  expect(out()).toContain('File ID: 43');
});
test('distinguishes no match from a completed but opaque tool call', () => {
  const out = capture();
  formatOutput({ documents: [], blocks: [] });
  expect(out()).toContain('No matching passage');
});
test('falls back to documents when blocks are absent from the returned set, and localizes the explanation', () => {
  const out = capture();
  initializeLanguage('fr', undefined, {});
  formatOutput({ documents: [{ title: 'Document', snippet: 'Résumé disponible' }], blocks: [] });
  expect(out()).toContain('La recherche a renvoyé 1 passage(s)');
  expect(out()).toContain('Résumé disponible');
  expect(out()).toContain('Choisissez Conversation');
});
test('bounds human previews without changing JSON or the server result', () => {
  const out = capture();
  const many = {
    documents: [],
    blocks: Array.from({ length: 25 }, (_, i) => ({
      text: 'é'.repeat(10000),
      file_name: `File-${i}`,
    })),
  };
  formatOutput(many);
  expect(out().length).toBeLessThan(16000);
  expect(out()).toContain('Showing 20 of 25 passages');
  const spy = vi.mocked(console.log);
  spy.mockClear();
  formatOutput(many, 'json');
  expect(JSON.parse(String(spy.mock.calls[0][0]))).toEqual(many);
});
test('strips terminal control sequences from returned passages', () => {
  const out = capture();
  formatOutput({
    documents: [],
    blocks: [{ file_name: 'Name', text: 'Before\u001b]52;c;clipboard\u0007After' }],
  });
  expect(out()).toContain('BeforeAfter');
  expect(out()).not.toContain('clipboard');
  const raw = vi.mocked(console.log).mock.calls.flat().join('\n');
  expect(raw).not.toContain('\u001b]52;');
  expect(raw).not.toContain('clipboard');
  expect(raw).toContain('BeforeAfter');
});
for (const kind of ['search', 'generic']) {
  test(`large Unicode ${kind} results render in a bounded child process instead of freezing the terminal`, () => {
    const code = `const {formatOutput}=require(${JSON.stringify(compiledModule('utils/formatter.js'))}); const body='été '.repeat(30000); formatOutput(${kind === 'search' ? "{documents:[{content:body}],blocks:[{text:body,file_name:'Synthetic.pdf',page:1}]}" : '{details:{body},items:25}'});`;
    const child = spawnSync(process.execPath, ['-e', code], {
      timeout: 4000,
      maxBuffer: 200000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout.length).toBeGreaterThan(0);
    expect(child.stdout.length).toBeLessThan(30000);
    if (kind === 'generic')
      expect(child.stdout.toString()).toContain('Large fields are abbreviated');
  });
}
