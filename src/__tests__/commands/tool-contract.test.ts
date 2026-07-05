/**
 * Outbound tool-call contract tests.
 *
 * Root-cause fix from the 2026-07-05 CLI/backend drift audit: prior
 * command tests only asserted mock-call shape with `expect.objectContaining({…})`,
 * which lets extra keys pass silently and misses when a required key
 * (per the backend Zod schema) is missing. That masked 10+ silent
 * bugs across `evaluate`, `corpus`, `files`, and `search` for months.
 *
 * These tests assert the EXACT outbound payload keys per tool against
 * the current backend `input-schemas.ts` contracts (deposium_MCPs).
 * A rename or key-drop on either side surfaces here as a test failure
 * instead of a user-facing silent no-op.
 *
 * Add a new case here every time you wire a command to a new MCP tool.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCallTool = vi.fn();
const mockGetDocument = vi.fn();

vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    callTool = mockCallTool;
    getDocument = mockGetDocument;
  },
}));

vi.mock('../../utils/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue('test-api-key'),
}));

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn().mockReturnValue({ defaultTenant: 't1', defaultSpace: 's1' }),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
  isInsecureMode: vi.fn().mockReturnValue(false),
}));

import { evaluateCommand } from '../../commands/evaluate';
import { corpusCommand } from '../../commands/corpus';
import { searchCommand } from '../../commands/search';

/** Assert the exact payload — no extra keys, no missing keys. */
function expectExactPayload(toolName: string, payload: Record<string, unknown>): void {
  expect(mockCallTool).toHaveBeenCalledTimes(1);
  const [actualTool, actualPayload] = mockCallTool.mock.calls[0];
  expect(actualTool).toBe(toolName);
  expect(actualPayload).toEqual(payload);
}

describe('MCP tool contract — outbound payloads', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockCallTool.mockReset();
    mockCallTool.mockResolvedValue({ content: {}, isError: false });
    mockGetDocument.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // evaluate
  // ==========================================================================

  it('eval metrics — camelCase userId/includeGlobal (evalMetricsSchema)', async () => {
    await evaluateCommand.parseAsync([
      'node',
      'test',
      'metrics',
      '--user-id',
      'u-42',
      '--include-global',
      '--silent',
    ]);
    expectExactPayload('eval_metrics', {
      userId: 'u-42',
      includeGlobal: true,
    });
  });

  it('eval dashboard — camelCase userId/timeRange (evalDashboardSchema)', async () => {
    await evaluateCommand.parseAsync([
      'node',
      'test',
      'dashboard',
      '--user-id',
      'u-42',
      '--time-range',
      '7d',
      '--silent',
    ]);
    expectExactPayload('eval_dashboard', {
      userId: 'u-42',
      timeRange: '7d',
    });
  });

  it('eval feedback — camelCase queryId/userId (evalFeedbackSchema)', async () => {
    await evaluateCommand.parseAsync([
      'node',
      'test',
      'feedback',
      '--query-id',
      'q-1',
      '--user-id',
      'u-42',
      '--score',
      '0.9',
      '--feedback',
      'good',
      '--silent',
    ]);
    expectExactPayload('eval_feedback', {
      queryId: 'q-1',
      userId: 'u-42',
      score: 0.9,
      feedback: 'good',
    });
  });

  it('eval code — targets evaluate_code (E2B), not analyze_code (Greptile)', async () => {
    await evaluateCommand.parseAsync([
      'node',
      'test',
      'code',
      'print("hi")',
      '--language',
      'python',
      '--timeout',
      '5000',
      '--silent',
    ]);
    expectExactPayload('evaluate_code', {
      code: 'print("hi")',
      language: 'python',
      timeout: 5000,
    });
  });

  // ==========================================================================
  // corpus
  // ==========================================================================

  it('corpus evaluate — metrics is an array, not singular (corpusEvaluateSchema)', async () => {
    await corpusCommand.parseAsync(['node', 'test', 'evaluate', '--metric', 'faithfulness']);
    expectExactPayload('corpus_evaluate', {
      tenant_id: 't1',
      space_id: 's1',
      metrics: ['faithfulness'],
    });
  });

  it('corpus improve — improvement_type required, no `focus` (corpusImproveSchema)', async () => {
    await corpusCommand.parseAsync(['node', 'test', 'improve', '--type', 'add_missing_topics']);
    expectExactPayload('corpus_improve', {
      tenant_id: 't1',
      space_id: 's1',
      improvement_type: 'add_missing_topics',
      evaluation_results: {},
    });
  });

  it('corpus monitor — action required, key is alert_threshold (corpusMonitorSchema)', async () => {
    await corpusCommand.parseAsync([
      'node',
      'test',
      'monitor',
      '--action',
      'start',
      '--threshold',
      '0.6',
    ]);
    expectExactPayload('corpus_monitor', {
      tenant_id: 't1',
      space_id: 's1',
      action: 'start',
      alert_threshold: 0.6,
    });
  });

  it('corpus drift — sends baseline_date + sensitivity (corpusDriftSchema)', async () => {
    await corpusCommand.parseAsync([
      'node',
      'test',
      'drift',
      '--time-window',
      '30',
      '--sensitivity',
      'high',
    ]);
    expect(mockCallTool).toHaveBeenCalledTimes(1);
    const [tool, payload] = mockCallTool.mock.calls[0];
    expect(tool).toBe('corpus_drift');
    const p = payload as Record<string, unknown>;
    expect(p.tenant_id).toBe('t1');
    expect(p.space_id).toBe('s1');
    expect(p.sensitivity).toBe('high');
    // baseline_date is derived from `now` and thus non-deterministic to
    // the millisecond — assert shape + rough range instead.
    expect(typeof p.baseline_date).toBe('string');
    expect(p.baseline_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No stray `time_window_days` key.
    expect(p).not.toHaveProperty('time_window_days');
  });

  // ==========================================================================
  // search
  // ==========================================================================

  it('search default — search_hub without use_fts/use_fuzzy (searchHubSchema)', async () => {
    await searchCommand.parseAsync(['node', 'test', 'find things', '--silent']);
    expectExactPayload('search_hub', {
      tenant_id: 't1',
      space_id: 's1',
      query_text: 'find things',
      use_vector_rel: true,
      use_graph: false,
      top_k: 10,
    });
  });

  it('search --fts — routes to search_bm25_ranked (searchBm25RankedSchema)', async () => {
    await searchCommand.parseAsync(['node', 'test', 'find things', '--fts', '--silent']);
    expectExactPayload('search_bm25_ranked', {
      tenant_id: 't1',
      space_id: 's1',
      query: 'find things',
      top_k: 10,
    });
  });
});
