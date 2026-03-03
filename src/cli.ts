#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { searchCommand } from './commands/search';
import { graphCommand } from './commands/graph';
import { corpusCommand } from './commands/corpus';
import { compoundCommand } from './commands/compound';
import { configCommand } from './commands/config';
import { healthCommand } from './commands/health';
import { authCommand } from './commands/auth';
import { intelligenceCommand } from './commands/intelligence';
import { leanragCommand } from './commands/leanrag';
import { mermaidCommand } from './commands/mermaid';
import { evaluateCommand } from './commands/evaluate';
import { dspyCommand } from './commands/dspy';
import { uiCommand } from './commands/ui';
import { logsCommand } from './commands/logs';
import { queryHistoryCommand } from './commands/query-history';
import { duckdbCommand } from './commands/duckdb';
import { toolsCommand } from './commands/tools';
import { uploadBatchCommand } from './commands/upload-batch';
import { benchmarkCommand } from './commands/benchmark';
import { getConfig, getBaseUrl } from './utils/config';
import { getErrorMessage } from './utils/command-helpers';
import pkg from '../package.json';

// ============================================================================
// Graceful Shutdown Handlers
// ============================================================================

let isShuttingDown = false;

/**
 * Handle graceful shutdown on SIGTERM/SIGINT
 * Ensures clean exit without orphaned processes or connections
 */
function handleShutdown(signal: string): void {
  if (isShuttingDown) {
    // Force exit if already shutting down (user pressed Ctrl+C twice)
    console.log(chalk.red('\nForce exit...'));
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(chalk.yellow(`\n\n🛑 Received ${signal}, shutting down gracefully...`));

  // Give a short time for cleanup, then exit
  setTimeout(() => {
    console.log(chalk.gray('Cleanup complete. Goodbye!'));
    process.exit(0);
  }, 100);
}

// Register signal handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle uncaught errors gracefully
process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('\n❌ Unexpected error:'), getErrorMessage(error));
  if (process.env.DEBUG) {
    console.error(chalk.gray(error.stack ?? ''));
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.red('\n❌ Unhandled promise rejection:'), message);
  if (process.env.DEBUG && reason instanceof Error) {
    console.error(chalk.gray(reason.stack ?? ''));
  }
  process.exit(1);
});

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command();

program
  .name('deposium')
  .description(
    chalk.bold('🚀 Deposium CLI') +
      '\n' +
      chalk.gray('Document search, graph queries, and AI workflows via Deposium API')
  )
  .version(pkg.version)
  .option('--insecure', 'Allow insecure HTTP connections to non-localhost servers')
  .hook('preAction', async () => {
    // Propagate --insecure flag to env var so enforceUrlSecurity() can read it
    const globalOpts = program.opts();
    if (globalOpts.insecure) {
      process.env.DEPOSIUM_INSECURE = 'true';
    }

    // Check if Deposium server URL is configured
    const config = getConfig();
    const insecure = globalOpts.insecure ?? process.env.DEPOSIUM_INSECURE === 'true';
    const baseUrl = getBaseUrl(config, { insecure });
    // Skip config check for commands that don't use API, or if using default localhost
    const noApiCommands = ['config', 'auth', 'upload-batch'];
    if (!config.deposiumUrl && !config.mcpUrl && !noApiCommands.includes(program.args[0])) {
      console.log(chalk.yellow('⚠️  Deposium server URL not configured.'));
      console.log(chalk.gray(`Using default: ${chalk.cyan(baseUrl)}`));
      console.log(
        chalk.gray('To change, run: ') + chalk.cyan('deposium config set deposium-url <url>')
      );
    }
  });

// Commands
program.addCommand(authCommand);
program.addCommand(toolsCommand);
program.addCommand(searchCommand);
program.addCommand(graphCommand);
program.addCommand(corpusCommand);
program.addCommand(compoundCommand);
program.addCommand(configCommand);
program.addCommand(healthCommand);
program.addCommand(intelligenceCommand);
program.addCommand(leanragCommand);
program.addCommand(mermaidCommand);
program.addCommand(evaluateCommand);
program.addCommand(dspyCommand);
program.addCommand(uiCommand);
program.addCommand(logsCommand);
program.addCommand(queryHistoryCommand);
program.addCommand(duckdbCommand);
program.addCommand(uploadBatchCommand);
program.addCommand(benchmarkCommand);

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode (REPL)')
  .action(async () => {
    const { startInteractive } = await import('./interactive');
    await startInteractive();
  });

// Chat mode
program
  .command('chat')
  .description('Start AI chat mode (continuous conversation)')
  .option('--direct', 'Bypass Edge Runtime, connect directly to MCP server (dev only)')
  .action(async (options: { direct?: boolean }) => {
    const { startChat } = await import('./chat');
    await startChat({ direct: options.direct });
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
