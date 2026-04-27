/**
 * `deposium validate <dossier_id>` — Phase II PR-3 entry point.
 *
 * Streams `deposium_validate_foncier` over `/mcp` (SSE), renders events
 * inline, pauses on `chat_prompt` to collect HITL form answers, uploads
 * missing pieces to Solid, resumes via `tools/call` re-call, and (in
 * `--json` mode) fetches the canonical report from
 * `GET /api/v1/reports/<run_id>?format=json` after `validate:complete`.
 *
 * See briefs:
 *   - deposium_MCPs/docs/2026/briefs/BRIEF-CLI-PHASE-II-PR-3-VALIDATE.md
 *   - deposium_MCPs/docs/2026/briefs/BRIEF-CLI-PHASE-II-PR-3-GREENLIGHT-2026-04-27.md
 *   - deposium_MCPs/docs/architecture/ADR-010-PHASE-II-CONTRACTS.md (§1, §4)
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
 * Validate-specific `--on-ambiguous` parser. Subset of chat (3 modes — see
 * GREENLIGHT §8.2). Defaults to `prompt` in a TTY, `fail` otherwise.
 */
export function parseOnAmbiguous(input: string | undefined): OnAmbiguousModeValidate {
  if (!input) return process.stdin.isTTY ? 'prompt' : 'fail';
  if (!VALID_ON_AMBIGUOUS.includes(input as OnAmbiguousModeValidate)) {
    throw new Error(
      `Invalid --on-ambiguous value: '${input}'. ` +
        `For validate, must be one of: ${VALID_ON_AMBIGUOUS.join(', ')} ` +
        `(pick-first is chat-only — see GREENLIGHT §8.2).`
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
 */
function makeChatPromptHandler(
  client: MCPClient,
  baseUrl: string,
  apiKey: string,
  dossierId: string,
  mode: OnAmbiguousModeValidate
): (prompt: ValidateChatPrompt) => Promise<HitlDecision> {
  return async (prompt) => {
    const interactive = await handleValidateChatPrompt(prompt, mode);

    if (interactive.kind === 'mode_b') {
      return { mode: 'b', hitlResponse: interactive.hitlResponse };
    }

    // Mode A — upload first, then signal the orchestrator to re-call.
    console.log(chalk.gray(`\n[upload] ${interactive.filePath}…`));
    void client; // upload uses raw fetch + Solid endpoint; client unused for upload.
    const { file_id, file_name } = await uploadFileForValidate(
      baseUrl,
      apiKey,
      dossierId,
      interactive.filePath
    );
    console.log(chalk.green(`[upload] ${file_name} → file_id=${file_id} ✓`));
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
  .description('Validate a foncier dossier (N1 per-thematic + N2 cross-document)')
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
      const onAmbiguous = parseOnAmbiguous(options.onAmbiguous);
      const language = parseLanguage(options.language);
      const json = options.json === true;
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
      const onChatPrompt = makeChatPromptHandler(client, baseUrl, apiKey, dossierId, onAmbiguous);

      const { run_id, status } = await client.validateFoncier(input, {
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
