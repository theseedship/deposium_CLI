/**
 * Phase II PR-3 — `validate:*` SSE event rendering.
 *
 * Pure functions that map each frozen ADR-010 §4 event payload to a single
 * console-ready string. The `validate` command consumes the SSE stream and
 * pipes every event through `renderValidateEvent`, printing the returned
 * string when non-null. Returning `null` is the signal to suppress (e.g.
 * `--quiet` skips per-requirement detail).
 *
 * No state is held here — the function is callable in any order and produces
 * deterministic output. Phase banners ("[1/5] Classification…") live in the
 * command layer because they require event-sequence context.
 *
 * @module client/validate-events
 */

import chalk from 'chalk';
import type {
  ValidateEvents,
  ValidateEventName,
  ValidateClassificationEvent,
  ValidateThematicStartEvent,
  ValidateThematicCompleteEvent,
  ValidateN2RuleVerdictEvent,
  ValidateThematicVerdict,
} from './validate-types';

/** Render-time toggles. `--silent` suppresses everything (used by `--json`). */
export interface ValidateRenderOptions {
  /** Suppress all output. Used by `--json` mode where SSE feeds the report fetch. */
  silent?: boolean;
  /**
   * Show per-document `validate:classification`, per-requirement
   * `validate:verdict_n1`, and per-extraction events.
   *
   * Off by default — most users only want the thematic-level summary.
   */
  verbose?: boolean;
}

const THEMATIC_VERDICT_GLYPH: Record<ValidateThematicVerdict, string> = {
  pass: chalk.green('✓'),
  fail: chalk.red('✗'),
  partial: chalk.yellow('⚠'),
  not_applicable: chalk.gray('—'),
};

/** Confidence → color: ≥ 0.8 green, ≥ 0.5 yellow, else red. */
function colorByConfidence(confidence: number, label: string): string {
  if (confidence >= 0.8) return chalk.green(label);
  if (confidence >= 0.5) return chalk.yellow(label);
  return chalk.red(label);
}

/**
 * Map a `validate:*` event to its console line.
 *
 * Returns `null` when the event should be suppressed (silent mode, or
 * verbose-only events when verbose is off). The caller `console.log`s the
 * string when non-null.
 */
/**
 * Static dispatch table — one renderer per event name. The renderer either
 * returns a string or null (when the event is verbose-only and verbose=off).
 *
 * Returning null here keeps each renderer single-purpose; the public
 * `renderValidateEvent` then only has to gate on `silent` and look up.
 */
const EVENT_RENDERERS: {
  [E in ValidateEventName]: (
    payload: ValidateEvents[E],
    options: ValidateRenderOptions
  ) => string | null;
} = {
  'validate:start': (p) => renderStart(p),
  'validate:classification': (p, o) => (o.verbose ? renderClassification(p) : null),
  'validate:thematic_start': (p) => renderThematicStart(p),
  'validate:extraction': (p, o) => (o.verbose ? renderExtraction(p) : null),
  'validate:verdict_n1': (p, o) => (o.verbose ? renderVerdictN1(p) : null),
  'validate:thematic_complete': (p) => renderThematicComplete(p),
  'validate:n1_complete': (p) => renderN1Complete(p),
  'validate:n2_rule_verdict': (p) => renderN2RuleVerdict(p),
  'validate:complete': (p) => renderComplete(p),
  'validate:failed': (p) => renderFailed(p),
  error: (p) => renderGenericError(p),
};

export function renderValidateEvent<E extends ValidateEventName>(
  event: E,
  payload: ValidateEvents[E],
  options: ValidateRenderOptions = {}
): string | null {
  if (options.silent) return null;
  const renderer = EVENT_RENDERERS[event];
  // Defensive fallback for unknown event names emitted by a server ahead of
  // the CLI's contract; surface the raw shape rather than crashing.
  if (!renderer) return null;
  // Cast: dispatch-table-typing collapses the per-key payload to a union;
  // the runtime lookup gives us back the right function for `event`.
  return (
    renderer as (payload: ValidateEvents[E], options: ValidateRenderOptions) => string | null
  )(payload, options);
}

function renderStart(p: ValidateEvents['validate:start']): string {
  return chalk.cyan(
    `[validate] dossier=${p.dossier_id} level=${p.level} run_id=${p.run_id} ` +
      `(${p.thematics.length} thematic${p.thematics.length === 1 ? '' : 's'}, ` +
      `${p.document_count} document${p.document_count === 1 ? '' : 's'})`
  );
}

