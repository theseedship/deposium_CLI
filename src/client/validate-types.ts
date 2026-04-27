/**
 * Phase II PR-3 — `deposium validate` types.
 *
 * Mirrors the contract frozen in deposium_MCPs ADR-010 §1 (tool signature)
 * and §4 (SSE event vocabulary, `validate:*` namespace, 11 events) on
 * commit `74efdb92` (2026-04-27).
 *
 * Re-exported from `mcp-client.ts` so consumers can import as
 * `import { ValidateLevel } from '@deposium/cli'`.
 *
 * @module client/validate-types
 */

// ============================================================================
// Tool input / output (ADR-010 §1)
// ============================================================================

/** N1 (per-thematic) | N2 (cross-document) | both runs the full pipeline. */
export type ValidateLevel = 1 | 2 | 'both';

/**
 * `--on-ambiguous` policy for the `validate` command.
 *
 * Distinct from the chat-stream `OnAmbiguousMode` which adds a `pick-first`
 * mode. Validate emits only `chat_prompt type='form'` (never `'choice'`),
 * so `pick-first` has no semantic meaning here — see ADR-010 §4 GREENLIGHT
 * §8.2 (2026-04-27).
 */
export type OnAmbiguousModeValidate = 'prompt' | 'fail' | 'dump';

/** Run lifecycle — see ADR-010 §1 output `status` field. */
export type ValidateRunStatus = 'complete' | 'paused' | 'failed';

/** Per-thematic verdict — see ADR-010 §1 output `verdicts.thematic.*.verdict`. */
export type ValidateThematicVerdict = 'pass' | 'fail' | 'partial' | 'not_applicable';

/** Top-level cross-document verdict (folder/N2). */
export type ValidateFolderVerdict = 'pass' | 'fail';

/**
 * `chat_prompt.waiting_for` discriminant for Phase II PR-3 (ADR-010 §4.1).
 *
 * Routes the CLI's HITL form rendering branch:
 *   - `missing_document` → `inquirer` file path prompt + multipart upload
 *   - `classification_correction` → `inquirer.list` (thematics + 'skip')
 *   - `rule_clarification` → sequenced text/select prompts
 */
export type ValidateWaitingFor =
  | 'missing_document'
  | 'classification_correction'
  | 'rule_clarification';

/**
 * Resume Mode B — structured response sent back via tool input.
 *
 * Emitted in response to `chat_prompt` events with `waiting_for` of
 * `classification_correction` or `rule_clarification`. Mode A (file upload
 * for `missing_document`) does NOT use this field — see ADR-010 §4.2.
 */
export interface HitlResponse {
  correlation_id: string;
  /** Keys mirror `chat_prompt.fields[].name`; values are user inputs. */
  fields: Record<string, unknown>;
}

/**
 * Input shape for `tools/call deposium_validate_foncier` — ADR-010 §1.
 *
 * `tenant_id` is auto-filled by the server from the API key, so the CLI
 * never sets it explicitly.
 */
export interface ValidateToolInput {
  dossier_id: string;
  level: ValidateLevel;
  on_ambiguity: OnAmbiguousModeValidate;
  /** `'stepwise'` always for the CLI — `'full_auto'` is for batch consumers. */
  mode?: 'stepwise' | 'full_auto';
  /** Reserved v1 (no escalation logic yet); pass to lock in contract slot. */
  verification_mode?: 'standard' | 'strict';
  language?: 'fr' | 'en';
  /** Idempotency key — reuse to resume/amend an existing paused run. */
  run_id?: string;
  /** Resume Mode B payload (ADR-010 §4.2). Omit for Mode A (re-classify). */
  hitl_response?: HitlResponse;
}

// ============================================================================
// SSE event payloads (ADR-010 §4)
// ============================================================================

export interface ValidateStartEvent {
  run_id: string;
  dossier_id: string;
  level: ValidateLevel;
  thematics: Array<{ key: string; label_fr: string }>;
  document_count: number;
  started_at: string;
}

