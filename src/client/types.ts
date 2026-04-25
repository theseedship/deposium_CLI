/**
 * Shared types for the Deposium MCP client.
 *
 * Re-exported by `mcp-client.ts` so existing imports
 * (`import { MCPTool } from './client/mcp-client'`) keep working.
 *
 * @module client/types
 */

/**
 * Represents a tool call request
 */
export interface MCPToolCall {
  /** Name of the tool to call */
  name: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
}

/**
 * Result returned from a tool call
 */
export interface MCPToolResult {
  /** The response content from the tool */
  content: unknown;
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

/**
 * Description of an available MCP tool
 */
export interface MCPTool {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Tool category (e.g., 'search', 'graph', 'compound') */
  category?: string;
  /** JSON Schema describing the tool's input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * Status information for a Deposium service
 */
export interface MCPHealthService {
  /** Service name */
  name: string;
  /** Current status */
  status: 'healthy' | 'online' | 'offline' | 'degraded' | string;
  /** Response latency in milliseconds */
  latency?: number;
  /** Additional status message */
  message?: string;
}

/**
 * Health check response from the Deposium API
 */
export interface MCPHealthResponse {
  /** Overall system status */
  status: string;
  /** Individual service statuses */
  services?: MCPHealthService[];
  /** API version */
  version?: string;
  /** Timestamp of the health check */
  timestamp?: string;
}

// ============================================================================
// SSE Event Types (matches MCP /api/chat-stream events)
// ============================================================================

/**
 * `metadata` SSE event — emitted once at the start of a chat stream with
 * the resolved intent and routing decision.
 */
export interface SSEMetadata {
  intent: string;
  confidence: number;
  method: 'bed-llm' | 'keywords';
  model: string;
  language: string;
  timestamp: string;
}

/**
 * `tool_call` SSE event — emitted when the agent invokes a tool, both at
 * `started` and `completed` (with duration on completion).
 */
export interface SSEToolCall {
  tool: string;
  status: 'started' | 'completed';
  duration_ms?: number;
}

/**
 * `citation` SSE event — a source document the agent referenced during
 * response generation. Multiple citations may be emitted per turn.
 */
export interface SSECitation {
  document_id: string;
  document_name: string;
  page?: number;
  snippet: string;
  score?: number;
  full_content?: string;
}

/**
 * `done` SSE event — emitted at the end of a stream with totals.
 * Always the last event of a successful stream.
 */
export interface SSEDone {
  total_duration_ms: number;
  tokens_generated?: number;
  tools_called: string[];
}

/**
 * `error` SSE event — non-fatal stream-level error. Streams may continue
 * after an error event. For terminal errors, the connection is closed.
 */
export interface SSEError {
  message: string;
  error?: string;
  code?: string;
}

/**
 * One option for `type='choice'` chat prompts.
 * `value` is what gets sent back to the server in the resume payload.
 */
export interface SSEChatPromptOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * HITL chat_prompt event — emitted when the pipeline pauses for user input
 * (intent disambiguation, step confirmation, scratchpad form, ...).
 *
 * The CLI responds by POSTing to `/api/agent-resume` with
 * `{ correlation_id, response: { value } }` (or `{ values }` for forms),
 * which opens a fresh SSE stream that continues the pipeline.
 */
export interface SSEChatPrompt {
  prompt_id: string;
  type: 'choice' | 'confirm' | 'form';
  title?: string;
  message?: string;
  config?: {
    options?: SSEChatPromptOption[];
    layout?: 'horizontal' | 'vertical';
    fields?: Array<Record<string, unknown>>;
  };
  correlation_id: string;
  waiting_for?: string;
  step_id?: string;
}

/**
 * Options accepted by `MCPClient.chatStream()` and `MCPClient.resumeAgent()`.
 *
 * Only `onToken` is required — everything else is opt-in for the events the
 * caller cares about. Set callbacks default to no-op when not provided.
 */
export interface ChatStreamOptions {
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  spaceIds?: string[];
  documentsOnly?: boolean;
  language?: 'fr' | 'en';
  confidenceThreshold?: number;
  onToken: (token: string) => void;
  onMetadata?: (data: SSEMetadata) => void;
  onCitation?: (data: SSECitation) => void;
  onToolCall?: (data: SSEToolCall) => void;
  onDone?: (data: SSEDone) => void;
  onError?: (data: SSEError) => void;
  onChatPrompt?: (data: SSEChatPrompt) => void;
}

/**
 * Payload accepted by POST /api/agent-resume.
 *
 * - `value`: single-answer choice/confirm response (e.g. `"web_search"`, `"approve"`)
 * - `values`: multi-field form response (e.g. `{ theme: "titre_propriete" }`)
 */
export interface AgentResumePayload {
  value?: string;
  values?: Record<string, string>;
}

/**
 * A workspace ("space") as exposed by `GET /api/spaces`.
 *
 * Spaces are the primary unit of content organization on Deposium —
 * documents, embeddings, graphs, and chat history are all scoped per space.
 */
export interface MCPSpace {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  created_at: string;
}

/**
 * A document/file as listed by `GET /api/v1/documents/`.
 *
 * Documents can be regular files (PDFs, docs, etc.) or "connector" entries
 * representing live data sources (e.g. web search, Notion, etc. — `doc_type`
 * indicates which).
 */
export interface MCPDocument {
  id: number;
  file_name: string;
  mime_type: string;
  size: number;
  doc_type: string;
  doc_status: string;
  num_pages: number;
  characters_count: number;
  keywords?: string[] | null;
  is_private: boolean;
  space_id?: string | null;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Full document detail returned by `GET /api/v1/documents/:id`.
 *
 * Adds storage metadata, search-enablement flags, connector config (when
 * applicable), and the per-call access summary.
 */
export interface MCPDocumentDetail extends MCPDocument {
  search_enabled?: boolean;
  s3_path?: string | null;
  bucket_name?: string | null;
  bucket_path?: string | null;
  file_infos?: Record<string, unknown>;
  _access?: { type: string; can_edit: boolean; can_delete: boolean };
}

/**
 * Pagination envelope returned alongside filtered document lists.
 */
export interface MCPDocumentPagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * An API key as listed by `GET /api/api-keys`.
 *
 * The actual secret is never returned by the list endpoint — only the
 * prefix (first chars), name, and metadata. The full secret is only
 * returned once at creation time (`POST /api/api-keys`).
 */
export interface MCPApiKey {
  id: string;
  name: string;
  prefix?: string;
  scopes?: string[];
  rate_limit_tier?: string;
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string | null;
}

/**
 * Response from `POST /api/api-keys` — includes the full secret which is
 * only returned once. Save it immediately; subsequent reads only return
 * the prefix.
 */
export interface MCPApiKeyCreated extends MCPApiKey {
  /** Full secret — shown ONCE at creation time. Save it. */
  secret?: string;
  key?: string;
}

/**
 * Usage stats for an API key, from `GET /api/api-keys/:id/usage`.
 *
 * The exact shape is server-version-dependent; we expose it as a plain
 * record so callers can inspect whatever the server returns.
 */
export type MCPApiKeyUsage = Record<string, unknown>;

/**
 * Configuration options for MCPClient
 */
export interface MCPClientOptions {
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryBaseDelay?: number;
}
