/**
 * Phase II PR-3 — HITL form rendering for `chat_prompt` events emitted
 * during a `deposium validate` run.
 *
 * Routes by `waiting_for` discriminant (ADR-010 §4.1):
 *   - `missing_document`  → file-path prompt → Mode A resume (caller uploads)
 *   - `classification_correction` → select prompt → Mode B resume
 *   - `rule_clarification` → sequenced text/select prompts → Mode B resume
 *
 * `--on-ambiguous` policy gates interactivity. `prompt` (default) runs the
 * interactive flow; `fail` throws with the correlation_id so callers can
 * file an issue; `dump` prints the raw prompt JSON and exits 0 (for
 * scripts/CI that want to inspect the pause shape).
 *
 * @module utils/validate-hitl-form
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'node:fs';
import type {
  ValidateChatPrompt,
  ValidateFormField,
  ValidateFormFieldFileUpload,
  ValidateFormFieldSelect,
  HitlResponse,
  OnAmbiguousModeValidate,
} from '../client/validate-types';

/**
 * What the prompter returns to the caller. Mode A (file upload) requires the
 * caller to upload + re-call `tools/call` without `hitl_response`. Mode B
 * carries the structured response that goes into the next tool input.
 */
export type HitlPromptResult =
  | { kind: 'mode_b'; hitlResponse: HitlResponse }
  | { kind: 'mode_a_file'; filePath: string; fieldName: string; correlationId: string };

/**
 * Dispatch a `chat_prompt` according to the `--on-ambiguous` policy.
 * `prompter` is injectable for tests.
 */
export async function handleValidateChatPrompt(
  prompt: ValidateChatPrompt,
  mode: OnAmbiguousModeValidate,
  prompter: (p: ValidateChatPrompt) => Promise<HitlPromptResult> = interactivePrompt
): Promise<HitlPromptResult> {
  if (mode === 'fail') {
    throw new Error(
      `Validation paused: waiting_for=${prompt.waiting_for}\n` +
        `  title: ${prompt.title}\n` +
        `  description: ${prompt.description}\n` +
        `--on-ambiguous=fail — exiting without a decision.\n` +
        `Correlation ID: ${prompt.correlation_id}\n` +
        `Run ID:         ${prompt.run_id}`
    );
  }

  if (mode === 'dump') {
    console.log(JSON.stringify({ chat_prompt: prompt }, null, 2));
    process.exit(0);
  }

  // mode === 'prompt' — interactive
  return prompter(prompt);
}

/**
 * Interactive prompter — uses `inquirer` to collect input from the user.
 * Routes by `waiting_for` to render the right UX.
 */
async function interactivePrompt(prompt: ValidateChatPrompt): Promise<HitlPromptResult> {
  console.log('');
  console.log(chalk.cyan(`▸ ${prompt.title}`));
  if (prompt.description && prompt.description !== prompt.title) {
    console.log(chalk.gray(`  ${prompt.description}`));
  }

  switch (prompt.waiting_for) {
    case 'missing_document':
      return promptMissingDocument(prompt);
    case 'classification_correction':
      return promptClassificationCorrection(prompt);
    case 'rule_clarification':
      return promptRuleClarification(prompt);
  }
}

/**
 * `missing_document` flow — single `file_upload` field. Returns the local
 * path; the CLI command uploads it then re-calls `tools/call` (Mode A).
 */
