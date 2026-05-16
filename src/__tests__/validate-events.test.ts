/**
 * Tests for src/client/validate-events.ts — renderValidateEvent.
 *
 * Pins the rendered string for each `validate:*` event type. Refactor of
 * the renderer must keep these guards green.
 */

import { describe, test, expect, vi } from 'vitest';

// Mock chalk so renderer output is deterministic plain strings.
vi.mock('chalk', () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
  },
}));

import { renderValidateEvent } from '../client/validate-events';
import type {
  ValidateStartEvent,
  ValidateClassificationEvent,
  ValidateThematicStartEvent,
  ValidateExtractionEvent,
  ValidateVerdictN1Event,
  ValidateThematicCompleteEvent,
  ValidateN1CompleteEvent,
  ValidateN2RuleVerdictEvent,
  ValidateCompleteEvent,
  ValidateFailedEvent,
  ValidateGenericErrorEvent,
} from '../client/validate-types';

const RUN_ID = 'a3f1b2c4-...';

describe('renderValidateEvent', () => {
  describe('silent mode', () => {
    test('returns null for every event when silent=true', () => {
      const events: Array<[string, unknown]> = [
        [
          'validate:start',
          {
            run_id: RUN_ID,
            dossier_id: 'd1',
            level: 'both',
            thematics: [],
            document_count: 0,
            started_at: '',
          },
        ],
        [
          'validate:classification',
          { run_id: RUN_ID, file_id: 1, file_name: 'x.pdf', thematic_key: 't', confidence: 0.9 },
        ],
        [
          'validate:complete',
          {
            run_id: RUN_ID,
            status: 'complete',
            verdicts_summary: { thematic_pass: 1, thematic_fail: 0 },
            finished_at: '',
          },
        ],
      ];
      for (const [name, payload] of events) {
        expect(
          renderValidateEvent(
            name as Parameters<typeof renderValidateEvent>[0],
            payload as Parameters<typeof renderValidateEvent>[1],
            { silent: true }
          )
        ).toBeNull();
      }
    });
  });

  describe('validate:start', () => {
    test('shows dossier, level, run_id, and counts', () => {
      const payload: ValidateStartEvent = {
        run_id: RUN_ID,
        dossier_id: 'd-123',
        level: 'both',
        thematics: [
          { key: 't1', label_fr: 'Category A' },
          { key: 't2', label_fr: 'Category B' },
        ],
        document_count: 5,
        started_at: '2026-04-27T10:00:00Z',
      };
      const out = renderValidateEvent('validate:start', payload);
      expect(out).toContain('dossier=d-123');
      expect(out).toContain('level=both');
      expect(out).toContain(`run_id=${RUN_ID}`);
      expect(out).toContain('2 thematics');
      expect(out).toContain('5 documents');
    });

    test('singular thematic + document counts use singular form', () => {
      const payload: ValidateStartEvent = {
        run_id: RUN_ID,
        dossier_id: 'd-1',
        level: 1,
        thematics: [{ key: 't1', label_fr: 'T' }],
        document_count: 1,
        started_at: '',
      };
      const out = renderValidateEvent('validate:start', payload);
      expect(out).toContain('1 thematic,');
      expect(out).toContain('1 document)');
      expect(out).not.toContain('1 thematics');
      expect(out).not.toContain('1 documents');
    });
  });

  describe('validate:classification', () => {
    test('verbose=true renders the line with file, thematic, confidence', () => {
      const payload: ValidateClassificationEvent = {
        run_id: RUN_ID,
        file_id: 42,
        file_name: 'doc-1.pdf',
        thematic_key: 'category_a',
        confidence: 0.92,
      };
      const out = renderValidateEvent('validate:classification', payload, { verbose: true });
      expect(out).toContain('doc-1.pdf');
      expect(out).toContain('category_a');
      expect(out).toContain('0.92');
    });

    test('verbose=false (default) suppresses the event', () => {
      const payload: ValidateClassificationEvent = {
        run_id: RUN_ID,
        file_id: 1,
        file_name: 'x.pdf',
        thematic_key: 't',
        confidence: 0.5,
      };
      expect(renderValidateEvent('validate:classification', payload)).toBeNull();
    });

    test('override=true is marked', () => {
      const payload: ValidateClassificationEvent = {
        run_id: RUN_ID,
        file_id: 1,
        file_name: 'doc.pdf',
        thematic_key: 'category_e',
        confidence: 1,
        override: true,
      };
      const out = renderValidateEvent('validate:classification', payload, { verbose: true });
      expect(out).toContain('[manual]');
    });
  });

  describe('validate:thematic_start', () => {
    test('shows N1/<i>/<total> + label_fr', () => {
      const payload: ValidateThematicStartEvent = {
        run_id: RUN_ID,
        thematic_key: 'category_a',
        label_fr: 'Category A',
        index_in_total: [2, 5],
        document_count: 3,
        iteration_index: 1,
      };
      const out = renderValidateEvent('validate:thematic_start', payload);
      expect(out).toContain('[N1/2/5]');
      expect(out).toContain('Category A');
      expect(out).not.toContain('iter');
    });

    test('iteration_index > 1 marks iteration', () => {
      const payload: ValidateThematicStartEvent = {
        run_id: RUN_ID,
        thematic_key: 't1',
        label_fr: 'T1',
        index_in_total: [1, 1],
        document_count: 1,
        iteration_index: 3,
      };
      const out = renderValidateEvent('validate:thematic_start', payload);
      expect(out).toContain('iter 3');
    });
  });

  describe('validate:extraction', () => {
    test('verbose=true shows method + confidence', () => {
      const payload: ValidateExtractionEvent = {
        run_id: RUN_ID,
        thematic_key: 't1',
        extraction_id: 'ext1',
        document_count: 2,
        confidence: 0.85,
        extraction_method: 'mistral_small_2603',
      };
      const out = renderValidateEvent('validate:extraction', payload, { verbose: true });
      expect(out).toContain('method=mistral_small_2603');
      expect(out).toContain('conf=0.85');
      expect(out).toContain('2 docs');
    });

    test('verbose=false suppresses', () => {
      const payload: ValidateExtractionEvent = {
        run_id: RUN_ID,
        thematic_key: 't',
        extraction_id: 'e',
        document_count: 1,
        extraction_method: 'm',
      };
      expect(renderValidateEvent('validate:extraction', payload)).toBeNull();
    });
  });

  describe('validate:verdict_n1', () => {
    test('verbose=true and passed=true shows ✓', () => {
      const payload: ValidateVerdictN1Event = {
        run_id: RUN_ID,
        thematic_key: 't1',
        requirement_key: 'r1',
        label_fr: 'Required field present',
        passed: true,
      };
      const out = renderValidateEvent('validate:verdict_n1', payload, { verbose: true });
      expect(out).toContain('✓');
      expect(out).toContain('Required field present');
    });

    test('verbose=true and passed=false shows ✗ and reason', () => {
      const payload: ValidateVerdictN1Event = {
        run_id: RUN_ID,
        thematic_key: 't1',
        requirement_key: 'r1',
        label_fr: 'Required field present',
        passed: false,
        reason: 'required field missing',
      };
      const out = renderValidateEvent('validate:verdict_n1', payload, { verbose: true });
      expect(out).toContain('✗');
      expect(out).toContain('required field missing');
    });
  });

  describe('validate:thematic_complete', () => {
    test.each([
      ['pass' as const, '✓'],
      ['fail' as const, '✗'],
      ['partial' as const, '⚠'],
      ['not_applicable' as const, '—'],
    ])('verdict=%s renders %s glyph', (verdict, glyph) => {
      const payload: ValidateThematicCompleteEvent = {
        run_id: RUN_ID,
        thematic_key: 'category_a',
        verdict,
        iteration_index: 1,
        requirements_summary: { pass: 6, fail: 0, partial: 0 },
      };
      const out = renderValidateEvent('validate:thematic_complete', payload);
      expect(out).toContain(glyph);
      expect(out).toContain('category_a');
      expect(out).toContain(verdict);
    });

    test('iteration_index > 1 renders iter mark', () => {
      const payload: ValidateThematicCompleteEvent = {
        run_id: RUN_ID,
        thematic_key: 't',
        verdict: 'pass',
        iteration_index: 2,
        requirements_summary: { pass: 6, fail: 0, partial: 0 },
      };
      const out = renderValidateEvent('validate:thematic_complete', payload);
      expect(out).toContain('iter 2');
    });
  });

  describe('validate:n1_complete', () => {
    test('renders pass/fail/partial counts', () => {
      const payload: ValidateN1CompleteEvent = {
        run_id: RUN_ID,
        thematic_count: { pass: 4, fail: 1, partial: 0 },
        level_2_starting: false,
      };
      const out = renderValidateEvent('validate:n1_complete', payload);
      expect(out).toContain('4 pass');
      expect(out).toContain('1 fail');
      expect(out).toContain('0 partial');
      expect(out).not.toContain('N2 starting');
    });

    test('level_2_starting=true mentions N2', () => {
      const payload: ValidateN1CompleteEvent = {
        run_id: RUN_ID,
        thematic_count: { pass: 5, fail: 0, partial: 0 },
        level_2_starting: true,
      };
      const out = renderValidateEvent('validate:n1_complete', payload);
      expect(out).toContain('N2 starting');
    });
  });

  describe('validate:n2_rule_verdict', () => {
    test('passed=true renders ✓', () => {
      const payload: ValidateN2RuleVerdictEvent = {
        run_id: RUN_ID,
        rule_key: 'rule_a_consistency',
        label_fr: 'Prix cohérent',
        passed: true,
        evidence: { reads_from: ['doc_a.field', 'doc_b.field'], values: {} },
      };
      const out = renderValidateEvent('validate:n2_rule_verdict', payload);
      expect(out).toContain('✓');
      expect(out).toContain('rule_a_consistency');
      expect(out).toContain('pass');
    });

    test('passed=false with reason', () => {
      const payload: ValidateN2RuleVerdictEvent = {
        run_id: RUN_ID,
        rule_key: 'rule_b_identity',
        label_fr: 'Rule B',
        passed: false,
        reason: 'document references diverge',
        evidence: { reads_from: [], values: {} },
      };
      const out = renderValidateEvent('validate:n2_rule_verdict', payload);
      expect(out).toContain('✗');
      expect(out).toContain('document references diverge');
    });
  });

  describe('validate:complete', () => {
    test('PASS when no thematic fails and folder_pass=true', () => {
      const payload: ValidateCompleteEvent = {
        run_id: RUN_ID,
        status: 'complete',
        verdicts_summary: { thematic_pass: 5, thematic_fail: 0, folder_pass: true },
        finished_at: '2026-04-27T11:00:00Z',
      };
      const out = renderValidateEvent('validate:complete', payload);
      expect(out).toContain('PASS');
      expect(out).toContain(`Run ID: ${RUN_ID}`);
      expect(out).toContain('folder=pass');
    });

    test('FAIL when any thematic fails', () => {
      const payload: ValidateCompleteEvent = {
        run_id: RUN_ID,
        status: 'complete',
        verdicts_summary: { thematic_pass: 4, thematic_fail: 1 },
        finished_at: '',
      };
      const out = renderValidateEvent('validate:complete', payload);
      expect(out).toContain('FAIL');
      expect(out).toContain('thematic=4/5');
    });

    test('FAIL when folder_pass=false even with all thematics passing', () => {
      const payload: ValidateCompleteEvent = {
        run_id: RUN_ID,
        status: 'complete',
        verdicts_summary: { thematic_pass: 5, thematic_fail: 0, folder_pass: false },
        finished_at: '',
      };
      const out = renderValidateEvent('validate:complete', payload);
      expect(out).toContain('FAIL');
      expect(out).toContain('folder=fail');
    });
  });

  describe('validate:failed', () => {
    test('resumable=true mentions --run-id resume hint', () => {
      const payload: ValidateFailedEvent = {
        run_id: RUN_ID,
        error: { message: 'extractor timeout', code: 'EXTRACT_TIMEOUT' },
        failed_at: { thematic_key: 'category_a', requirement_key: 'date_signature' },
        resumable: true,
      };
      const out = renderValidateEvent('validate:failed', payload);
      expect(out).toContain('extractor timeout');
      expect(out).toContain('EXTRACT_TIMEOUT');
      expect(out).toContain(`--run-id ${RUN_ID}`);
      expect(out).toContain('thematic=category_a');
      expect(out).toContain('requirement=date_signature');
    });

    test('resumable=false marks as not resumable', () => {
      const payload: ValidateFailedEvent = {
        run_id: RUN_ID,
        error: { message: 'dossier not found' },
        failed_at: {},
        resumable: false,
      };
      const out = renderValidateEvent('validate:failed', payload);
      expect(out).toContain('not resumable');
    });

    test('failed_at with rule_key only renders rule=...', () => {
      const payload: ValidateFailedEvent = {
        run_id: RUN_ID,
        error: { message: 'rule eval crashed' },
        failed_at: { rule_key: 'prix_coherent' },
        resumable: true,
      };
      const out = renderValidateEvent('validate:failed', payload);
      expect(out).toContain('rule=prix_coherent');
      expect(out).not.toContain('thematic=');
      expect(out).not.toContain('requirement=');
    });
  });

  describe('error (generic)', () => {
    test('renders message + optional code', () => {
      const payload: ValidateGenericErrorEvent = {
        error: { message: 'transport hiccup', code: 'TRANSPORT' },
      };
      const out = renderValidateEvent('error', payload);
      expect(out).toContain('transport hiccup');
      expect(out).toContain('TRANSPORT');
    });
  });
});
