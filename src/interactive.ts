import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient } from './client/mcp-client';
import { getConfig } from './utils/config';
import { formatOutput } from './utils/formatter';
import { ensureAuthenticated } from './utils/auth';

export async function startInteractive(): Promise<void> {
  console.log(chalk.bold('\n🚀 Deposium Interactive Mode\n'));
  console.log(chalk.gray('Type "exit" to quit\n'));

  const config = getConfig();

  // Ensure user is authenticated
  const apiKey = await ensureAuthenticated(config.mcpUrl!);

  const client = new MCPClient(config.mcpUrl!, apiKey);

  while (true) {
    const { command } = await inquirer.prompt([
      {
        type: 'list',
        name: 'command',
        message: 'What would you like to do?',
        choices: [
          { name: '🔍 Search documents', value: 'search' },
          { name: '🔗 Analyze graph', value: 'graph' },
          { name: '📊 Corpus stats', value: 'corpus' },
          { name: '🤖 Compound AI', value: 'compound' },
          { name: '🏥 Health check', value: 'health' },
          new inquirer.Separator(),
          { name: '🚪 Exit', value: 'exit' },
        ],
      },
    ]);

    if (command === 'exit') {
      console.log(chalk.green('\n👋 Goodbye!\n'));
      break;
    }

    try {
      switch (command) {
        case 'search':
          await handleSearch(client);
          break;
        case 'graph':
          await handleGraph(client);
          break;
        case 'corpus':
          await handleCorpus(client);
          break;
        case 'compound':
          await handleCompound(client);
          break;
        case 'health':
          await handleHealth(client);
          break;
      }
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'), error.message);
    }

    console.log(''); // Empty line for spacing
  }
}

async function handleSearch(client: MCPClient): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Enter search query:',
    },
    {
      type: 'input',
      name: 'tenant',
      message: 'Tenant ID:',
      default: getConfig().defaultTenant || 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace || 'default',
    },
  ]);

  const result = await client.callTool(
    'search_hub',
    {
      tenant_id: answers.tenant,
      space_id: answers.space,
      query_text: answers.query,
    },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Search failed:'), result.content);
  }
}

async function handleGraph(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Graph operation:',
      choices: ['analyze', 'components', 'path'],
    },
  ]);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tenant',
      message: 'Tenant ID:',
      default: getConfig().defaultTenant || 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace || 'default',
    },
  ]);

  // Map action names to MCP tool names
  const toolMap: Record<string, string> = {
    analyze: 'graph_multihop',
    components: 'graph_components',
    path: 'graph_variable_path',
  };

  const result = await client.callTool(
    toolMap[action] || `graph_${action}`,
    {
      tenant_id: answers.tenant,
      space_id: answers.space,
    },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Graph operation failed:'), result.content);
  }
}

async function handleCorpus(client: MCPClient): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tenant',
      message: 'Tenant ID:',
      default: getConfig().defaultTenant || 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace || 'default',
    },
  ]);

  const result = await client.callTool(
    'corpus_stats',
    {
      tenant_id: answers.tenant,
      space_id: answers.space,
    },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Corpus stats failed:'), result.content);
  }
}

async function handleCompound(client: MCPClient): Promise<void> {
  const { query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Enter your question:',
    },
  ]);

  const result = await client.callTool(
    'compound_analyze',
    { query },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'markdown');
  } else {
    console.error(chalk.red('Compound AI failed:'), result.content);
  }
}

async function handleHealth(client: MCPClient): Promise<void> {
  const health = await client.health();
  console.log(chalk.green('\n✅ MCP Server: Healthy\n'));
  formatOutput(health, 'table');
}