export interface ValidateClassificationEvent {
  run_id: string;
  file_id: number;
  file_name: string;
  thematic_key: string;
  confidence: number;
  /** True ⇔ this is a manual reclassification from a `classification_correction` response. */
  override?: boolean;
}

export interface ValidateThematicStartEvent {
  run_id: string;
  thematic_key: string;
  label_fr: string;
  index_in_total: [number, number];
  document_count: number;
  iteration_index: number;
}

export interface ValidateExtractionEvent {
  run_id: string;
  thematic_key: string;
  extraction_id: string;
  document_count: number;
  confidence?: number;
  extraction_method: string;
}

export interface ValidateVerdictN1Event {
  run_id: string;
  thematic_key: string;
  requirement_key: string;
  label_fr: string;
  passed: boolean;
  reason?: string;
  evidence?: unknown;
}

export interface ValidateThematicCompleteEvent {
  run_id: string;
  thematic_key: string;
  verdict: ValidateThematicVerdict;
  iteration_index: number;
  requirements_summary: { pass: number; fail: number; partial: number };
}

export interface ValidateN1CompleteEvent {
  run_id: string;
  thematic_count: { pass: number; fail: number; partial: number };
  level_2_starting: boolean;
}

export interface ValidateN2RuleVerdictEvent {
  run_id: string;
  rule_key: string;
  label_fr: string;
  passed: boolean;
  reason?: string;
  evidence: { reads_from: string[]; values: Record<string, unknown> };
}

export interface ValidateCompleteEvent {
  run_id: string;
  status: 'complete';
  verdicts_summary: {
    thematic_pass: number;
    thematic_fail: number;
    folder_pass?: boolean;
  };
  finished_at: string;
}

export interface ValidateFailedEvent {
  run_id: string;
  error: { message: string; code?: string };
  failed_at: { thematic_key?: string; requirement_key?: string; rule_key?: string };
  /** True ⇔ caller can re-issue tools/call with the same run_id (e.g. infra timeout). */
  resumable: boolean;
}

/** Generic non-terminal error envelope. Mostly subsumed by `validate:failed`. */
export interface ValidateGenericErrorEvent {
  run_id?: string;
  error: { message: string; code?: string };
}

// ============================================================================
// Typed `chat_prompt` form fields (ADR-010 §4.1)
// ============================================================================

export interface ValidateFormFieldSelect {
  type: 'select';
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  default?: string;
  required: boolean;
}

export interface ValidateFormFieldFileUpload {
  type: 'file_upload';
  name: string;
  label: string;
  /** MIME types CSV — e.g. `'application/pdf,image/*'`. */
  accept: string;
  max_size_mb: number;
  /** `false` in v1 — one missing piece per `chat_prompt`. */
  multiple: boolean;
  required: boolean;
}

export interface ValidateFormFieldText {
  type: 'text';
  name: string;
  label: string;
  placeholder?: string;
  required: boolean;
}

export type ValidateFormField =
  | ValidateFormFieldSelect
  | ValidateFormFieldFileUpload
  | ValidateFormFieldText;

/**
 * Phase II PR-3 form-shape `chat_prompt` (ADR-010 §4.1).
 *
 * Specializes the generic `SSEChatPrompt` with typed fields and a strict
 * `waiting_for` discriminant. The transport layer still receives a generic
 * `chat_prompt` event; consumers cast into this shape after asserting
 * `prompt_type === 'form'`.
 */
export interface ValidateChatPrompt {
  type: 'chat_prompt';
  run_id: string;
  correlation_id: string;
  waiting_for: ValidateWaitingFor;
  prompt_type: 'form';
  title: string;
  description: string;
  fields: ValidateFormField[];
  submit_label: string;
  /** OPAQUE TO CONSUMER — passed back unchanged on resume. */
  context: {
    run_id: string;
    thematic_key?: string;
    rule_key?: string;
    iteration_index: number;
  };
}

// ============================================================================
// Report JSON (ADR-010 §1 output, fetched via GET /api/v1/reports/<run_id>)
// ============================================================================

