import chalk from 'chalk';
import { stripVTControlCharacters } from 'node:util';
import type { SSECitation, SSEVerification } from '../client/types';

export interface ChatTurnDetails {
  citations: SSECitation[];
  verifications: SSEVerification[];
}

function safeText(value: string): string {
  // Strip terminal controls from untrusted filenames and excerpts.
  // eslint-disable-next-line no-control-regex
  return stripVTControlCharacters(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

function citationNumber(citation: SSECitation): number | undefined {
  const value: unknown = citation.citation_id;
  const number = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0
    ? number
    : undefined;
}

function canonicalCitations(citations: SSECitation[]): SSECitation[] {
  const identified = new Map<number, SSECitation>();
  const legacy: SSECitation[] = [];
  for (const citation of citations) {
    if (!citation || typeof citation !== 'object' || Array.isArray(citation)) continue;
    const id = citationNumber(citation);
    if (id) identified.set(id, citation);
    else legacy.push(citation);
  }
  return [...identified.values(), ...legacy];
}

/** List inspectable citation IDs actually supplied by the server, never fabricated references. */
export function chatSourceChoices(
  citations: SSECitation[]
): Array<{ name: string; value: string }> {
  return canonicalCitations(citations).flatMap((citation) => {
    const id = citationNumber(citation);
    if (!id || sourceUnavailable(citation)) return [];
    const { label, page, name, identity } = sourceDetails(citation);
    if (!name && !identity) return [];
    return [
      {
        name: `[${id}] ${safeText(label).replace(/\s+/g, ' ')}${page ? ` p.${page}` : ''}`,
        value: String(id),
      },
    ];
  });
}

/** Inspect only an emitted, available citation; excerpts are cached, bounded and non-executable. */
export function printChatSourceDetail(citations: SSECitation[], id: number): void {
  const citation = canonicalCitations(citations).find((item) => citationNumber(item) === id);
  if (!citation || sourceUnavailable(citation)) {
    console.log('Citation unavailable. Use /sources to see references received for this answer.');
    return;
  }
  const { label, page, name, identity } = sourceDetails(citation);
  if (!name && !identity) {
    console.log('Citation document identity is unavailable.');
    return;
  }
  console.log(
    `\nCitation ${id} — ${safeText(label).replace(/\s+/g, ' ')}${page ? ` p.${page}` : ''}`
  );
  const text = nonEmpty(citation.snippet) ?? nonEmpty(citation.full_content);
  if (text) {
    const excerpt = safeText(text);
    console.log(excerpt.slice(0, 2500));
    if (excerpt.length > 2500) console.log('[Excerpt truncated]');
  } else console.log('The server provided a reference but no passage text for this citation.');
  console.log('Passage received with the last answer; no new document was fetched.');
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length ? text : undefined;
}

function sourceUnavailable(citation: SSECitation): boolean {
  return citation.availability !== undefined && citation.availability !== 'available';
}

function sourceDetails(citation: SSECitation) {
  const name = nonEmpty(citation.document_name) ?? nonEmpty(citation.file_name);
  const rawIdentity = citation.file_id ?? citation.document_id;
  const identity =
    typeof rawIdentity === 'number' && Number.isSafeInteger(rawIdentity) && rawIdentity > 0
      ? rawIdentity
      : nonEmpty(rawIdentity);
  const label = name ?? (identity ? `Document ${identity}` : 'Unnamed source');
  const key = identity ? `id:${identity}` : `name:${label}`;
  const rawPage = citation.page ?? citation.page_number;
  const page =
    typeof rawPage === 'number' && Number.isSafeInteger(rawPage) && rawPage > 0
      ? rawPage
      : undefined;
  return { name, identity, label, key, page };
}

function groupChatSources(citations: SSECitation[]) {
  const sources = new Map<string, { name: string; pages: Set<number>; ids: Set<number> }>();
  let unavailable = 0;
  for (const citation of canonicalCitations(citations)) {
    const { name, identity, label, key, page } = sourceDetails(citation);
    if (sourceUnavailable(citation) || (!name && !identity)) {
      unavailable++;
      continue;
    }
    const source = sources.get(key) ?? {
      name: label,
      pages: new Set<number>(),
      ids: new Set<number>(),
    };
    // A later event can supply the name missing from an earlier event.
    if (name) source.name = name;
    if (typeof page === 'number' && Number.isInteger(page) && page > 0) {
      source.pages.add(page);
    }
    const id = citationNumber(citation);
    if (id) source.ids.add(id);
    sources.set(key, source);
  }
  return { sources, unavailable };
}

/** Group repeated passage citations without inventing a missing filename. */
export function printChatSources(citations: SSECitation[]): void {
  const { sources, unavailable } = groupChatSources(citations);
  if (citations.length === 0) return;
  console.log(chalk.gray('\n📎 Sources:'));
  for (const source of sources.values()) {
    const pages = [...source.pages].sort((a, b) => a - b);
    const suffix = pages.length ? ` p.${pages.join(', ')}` : '';
    console.log(
      chalk.gray(
        `   - ${safeText(source.name).replace(/\s+/g, ' ')}${suffix}${source.ids.size ? ` — citations ${[...source.ids].sort((a, b) => a - b).join(', ')}` : ''}`
      )
    );
  }
  if (chatSourceChoices(citations).length)
    console.log(
      chalk.gray('   Read a cited passage: /source <citation number> · List again: /sources')
    );
  if (unavailable)
    console.log(chalk.yellow(`   - ${unavailable} source reference(s) unavailable.`));
}

type VerificationNote = { severity: string; text: string; type?: string };

function verificationNote(issue: NonNullable<SSEVerification['issues']>[number]): VerificationNote {
  return {
    type: nonEmpty(issue.type),
    severity: nonEmpty(issue.severity) ?? 'warning',
    text:
      nonEmpty(issue.message) ??
      nonEmpty(issue.description) ??
      nonEmpty(issue.type) ??
      'Verification note',
  };
}

function collectVerification(events: SSEVerification[]) {
  const notes = new Map<string, VerificationNote>();
  const recommendations = new Set<string>();
  for (const event of events) {
    const recommendation = nonEmpty(event.recommendation);
    if (recommendation) recommendations.add(recommendation);
    for (const issue of event.issues ?? []) {
      const note = verificationNote(issue);
      notes.set(`${note.type}:${note.severity}:${note.text}`, note);
    }
  }
  return { notes, recommendations };
}

function verificationStatus(blocked: boolean, needsReview: boolean, hasImportant: boolean) {
  if (blocked) return { label: '🚫', text: 'response blocked' };
  if (needsReview) return { label: '⚠️', text: 'response needs review' };
  return { label: hasImportant ? '⚠️' : 'ℹ️', text: 'advisory notes' };
}

function printCompactVerification(
  details: VerificationNote[],
  needsReview: boolean,
  blocked: boolean
): boolean {
  const advisory = (severity: string) => severity === 'info' || severity === 'low';
  const categories: Record<string, string> = {
    amount_mismatch: 'Amounts to check against the cited passages',
    entity_unresolved: 'Names not linked in the knowledge graph',
    ungrounded_claim: 'Claims needing a source check',
    citation_completeness: 'Citation coverage to check',
    scope_not_addressed: 'Parts of the question possibly unanswered',
    low_recall_diversity: 'Limited diversity of retrieved documents',
    evidence_numeric_miss: 'Limited numerical evidence',
  };
  const grouped = new Map<string, number>();
  const other: VerificationNote[] = [];
  for (const note of details) {
    const code = note.type ?? '';
    const label = Object.hasOwn(categories, code) ? categories[code] : undefined;
    if (label) grouped.set(label, (grouped.get(label) ?? 0) + 1);
    else other.push(note);
  }
  for (const [label, count] of grouped) console.log(`  • ${label}: ${count}`);
  const visible = (
    needsReview || blocked ? other : other.filter((note) => !advisory(note.severity))
  ).slice(0, 3);
  for (const note of visible)
    console.log(`  [${note.severity}] ${safeText(note.text).replace(/\s+/g, ' ').slice(0, 180)}`);
  if (visible.length < other.length)
    console.log(chalk.gray(`  ${other.length - visible.length} additional note(s).`));
  if (details.some((note) => note.type === 'entity_unresolved'))
    console.log(chalk.gray('  An unlinked name is not, by itself, proof of an invented fact.'));
  console.log(chalk.gray('  Details: /verify or chat --verbose. Check passages with /source.'));
  return grouped.size > 0 && !blocked;
}

/** Display diagnostics once, after the final answer, with bounded detail. */
export function printChatVerification(events: SSEVerification[], verbose = false): void {
  const { notes, recommendations } = collectVerification(events);
  const blocked = events.some((event) => event.action === 'blocked');
  const needsReview = events.some((event) => event.action === 'human_review' || !event.passed);
  if (!notes.size && !needsReview && !blocked) return;
  const advisory = (severity: string) => severity === 'info' || severity === 'low';
  const details = [...notes.values()].sort(
    (a, b) => Number(advisory(a.severity)) - Number(advisory(b.severity))
  );
  const important = details.filter((note) => !advisory(note.severity));
  const status = verificationStatus(blocked, needsReview, important.length > 0);
  console.log(chalk.yellow(`\n${status.label} Verification: ${status.text} (${notes.size}).`));
  if (verbose) {
    for (const note of details) console.log(`  [${note.severity}] ${safeText(note.text)}`);
  } else {
    if (printCompactVerification(details, needsReview, blocked)) return;
  }
  for (const recommendation of recommendations)
    console.log(chalk.gray(`  → ${safeText(recommendation)}`));
}
