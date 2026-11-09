import { afterEach, describe, expect, test, vi } from 'vitest';
import { printChatSources, printChatVerification } from '../utils/chat-output';
import type { SSEVerification } from '../client/types';

afterEach(() => vi.restoreAllMocks());

function capture() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => log.mock.calls.map((call) => String(call[0])).join('\n');
}

describe('chat source display', () => {
  test('accepts both source schemas and groups repeated passages by file and page', () => {
    const output = capture();
    printChatSources([
      { file_id: 1, file_name: 'guide.pdf', page_number: 2 },
      { file_id: 1, document_name: 'guide.pdf', page: 1 },
      { file_id: 1, document_name: 'guide.pdf', page: 2 },
      { document_id: 'legacy', document_name: 'legacy.pdf', page: 12 },
    ]);
    expect(output()).toContain('guide.pdf p.1, 2');
    expect(output().split('guide.pdf').length - 1).toBe(1);
    expect(output()).toContain('legacy.pdf p.12');
    expect(output()).not.toContain('undefined');
  });

  test('uses explicit fallbacks, learns later filenames, and ignores invalid pages', () => {
    const output = capture();
    printChatSources([
      { file_id: 2, page: 0 },
      { file_id: 2, file_name: 'late.pdf', page: 3 },
      { document_id: 'unknown', page: -1 },
      {},
    ]);
    expect(output()).toContain('late.pdf p.3');
    expect(output()).toContain('Document unknown');
    expect(output()).toContain('1 source reference(s) unavailable');
    expect(output()).not.toContain('undefined');
    expect(output()).not.toContain('p.0');
    expect(output()).not.toContain('p.-1');
  });

  test('keeps distinct files even when their filenames match', () => {
    const output = capture();
    printChatSources([
      { file_id: 1, file_name: 'same.pdf' },
      { file_id: 2, file_name: 'same.pdf' },
    ]);
    expect(output().split('same.pdf').length - 1).toBe(2);
  });

  test('unavailable references are not invented or combined as pages of one document', () => {
    const output = capture();
    printChatSources([
      { citation_id: 1, availability: 'unavailable', page: 1 },
      { citation_id: 2, availability: 'unavailable', page: 8 },
      { citation_id: 3, availability: 'unavailable', document_name: 'restricted.pdf', page: 4 },
    ]);
    expect(output()).toContain('3 source reference(s) unavailable');
    expect(output()).not.toContain('p.');
    expect(output()).not.toContain('undefined');
    expect(output()).not.toContain('restricted.pdf');
  });
});

describe('chat verification display', () => {
  const note = {
    severity: 'low',
    description: 'An entity is unresolved.',
    type: 'entity_unresolved',
  };
  const advisory: SSEVerification = {
    validated: true,
    passed: true,
    action: 'passed',
    issues: [note],
  };

  test('deduplicates intermediate advisories and avoids raw JSON by default', () => {
    const output = capture();
    printChatVerification([advisory, advisory]);
    expect(output()).toContain('advisory notes (1)');
    expect(output()).toContain('--verbose');
    expect(output()).not.toContain('An entity');
    expect(output()).not.toContain('"type"');
  });

  test('verbose uses human-readable descriptions and deduplicates repeated notes', () => {
    const output = capture();
    printChatVerification([advisory, advisory], true);
    expect(output().split(note.description).length - 1).toBe(1);
    expect(output()).not.toContain('"description"');
  });

  test('review and block decisions stay visible with bounded details and a recommendation', () => {
    const output = capture();
    printChatVerification([
      {
        validated: true,
        passed: false,
        action: 'human_review',
        issues: Array.from({ length: 40 }, (_, i) => ({
          severity: 'low',
          description: `Note ${i}.`,
        })),
        recommendation: 'Check the cited source.',
      },
      { validated: true, passed: false, action: 'blocked' },
    ]);
    expect(output()).toContain('response blocked');
    expect(output()).toContain('Note 0.');
    expect(output()).not.toContain('Note 3.');
    expect(output()).toContain('37 additional');
    expect(output()).toContain('Check the cited source.');
  });

  test('important issues are shown even when the verdict passed', () => {
    const output = capture();
    printChatVerification([
      { ...advisory, issues: [{ severity: 'high', message: 'Check amount.' }] },
    ]);
    expect(output()).toContain('Check amount.');
  });

  test('important issues are not hidden by earlier advisory notes in a review', () => {
    const output = capture();
    printChatVerification([
      {
        ...advisory,
        passed: false,
        action: 'human_review',
        issues: [
          ...Array.from({ length: 10 }, () => note),
          { severity: 'high', message: 'Amount mismatch.' },
        ],
      },
    ]);
    expect(output()).toContain('Amount mismatch.');
  });

  test('a clean pass produces no diagnostics', () => {
    const output = capture();
    printChatVerification([{ validated: true, passed: true, action: 'passed' }]);
    expect(output()).toBe('');
  });
});
