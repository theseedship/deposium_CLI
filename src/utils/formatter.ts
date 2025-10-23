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

    // Create markdown table
    const headers = Object.keys(data[0] || {});
    markdown += '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    data.forEach((row) => {
      markdown += '| ' + headers.map((h) => String(row[h] || '')).join(' | ') + ' |\n';
    });
  } else if (typeof data === 'object') {
    // Single object - show as list
    Object.entries(data).forEach(([key, value]) => {
      markdown += `**${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}\n\n`;
    });
  } else {
    markdown = String(data);
  }

  console.log('\n' + marked(markdown) + '\n');
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
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
