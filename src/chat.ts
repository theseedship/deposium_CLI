import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import type {
  AgentResumePayload,
  ChatPromptContext,
  ChatStreamOptions,
  SSECitation,
  SSEChatPrompt,
} from './client/mcp-client';
import { getConfig, getEdgeUrl, getMcpDirectUrl } from './utils/config';
import { createTitleBox } from './utils/formatter';
import { ChatHistory } from './utils/chat-history';
import { getErrorMessage, initializeCommand } from './utils/command-helpers';

/**
 * `--on-ambiguous` policy — what the CLI does when the server emits a
 * `chat_prompt` HITL pause.
 *
 * Stateful modes (`resume-file`, `fail-with-token`) that need
 * persistence across process restarts are not yet implemented.
 */
export type OnAmbiguousMode = 'prompt' | 'fail' | 'dump' | 'pick-first';

export interface ChatOptions {
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
  console.log(createTitleBox('AI CHAT', 'Streaming conversation with Deposium AI'));
  console.log(chalk.gray('Commands: /exit (quit) | /clear (reset) | /history (view)\n'));

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
        '⚠️  --direct mode: bypassing Edge Runtime (no rate-limiting, no auth gateway)\n'
      )
    );
    console.log(chalk.gray(`MCP direct: ${streamUrl}\n`));
  } else {
    streamUrl = getEdgeUrl(config);
    console.log(chalk.gray(`Edge Runtime: ${streamUrl}\n`));
  }

  console.log(chalk.gray(`HITL policy: --on-ambiguous=${onAmbiguous}\n`));

  // NOW bootstrap (auth + MCPClient). May prompt if the API key is
  // missing — the user already saw the mode banner above so they
  // know what they're authenticating against.
  const { client } = await initializeCommand();

  const chatHistory = new ChatHistory(10);

  while (true) {
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: 'You:',
      },
    ]);

    const trimmedMessage = message.trim();

    // Handle commands
    if (trimmedMessage === '/exit') {
      console.log(chalk.green('\n👋 Goodbye!\n'));
      break;
    }

    if (trimmedMessage === '/clear') {
      chatHistory.clear();
      console.log(chalk.yellow('🗑️  Conversation history cleared\n'));
      continue;
    }

    if (trimmedMessage === '/history') {
      chatHistory.display();
      continue;
    }

    if (!trimmedMessage) {
      continue;
    }

    chatHistory.addUserMessage(trimmedMessage);

    try {
      const fullResponse = await runChatTurn({
        client,
        streamUrl,
        directMcp,
        message: trimmedMessage,
        conversationHistory: chatHistory.toConversationHistory(6),
        onAmbiguous,
      });

      chatHistory.addAssistantMessage(fullResponse);

      const exchanges = Math.floor(chatHistory.getMessages().length / 2);
      console.log(chalk.gray(`\n💭 ${exchanges} exchange${exchanges !== 1 ? 's' : ''}\n`));
    } catch (error: unknown) {
      process.stdout.write('\n');
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
      chatHistory.removeLastMessage();
    }
  }
}

// ============================================================================
// One chat turn = initial stream + resume loop for every HITL pause.
// Exported for unit testing.
// ============================================================================

export interface RunChatTurnArgs {
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
}

export async function runChatTurn(args: RunChatTurnArgs): Promise<string> {
  const citations: SSECitation[] = [];
  let fullResponse = '';
  // Queue rather than single-slot so multiple chat_prompts in one
  // stream are drained in order instead of silently overwritten.
  const pendingPrompts: SSEChatPrompt[] = [];

  const streamOpts: ChatStreamOptions = {
    conversationHistory: args.conversationHistory,
    language: 'fr',
    onToken: (token) => {
      process.stdout.write(token);
      fullResponse += token;
    },
    onCitation: (c) => citations.push(c),
    onChatPrompt: (prompt) => {
      pendingPrompts.push(prompt);
    },
    onError: (err) => {
      console.error(chalk.red('\n❌ ' + (err.message ?? err.error ?? 'Stream error')));
    },
  };

  process.stdout.write(chalk.green('\nAI: '));

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
    const decision = await handleChatPrompt(prompt, args.onAmbiguous, args.prompter);

    process.stdout.write(chalk.gray(`↪ Resuming (${describeDecision(decision)})\n`));
    process.stdout.write(chalk.green('AI: '));

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
      });
    }
  }

  process.stdout.write('\n');

  if (citations.length > 0) {
    console.log(chalk.gray('\n📎 Sources:'));
    for (const c of citations) {
      const page = c.page ? ` p.${c.page}` : '';
      console.log(chalk.gray(`   - ${c.document_name}${page}`));
    }
  }

  return fullResponse;
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

function autoPickFirst(prompt: SSEChatPrompt): AgentResumePayload {
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
    return { value: 'approve' };
  }
  throw new Error(
    `--on-ambiguous=pick-first cannot auto-select for type=${prompt.type}. ` +
      `Use --on-ambiguous=prompt (interactive) or --on-ambiguous=dump (inspect payload).`
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
        default: true,
      },
    ]);
    return { value: ok ? 'approve' : 'abort' };
  }

  throw new Error(
    `chat_prompt type='${prompt.type}' is not yet supported in the CLI. ` +
      `Use --on-ambiguous=dump to inspect the payload.`
  );
}

function describeDecision(decision: AgentResumePayload): string {
  if (decision.value) return `value=${decision.value}`;
  if (decision.values) return `values=${Object.keys(decision.values).join(',')}`;
  return 'empty';
}