async function promptMissingDocument(prompt: ValidateChatPrompt): Promise<HitlPromptResult> {
  const fileField = prompt.fields.find(
    (f): f is ValidateFormFieldFileUpload => f.type === 'file_upload'
  );
  if (!fileField) {
    throw new Error(
      `chat_prompt waiting_for=missing_document has no file_upload field. ` +
        `Correlation ID: ${prompt.correlation_id}`
    );
  }

  const { filePath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'filePath',
      message: `${fileField.label} (or 'skip' to abandon this thematic):`,
      validate: (input: string) => validateFilePath(input, fileField),
    },
  ]);

  const trimmed = (filePath as string).trim();
  if (trimmed.toLowerCase() === 'skip') {
    // 'skip' on a missing_document = Mode B with an empty/skip marker so
    // MCPs can record the user opted out.
    return {
      kind: 'mode_b',
      hitlResponse: {
        correlation_id: prompt.correlation_id,
        fields: { [fileField.name]: 'skip' },
      },
    };
  }

  return {
    kind: 'mode_a_file',
    filePath: trimmed,
    fieldName: fileField.name,
    correlationId: prompt.correlation_id,
  };
}

/**
 * `classification_correction` flow — single `select` field with thematic
 * options. Returns Mode B `hitl_response`.
 */
async function promptClassificationCorrection(
  prompt: ValidateChatPrompt
): Promise<HitlPromptResult> {
  const selectField = prompt.fields.find((f): f is ValidateFormFieldSelect => f.type === 'select');
  if (!selectField) {
    throw new Error(
      `chat_prompt waiting_for=classification_correction has no select field. ` +
        `Correlation ID: ${prompt.correlation_id}`
    );
  }

  const { value } = await inquirer.prompt([
    {
      type: 'list',
      name: 'value',
      message: selectField.label,
      choices: selectField.options.map((o) => ({ name: o.label, value: o.value })),
      default: selectField.default,
    },
  ]);

  return {
    kind: 'mode_b',
    hitlResponse: {
      correlation_id: prompt.correlation_id,
      fields: { [selectField.name]: value },
    },
  };
}

/**
 * `rule_clarification` flow — one or more `text` / `select` fields,
 * prompted sequentially. Aggregates into a single Mode B `hitl_response`.
 */
async function promptRuleClarification(prompt: ValidateChatPrompt): Promise<HitlPromptResult> {
  const collected: Record<string, unknown> = {};

  for (const field of prompt.fields) {
    if (field.type === 'text') {
      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: field.label,
          // Show placeholder as the default so the user can hit Enter to use it
          // when it represents a sensible default suggestion from the server.
          ...(field.placeholder !== undefined ? { default: field.placeholder } : {}),
          validate: (input: string) => {
            if (field.required && input.trim().length === 0) {
              return `${field.label} is required.`;
            }
            return true;
          },
        },
      ]);
      collected[field.name] = value;
    } else if (field.type === 'select') {
      const { value } = await inquirer.prompt([
        {
          type: 'list',
          name: 'value',
          message: field.label,
          choices: field.options.map((o) => ({ name: o.label, value: o.value })),
          default: field.default,
        },
      ]);
      collected[field.name] = value;
    } else {
      throw new Error(
        `Unsupported field type '${(field as ValidateFormField).type}' under ` +
          `waiting_for=rule_clarification. Correlation ID: ${prompt.correlation_id}`
      );
    }
  }

  return {
    kind: 'mode_b',
    hitlResponse: {
      correlation_id: prompt.correlation_id,
      fields: collected,
    },
  };
}

/**
 * Validator for the file_upload prompt: file must exist, be a regular
 * file, and be under the server's `max_size_mb`. `skip` keyword is allowed.
 */
function validateFilePath(input: string, field: ValidateFormFieldFileUpload): string | true {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return `Please enter a file path or 'skip'.`;
  }
  if (trimmed.toLowerCase() === 'skip') {
    return true;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(trimmed);
  } catch {
    return `File not found: ${trimmed}`;
  }
  if (!stat.isFile()) {
    return `Not a regular file: ${trimmed}`;
  }
  const sizeMb = stat.size / (1024 * 1024);
  if (sizeMb > field.max_size_mb) {
    return `File too large (${sizeMb.toFixed(1)} MB > max ${field.max_size_mb} MB): ${trimmed}`;
  }
  return true;
}

/** Exposed for tests — direct check of the file validator. */
export const __test_validateFilePath = validateFilePath;
