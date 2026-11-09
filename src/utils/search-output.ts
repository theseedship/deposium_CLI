import chalk from 'chalk';
import { terminalText } from './terminal-text';
import { tr } from './i18n';

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => terminalText(value).replace(/\s+/g, ' ').trim();
const excerpt = (value: string, limit: number) =>
  value.length > limit ? value.slice(0, limit) + '…' : value;

/** Render the observed search_hub business contract, without its duplicate document bodies or UI resource. */
export function printSearchResult(value: unknown): boolean {
  if (!record(value) || !Array.isArray(value.blocks) || !Array.isArray(value.documents))
    return false;
  const rows = value.blocks.length ? value.blocks : value.documents;
  console.log(chalk.bold(tr('\nSearch returned {0} passage(s).', rows.length)));
  if (!rows.length) {
    console.log(tr('No matching passage. Try another term or choose another space.'));
    return true;
  }
  rows.slice(0, 20).forEach((raw, index) => {
    if (!record(raw)) return;
    const name = text(raw.file_name) || text(raw.title) || tr('Unnamed document');
    const page = raw.page ?? raw.page_number;
    const pageLabel =
      typeof page === 'number' || typeof page === 'string'
        ? ` — p.${excerpt(text(String(page)), 30)}`
        : '';
    console.log(chalk.cyan(`\n[${index + 1}] ${excerpt(name, 160)}${pageLabel}`));
    const content = text(raw.text) || text(raw.snippet) || text(raw.content);
    console.log(content ? excerpt(content, 600) : tr('No passage text supplied.'));
    if (typeof raw.file_id === 'string' || typeof raw.file_id === 'number')
      console.log(tr('File ID: {0}', excerpt(text(String(raw.file_id)), 120)));
  });
  if (rows.length > 20)
    console.log(
      tr(
        'Showing {0} of {1} passages. Use --format json for the complete response.',
        20,
        rows.length
      )
    );
  console.log(tr('\nThese are retrieved passages, not an AI answer. Choose Chat for a synthesis.'));
  return true;
}