/**
 * Full report JSON returned by `GET /api/v1/reports/<run_id>?format=json`.
 *
 * Per ADR-010 §4.4 + GREENLIGHT §8.5 — the report is fetched separately
 * after `validate:complete`, NOT embedded in the SSE stream.
 */
export interface ValidateReportJson {
  run_id: string;
  dossier_id: string;
  level_requested: ValidateLevel;
  status: ValidateRunStatus;
  verdicts: {
    thematic: Record<
      string,
      {
        verdict: ValidateThematicVerdict;
        requirements: Array<{
          key: string;
          label_fr: string;
          passed: boolean;
          reason: string | null;
          evidence: unknown;
        }>;
        extraction: {
          extraction_id: string;
          extracted_data: unknown;
          documents: Array<{ file_id: number; file_name: string }>;
        };
        iterations: Array<{
          attempted_at: string;
          verdict: 'pass' | 'fail' | 'partial';
          reason: string | null;
          hitl_prompts?: Array<{ prompt: unknown; user_response: unknown }>;
        }>;
      }
    >;
    folder?: {
      verdict: ValidateFolderVerdict;
      rules: Array<{
        key: string;
        label_fr: string;
        passed: boolean;
        reason: string | null;
        evidence: { reads_from: string[]; values: Record<string, unknown> };
      }>;
    };
  };
  chat_history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    step_id?: string;
  }>;
  metadata: {
    started_at: string;
    finished_at: string | null;
    total_duration_ms: number;
    models_used: string[];
    total_tokens: { prompt: number; completion: number };
    documents_processed: number;
    hitl_pauses: number;
  };
}

// ============================================================================
// SSE event union — discriminated by event name (set by transport layer)
// ============================================================================

/**
 * Tagged union of every `validate:*` event. The transport layer reads the
 * SSE `event:` line, looks up the payload type via this map, and dispatches.
 *
 * Use as: `type Foo = ValidateEvents['validate:start']` to pull a single
 * payload type, or as a discriminated union when iterating.
 */
export interface ValidateEvents {
  'validate:start': ValidateStartEvent;
  'validate:classification': ValidateClassificationEvent;
  'validate:thematic_start': ValidateThematicStartEvent;
  'validate:extraction': ValidateExtractionEvent;
  'validate:verdict_n1': ValidateVerdictN1Event;
  'validate:thematic_complete': ValidateThematicCompleteEvent;
  'validate:n1_complete': ValidateN1CompleteEvent;
  'validate:n2_rule_verdict': ValidateN2RuleVerdictEvent;
  'validate:complete': ValidateCompleteEvent;
  'validate:failed': ValidateFailedEvent;
  error: ValidateGenericErrorEvent;
}

/** Every `validate:*` event name — useful for exhaustiveness checks. */
export type ValidateEventName = keyof ValidateEvents;

/**
 * Decision returned by `onChatPrompt` to the validate orchestrator.
 *
 * Mode A (the orchestrator re-calls without `hitl_response`) signals that
 * the caller has performed the file upload externally — typically via
 * `uploadFileForValidate()` — and the macro should re-classify the dossier.
 *
 * Mode B (with `hitlResponse`) carries the structured form payload that
 * MCPs maps onto the paused step.
 */
export type HitlDecision = { mode: 'a' } | { mode: 'b'; hitlResponse: HitlResponse };

/**
 * Callbacks supplied to `MCPClient.validateFoncier`. The orchestrator drives
 * the `tools/call` re-call loop; the caller supplies event rendering and
 * the chat_prompt handler (which may itself prompt the user, upload files,
 * etc.).
 */
export interface ValidateStreamHandlers {
  /** Called for every `validate:*` (and generic `error`) SSE event in stream order. */
  onEvent: <E extends ValidateEventName>(
    name: E,
    payload: ValidateEvents[E]
  ) => void | Promise<void>;
  /** Called when a `chat_prompt` arrives. Decide Mode A or Mode B. */
  onChatPrompt: (prompt: ValidateChatPrompt) => Promise<HitlDecision>;
}
