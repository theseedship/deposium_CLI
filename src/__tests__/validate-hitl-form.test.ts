/**
 * Tests for src/utils/validate-hitl-form.ts.
 *
 * Covers:
 *   - `--on-ambiguous` mode dispatch (prompt | fail | dump)
 *   - Each `waiting_for` discriminant routing
 *   - `missing_document` Mode A vs 'skip' Mode B branching
 *   - File path validator (existence, type, size)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('chalk', () => ({
  default: {
    cyan: (s: string) => s,
    gray: (s: string) => s,
  },
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

import inquirer from 'inquirer';
import {
  handleValidateChatPrompt,
  __test_validateFilePath,
  type HitlPromptResult,
} from '../utils/validate-hitl-form';
import type { ValidateChatPrompt, ValidateFormFieldFileUpload } from '../client/validate-types';

function makePrompt(overrides: Partial<ValidateChatPrompt> = {}): ValidateChatPrompt {
  return {
    type: 'chat_prompt',
    run_id: 'run-1',
    correlation_id: 'corr-1',
    waiting_for: 'classification_correction',
    prompt_type: 'form',
    title: 'Test',
    description: 'desc',
    fields: [],
    submit_label: 'Submit',
    context: { run_id: 'run-1', iteration_index: 1 },
    ...overrides,
  };
}

describe('handleValidateChatPrompt — mode dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('mode=fail throws with correlation_id and run_id', async () => {
    const prompt = makePrompt({ waiting_for: 'missing_document' });
    await expect(handleValidateChatPrompt(prompt, 'fail')).rejects.toThrow(
      /Validation paused.*waiting_for=missing_document.*Correlation ID: corr-1.*Run ID:\s+run-1/s
    );
  });

  test('mode=dump prints prompt JSON and exits 0', async () => {
    const prompt = makePrompt();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitError = new Error('__TEST_EXIT__');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });

    await expect(handleValidateChatPrompt(prompt, 'dump')).rejects.toBe(exitError);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const printed = logSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(printed).chat_prompt.correlation_id).toBe('corr-1');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test('mode=prompt delegates to the injected prompter', async () => {
    const prompt = makePrompt();
    const customResult: HitlPromptResult = {
      kind: 'mode_b',
      hitlResponse: { correlation_id: 'corr-1', fields: { x: 1 } },
    };
    const prompter = vi.fn().mockResolvedValue(customResult);

    const result = await handleValidateChatPrompt(prompt, 'prompt', prompter);
    expect(prompter).toHaveBeenCalledWith(prompt);
    expect(result).toEqual(customResult);
  });
});

describe('handleValidateChatPrompt — waiting_for routing (interactive)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('classification_correction → Mode B with selected value', async () => {
    const prompt = makePrompt({
      waiting_for: 'classification_correction',
      title: 'Quel type de pièce ?',
      fields: [
        {
          type: 'select',
          name: 'thematic_key',
          label: 'Choose:',
          options: [
            { value: 'titre_propriete', label: 'Titre' },
            { value: 'skip', label: 'Skip' },
          ],
          required: true,
        },
      ],
    });
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ value: 'titre_propriete' });

    const result = await handleValidateChatPrompt(prompt, 'prompt');

    expect(result).toEqual({
      kind: 'mode_b',
      hitlResponse: {
        correlation_id: 'corr-1',
        fields: { thematic_key: 'titre_propriete' },
      },
    });
  });

  test('classification_correction throws when no select field present', async () => {
    const prompt = makePrompt({
      waiting_for: 'classification_correction',
      fields: [],
    });
    await expect(handleValidateChatPrompt(prompt, 'prompt')).rejects.toThrow(
      /no select field.*corr-1/s
    );
  });

  test('rule_clarification with one text field → Mode B', async () => {
    const prompt = makePrompt({
      waiting_for: 'rule_clarification',
      fields: [
        {
          type: 'text',
          name: 'reason',
          label: 'Explain divergence:',
          required: true,
        },
      ],
    });
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ value: 'unrelated parties' });

    const result = await handleValidateChatPrompt(prompt, 'prompt');

    expect(result).toEqual({
      kind: 'mode_b',
      hitlResponse: {
        correlation_id: 'corr-1',
        fields: { reason: 'unrelated parties' },
      },
    });
  });

  test('rule_clarification with multi-field aggregates into a single response', async () => {
    const prompt = makePrompt({
      waiting_for: 'rule_clarification',
      fields: [
        { type: 'text', name: 'reason', label: 'Reason:', required: true },
        {
          type: 'select',
          name: 'severity',
          label: 'Severity:',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' },
          ],
          required: true,
        },
      ],
    });
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ value: 'numbers diverge' })
      .mockResolvedValueOnce({ value: 'high' });

    const result = await handleValidateChatPrompt(prompt, 'prompt');

    expect(result).toEqual({
      kind: 'mode_b',
      hitlResponse: {
        correlation_id: 'corr-1',
        fields: { reason: 'numbers diverge', severity: 'high' },
      },
    });
  });

  test('rule_clarification rejects unsupported field types (e.g. file_upload)', async () => {
    const prompt = makePrompt({
      waiting_for: 'rule_clarification',
      fields: [
        {
          type: 'file_upload',
          name: 'attachment',
          label: 'Attach proof',
          accept: 'application/pdf',
          max_size_mb: 10,
          multiple: false,
          required: true,
        },
      ],
    });
    await expect(handleValidateChatPrompt(prompt, 'prompt')).rejects.toThrow(
      /Unsupported field type 'file_upload'.*rule_clarification/s
    );
  });
});

describe('handleValidateChatPrompt — missing_document', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-validate-test-'));
    tmpFile = path.join(tmpDir, 'doc.pdf');
    fs.writeFileSync(tmpFile, 'fake pdf content');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns Mode A file path when user types a real file path', async () => {
    const prompt = makePrompt({
      waiting_for: 'missing_document',
      fields: [
        {
          type: 'file_upload',
          name: 'dpe_file',
          label: 'Upload DPE:',
          accept: 'application/pdf',
          max_size_mb: 50,
          multiple: false,
          required: true,
        },
      ],
    });
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ filePath: tmpFile });

    const result = await handleValidateChatPrompt(prompt, 'prompt');

    expect(result).toEqual({
      kind: 'mode_a_file',
      filePath: tmpFile,
      fieldName: 'dpe_file',
      correlationId: 'corr-1',
    });
  });

  test("'skip' keyword returns Mode B with skip marker (so server records the opt-out)", async () => {
    const prompt = makePrompt({
      waiting_for: 'missing_document',
      fields: [
        {
          type: 'file_upload',
          name: 'fiche_hyp',
          label: 'Upload fiche hypothécaire:',
          accept: 'application/pdf',
          max_size_mb: 10,
          multiple: false,
          required: true,
        },
      ],
    });
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ filePath: 'skip' });

    const result = await handleValidateChatPrompt(prompt, 'prompt');

    expect(result).toEqual({
      kind: 'mode_b',
      hitlResponse: {
        correlation_id: 'corr-1',
        fields: { fiche_hyp: 'skip' },
      },
    });
  });

  test('throws when no file_upload field present', async () => {
    const prompt = makePrompt({
      waiting_for: 'missing_document',
      fields: [],
    });
    await expect(handleValidateChatPrompt(prompt, 'prompt')).rejects.toThrow(
      /no file_upload field.*corr-1/s
    );
  });
});

describe('validateFilePath', () => {
  let tmpDir: string;
  let tmpFile: string;
  let bigFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-validate-test-'));
    tmpFile = path.join(tmpDir, 'small.pdf');
    fs.writeFileSync(tmpFile, 'small');
    bigFile = path.join(tmpDir, 'big.pdf');
    fs.writeFileSync(bigFile, Buffer.alloc(2 * 1024 * 1024)); // 2 MB
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const field: ValidateFormFieldFileUpload = {
    type: 'file_upload',
    name: 'doc',
    label: 'doc',
    accept: 'application/pdf',
    max_size_mb: 1,
    multiple: false,
    required: true,
  };

  test('empty input rejected', () => {
    expect(__test_validateFilePath('', field)).toMatch(/file path or 'skip'/);
    expect(__test_validateFilePath('   ', field)).toMatch(/file path or 'skip'/);
  });

  test("'skip' accepted regardless of size", () => {
    expect(__test_validateFilePath('skip', field)).toBe(true);
    expect(__test_validateFilePath('SKIP', field)).toBe(true);
  });

  test('non-existent path rejected', () => {
    expect(__test_validateFilePath('/nope/does-not-exist.pdf', field)).toMatch(/File not found/);
  });

  test('directory rejected', () => {
    expect(__test_validateFilePath(tmpDir, field)).toMatch(/Not a regular file/);
  });

  test('file under max_size_mb accepted', () => {
    expect(__test_validateFilePath(tmpFile, field)).toBe(true);
  });

  test('file over max_size_mb rejected', () => {
    const result = __test_validateFilePath(bigFile, field);
    expect(result).toMatch(/too large.*max 1 MB/);
  });
});
