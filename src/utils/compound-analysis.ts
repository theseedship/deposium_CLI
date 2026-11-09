import type { MCPClient } from '../client/mcp-client';
import { ChatHistory } from './chat-history';
import { decodeMcpContent, mcpErrorMessage } from './mcp-content';

/** Shared direct-command/menu contract: prior context only, optional text, successful exchanges only. */
export async function runCompoundAnalysis(
  client: Pick<MCPClient, 'callTool'>,
  history: ChatHistory,
  query: string
): Promise<unknown> {
  const context = history.getContext(6);
  const result = await client.callTool(
    'compound_analyze',
    { query, ...(context ? { context } : {}) },
    { spinner: true }
  );
  if (result.isError) throw new Error(mcpErrorMessage(result.content));
  const decoded = decodeMcpContent(result.content);
  for (const value of decoded.values) {
    if (value && typeof value === 'object' && 'success' in value && value.success === false) {
      throw new Error(mcpErrorMessage(value));
    }
  }
  const text = decoded.values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && 'answer' in value) return String(value.answer);
      return JSON.stringify(value);
    })
    .join('\n');
  history.addUserMessage(query);
  history.addAssistantMessage(text);
  return result.content;
}
