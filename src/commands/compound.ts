import { Command } from 'commander';
import chalk from 'chalk';
import { formatOutput } from '../utils/formatter';
import { initializeCommand, withErrorHandling, runMcpTool } from '../utils/command-helpers';
import { ChatHistory } from '../utils/chat-history';
import { runCompoundAnalysis } from '../utils/compound-analysis';

// Module-scope chat history. In the standalone `compound analyze` CLI
// command this resets every invocation (one-shot process); inside the
// interactive REPL it carries across turns. The `--clear` and
// `--show-history` flags that used to sit on the standalone command
// were no-ops in that mode and have been removed — the REPL provides
// the equivalent commands.
const globalChatHistory = new ChatHistory(10);

export const compoundCommand = new Command('compound')
  .description('General server AI reasoning and optional web research (no selected document space)')
  .addCommand(
    new Command('analyze')
      .description('Deep reasoning with multi-tool orchestration')
      .argument('<query>', 'Complex query for analysis')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .action(
        withErrorHandling(async (query, options) => {
          const json = options.format.toLowerCase() === 'json';
          const { client } = await initializeCommand({ machineReadable: json });

          if (!json) console.log(chalk.bold('\nGeneral AI — no document space selected.\n'));
          const content = await runCompoundAnalysis(client, globalChatHistory, query, {
            spinner: !json,
          });

          formatOutput(content, options.format);

          // Show message count
          if (!json)
            console.log(
              chalk.gray(
                `\n💬 ${globalChatHistory.getMessages().length} messages in conversation\n`
              )
            );
        })
      )
  )
  .addCommand(
    new Command('research')
      .description('Topic research with web search')
      .argument('<topic>', 'Research topic')
      .option('-f, --format <type>', 'Output format (json|markdown)', 'markdown')
      .action(
        withErrorHandling(async (topic, options) => {
          const json = options.format.toLowerCase() === 'json';
          const { client } = await initializeCommand({ machineReadable: json });

          if (!json) console.log(chalk.bold(`\n🔬 Researching: ${topic}...\n`));

          const content = await runMcpTool(
            client,
            'compound_research',
            {
              topic,
              depth: 'comprehensive',
            },
            { label: 'Research', spinner: !json }
          );

          formatOutput(content, options.format);
        })
      )
  );
