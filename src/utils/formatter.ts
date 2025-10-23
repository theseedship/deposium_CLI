import chalk from 'chalk';
import Table from 'cli-table3';
import { marked } from 'marked';
import markedTerminal from 'marked-terminal';
import boxen from 'boxen';
import gradient from 'gradient-string';
import cliProgress from 'cli-progress';

// Lazy initialization of marked with terminal rendering
let markedConfigured = false;
function ensureMarkedConfigured() {
  if (!markedConfigured) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      marked.use(markedTerminal() as any);
      markedConfigured = true;
    } catch {
      // Fallback to default marked if terminal rendering fails
      console.warn('Warning: Could not configure terminal markdown rendering');
      markedConfigured = true;
    }
  }
}

export function formatOutput(data: any, format: string = 'table'): void {
  switch (format.toLowerCase()) {
    case 'json':
      formatJSON(data);
      break;
    case 'table':
      formatTable(data);
      break;
    case 'markdown':
      formatMarkdown(data);
      break;
    default:
      formatTable(data);
  }
}

function formatJSON(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

function formatTable(data: any): void {
  // Handle different data types
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(chalk.yellow('\n📭 No results found\n'));
      return;
    }

    // Create table with first object's keys as headers
    const headers = Object.keys(data[0] || {});
    const table = new Table({
      head: headers.map((h) => chalk.cyan(h)),
      style: {
        head: [],
        border: ['grey'],
      },
      wordWrap: true,
      wrapOnWordBoundary: true,
      colWidths: headers.map(() => 30),
    });

    // Add rows
    data.forEach((row) => {
      table.push(headers.map((h) => truncate(String(row[h] || ''), 100)));
    });

    console.log('\n' + table.toString() + '\n');
    console.log(chalk.gray(`Found ${data.length} result(s)\n`));
  } else if (typeof data === 'object') {
    // Single object - show as key-value pairs
    const table = new Table({
      style: {
        head: [],
        border: ['grey'],
      },
      wordWrap: true,
    });

    Object.entries(data).forEach(([key, value]) => {
      table.push({
        [chalk.cyan(key)]:
          typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
      });
    });

    console.log('\n' + table.toString() + '\n');
  } else {
    console.log('\n' + String(data) + '\n');
  }
}

function formatMarkdown(data: any): void {
  ensureMarkedConfigured();
  let markdown = '';

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(chalk.yellow('\n📭 No results found\n'));
      return;
    }

    // Check if this is compound AI result (has content array with text blocks)
    if (data.length > 0 && data[0].type === 'text' && data[0].text) {
      formatCompoundAI(data);
      return;
    }

    // Create markdown table
    const headers = Object.keys(data[0] || {});
    markdown += '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    data.forEach((row) => {
      markdown += '| ' + headers.map((h) => String(row[h] || '')).join(' | ') + ' |\n';
    });
  } else if (typeof data === 'object') {
    // Check if this is a compound AI response object
    if (data.success !== undefined && data.answer) {
      formatCompoundAIObject(data);
      return;
    }

    // Single object - show as list
    Object.entries(data).forEach(([key, value]) => {
      markdown += `**${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}\n\n`;
    });
  } else {
    markdown = String(data);
  }

  console.log('\n' + marked(markdown) + '\n');
}

function formatCompoundAI(data: any[]): void {
  // Parse the text content to extract JSON
  let result: any = {};

  try {
    // Combine all text blocks
    const textContent = data
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');

    // Try to parse as JSON
    result = JSON.parse(textContent);
  } catch {
    // If not JSON, display as-is
    console.log('\n' + data.map((item) => item.text).join('\n') + '\n');
    return;
  }

  formatCompoundAIObject(result);
}

