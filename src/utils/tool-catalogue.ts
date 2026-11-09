import { menuPageSize } from './menu-layout';
import { tr } from './i18n';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { MCPClient, MCPTool } from '../client/mcp-client';
import { terminalText as text } from './terminal-text';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function printParameter(name: string, value: unknown, required: boolean): void {
  const definition = record(value) ? value : {};
  const type = Array.isArray(definition.type)
    ? definition.type.map(text).filter(Boolean).join(' | ')
    : text(definition.type);
  console.log(
    `\n  ${text(name)} — ${required ? tr('required') : tr('optional')} (${type || 'schema-defined'})`
  );
  if (text(definition.description)) console.log(`  ${text(definition.description)}`);
  if (Array.isArray(definition.enum))
    console.log(tr('  Allowed values: {0}', text(JSON.stringify(definition.enum))));
  if (Object.hasOwn(definition, 'default'))
    console.log(tr('  Server schema default: {0}', text(JSON.stringify(definition.default))));
  if (text(definition.$ref)) console.log(tr('  Schema reference: {0}', text(definition.$ref)));
}

/** Read the complete server description and top-level parameters without executing the tool. */
export function printToolDetail(tool: MCPTool): void {
  console.log(chalk.bold.cyan(`\n${text(tool.name)}`));
  if (text(tool.category)) console.log(tr('Category: {0}', text(tool.category)));
  console.log(text(tool.description).trim() || tr('The server supplied no description.'));
  console.log(chalk.bold(tr('\nInput parameters (reported by the server):')));
  if (!record(tool.inputSchema)) {
    console.log(tr('The server supplied no input schema.'));
  } else {
    const schema = tool.inputSchema;
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    if (record(schema.properties) && Object.keys(schema.properties).length) {
      for (const [name, definition] of Object.entries(schema.properties))
        printParameter(name, definition, required.has(name));
    } else console.log(tr('No top-level parameter definitions were supplied.'));
    console.log(
      tr(
        '\nThis is a top-level summary. Conditional and nested requirements remain in the complete schema.'
      )
    );
  }
  console.log(
    tr('\nComplete catalogue entry and schema: deposium tools --show <tool-name> --json')
  );
  console.log(
    tr(
      'Reference only: this view does not run the tool. Its description is not a live execution or permissions check.'
    )
  );
}

/** Browse one server catalogue locally; selecting a tool only displays its reference. */
export async function browseToolCatalogue(client: Pick<MCPClient, 'listTools'>): Promise<void> {
  const tools = await client.listTools();
  if (!tools.length) {
    console.log(tr('The server returned an empty tool catalogue.'));
    return;
  }
  console.log(
    tr('\nChoose a tool to read its full description and input parameters. No tool is run.')
  );
  while (true) {
    const { toolIndex } = await inquirer.prompt<{ toolIndex: number }>([
      {
        type: 'select',
        name: 'toolIndex',
        pageSize: menuPageSize(tools.length + 1, 'catalogue'),
        loop: false,
        message: tr('Inspect which tool?'),
        choices: [
          ...tools.map((tool, index) => ({
            name: text(tool.name).replace(/\s+/g, ' '),
            value: index,
          })),
          { name: tr('Back to the main menu'), value: -1 },
        ],
      },
    ]);
    if (toolIndex === -1) return;
    const tool = tools[toolIndex];
    if (!Number.isInteger(toolIndex) || !tool) throw new Error('Invalid catalogue selection.');
    printToolDetail(tool);
  }
}
