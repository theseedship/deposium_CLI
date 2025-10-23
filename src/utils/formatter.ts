import chalk from 'chalk';
import Table from 'cli-table3';
import { marked } from 'marked';
import markedTerminal from 'marked-terminal';

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

  // Display ASCII art "D" in blue
  const asciiArt = chalk.blue(`
 ██████╗  ███████╗██████╗  ██████╗ ███████╗██╗██╗   ██╗███╗   ███╗
 ██╔══██╗ ██╔════╝██╔══██╗██╔═══██╗██╔════╝██║██║   ██║████╗ ████║
 ██║  ██║ █████╗  ██████╔╝██║   ██║███████╗██║██║   ██║██╔████╔██║
 ██║  ██║ ██╔══╝  ██╔═══╝ ██║   ██║╚════██║██║██║   ██║██║╚██╔╝██║
 ██████╔╝ ███████╗██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚═╝ ██║
 ╚═════╝  ╚══════╝╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝     ╚═╝
`);

  console.log(asciiArt);
  console.log(
    chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  );

  // Display status
  if (result.success) {
    console.log(chalk.green('✅ Status: ') + chalk.bold('Success\n'));
  } else {
    console.log(chalk.red('❌ Status: ') + chalk.bold('Failed\n'));
  }

  // Display the main answer
  if (result.answer) {
    console.log(chalk.bold.cyan('📝 Answer:\n'));
    // Strip HTML tags and convert to plain text
    const plainText = stripHtmlTags(result.answer);
    console.log(plainText);
  }

  // Display metadata in a nice box
  console.log(
    chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  );
  console.log(chalk.bold('📊 Analysis Metadata\n'));

  const metadataTable = new Table({
    style: {
      head: [],
      border: ['cyan'],
    },
    chars: {
      top: '═',
      'top-mid': '╤',
      'top-left': '╔',
      'top-right': '╗',
      bottom: '═',
      'bottom-mid': '╧',
      'bottom-left': '╚',
      'bottom-right': '╝',
      left: '║',
      'left-mid': '╟',
      mid: '─',
      'mid-mid': '┼',
      right: '║',
      'right-mid': '╢',
      middle: '│',
    },
  });

  if (result.model_used) {
    metadataTable.push([chalk.cyan('🤖 Model'), chalk.white(result.model_used)]);
  }

  if (result.confidence !== undefined) {
    const confidencePercent = (result.confidence * 100).toFixed(1);
    const confidenceColor =
      result.confidence >= 0.7 ? chalk.green : result.confidence >= 0.4 ? chalk.yellow : chalk.red;
    metadataTable.push([chalk.cyan('📈 Confidence'), confidenceColor(`${confidencePercent}%`)]);
  }

  if (result.tools_used && result.tools_used.length > 0) {
    metadataTable.push([chalk.cyan('🔧 Tools Used'), chalk.white(result.tools_used.join(', '))]);
  } else {
    metadataTable.push([chalk.cyan('🔧 Tools Used'), chalk.gray('None')]);
  }

  if (result.tokens_used) {
    metadataTable.push([chalk.cyan('🎯 Tokens'), chalk.white(result.tokens_used.toLocaleString())]);
  }

  if (result.execution_time_ms) {
    const timeStr =
      result.execution_time_ms >= 1000
        ? `${(result.execution_time_ms / 1000).toFixed(2)}s`
        : `${result.execution_time_ms}ms`;
    metadataTable.push([chalk.cyan('⚡ Execution Time'), chalk.white(timeStr)]);
  }

  console.log(metadataTable.toString());

  // Display reasoning if available
  if (result.reasoning && result.reasoning !== result.answer) {
    console.log(chalk.bold.cyan('\n💭 Reasoning:\n'));
    console.log(chalk.gray(result.reasoning));
  }

  console.log(
    chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  );
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
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
