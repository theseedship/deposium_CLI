import inquirer from 'inquirer';
import chalk from 'chalk';
import { MCPClient, MCPTool } from './client/mcp-client';
import { getConfig, getBaseUrl } from './utils/config';
import { formatOutput, createTitleBox } from './utils/formatter';
import { ensureAuthenticated } from './utils/auth';
import { ChatHistory } from './utils/chat-history';
import { startChat } from './chat';
import { getErrorMessage } from './utils/command-helpers';

export async function startInteractive(): Promise<void> {
  console.log(createTitleBox('INTERACTIVE MODE', 'Menu-driven access to all Deposium features'));

  const config = getConfig();
  const baseUrl = getBaseUrl(config);

  // Ensure user is authenticated
  const apiKey = await ensureAuthenticated(baseUrl);

  const client = new MCPClient(baseUrl, apiKey);

  // Initialize chat history for Compound AI
  const compoundChatHistory = new ChatHistory(10);

  while (true) {
    const { command } = await inquirer.prompt([
      {
        type: 'list',
        name: 'command',
        message: chalk.bold.cyan('Select an operation:'),
        choices: [
          new inquirer.Separator(chalk.gray('─── AI Operations ───')),
          { name: '💬  AI Chat ' + chalk.gray('(continuous conversation)'), value: 'chat' },
          {
            name: '🤖  Compound AI ' + chalk.gray('(single query with context)'),
            value: 'compound',
          },
          {
            name: '🧠  Intelligence ' + chalk.gray('(smart query analysis)'),
            value: 'intelligence',
          },
          { name: '🧭  DSPy Router ' + chalk.gray('(intelligent routing)'), value: 'dspy' },
          new inquirer.Separator(chalk.gray('─── Search & Retrieval ───')),
          { name: '🔍  Search ' + chalk.gray('(find documents)'), value: 'search' },
          { name: '🎯  LeanRAG ' + chalk.gray('(optimized retrieval)'), value: 'leanrag' },
          new inquirer.Separator(chalk.gray('─── Graph & Analysis ───')),
          { name: '🔗  Graph Analysis ' + chalk.gray('(explore connections)'), value: 'graph' },
          { name: '📐  Mermaid ' + chalk.gray('(diagram tools)'), value: 'mermaid' },
          new inquirer.Separator(chalk.gray('─── Corpus & Quality ───')),
          { name: '📊  Corpus Stats ' + chalk.gray('(view metrics)'), value: 'corpus' },
          { name: '📈  Evaluate ' + chalk.gray('(quality metrics)'), value: 'evaluate' },
          new inquirer.Separator(chalk.gray('─── Management ───')),
          { name: '📝  Query History ' + chalk.gray('(track queries)'), value: 'queryhistory' },
          { name: '📜  Logs ' + chalk.gray('(view server logs)'), value: 'logs' },
          { name: '🦆  DuckDB ' + chalk.gray('(database federation)'), value: 'duckdb' },
          new inquirer.Separator(chalk.gray('─── UI & Tools ───')),
          { name: '🎨  UI Dashboards ' + chalk.gray('(interactive interfaces)'), value: 'ui' },
          { name: '🛠️  List Tools ' + chalk.gray('(see all 65 tools)'), value: 'tools' },
          new inquirer.Separator(chalk.gray('─── System ───')),
          { name: '🏥  Health Check ' + chalk.gray('(service status)'), value: 'health' },
          new inquirer.Separator(),
          { name: chalk.red('🚪  Exit'), value: 'exit' },
        ],
        pageSize: 25,
      },
    ]);

    if (command === 'exit') {
      console.log(chalk.green('\n👋 Goodbye!\n'));
      break;
    }

    try {
      switch (command) {
        case 'chat':
          await startChat();
          break;
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
          await handleCompound(client, compoundChatHistory);
          break;
        case 'health':
          await handleHealth(client);
          break;
        case 'intelligence':
          await handleIntelligence(client);
          break;
        case 'dspy':
          await handleDSPy(client);
          break;
        case 'leanrag':
          await handleLeanRAG(client);
          break;
        case 'mermaid':
          await handleMermaid(client);
          break;
        case 'evaluate':
          await handleEvaluate(client);
          break;
        case 'queryhistory':
          await handleQueryHistory(client);
          break;
        case 'logs':
          await handleLogs(client);
          break;
        case 'duckdb':
          await handleDuckDB(client);
          break;
        case 'ui':
          await handleUI(client);
          break;
        case 'tools':
          await handleTools(client);
          break;
      }
    } catch (error: unknown) {
      console.error(chalk.red('\n❌ Error:'), getErrorMessage(error));
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
      default: getConfig().defaultTenant ?? 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace ?? 'default',
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
      default: getConfig().defaultTenant ?? 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace ?? 'default',
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
      default: getConfig().defaultTenant ?? 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace ?? 'default',
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

async function handleCompound(client: MCPClient, chatHistory: ChatHistory): Promise<void> {
  // Show conversation history if it exists
  if (!chatHistory.isEmpty()) {
    const { showHistory } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'showHistory',
        message: 'View conversation history?',
        default: false,
      },
    ]);

    if (showHistory) {
      chatHistory.display();
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Enter your question:',
    },
    {
      type: 'confirm',
      name: 'clearHistory',
      message: 'Clear conversation history?',
      default: false,
      when: () => !chatHistory.isEmpty(),
    },
  ]);

  // Clear history if requested
  if (answers.clearHistory) {
    chatHistory.clear();
    console.log(chalk.yellow('\n🗑️  Conversation history cleared\n'));
  }

  // Add user message to history
  chatHistory.addUserMessage(answers.query);

  // Get conversation context
  const conversationContext = chatHistory.getContext(6);

  // Build context object - only add conversation_history if it exists
  const context: { conversation_history?: string } = {};
  if (conversationContext) {
    context.conversation_history = conversationContext;
  }

  const result = await client.callTool(
    'compound_analyze',
    {
      query: answers.query,
      context,
    },
    { spinner: true }
  );

  if (!result.isError) {
    // Add AI response to history
    const responseText =
      typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    chatHistory.addAssistantMessage(responseText);

    formatOutput(result.content, 'markdown');

    // Show brief history indicator
    console.log(chalk.gray(`\n💬 ${chatHistory.getMessages().length} messages in conversation\n`));
  } else {
    console.error(chalk.red('Compound AI failed:'), result.content);
  }
}

