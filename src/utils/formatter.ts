import { tr } from './i18n';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { terminalText } from './terminal-text';
import boxen from 'boxen';
import gradient from 'gradient-string';
import { decodeMcpContent } from './mcp-content';

/** Text block from compound AI response */
interface TextBlock {
  type: 'text';
  text: string;
}

/** Compound AI analysis result */
interface CompoundAIResult {
  success: boolean;
  answer?: string;
  confidence?: number;
  model_used?: string;
  tools_used?: string[];
  tokens_used?: number;
  execution_time_ms?: number;
  reasoning?: string;
}

function renderMarkdownText(input: string): string {
  const width = Math.max(20, Math.min(100, process.stdout.columns ?? 80));
  const renderer = new Marked(markedTerminal({ width, reflowText: true }));
  return renderer.parse(terminalText(input), { async: false });
}

export function formatOutput(data: unknown, format: string = 'table'): void {
  if (format.toLowerCase() === 'json') {
    formatJSON(data); // Explicit technical output retains the original response.
    return;
  }
  const decoded = decodeMcpContent(data);
  for (const value of decoded.values) {
    if (format.toLowerCase() === 'markdown') formatMarkdown(value);
    else formatTable(value);
  }
  for (const resource of new Map(
    decoded.resources.map((resource) => [resource.uri, resource])
  ).values()) {
    console.log(tr('\nMCP resource: {0}', resource.uri));
    if (resource.mimeType) console.log(tr('Type: {0}', resource.mimeType));
    console.log(
      tr(
        'This resource requires a compatible MCP app host; no dashboard was opened in this terminal.'
      )
    );
  }
}

function formatJSON(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function formatTable(data: unknown): void {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'total_documents' in data) {
    const labels: Record<string, string> = {
      total_documents: 'Documents',
      total_pages: 'Pages',
      total_folders: 'Folders',
      total_embeddings: 'Embedding vectors',
      total_entities: 'Entities',
      unique_entities: 'Unique entities',
      total_relations: 'Relations',
      total_clusters: 'Clusters',
      has_embeddings: 'Has embedding vectors',
    };
    data = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [labels[key] ? tr(labels[key]) : key, value])
    );
  }
  // Handle different data types
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(chalk.yellow(tr('\n📭 No results found\n')));
      return;
    }

    // Create table with first object's keys as headers
    const headers = Object.keys(data[0] ?? {});
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
    data.forEach((row: Record<string, unknown>) => {
      table.push(headers.map((h) => truncate(String(row[h] ?? ''), 100)));
    });

    console.log('\n' + table.toString() + '\n');
    console.log(chalk.gray(tr('Found {0} result(s)\n', data.length)));
  } else if (data && typeof data === 'object') {
    // Single object - show as key-value pairs
    const table = new Table({
      style: {
        head: [],
        border: ['grey'],
      },
      wordWrap: true,
    });

    Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
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

function formatMarkdown(data: unknown): void {
  let markdown = '';

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(chalk.yellow(tr('\n📭 No results found\n')));
      return;
    }

    // Check if this is compound AI result (has content array with text blocks)
    const first = data[0] as Record<string, unknown>;
    if (data.length > 0 && first.type === 'text' && first.text) {
      formatCompoundAI(data as TextBlock[]);
      return;
    }

    // Create markdown table
    const headers = Object.keys(first || {});
    markdown += '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    data.forEach((row: Record<string, unknown>) => {
      markdown += '| ' + headers.map((h) => String(row[h] ?? '')).join(' | ') + ' |\n';
    });
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Check if this is a compound AI response object
    if (obj.success !== undefined && obj.answer) {
      formatCompoundAIObject(obj as unknown as CompoundAIResult);
      return;
    }

    // Single object - show as list
    Object.entries(obj).forEach(([key, value]) => {
      markdown += `**${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}\n\n`;
    });
  } else {
    markdown = String(data);
  }

  console.log('\n' + renderMarkdownText(markdown) + '\n');
}

