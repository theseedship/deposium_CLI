/**
 * Programmatic entry point for `@deposium/cli`.
 *
 * Re-exports the public SDK surface so consumers can do:
 *
 *   ```typescript
 *   import { MCPClient, MCPAuthError } from '@deposium/cli';
 *   ```
 *
 * The CLI binary entry is `dist/cli.js` (registered via the `bin` field in
 * `package.json`); importing the package does NOT trigger CLI parsing —
 * that side effect lives in `cli.ts` which is no longer the npm `main`.
 *
 * @module index
 */

export { MCPClient } from './client/mcp-client';

// Auth errors — switch on `errorCode` for stable handling.
export { MCPAuthError } from './client/auth-error';
export type { MCPAuthErrorCode } from './client/auth-error';

// Core MCP types
export type {
  MCPToolCall,
  MCPToolResult,
  MCPTool,
  MCPHealthService,
  MCPHealthResponse,
  MCPClientOptions,
  // SSE event payload types (chat-stream)
  SSEMetadata,
  SSEToolCall,
  SSECitation,
  SSEDone,
  SSEError,
  SSEChatPromptOption,
  SSEChatPrompt,
  ChatStreamOptions,
  AgentResumePayload,
  // Self-service types
  MCPSpace,
  MCPDocument,
  MCPDocumentDetail,
  MCPDocumentPagination,
  MCPApiKey,
  MCPApiKeyCreated,
  MCPApiKeyUsage,
} from './client/types';

// Phase II PR-3 — `deposium validate` types
export type {
  ValidateLevel,
  OnAmbiguousModeValidate,
  ValidateRunStatus,
  ValidateThematicVerdict,
  ValidateFolderVerdict,
  ValidateWaitingFor,
  HitlResponse,
  HitlDecision,
  ValidateToolInput,
  ValidateStartEvent,
  ValidateClassificationEvent,
  ValidateThematicStartEvent,
  ValidateExtractionEvent,
  ValidateVerdictN1Event,
  ValidateThematicCompleteEvent,
  ValidateN1CompleteEvent,
  ValidateN2RuleVerdictEvent,
  ValidateCompleteEvent,
  ValidateFailedEvent,
  ValidateGenericErrorEvent,
  ValidateFormFieldSelect,
  ValidateFormFieldFileUpload,
  ValidateFormFieldText,
  ValidateFormField,
  ValidateChatPrompt,
  ValidateReportJson,
  ValidateEvents,
  ValidateEventName,
  ValidateStreamHandlers,
} from './client/validate-types';