async function handleHealth(client: MCPClient): Promise<void> {
  const health = await client.health();
  console.log(chalk.green('\n✅ MCP Server: Healthy\n'));
  formatOutput(health, 'table');
}

async function handleIntelligence(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Intelligence operation:',
      choices: ['analyze', 'suggest', 'summarize', 'elicit'],
    },
  ]);

  const { query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: action === 'suggest' ? 'Enter partial query:' : 'Enter query:',
    },
  ]);

  const toolMap: Record<string, string> = {
    analyze: 'smart_analyze',
    suggest: 'smart_suggest',
    summarize: 'smart_summarize',
    elicit: 'smart_elicit',
  };

  const result = await client.callTool(
    toolMap[action],
    action === 'suggest'
      ? { partial_query: query, tenant_id: 'default', space_id: 'default' }
      : { query_text: query },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Intelligence operation failed:'), result.content);
  }
}

async function handleDSPy(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'DSPy operation:',
      choices: ['route', 'analyze'],
    },
  ]);

  const { query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Enter query:',
    },
  ]);

  const result = await client.callTool(
    action === 'route' ? 'dspy_route' : 'dspy_analyze',
    { query },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('DSPy operation failed:'), result.content);
  }
}

async function handleLeanRAG(client: MCPClient): Promise<void> {
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
      default: getConfig().defaultTenant ?? 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace ?? 'default',
    },
  ]);

  const result = await client.callTool(
    'leanrag_retrieve',
    {
      tenant_id: answers.tenant,
      space_id: answers.space,
      query_text: answers.query,
      top_k: 10,
    },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('LeanRAG retrieval failed:'), result.content);
  }
}

async function handleMermaid(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Mermaid operation:',
      choices: ['parse', 'query'],
    },
  ]);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tenant',
      message: 'Tenant ID:',
      default: getConfig().defaultTenant ?? 'default',
    },
    {
      type: 'input',
      name: 'space',
      message: 'Space ID:',
      default: getConfig().defaultSpace ?? 'default',
    },
  ]);

  const result = await client.callTool(
    action === 'parse' ? 'mermaid_parse' : 'mermaid_query',
    {
      tenant_id: answers.tenant,
      space_id: answers.space,
    },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'markdown');
  } else {
    console.error(chalk.red('Mermaid operation failed:'), result.content);
  }
}

async function handleEvaluate(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Evaluation operation:',
      choices: ['metrics', 'dashboard', 'feedback'],
    },
  ]);

  const result = await client.callTool(
    `eval_${action}`,
    action === 'feedback' ? { queryId: 'demo', userId: 'demo', score: 0.8 } : {},
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Evaluation operation failed:'), result.content);
  }
}

async function handleQueryHistory(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Query history operation:',
      choices: ['retrieve', 'stats'],
    },
  ]);

  const result = await client.callTool(`query_${action}`, { limit: 50 }, { spinner: true });

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Query history operation failed:'), result.content);
  }
}

async function handleLogs(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Logs operation:',
      choices: ['view', 'stats'],
    },
  ]);

  const result = await client.callTool(
    action === 'view' ? 'view_logs' : 'get_log_stats',
    { limit: 100 },
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('Logs operation failed:'), result.content);
  }
}

async function handleDuckDB(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'DuckDB operation:',
      choices: ['status', 'list tables'],
    },
  ]);

  const result = await client.callTool(
    action === 'status' ? 'duckdb_mcp_status' : 'list_tables',
    {},
    { spinner: true }
  );

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('DuckDB operation failed:'), result.content);
  }
}

async function handleUI(client: MCPClient): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'UI operation:',
      choices: ['dashboard', 'health monitor', 'tools explorer'],
    },
  ]);

  const toolMap: Record<string, string> = {
    dashboard: 'ui_show_dashboard',
    'health monitor': 'ui_show_health',
    'tools explorer': 'ui_show_tools',
  };

  const result = await client.callTool(toolMap[action], { port: 8080 }, { spinner: true });

  if (!result.isError) {
    formatOutput(result.content, 'table');
  } else {
    console.error(chalk.red('UI operation failed:'), result.content);
  }
}

async function handleTools(client: MCPClient): Promise<void> {
  console.log(chalk.bold('\n🛠️  Fetching Available MCP Tools...\n'));

  const tools = await client.listTools();

  if (tools?.length === 0) {
    console.log(chalk.yellow('⚠️  No tools found'));
    return;
  }

  console.log(chalk.bold.cyan(`📊 Found ${tools.length} tools\n`));

  // Group by category
  const categories = new Map<string, MCPTool[]>();
  tools.forEach((tool) => {
    const category = tool.name.split('_')[0] ?? 'other';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)?.push(tool);
  });

  // Display summary
  for (const [category, categoryTools] of Array.from(categories.entries()).sort()) {
    console.log(chalk.green(`${category}: `) + chalk.white(`${categoryTools.length} tools`));
  }

  console.log(chalk.gray('\n💡 Use "deposium tools" command for detailed view\n'));
}
