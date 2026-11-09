import { readChatMessage } from './utils/chat-input';
import { tr } from './utils/i18n';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import type {
  AgentResumePayload,
  ChatPromptContext,
  ChatStreamOptions,
  SSECitation,
  SSEChatPrompt,
  SSEVerification,
} from './client/mcp-client';
import { getConfig, getEdgeUrl, getMcpDirectUrl } from './utils/config';
import { createTitleBox } from './utils/formatter';
import { ChatHistory } from './utils/chat-history';
import { getErrorMessage, initializeCommand } from './utils/command-helpers';
import { printChatSources, printChatVerification } from './utils/chat-output';
import { parseChatCommand, selectChatScope } from './utils/chat-scope';
import { executeChatCommand } from './utils/chat-commands';
import { createChatActivity, type ChatActivity } from './utils/chat-activity';
import { createChatRenderer } from './utils/chat-renderer';
import type { ChatTurnDetails } from './utils/chat-output';
import { getLanguage } from './utils/i18n';

/**
 * `--on-ambiguous` policy — what the CLI does when the server emits a
 * `chat_prompt` HITL pause.
 *
 * Stateful modes (`resume-file`, `fail-with-token`) that need
 * persistence across process restarts are not yet implemented.
 */
export type OnAmbiguousMode = 'prompt' | 'fail' | 'dump' | 'pick-first';

export interface ChatOptions {
  space?: string;
  /** Show every verification diagnostic rather than a compact summary. */
  verbose?: boolean;
  /** Bypass Edge Runtime and connect directly to MCP server (dev only) */
  direct?: boolean;
  /**
   * HITL policy. Defaults to `prompt` when stdin is a TTY, `fail` otherwise
   * (so scripts and pipes don't silently hang).
   */
  onAmbiguous?: OnAmbiguousMode;
}

/**
 * Resolve the effective --on-ambiguous mode. Explicit flag wins; otherwise
 * default is TTY-aware (prompt interactive, fail non-interactive).
 */
export function resolveOnAmbiguousMode(explicit?: OnAmbiguousMode): OnAmbiguousMode {
  if (explicit) return explicit;
  return process.stdin.isTTY ? 'prompt' : 'fail';
}

export async function startChat(options: ChatOptions = {}): Promise<void> {
  console.log(createTitleBox(tr('AI CHAT'), tr('Streaming conversation with Deposium AI')));
  console.log(chalk.gray(tr('Commands: /help | /space | /clear | /history | /exit\n')));

  // Resolve URLs + print mode banner FIRST, BEFORE any prompt that
  // could come out of initializeCommand → ensureAuthenticated. If the
  // user has no stored API key, they get prompted; we want them to
  // see which mode (Edge / Direct) they're authenticating against
  // before typing their secret.
  const config = getConfig();
  const onAmbiguous = resolveOnAmbiguousMode(options.onAmbiguous);

  let streamUrl: string;
  let directMcp = false;

  if (options.direct) {
    streamUrl = getMcpDirectUrl(config);
    directMcp = true;
    console.warn(
      chalk.yellow(
        tr('⚠️  --direct mode: bypassing Edge Runtime (no rate-limiting, no auth gateway)\n')
      )
    );
    console.log(chalk.gray(tr('MCP direct: {0}\n', streamUrl)));
  } else {
    streamUrl = getEdgeUrl(config);
    console.log(chalk.gray(tr('Edge Runtime: {0}\n', streamUrl)));
  }

  console.log(chalk.gray(tr('HITL policy: --on-ambiguous={0}\n', onAmbiguous)));

  // NOW bootstrap (auth + MCPClient). May prompt if the API key is
  // missing — the user already saw the mode banner above so they
  // know what they're authenticating against.
  const { client } = await initializeCommand();

  let scope = await selectChatScope(client, {
    space: options.space,
    initialSpace: config.defaultSpace,
  });
  console.log(chalk.cyan(tr('Space: {0}\n', scope.label)));

  const chatHistory = new ChatHistory(10);
  const details: ChatTurnDetails = { citations: [], verifications: [] };

  while (true) {
    const message = await readChatMessage();

    const trimmedMessage = message.trim();

    const local = parseChatCommand(trimmedMessage);
    if (local) {
      try {
        const result = await executeChatCommand(local, {
          client,
          history: chatHistory,
          scope,
          details,
        });
        scope = result.scope;
        if (result.exit) break;
      } catch (error: unknown) {
        console.error(chalk.red(tr('\n❌ Error:')), getErrorMessage(error));
      }
      continue;
    }

    if (!trimmedMessage) {
      continue;
    }

    details.citations = [];
    details.verifications = [];
    const conversationHistory = chatHistory.toConversationHistory(6);
    chatHistory.addUserMessage(trimmedMessage);

    try {
      const fullResponse = await runChatTurn({
        client,
        streamUrl,
        directMcp,
        message: trimmedMessage,
        conversationHistory,
        spaceIds: scope.spaceIds,
        onAmbiguous,
        verbose: options.verbose,
        onDetails: (result) => Object.assign(details, result),
      });

      if (!fullResponse) {
        chatHistory.removeLastMessage();
        continue;
      }
      chatHistory.addAssistantMessage(fullResponse);

      const exchanges = Math.floor(chatHistory.getMessages().length / 2);
      console.log(chalk.gray(tr('\n💭 {0} exchange{1}\n', exchanges, exchanges !== 1 ? 's' : '')));
    } catch (error: unknown) {
      process.stdout.write('\n');
      console.error(chalk.red(tr('\n❌ Error:')), getErrorMessage(error));
      chatHistory.removeLastMessage();
    }
  }
}

