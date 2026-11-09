import chalk from 'chalk';
import type { SSECitation, SSEVerification } from '../client/types';

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length ? text : undefined;
}

function sourceDetails(citation: SSECitation) {
  const name = nonEmpty(citation.document_name) ?? nonEmpty(citation.file_name);
  const identity = citation.file_id ?? citation.document_id;
  const label = name ?? `Document ${identity}`;
  const key = identity ? `id:${identity}` : `name:${label}`;
  return { name, identity, label, key, page: citation.page ?? citation.page_number };
}

/** Group repeated passage citations without inventing a missing filename. */
export function printChatSources(citations: SSECitation[]): void {
  const sources = new Map<string, { name: string; pages: Set<number> }>();
  let unavailable = 0;
  for (const citation of citations) {
    const { name, identity, label, key, page } = sourceDetails(citation);
    if (citation.availability === 'unavailable' || (!name && !identity)) {
      unavailable++;
      continue;
    }
    const source = sources.get(key) ?? { name: label, pages: new Set<number>() };
    // A later event can supply the name missing from an earlier event.
    if (name) source.name = name;
    if (typeof page === 'number' && Number.isInteger(page) && page > 0) {
      source.pages.add(page);
    }
    sources.set(key, source);
  }
  if (citations.length === 0) return;
  console.log(chalk.gray('\n📎 Sources:'));
  for (const source of sources.values()) {
    const pages = [...source.pages].sort((a, b) => a - b);
    const suffix = pages.length ? ` p.${pages.join(', ')}` : '';
    console.log(chalk.gray(`   - ${source.name}${suffix}`));
  }
  if (unavailable)
    console.log(chalk.yellow(`   - ${unavailable} source reference(s) unavailable.`));
}

type VerificationNote = { severity: string; text: string };

function verificationNote(issue: NonNullable<SSEVerification['issues']>[number]): VerificationNote {
  return {
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
      notes.set(`${note.severity}:${note.text}`, note);
    }
  }
  return { notes, recommendations };
}

function verificationStatus(blocked: boolean, needsReview: boolean, hasImportant: boolean) {
  if (blocked) return { label: '🚫', text: 'response blocked' };
  if (needsReview) return { label: '⚠️', text: 'response needs review' };
  return { label: hasImportant ? '⚠️' : 'ℹ️', text: 'advisory notes' };
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
  const visible = verbose ? details : (needsReview || blocked ? details : important).slice(0, 3);
  for (const note of visible) console.log(`  [${note.severity}] ${note.text}`);
  if (visible.length < details.length) {
    console.log(
      chalk.gray(
        `  ${details.length - visible.length} additional note(s); use chat --verbose for details.`
      )
    );
  }
  for (const recommendation of recommendations) console.log(chalk.gray(`  → ${recommendation}`));
}