function renderClassification(p: ValidateClassificationEvent): string {
  const conf = colorByConfidence(p.confidence, p.confidence.toFixed(2));
  const overrideMark = p.override === true ? chalk.gray(' [manual]') : '';
  return `  ${chalk.green('✓')} ${p.file_name.padEnd(30)} → ${p.thematic_key} (${conf})${overrideMark}`;
}

function renderThematicStart(p: ValidateThematicStartEvent): string {
  const [i, total] = p.index_in_total;
  const iter = p.iteration_index > 1 ? chalk.gray(` iter ${p.iteration_index}`) : '';
  return chalk.cyan(`[N1/${i}/${total}] ${p.label_fr}${iter}…`);
}

function renderExtraction(p: ValidateEvents['validate:extraction']): string {
  const conf = p.confidence !== undefined ? ` conf=${p.confidence.toFixed(2)}` : '';
  return chalk.gray(
    `    extraction ${p.thematic_key} (${p.document_count} doc${p.document_count === 1 ? '' : 's'}, ` +
      `method=${p.extraction_method}${conf})`
  );
}

function renderVerdictN1(p: ValidateEvents['validate:verdict_n1']): string {
  const glyph = p.passed ? chalk.green('✓') : chalk.red('✗');
  const reason = p.reason ? chalk.gray(` — ${p.reason}`) : '';
  return `    ${glyph} ${p.label_fr}${reason}`;
}

function renderThematicComplete(p: ValidateThematicCompleteEvent): string {
  const glyph = THEMATIC_VERDICT_GLYPH[p.verdict];
  const summary = `${p.requirements_summary.pass}/${p.requirements_summary.pass + p.requirements_summary.fail + p.requirements_summary.partial}`;
  const iterMark = p.iteration_index > 1 ? chalk.gray(` (iter ${p.iteration_index})`) : '';
  return `  ${glyph} ${p.thematic_key.padEnd(28)} → ${p.verdict} (${summary})${iterMark}`;
}

function renderN1Complete(p: ValidateEvents['validate:n1_complete']): string {
  const { pass, fail, partial } = p.thematic_count;
  const banner = chalk.cyan(`[N1 récap] ${pass} pass, ${fail} fail, ${partial} partial`);
  if (p.level_2_starting) {
    return banner + chalk.gray(' — N2 starting…');
  }
  return banner;
}

function renderN2RuleVerdict(p: ValidateN2RuleVerdictEvent): string {
  const glyph = p.passed ? chalk.green('✓') : chalk.red('✗');
  const reason = p.reason ? chalk.gray(` — ${p.reason}`) : '';
  return `  ${glyph} ${p.rule_key.padEnd(36)} → ${p.passed ? 'pass' : 'fail'}${reason}`;
}

function renderComplete(p: ValidateEvents['validate:complete']): string {
  const t = p.verdicts_summary;
  const folder = t.folder_pass !== undefined ? ` | folder=${t.folder_pass ? 'pass' : 'fail'}` : '';
  const verdict = t.thematic_fail === 0 && t.folder_pass !== false ? 'PASS' : 'FAIL';
  const color = verdict === 'PASS' ? chalk.green : chalk.red;
  return color(
    `\n[FINAL] Verdict global : ${verdict}\n` +
      `        thematic=${t.thematic_pass}/${t.thematic_pass + t.thematic_fail}${folder}\n` +
      `        Run ID : ${p.run_id}`
  );
}

function renderFailed(p: ValidateEvents['validate:failed']): string {
  const where = [
    p.failed_at.thematic_key && `thematic=${p.failed_at.thematic_key}`,
    p.failed_at.requirement_key && `requirement=${p.failed_at.requirement_key}`,
    p.failed_at.rule_key && `rule=${p.failed_at.rule_key}`,
  ]
    .filter(Boolean)
    .join(', ');
  const resumable = p.resumable
    ? chalk.yellow(' [resumable — re-run with --run-id ' + p.run_id + ']')
    : chalk.red(' [not resumable]');
  const code = p.error.code ? chalk.gray(` (${p.error.code})`) : '';
  const locus = where ? chalk.gray(`\n        at ${where}`) : '';
  return chalk.red(`\n❌ Validation failed: ${p.error.message}${code}${locus}${resumable}`);
}

function renderGenericError(p: ValidateEvents['error']): string {
  const code = p.error.code ? chalk.gray(` (${p.error.code})`) : '';
  return chalk.red(`⚠ ${p.error.message}${code}`);
}