// ============================================================================
// One chat turn = initial stream + resume loop for every HITL pause.
// Exported for unit testing.
// ============================================================================

export interface RunChatTurnArgs {
  spaceIds?: string[];
  verbose?: boolean;
  client: MCPClient;
  /** Base URL the SSE stream + resume both target. Edge Runtime by
   *  default; direct MCP only when `directMcp=true`. */
  streamUrl: string;
  directMcp: boolean;
  message: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  onAmbiguous: OnAmbiguousMode;
  /** Override inquirer for tests. */
  prompter?: (prompt: SSEChatPrompt) => Promise<AgentResumePayload>;
  activity?: ChatActivity;
  onDetails?: (details: ChatTurnDetails) => void;
}

/** Drive one turn with HITL, canonical answer handling, activity cleanup and scoped inspection data. */
export async function runChatTurn(args: RunChatTurnArgs): Promise<string> {
  const citations: SSECitation[] = [];
  const verifications: SSEVerification[] = [];
  let fullResponse = '';
  let completed = false;
  let hadStreamError = false;
  let streamDone = false;
  const activity = args.activity ?? createChatActivity();
  const screen = createChatRenderer(activity);
  // Suppressed = true when the backend blocked the answer via Guardian
  // (`answer_blocked` or `verification.action === 'blocked'`). Callers
  // must NOT persist the streamed draft to chat history in that case;
  // return an empty string so the outer loop drops the assistant slot.
  let suppressResponse = false;
  // Queue rather than single-slot so multiple chat_prompts in one
  // stream are drained in order instead of silently overwritten.
  const pendingPrompts: SSEChatPrompt[] = [];

  const streamOpts: ChatStreamOptions = {
    spaceIds: args.spaceIds,
    conversationHistory: args.conversationHistory,
    language: getLanguage(),
    onToken: (token) => {
      if (typeof token !== 'string' || !token) return;
      screen.token(token);
      fullResponse += token;
    },
    onMetadata: () => screen.phase(tr('Processing request')),
    onToolCall: () => screen.phase(tr('Working with tools')),
    onCitation: (c) => citations.push(c),
    onDone: () => {
      streamDone = true;
    },
    onChatPrompt: (prompt) => {
      activity.stop();
      pendingPrompts.push(prompt);
    },
    // The cleaned final answer arrived (chart-JSON stripped, mermaid
    // normalized, tables repaired, Guardian/evidence swaps applied).
    // Replace both the on-screen draft AND the stored response with
    // `final_answer` verbatim — same field `persist-run.ts` treats as
    // authoritative. This is what stops chart-JSON dumps and un-swapped
    // Guardian text from being displayed and fed back next turn.
    onAnswerReplace: (data) => {
      screen.replace(fullResponse, data.final_answer);
      fullResponse = data.final_answer;
    },
    onVerification: (v) => {
      verifications.push(v);
      if (v.action === 'blocked') {
        suppressResponse = true;
      }
    },
    onAnswerBlocked: (data) => {
      activity.stop();
      suppressResponse = true;
      console.log(chalk.red(tr('\n🚫 Answer blocked: {0}', data.reason)));
      if (data.fallback_answer) {
        console.log(chalk.gray(tr('Fallback:')));
        console.log(data.fallback_answer);
        // The fallback IS a safe answer the server explicitly offered
        // — persist it in place of the blocked draft.
        fullResponse = data.fallback_answer;
        suppressResponse = false;
      } else {
        // No fallback — the turn produced nothing usable.
        fullResponse = '';
      }
    },
    onError: (err) => {
      hadStreamError = true;
      activity.stop();
      console.error(chalk.red('\n❌ ' + (err.message ?? err.error ?? 'Stream error')));
    },
  };

  try {
    screen.waiting();
    await args.client.chatStream(args.streamUrl, args.message, {
      directMcp: args.directMcp,
      ...streamOpts,
    });

    // Resume loop — server may emit multiple chat_prompts in sequence
    // (e.g. disambiguate → confirm step action → done). Branch on whether
    // the gate carries a `correlation_id`:
    //
    //   present → agent-step gate (intent-disambiguate). Resume via
    //             POST /api/agent-resume { correlation_id, response }.
    //   absent  → inline chat gate (scope, source, exhaustive-confirm,
    //             clarification, S4, S5). Resume by re-POSTing the SAME
    //             message to /chat-stream with `chatPromptContext`, which
    //             the backend parses to continue the paused pipeline.
    //
    // The resume URL matches the stream URL: in non-`--direct` mode this
    // is Edge Runtime so the gateway's auth + rate-limiting apply on
    // resume too.
    while (pendingPrompts.length > 0) {
      const prompt = pendingPrompts.shift() as SSEChatPrompt;

      process.stdout.write('\n');
      activity.stop();
      const decision = await handleChatPrompt(prompt, args.onAmbiguous, args.prompter);

      process.stdout.write(chalk.gray(tr('↪ Resuming ({0})\n', describeDecision(decision))));
      screen.waiting('Resuming request');
      // Each resume is a new stream; an earlier gate stream cannot attest
      // completion of its successor. EOF alone is not an answer receipt.
      streamDone = false;

      if (prompt.correlation_id) {
        await args.client.resumeAgent(args.streamUrl, prompt.correlation_id, decision, streamOpts);
      } else {
        const context: ChatPromptContext = {
          original_query: args.message,
          selected_value: decision.value ?? decision.values ?? '',
          prompt_type: prompt.type,
        };
        await args.client.chatStream(args.streamUrl, args.message, {
          directMcp: args.directMcp,
          ...streamOpts,
          chatPromptContext: context,
          // Honor a decline of the inline exhaustive-confirm gate — see
          // resolveAnalysisEffort. undefined for every other inline gate.
          analysisEffort: resolveAnalysisEffort(prompt, decision),
        });
      }
    }

    activity.stop();
    process.stdout.write('\n');

    completed = streamDone && !hadStreamError;
    if (completed) printChatSources(citations);

    // If Guardian blocked without offering a fallback, return empty so
    // the caller drops the assistant slot from history rather than
    // persisting an unverified draft. `startChat` treats empty as "no
    // answer" and calls `removeLastMessage` implicitly via the try/catch.
    return suppressResponse ? '' : fullResponse;
  } finally {
    activity.stop();
    // Verification signals must survive a stream or HITL-resume failure.
    printChatVerification(verifications, args.verbose);
    args.onDetails?.({ citations: completed && !suppressResponse ? citations : [], verifications });
  }
}

