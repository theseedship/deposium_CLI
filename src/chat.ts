import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import type {
  AgentResumePayload,
  ChatStreamOptions,
  SSECitation,
  SSEChatPrompt,
} from './client/mcp-client';
import { getConfig, getBaseUrl, getEdgeUrl, getMcpDirectUrl } from './utils/config';
import { createTitleBox } from './utils/formatter';
import { ensureAuthenticated } from './utils/auth';
import { ChatHistory } from './utils/chat-history';
import { getErrorMessage } from './utils/command-helpers';

/**
 * `--on-ambiguous` policy — what the CLI does when the server emits a
 * `chat_prompt` HITL pause.
 *
 * Phase I ships 4 modes. Phase W.2 will add `resume-file` and
 * `fail-with-token` (stateful modes that need persistence across process
 * restarts).
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

  const config = getConfig();
  const baseUrl = getBaseUrl(config);
  const mcpDirectUrl = getMcpDirectUrl(config);
  const onAmbiguous = resolveOnAmbiguousMode(options.onAmbiguous);

  let streamUrl: string;
  let directMcp = false;

  if (options.direct) {
    streamUrl = mcpDirectUrl;
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

  // Ensure user is authenticated (validates via SolidStart)
  const apiKey = await ensureAuthenticated(baseUrl);

  const client = new MCPClient(baseUrl, apiKey);
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
        mcpDirectUrl,
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
  streamUrl: string;
  mcpDirectUrl: string;
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
  let pendingPrompt: SSEChatPrompt | null = null;

  const streamOpts: ChatStreamOptions = {
    conversationHistory: args.conversationHistory,
    language: 'fr',
    onToken: (token) => {
      process.stdout.write(token);
      fullResponse += token;
    },
    onCitation: (c) => citations.push(c),
    onChatPrompt: (prompt) => {
      pendingPrompt = prompt;
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
  // (e.g. disambiguate → confirm step action → done).
  while (pendingPrompt) {
    const prompt: SSEChatPrompt = pendingPrompt;
    pendingPrompt = null;

    process.stdout.write('\n');
    const decision = await handleChatPrompt(prompt, args.onAmbiguous, args.prompter);

    process.stdout.write(chalk.gray(`↪ Resuming (${describeDecision(decision)})\n`));
    process.stdout.write(chalk.green('AI: '));

    await args.client.resumeAgent(args.mcpDirectUrl, prompt.correlation_id, decision, streamOpts);
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
    throw new Error(
      `Agent paused: waiting_for=${prompt.waiting_for ?? prompt.type} [${hint}]\n` +
        `--on-ambiguous=fail — exiting without a decision.\n` +
        `Correlation ID: ${prompt.correlation_id}`
    );
  }

  if (mode === 'dump') {
    console.log(JSON.stringify({ chat_prompt: prompt }, null, 2));
    process.exit(0);
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
      throw new Error(
        `--on-ambiguous=pick-first: chat_prompt type=choice has no options. ` +
          `Correlation ID: ${prompt.correlation_id}`
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
    const { ok } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'ok',
        message: prompt.message ?? prompt.title ?? 'Continue?',
        default: true,
      },
    ]);
    return { value: ok ? 'approve' : 'abort' };
  }

  throw new Error(
    `chat_prompt type='${prompt.type}' is not yet supported in CLI — ` +
      `forms will ship in Phase W.2. Use --on-ambiguous=dump to inspect the payload.`
  );
}

function describeDecision(decision: AgentResumePayload): string {
  if (decision.value) return `value=${decision.value}`;
  if (decision.values) return `values=${Object.keys(decision.values).join(',')}`;
  return 'empty';
}