function formatCompoundAI(data: TextBlock[]): void {
  // Parse the text content to extract JSON
  let result: CompoundAIResult = { success: false };

  try {
    // Combine all text blocks
    const textContent = data
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');

    // Try to parse as JSON
    result = JSON.parse(textContent) as CompoundAIResult;
  } catch {
    // If not JSON, display as-is
    console.log('\n' + data.map((item) => item.text).join('\n') + '\n');
    return;
  }

  formatCompoundAIObject(result);
}

function formatCompoundAIObject(result: CompoundAIResult): void {
  console.log(chalk.bold.cyan(tr('\nGeneral AI response')));
  console.log(result.success ? 'Response received.' : 'The server reported a failed request.');
  if (result.answer) console.log('\n' + renderMarkdownText(stripHtmlTags(result.answer)));

  const tools = Array.isArray(result.tools_used)
    ? result.tools_used.filter((tool) => typeof tool === 'string')
    : undefined;
  if (result.model_used) console.log(tr('Model (reported): {0}', terminalText(result.model_used)));
  console.log(
    tr(
      'Tools (reported): {0}',
      tools ? terminalText(tools.join(', ')) || tr('none') : tr('not supplied')
    )
  );
  if (!tools?.length)
    console.log(
      chalk.yellow(
        tr(
          'No tool use is attested by this result; it does not establish that your documents were searched.'
        )
      )
    );
  console.log(tr('For questions about files in a space, use Chat from the main menu.'));
  if (typeof result.tokens_used === 'number')
    console.log(tr('Tokens (reported): {0}', result.tokens_used));
  if (typeof result.execution_time_ms === 'number')
    console.log(tr('Server duration (reported): {0} ms', result.execution_time_ms));
  // Confidence and reasoning remain in explicit JSON. Neither is a verified
  // quality score, and raw reasoning is not a useful default user result.
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
export function createInfoBox(
  title: string,
  content: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): string {
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
 * Display a visual metric with bar representation
 */
export function displayMetricBar(
  label: string,
  value: number,
  max: number,
  unit: string = ''
): void {
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

  console.log(
    `${chalk.cyan(label.padEnd(20))} ${coloredBar} ${chalk.white(valueStr)}/${chalk.gray(maxStr)} ${chalk.gray(`(${percentage.toFixed(1)}%)`)}`
  );
}

/**
 * Display a simple status indicator
 */
export function displayStatus(
  label: string,
  status: 'online' | 'offline' | 'degraded' | 'unknown'
): void {
  const icons = {
    online: chalk.green('●'),
    offline: chalk.red('●'),
    degraded: chalk.yellow('●'),
    unknown: chalk.gray('●'),
  };

  const labels = {
    online: chalk.green(tr('ONLINE')),
    offline: chalk.red(tr('OFFLINE')),
    degraded: chalk.yellow(tr('DEGRADED')),
    unknown: chalk.gray(tr('UNKNOWN')),
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

/**
 * Safely parse JSON with descriptive error messages for CLI options
 * @param input - The JSON string to parse
 * @param optionName - The CLI option name for error messages (e.g., '--sources')
 * @returns Parsed JSON object
 * @throws Error with user-friendly message if parsing fails
 */
export function safeParseJSON<T = unknown>(input: string, optionName: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    throw new Error(
      `Invalid JSON for ${optionName}. ` +
        `Please provide valid JSON (e.g., ${optionName} '{"key": "value"}' or ${optionName} '[1, 2, 3]'). ` +
        `Received: ${input.length > 100 ? input.substring(0, 100) + '...' : input}`
    );
  }
}

/**
 * Safely parse JSON from API response content
 * @param content - The content to parse (string or object)
 * @returns Parsed object or the original object if already parsed
 */
export function parseAPIResponse<T = unknown>(content: unknown): T {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content) as T;
    } catch {
      // Return as-is if not valid JSON (could be plain text response)
      return content as T;
    }
  }
  return content as T;
}