/**
 * Resolve the top-level `analysis_effort` to send when resuming an inline
 * HITL gate.
 *
 * The inline exhaustive-confirm gate (`waiting_for === 'exhaustive_confirm'`)
 * asks whether to run the multi-minute exhaustive analysis or a quick
 * search. Its `'cancel'` answer is NOT consumed on the backend's inline
 * resume path, so a decline that only rode in `chat_prompt_context` was
 * silently ignored and the exhaustive analysis ran anyway. The backend
 * DOES honor a top-level `analysis_effort` (`'quick'` → focused scope),
 * so map the decision to it: accept → `'complete'`, decline → `'quick'`.
 *
 * Returns `undefined` for every other gate — no effort override, so the
 * backend keeps its server-derived scope. Also returns `undefined` if the
 * backend has not yet been deployed with the `exhaustive_confirm`
 * `waiting_for` tag, so the CLI degrades to prior behavior rather than
 * regressing.
 *
 * Exported for unit testing.
 */
export function resolveAnalysisEffort(
  prompt: SSEChatPrompt,
  decision: AgentResumePayload
): 'quick' | 'complete' | undefined {
  if (prompt.waiting_for !== 'exhaustive_confirm') return undefined;
  return decision.value === 'approve' ? 'complete' : 'quick';
}

