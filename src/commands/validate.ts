/**
 * `deposium validate <dossier_id>` — entry point for the dossier
 * validation macro.
 *
 * Streams the configured validation tool over `/mcp` (SSE), renders
 * events inline, pauses on `chat_prompt` to collect HITL form answers,
 * uploads missing pieces to the API, resumes via `tools/call` re-call,
 * and (in `--json` mode) fetches the canonical report from
 * `GET /api/v1/reports/<run_id>?format=json` after `validate:complete`.
 *
 * @module commands/validate
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { MCPClient } from '../client/mcp-client';
import type {
  HitlDecision,
  OnAmbiguousModeValidate,
  ValidateChatPrompt,
  ValidateEventName,
  ValidateEvents,
  ValidateLevel,
  ValidateToolInput,
} from '../client/mcp-client';
import { getConfig, getBaseUrl } from '../utils/config';
import { ensureAuthenticated } from '../utils/auth';
import { withErrorHandling } from '../utils/command-helpers';
import { handleValidateChatPrompt } from '../utils/validate-hitl-form';
import { uploadFileForValidate } from '../utils/validate-file-upload';
import { renderValidateEvent } from '../client/validate-events';

const VALID_LEVELS = ['1', '2', 'both'] as const;
const VALID_ON_AMBIGUOUS = ['prompt', 'fail', 'dump'] as const;

interface ValidateOptions {
  level?: string;
  onAmbiguous?: string;
  language?: string;
  runId?: string;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Translate `--level` flag input to the typed `ValidateLevel`. Throws on
 * invalid values so commander prints a clear error.
 *
 * Exported for unit testing — the command action calls it directly.
 */
export function parseLevel(input: string): ValidateLevel {
  if (input === '1') return 1;
  if (input === '2') return 2;
  if (input === 'both') return 'both';
  throw new Error(`Invalid --level value: '${input}'. Must be one of: ${VALID_LEVELS.join(', ')}`);
}

/**
 * Validate-specific `--on-ambiguous` parser. 3-mode subset of chat (which
 * also accepts `pick-first`). Validate emits only `chat_prompt type='form'`
 * — never `'choice'` — so `pick-first` has no semantic meaning here.
 *
 * Defaults:
 *   - `--json` (regardless of TTY): `fail` — interactive prompts would
 *     write to stdout and corrupt the final JSON report.
 *   - TTY without `--json`: `prompt` (interactive).
 *   - Non-TTY without `--json`: `fail`.
 *
 * Exported for unit testing.
 */
export function parseOnAmbiguous(
  input: string | undefined,
  context: { json?: boolean } = {}
): OnAmbiguousModeValidate {
  if (!input) {
    if (context.json) return 'fail';
    return process.stdin.isTTY ? 'prompt' : 'fail';
  }
  if (!VALID_ON_AMBIGUOUS.includes(input as OnAmbiguousModeValidate)) {
    throw new Error(
      `Invalid --on-ambiguous value: '${input}'. ` +
        `For validate, must be one of: ${VALID_ON_AMBIGUOUS.join(', ')} ` +
        `(pick-first is chat-only — validate emits form prompts, not choice prompts).`
    );
  }
  if (context.json && input === 'prompt') {
    throw new Error(
      `--on-ambiguous=prompt is incompatible with --json: interactive prompts ` +
        `would corrupt the JSON report on stdout. Use --on-ambiguous=fail or =dump.`
    );
  }
  return input as OnAmbiguousModeValidate;
}

export function parseLanguage(input: string | undefined): 'fr' | 'en' | undefined {
  if (!input) return undefined;
  if (input !== 'fr' && input !== 'en') {
    throw new Error(`Invalid --language value: '${input}'. Must be 'fr' or 'en'.`);
  }
  return input;
}

/**
 * Build the `onChatPrompt` callback that the orchestrator invokes on every
 * `chat_prompt` SSE event. Wraps the interactive prompter, performs file
 * uploads (Mode A), and translates the result into a `HitlDecision`.
 *
 * `silent` mirrors the `--json` flag — when true the upload progress lines
 * are suppressed so they don't pollute the JSON report on stdout.
 */
interface ChatPromptHandlerDeps {
  baseUrl: string;
  apiKey: string;
  dossierId: string;
  mode: OnAmbiguousModeValidate;
  silent: boolean;
}

