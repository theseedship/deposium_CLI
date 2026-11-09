import { afterEach, expect, test, vi } from 'vitest';
import { Command } from 'commander';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import french from '../utils/locales/fr.json';
import { initializeLanguage } from '../utils/i18n';
import { configureLanguageHelp } from '../utils/cli-language-help';
import { formatOutput } from '../utils/formatter';
import { CHAT_HELP, getChatHelp } from '../utils/chat-scope';
afterEach(() => {
  initializeLanguage(undefined, undefined, {});
  vi.restoreAllMocks();
});
test('French help retains command tokens, options and defaults; JSON retains original data', () => {
  initializeLanguage('fr', undefined, {});
  const root = new Command('deposium').option(
    '--lang <language>',
    'Use fr or en for this invocation without saving it'
  );
  const search = root
    .command('search')
    .description('Search documents using DuckDB VSS, FTS, or fuzzy matching')
    .option('--format <type>', 'Output format (json|table|markdown)', 'table');
  configureLanguageHelp(root);
  const help = search.helpInformation();
  expect(help).toContain('Rechercher des documents');
  expect(help).toContain('défaut : "table"');
  expect(help).toContain('--lang <language>');
  expect(help).toContain('json|table|markdown');
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const result = {
    description: 'Server English',
    role: 'assistant',
    language: 'fr',
    status: 'unknown',
  };
  formatOutput(result, 'json');
  expect(JSON.parse(String(output.mock.calls[0][0]))).toEqual(result);
});
test('translated slash help preserves every command name and argument token', () => {
  initializeLanguage('fr', undefined, {});
  expect(
    getChatHelp()
      .split('\n')
      .map((line) => line.split(' ')[0])
  ).toEqual(CHAT_HELP.split('\n').map((line) => line.split(' ')[0]));
  expect(getChatHelp()).toContain('Afficher les commandes');
});
test('all literal translations and static command descriptions have a French catalogue entry', () => {
  const missing: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== '__tests__') walk(file);
      else if (entry.isFile() && file.endsWith('.ts')) {
        const source = ts.createSourceFile(
          file,
          readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true
        );
        function visit(node: ts.Node) {
          if (ts.isCallExpression(node)) {
            let argument: ts.Expression | undefined;
            if (node.expression.getText(source) === 'tr') argument = node.arguments[0];
            else if (ts.isPropertyAccessExpression(node.expression)) {
              const method = node.expression.name.text;
              argument =
                node.arguments[
                  method === 'description'
                    ? 0
                    : ['option', 'requiredOption', 'argument'].includes(method)
                      ? 1
                      : -1
                ];
            }
            if (
              argument &&
              ts.isStringLiteralLike(argument) &&
              !Object.hasOwn(french, argument.text)
            )
              missing.push(`${file}: ${argument.text}`);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  walk('src');
  expect(missing).toEqual([]);
});