/**
 * Dispatch a `chat_prompt` according to the --on-ambiguous policy.
 * Returns the resume payload; may throw (`fail`) or exit the process (`dump`).
 */
export async function handleChatPrompt(
  prompt: SSEChatPrompt,
  mode: OnAmbiguousMode,
  prompter?: (p: SSEChatPrompt) => Promise<AgentResumePayload>
): Promise<AgentResumePayload> {
  if (mode === 'fail') {
    const hint =
      prompt.type === 'choice'
        ? (prompt.config?.options ?? []).map((o) => o.value).join('|')
        : prompt.type;
    // Inline gates carry no `correlation_id`; report `inline-gate`
    // instead of `undefined` so downstream logs stay searchable.
    const trace = prompt.correlation_id ?? `inline-gate (${prompt.prompt_id})`;
    throw new Error(
      `Agent paused: waiting_for=${prompt.waiting_for ?? prompt.type} [${hint}]\n` +
        `--on-ambiguous=fail — exiting without a decision.\n` +
        `Trace: ${trace}`
    );
  }

  if (mode === 'dump') {
    // Use write+callback rather than console.log+process.exit because
    // process.exit is synchronous and Node may terminate before the
    // kernel pipe buffer flushes — truncating the JSON for downstream
    // `| jq` consumers on slow pipes or CI runners.
    process.stdout.write(JSON.stringify({ chat_prompt: prompt }, null, 2) + '\n', () => {
      process.exit(0);
    });
    // Unreachable in practice, but keeps the type system happy and
    // satisfies the "this function never returns" contract.
    return new Promise(() => {});
  }

  if (mode === 'pick-first') {
    return autoPickFirst(prompt);
  }

  // prompt mode (default, interactive)
  return (prompter ?? inquirerPrompt)(prompt);
}

/**
 * `--on-ambiguous=pick-first` decision resolver.
 *
 * The name is retained for back-compat; the semantics have shifted:
 * we now prefer the backend's `default_choice.value` (the safe
 * server-declared default) over `options[0]`. This flips the previous
 * behavior on confirm-before-action gates, where `options[0]` was
 * `approve` — actively unsafe for unattended runs, which the server
 * defaults to `skip`.
 */
function autoPickFirst(prompt: SSEChatPrompt): AgentResumePayload {
  // Server-declared safe default wins for every gate type.
  if (prompt.default_choice?.value) {
    return { value: prompt.default_choice.value };
  }

  if (prompt.type === 'choice') {
    const first = prompt.config?.options?.[0];
    if (!first) {
      const trace = prompt.correlation_id ?? `inline-gate (${prompt.prompt_id})`;
      throw new Error(
        `--on-ambiguous=pick-first: chat_prompt type=choice has no options. ` + `Trace: ${trace}`
      );
    }
    return { value: first.value };
  }
  if (prompt.type === 'confirm') {
    // No `default_choice` on the wire → err on the side of NOT taking
    // the action. The v1.4.3 hardcoded `approve` was the opposite of
    // the server's own safety contract (which defaults to `skip`).
    return { value: 'skip' };
  }
  throw new Error(
    `--on-ambiguous=pick-first cannot auto-select for type=${prompt.type} ` +
      `(no default_choice, no options). Use --on-ambiguous=prompt (interactive) ` +
      `or --on-ambiguous=dump (inspect payload).`
  );
}