function makeChatPromptHandler(
  deps: ChatPromptHandlerDeps
): (prompt: ValidateChatPrompt) => Promise<HitlDecision> {
  const { baseUrl, apiKey, dossierId, mode, silent } = deps;
  return async (prompt) => {
    const interactive = await handleValidateChatPrompt(prompt, mode);

    if (interactive.kind === 'mode_b') {
      return { mode: 'b', hitlResponse: interactive.hitlResponse };
    }

    // Mode A — upload first, then signal the orchestrator to re-call.
    if (!silent) console.log(chalk.gray(`\n[upload] ${interactive.filePath}…`));
    const { file_id, file_name } = await uploadFileForValidate(
      baseUrl,
      apiKey,
      dossierId,
      interactive.filePath
    );
    if (!silent) console.log(chalk.green(`[upload] ${file_name} → file_id=${file_id} ✓`));
    return { mode: 'a' };
  };
}

/**
 * Build the per-event renderer used by the orchestrator. Returns a closure
 * because the renderer logs straight to stdout (no return value); silent /
 * verbose toggles come from the command flags.
 */
function makeEventHandler(opts: { silent: boolean; verbose: boolean }) {
  return <E extends ValidateEventName>(name: E, payload: ValidateEvents[E]): void => {
    const line = renderValidateEvent(name, payload, {
      silent: opts.silent,
      verbose: opts.verbose,
    });
    if (line !== null) console.log(line);
  };
}

export const validateCommand = new Command('validate')
  .description('Validate a dossier (N1 per-thematic + N2 cross-document)')
  .argument('<dossier_id>', 'UUID of the dossier (space) to validate')
  .option(
    '--level <level>',
    `Validation level — one of: ${VALID_LEVELS.join('|')}. Default: both.`,
    'both'
  )
  .option(
    '--on-ambiguous <mode>',
    `HITL policy when the run pauses — one of: ${VALID_ON_AMBIGUOUS.join('|')}. ` +
      `Defaults to 'prompt' in a TTY, 'fail' otherwise.`
  )
  .option('--language <lang>', `Server response language — fr or en. Default: fr.`)
  .option('--run-id <run_id>', 'Resume an existing paused run instead of starting a new one.')
  .option(
    '--json',
    'After completion, fetch the full report from /api/v1/reports/<run_id>?format=json and pipe to stdout. Suppresses per-event console output.'
  )
  .option(
    '--verbose',
    'Show per-document classification and per-requirement N1 verdicts (otherwise summarised).'
  )
  .action(
    withErrorHandling(async (dossierId: string, options: ValidateOptions) => {
      const level = parseLevel(options.level ?? 'both');
      const json = options.json === true;
      const onAmbiguous = parseOnAmbiguous(options.onAmbiguous, { json });
      const language = parseLanguage(options.language);
      const verbose = options.verbose === true;

      const config = getConfig();
      const baseUrl = getBaseUrl(config);
      const apiKey = await ensureAuthenticated(baseUrl);
      const client = new MCPClient(baseUrl, apiKey);

      if (!json) {
        console.log(
          chalk.gray(
            `[validate] dossier=${dossierId} level=${level} ` +
              `on-ambiguous=${onAmbiguous}${
                options.runId ? ` (resuming run_id=${options.runId})` : ''
              }\n`
          )
        );
      }

      const input: ValidateToolInput = {
        dossier_id: dossierId,
        level,
        on_ambiguity: onAmbiguous,
        ...(language ? { language } : {}),
        ...(options.runId ? { run_id: options.runId } : {}),
      };

      const onEvent = makeEventHandler({ silent: json, verbose });
      const onChatPrompt = makeChatPromptHandler({
        baseUrl,
        apiKey,
        dossierId,
        mode: onAmbiguous,
        silent: json,
      });

      const { run_id, status } = await client.validateDossier(input, {
        onEvent,
        onChatPrompt,
      });

      if (json) {
        // Stream-only mode wouldn't have printed anything — fetch the
        // canonical report and pipe to stdout.
        const report = await client.fetchValidateReport(run_id);
        console.log(JSON.stringify(report, null, 2));
      }

      // Exit code: 0 on complete, 1 on failed. Silent in --json since the
      // report itself carries `status`.
      if (status === 'failed' && !json) {
        process.exit(1);
      }
    })
  );
