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
    // Skip config check for 'config' and 'auth' commands
    if (!config.mcpUrl && program.args[0] !== 'config' && program.args[0] !== 'auth') {
      console.log(chalk.yellow('⚠️  MCP Server URL not configured.'));
      console.log(
        chalk.gray('Run: ') + chalk.cyan('deposium config set mcp-url http://localhost:4001')
      );
      process.exit(1);
    }
  });

// Commands
program.addCommand(authCommand);
program.addCommand(searchCommand);
program.addCommand(graphCommand);
program.addCommand(corpusCommand);
program.addCommand(compoundCommand);
program.addCommand(configCommand);
program.addCommand(healthCommand);

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode (REPL)')
  .action(async () => {
    const { startInteractive } = await import('./interactive');
    await startInteractive();
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