async function inquirerPrompt(prompt: SSEChatPrompt): Promise<AgentResumePayload> {
  if (prompt.type === 'choice') {
    const options = prompt.config?.options ?? [];
    if (options.length === 0) {
      throw new Error(`chat_prompt type=choice has no options; cannot render picker`);
    }
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: prompt.title ?? prompt.message ?? 'Choose an option:',
        choices: options.map((o) => ({
          name: o.description ? `${o.label}  ${chalk.gray(`— ${o.description}`)}` : o.label,
          value: o.value,
        })),
      },
    ]);
    return { value: choice };
  }

  if (prompt.type === 'confirm') {
    // Confirm gates put their body in `config.message` (backend
    // `hitl-gates.ts:197-235`); fall back to the top-level `message`
    // for gates that don't write to `config`.
    const body = prompt.config?.message ?? prompt.message ?? prompt.title ?? 'Continue?';
    const { ok } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'ok',
        message: body,
        // Match the server's declared safe default rather than always
        // starting on `Yes` — for confirm-before-action gates the
        // default is `skip`, so `Yes` (approve) reads as pressing
        // Enter to run the action.
        default: prompt.default_choice?.value ? prompt.default_choice.value === 'approve' : true,
      },
    ]);
    // Preserve explicit interactive decline: when the user picks `No`,
    // they never want us to send `approve`. Use the server-declared
    // safe default only when it's ITSELF a non-approving value
    // (skip / cancel / abort); otherwise fall back to `abort`. A
    // `default_choice.value === 'approve'` server hint applies to
    // Enter-to-accept, not to an explicit rejection.
    const serverDefault = prompt.default_choice?.value;
    const declineValue = serverDefault && serverDefault !== 'approve' ? serverDefault : 'abort';
    return { value: ok ? 'approve' : declineValue };
  }

  if (prompt.type === 'form') {
    // Form gates carry `config.fields` — a mix of text/select fields.
    // Reuse the per-field pattern from `validate-hitl-form.ts`.
    const fields = prompt.config?.fields ?? [];
    if (fields.length === 0) {
      throw new Error(`chat_prompt type=form has no fields (${prompt.prompt_id}); cannot render`);
    }
    const collected: Record<string, string> = {};
    if (prompt.title) console.log(chalk.bold(`\n${prompt.title}`));
    if (prompt.message) console.log(chalk.gray(prompt.message));
    for (const field of fields) {
      if (field.type === 'text') {
        const { value } = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: field.label,
            ...(field.default !== undefined ? { default: field.default } : {}),
            ...(field.placeholder !== undefined && field.default === undefined
              ? { default: field.placeholder }
              : {}),
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
        const options = field.options ?? [];
        if (options.length === 0) {
          throw new Error(`form field '${field.name}' is a select with no options`);
        }
        const { value } = await inquirer.prompt([
          {
            type: 'list',
            name: 'value',
            message: field.label,
            choices: options.map((o) => ({
              name: o.description ? `${o.label}  ${chalk.gray(`— ${o.description}`)}` : o.label,
              value: o.value,
            })),
            default: field.default,
          },
        ]);
        collected[field.name] = value;
      } else {
        // Exhaustive check — the type union only lists text/select
        // today, but a new field kind added server-side would land
        // here without a matching branch.
        const unknown = field as { type: string };
        throw new Error(`Unsupported form field type: ${unknown.type}`);
      }
    }
    return { values: collected };
  }

  // Exhaustive over the SSEChatPrompt.type union.
  const exhaustive: never = prompt.type;
  throw new Error(`Unhandled chat_prompt type: ${String(exhaustive)}`);
}

function describeDecision(decision: AgentResumePayload): string {
  if (decision.value) return `value=${decision.value}`;
  if (decision.values) return `values=${Object.keys(decision.values).join(',')}`;
  return 'empty';
}
