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
import { getConfig } from './utils/config';

const program = new Command();

program
  .name('deposium')
  .description(
    chalk.bold('🚀 Deposium CLI') +
      '\n' +
      chalk.gray('Document search, graph queries, and AI workflows via MCP Server')
  )
  .version('1.0.0')
  .hook('preAction', async () => {
    // Check if MCP server URL is configured
    const config = getConfig();
    // Skip config check for commands that don't use MCP
    const noMcpCommands = ['config', 'auth', 'upload-batch'];
    if (!config.mcpUrl && !noMcpCommands.includes(program.args[0])) {
      console.log(chalk.yellow('⚠️  MCP Server URL not configured.'));
      console.log(
        chalk.gray('Run: ') + chalk.cyan('deposium config set mcp-url http://localhost:4001')
      );
      process.exit(1);
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
  .action(async () => {
    const { startChat } = await import('./chat');
    await startChat();
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