function formatCompoundAIObject(result: any): void {
  ensureMarkedConfigured();

  // Display blue gradient ASCII art header
  const asciiArt = gradient(['#0ea5e9', '#3b82f6', '#6366f1']).multiline(`
 ██████╗  ███████╗██████╗  ██████╗ ███████╗██╗██╗   ██╗███╗   ███╗
 ██╔══██╗ ██╔════╝██╔══██╗██╔═══██╗██╔════╝██║██║   ██║████╗ ████║
 ██║  ██║ █████╗  ██████╔╝██║   ██║███████╗██║██║   ██║██╔████╔██║
 ██║  ██║ ██╔══╝  ██╔═══╝ ██║   ██║╚════██║██║██║   ██║██║╚██╔╝██║
 ██████╔╝ ███████╗██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚═╝ ██║
 ╚═════╝  ╚══════╝╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝     ╚═╝
`);

  console.log(asciiArt);
  console.log('\n' + divider('AI Analysis Result', 'double') + '\n');

  // Display status in a nice box
  const statusType = result.success ? 'success' : 'error';
  const statusMessage = result.success ? 'Analysis completed successfully' : 'Analysis failed';
  console.log(createInfoBox('Status', statusMessage, statusType));

  // Display the main answer with enhanced formatting
  if (result.answer) {
    console.log(chalk.bold.cyan('📝 Answer:\n'));
    // Strip HTML tags and convert to plain text
    const plainText = stripHtmlTags(result.answer);

    // Display in a subtle box
    console.log(boxen(plainText, {
      padding: 1,
      margin: { top: 0, right: 0, bottom: 1, left: 2 },
      borderStyle: 'round',
      borderColor: 'cyan',
      dimBorder: true,
    }));
  }

  // Display metadata with visual metrics
  console.log('\n' + divider('Analysis Metadata', 'light') + '\n');

  if (result.confidence !== undefined) {
    const confidencePercent = (result.confidence * 100);
    displayMetricBar('Confidence', confidencePercent, 100, '%');
  }

  if (result.model_used) {
    console.log(`${chalk.cyan('🤖 Model:'.padEnd(22))} ${chalk.white(result.model_used)}`);
  }

  if (result.tools_used && result.tools_used.length > 0) {
    console.log(`${chalk.cyan('🔧 Tools Used:'.padEnd(22))} ${chalk.white(result.tools_used.join(', '))}`);
  } else {
    console.log(`${chalk.cyan('🔧 Tools Used:'.padEnd(22))} ${chalk.gray('None')}`);
  }

  if (result.tokens_used) {
    console.log(`${chalk.cyan('🎯 Tokens:'.padEnd(22))} ${chalk.white(result.tokens_used.toLocaleString())}`);
  }

  if (result.execution_time_ms) {
    const timeStr =
      result.execution_time_ms >= 1000
        ? `${(result.execution_time_ms / 1000).toFixed(2)}s`
        : `${result.execution_time_ms}ms`;
    console.log(`${chalk.cyan('⚡ Execution Time:'.padEnd(22))} ${chalk.white(timeStr)}`);
  }

  // Display reasoning if available
  if (result.reasoning && result.reasoning !== result.answer) {
    console.log('\n' + divider('Reasoning Process', 'light') + '\n');
    console.log(chalk.gray(result.reasoning));
  }

  console.log('\n' + divider('', 'double') + '\n');
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// Enhanced UI Utilities
// ============================================================================

/**
 * Create a fancy title box with blue gradient text
 */
export function createTitleBox(title: string, subtitle?: string): string {
  // Blue gradient from cyan to deep blue
  const gradientTitle = gradient(['#0ea5e9', '#3b82f6', '#6366f1']).multiline(title);
  let content = gradientTitle;

  if (subtitle) {
    content += '\n' + chalk.gray(subtitle);
  }

  return boxen(content, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    backgroundColor: '#000000',
  });
}

/**
 * Create an info box with custom styling
 */
export function createInfoBox(title: string, content: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): string {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const colors = {
    info: 'cyan',
    success: 'green',
    warning: 'yellow',
    error: 'red',
  };

  const icon = icons[type];
  const color = colors[type] as 'cyan' | 'green' | 'yellow' | 'red';

  return boxen(`${icon}  ${chalk.bold(title)}\n\n${content}`, {
    padding: 1,
    margin: { top: 0, right: 0, bottom: 1, left: 0 },
    borderStyle: 'round',
    borderColor: color,
  });
}

/**
 * Create a progress bar for long operations
 */
export function createProgressBar(total: number, initialValue: number = 0): cliProgress.SingleBar {
  return new cliProgress.SingleBar({
    format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | {status}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  }, cliProgress.Presets.shades_classic);
}

/**
 * Display a visual metric with bar representation
 */
export function displayMetricBar(label: string, value: number, max: number, unit: string = ''): void {
  const percentage = Math.min(100, (value / max) * 100);
  const barLength = 30;
  const filledLength = Math.round((percentage / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  // Color based on percentage
  let coloredBar: string;
  if (percentage >= 70) {
    coloredBar = chalk.green(bar);
  } else if (percentage >= 40) {
    coloredBar = chalk.yellow(bar);
  } else {
    coloredBar = chalk.red(bar);
  }

  const valueStr = unit ? `${value}${unit}` : value.toString();
  const maxStr = unit ? `${max}${unit}` : max.toString();

  console.log(`${chalk.cyan(label.padEnd(20))} ${coloredBar} ${chalk.white(valueStr)}/${chalk.gray(maxStr)} ${chalk.gray(`(${percentage.toFixed(1)}%)`)}`);
}

/**
 * Display a simple status indicator
 */
export function displayStatus(label: string, status: 'online' | 'offline' | 'degraded' | 'unknown'): void {
  const icons = {
    online: chalk.green('●'),
    offline: chalk.red('●'),
    degraded: chalk.yellow('●'),
    unknown: chalk.gray('●'),
  };

  const labels = {
    online: chalk.green('ONLINE'),
    offline: chalk.red('OFFLINE'),
    degraded: chalk.yellow('DEGRADED'),
    unknown: chalk.gray('UNKNOWN'),
  };

  console.log(`${icons[status]} ${chalk.white(label.padEnd(25))} ${labels[status]}`);
}

/**
 * Create a divider line with optional label
 */
export function divider(label?: string, style: 'light' | 'heavy' | 'double' = 'light'): string {
  const chars = {
    light: '─',
    heavy: '━',
    double: '═',
  };

  const width = 75;
  const char = chars[style];

  if (label) {
    const padding = Math.floor((width - label.length - 4) / 2);
    return chalk.cyan(char.repeat(padding) + `  ${label}  ` + char.repeat(padding));
  }

  return chalk.cyan(char.repeat(width));
}

/**
 * Typewriter effect for text (streaming simulation)
 */
export async function typewriter(text: string, speed: number = 10): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, speed));
  }
  process.stdout.write('\n');
}

