import { afterEach, expect, test, vi } from 'vitest';
import inquirer from 'inquirer';
import { browseToolCatalogue, printToolDetail } from '../utils/tool-catalogue';
import type { MCPTool } from '../client/mcp-client';

vi.mock('inquirer', () => ({ default: { prompt: vi.fn() } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const tool: MCPTool = {
  name: 'deposium_documents',
  description: `${'Long server description. '.repeat(15)}\nFINAL OPERATION INSTRUCTIONS`,
  inputSchema: {
    type: 'object',
    required: ['operation', 'space_id'],
    properties: {
      operation: { type: 'string', enum: ['count', 'list'], description: 'Choose count or list.' },
      space_id: { type: 'string', description: 'An authorized space.' },
      details: { type: 'boolean', default: false },
      limit: { type: 'integer', default: 0 },
      options: { $ref: '#/$defs/options' },
    },
  },
};

function output() {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => spy.mock.calls.flat().join('\n');
}

test('the complete description and reported parameter requirements remain readable', () => {
  const out = output();
  printToolDetail(tool);
  expect(out()).toContain(tool.description);
  expect(out()).toContain('FINAL OPERATION INSTRUCTIONS');
  expect(out()).toContain('operation — required (string)');
  expect(out()).toContain('details — optional (boolean)');
  expect(out()).toContain('["count","list"]');
  expect(out()).toContain('Server schema default: false');
  expect(out()).toContain('Server schema default: 0');
  expect(out()).toContain('Schema reference: #/$defs/options');
  expect(out()).toContain('Conditional and nested requirements');
});

test('missing schema metadata is stated without inventing parameters or execution guarantees', () => {
  const out = output();
  printToolDetail({ name: 'unknown' });
  expect(out()).toContain('no description');
  expect(out()).toContain('no input schema');
  expect(out()).toContain('not a live execution or permissions check');
});

test('server descriptions, names and parameter values cannot emit terminal controls', () => {
  const out = output();
  printToolDetail({
    name: '\x1b]52;c;AAAA\x07tool',
    description: '\x1b[2JDescription\x07',
    inputSchema: { properties: { '\x1b[2Jparam': { type: 'string', description: '\x1b[2JHelp' } } },
  });
  expect(out()).not.toContain('\x1b');
  expect(out()).not.toContain('\x07');
  expect(out()).not.toContain('AAAA');
  expect(out()).toContain('Description');
});

test('interactive inspection reads one catalogue, shows the selected entry and returns without execution', async () => {
  const out = output();
  const client = { listTools: vi.fn().mockResolvedValue([tool]), callTool: vi.fn() };
  vi.mocked(inquirer.prompt)
    .mockResolvedValueOnce({ toolIndex: 0 })
    .mockResolvedValueOnce({ toolIndex: -1 });
  await browseToolCatalogue(client);
  expect(client.listTools).toHaveBeenCalledOnce();
  expect(client.callTool).not.toHaveBeenCalled();
  expect(out()).toContain('FINAL OPERATION INSTRUCTIONS');
  expect(out()).toContain('No tool is run.');
});

test('empty and failed catalogues remain distinct and never offer a fictitious selection', async () => {
  const out = output();
  await browseToolCatalogue({ listTools: vi.fn().mockResolvedValue([]) });
  expect(out()).toContain('empty tool catalogue');
  await expect(
    browseToolCatalogue({ listTools: vi.fn().mockRejectedValue(new Error('offline')) })
  ).rejects.toThrow('offline');
  expect(inquirer.prompt).not.toHaveBeenCalled();
});
