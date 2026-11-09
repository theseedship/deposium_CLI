/** Decode protocol envelopes only; never recursively parse document fields or execute resources. */
export interface McpResource {
  uri: string;
  mimeType?: string;
}

export interface DecodedMcpContent {
  values: unknown[];
  resources: McpResource[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isBlock(value: unknown): value is Record<string, unknown> {
  return (
    record(value) &&
    ['text', 'resource', 'resource_link', 'image', 'audio'].includes(String(value.type))
  );
}

function isEnvelope(value: unknown): value is Record<string, unknown> & { content?: unknown[] } {
  if (
    !record(value) ||
    !Object.keys(value).every((key) =>
      ['content', 'isError', '_meta', 'structuredContent'].includes(key)
    )
  )
    return false;
  if (value.content === undefined) return record(value.structuredContent);
  return Array.isArray(value.content) && value.content.every(isBlock);
}

function visitBlock(
  block: Record<string, unknown>,
  output: DecodedMcpContent,
  visit: (value: unknown, depth: number) => void,
  depth: number
): void {
  if (block.type === 'text' && typeof block.text === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.text);
    } catch {
      output.values.push(block.text);
      return;
    }
    visit(parsed, depth + 1);
    return;
  }
  if (block.type === 'resource' || block.type === 'resource_link') {
    const resource = record(block.resource) ? block.resource : block;
    if (typeof resource.uri !== 'string') throw new Error('MCP resource has no URI.');
    output.resources.push({
      uri: resource.uri,
      mimeType: typeof resource.mimeType === 'string' ? resource.mimeType : undefined,
    });
    return;
  }
  output.values.push(`[${String(block.type)} content requires a compatible MCP client]`);
}

function visitEnvelope(
  envelope: Record<string, unknown> & { content?: unknown[] },
  visit: (value: unknown, depth: number) => void,
  depth: number
): void {
  if (envelope.structuredContent === undefined) {
    visit(envelope.content, depth + 1);
    return;
  }
  visit(envelope.structuredContent, depth + 1);
  for (const block of envelope.content ?? []) {
    if (isBlock(block) && block.type !== 'text') visit(block, depth + 1);
  }
}

/** Unwrap MCP-only envelopes, preserving business fields and separating non-executable resources.
 * Throws for protocol errors, invalid resources, more than 1,000 visited nodes or depth above eight.
 */
export function decodeMcpContent(input: unknown): DecodedMcpContent {
  const output: DecodedMcpContent = { values: [], resources: [] };
  let visited = 0;
  function visit(value: unknown, depth: number): void {
    if (++visited > 1000 || depth > 8) throw new Error('MCP response exceeds decoding limits.');
    if (record(value) && value.isError === true) {
      throw new Error(
        typeof value.message === 'string' ? value.message : 'The MCP tool reported an error.'
      );
    }
    if (Array.isArray(value) && value.length > 0 && value.every(isBlock)) {
      for (const block of value) visit(block, depth + 1);
    } else if (isEnvelope(value)) visitEnvelope(value, visit, depth);
    else if (isBlock(value)) visitBlock(value, output, visit, depth);
    else output.values.push(value);
  }
  visit(input, 0);
  return output;
}

/** Return an actionable message without dumping opaque response objects or stack traces. */
export function mcpErrorMessage(input: unknown): string {
  if (record(input) && typeof input.message === 'string') return input.message;
  if (typeof input === 'string') return input;
  return 'The operation failed. Check authentication, permissions and the selected space.';
}