/**
 * Format graph data as a tree visualization
 */
export function formatGraphTree(nodes: any[], edges: any[]): void {
  console.log(chalk.bold.cyan('\n🌳 Graph Structure\n'));

  // Build adjacency list
  const adjacencyList: Map<string, string[]> = new Map();
  const nodeMap: Map<string, any> = new Map();

  nodes.forEach(node => {
    const nodeId = node.id || node.node_id || node.name;
    nodeMap.set(nodeId, node);
    if (!adjacencyList.has(nodeId)) {
      adjacencyList.set(nodeId, []);
    }
  });

  edges.forEach(edge => {
    const from = edge.source || edge.from;
    const to = edge.target || edge.to;
    if (!adjacencyList.has(from)) {
      adjacencyList.set(from, []);
    }
    adjacencyList.get(from)?.push(to);
  });

  // Find root nodes (nodes with no incoming edges)
  const hasIncoming = new Set<string>();
  edges.forEach(edge => {
    const to = edge.target || edge.to;
    hasIncoming.add(to);
  });

  const rootNodes = Array.from(adjacencyList.keys()).filter(id => !hasIncoming.has(id));

  // If no clear roots, use all nodes with outgoing edges
  const nodesToDisplay = rootNodes.length > 0 ? rootNodes : Array.from(adjacencyList.keys()).slice(0, 5);

  // Display tree for each root
  const visited = new Set<string>();
  nodesToDisplay.forEach((rootId, index) => {
    if (index > 0) console.log('');
    displayTreeNode(rootId, nodeMap, adjacencyList, '', true, visited);
  });

  console.log('');
}

/**
 * Recursively display tree node
 */
function displayTreeNode(
  nodeId: string,
  nodeMap: Map<string, any>,
  adjacencyList: Map<string, string[]>,
  prefix: string,
  isLast: boolean,
  visited: Set<string>
): void {
  if (visited.has(nodeId)) {
    console.log(prefix + (isLast ? '└── ' : '├── ') + chalk.gray(nodeId) + chalk.yellow(' (circular)'));
    return;
  }

  visited.add(nodeId);

  const node = nodeMap.get(nodeId);
  const label = node?.label || node?.name || nodeId;
  const nodeType = node?.type || node?.node_type;

  // Display node with color based on type
  let nodeDisplay = label;
  if (nodeType) {
    nodeDisplay += chalk.gray(` (${nodeType})`);
  }

  const connector = isLast ? '└── ' : '├── ';
  console.log(prefix + connector + chalk.cyan(nodeDisplay));

  // Get children
  const children = adjacencyList.get(nodeId) || [];

  // Display children
  children.forEach((childId, index) => {
    const isLastChild = index === children.length - 1;
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    displayTreeNode(childId, nodeMap, adjacencyList, newPrefix, isLastChild, new Set(visited));
  });
}

/**
 * Display a list of items in a compact, visually appealing way
 */
export function displayCompactList(title: string, items: string[], icon: string = '•'): void {
  console.log(chalk.bold.cyan(`\n${title}\n`));
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const connector = isLast ? '└─' : '├─';
    console.log(chalk.gray(connector) + ' ' + chalk.white(icon + ' ' + item));
  });
  console.log('');
}

function stripHtmlTags(html: string): string {
  // Remove HTML tags and decode common entities
  return html
    .replace(
      /<\/?(p|br|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|strong|em|code|pre)[^>]*>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g, '') // Remove any remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines to double
    .trim();
}

export function formatError(error: any): void {
  console.error(chalk.red('\n❌ Error:\n'));

  if (error.response) {
    console.error(chalk.yellow('Status:'), error.response.status);
    console.error(chalk.yellow('Message:'), error.response.data?.message || error.message);
  } else {
    console.error(error.message);
  }

  console.error('');
}
