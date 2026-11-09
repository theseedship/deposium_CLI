import { afterEach, describe, expect, test, vi } from 'vitest';
import { decodeMcpContent } from '../utils/mcp-content';
import { formatOutput } from '../utils/formatter';
const text = (value: unknown) => ({ type: 'text', text: JSON.stringify(value) });
afterEach(() => vi.restoreAllMocks());

describe('MCP protocol content', () => {
  test('extracts the observed nested corpus response, preserving zero and unavailable values', () => {
    const resource = {
      type: 'resource',
      resource: {
        uri: 'ui://corpus',
        mimeType: 'text/html',
        text: '<script>not rendered</script>',
      },
    };
    const payload = { total_documents: 126, total_pages: 0, total_entities: null };
    expect(decodeMcpContent([text({ content: [text(payload)] }), resource])).toEqual({
      values: [payload],
      resources: [{ uri: 'ui://corpus', mimeType: 'text/html' }],
    });
  });
  test('does not parse JSON stored inside business document fields', () => {
    const document = {
      name: 'guide.pdf',
      content: '{"isError":true}',
      snippet: '{"type":"resource"}',
    };
    expect(decodeMcpContent([text(document)]).values).toEqual([document]);
  });
  test('preserves multiple text blocks and ordinary result arrays', () => {
    expect(
      decodeMcpContent([text({ intent: 'search' }), { type: 'text', text: 'Explanation' }]).values
    ).toEqual([{ intent: 'search' }, 'Explanation']);
    expect(decodeMcpContent([{ id: 1 }, { id: 2 }]).values).toEqual([[{ id: 1 }, { id: 2 }]]);
  });
  test('nested error envelopes cannot become a successful answer', () => {
    expect(() =>
      decodeMcpContent([text({ content: [text('unavailable')], isError: true })])
    ).toThrow('reported an error');
  });
  test('bounded recursion rejects deeply nested envelopes', () => {
    let value: unknown = { total_documents: 126 };
    for (let i = 0; i < 12; i++) value = { content: [text(value)] };
    expect(() => decodeMcpContent(value)).toThrow('decoding limits');
  });
  test('empty content and malformed resources are distinguished', () => {
    expect(decodeMcpContent({ content: [] }).values).toEqual([[]]);
    expect(() => decodeMcpContent([{ type: 'resource', resource: {} }])).toThrow('URI');
  });
  test('human display reports metrics and resource requirements, not protocol block counts', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    formatOutput([
      text({ content: [text({ total_documents: 126 })] }),
      {
        type: 'resource',
        resource: { uri: 'ui://health', mimeType: 'text/html', text: 'PRIVATE HTML' },
      },
    ]);
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('126');
    expect(output).toContain('ui://health');
    expect(output).toContain('compatible MCP app host');
    expect(output).not.toContain('Found 2');
    expect(output).not.toContain('PRIVATE HTML');
  });
  test('explicit JSON mode preserves protocol resources and stays parseable', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = [
      text({ documents: 126 }),
      { type: 'resource', resource: { uri: 'ui://health' } },
    ];
    formatOutput(payload, 'JSON');
    expect(JSON.parse(log.mock.calls[0]![0])).toEqual(payload);
    expect(log).toHaveBeenCalledTimes(1);
  });
  test('structured MCP data is not lost or double-counted through its text mirror', () => {
    const payload = { total_documents: 126 };
    expect(
      decodeMcpContent({ structuredContent: payload, content: [text(payload)] }).values
    ).toEqual([payload]);
    expect(decodeMcpContent({ structuredContent: payload }).values).toEqual([payload]);
  });
});
