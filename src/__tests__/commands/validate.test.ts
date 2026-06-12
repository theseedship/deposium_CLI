/**
 * Tests for src/commands/validate.ts — arg parsing + integration with
 * MCPClient.validateDossier (mocked).
 *
 * Coverage:
 *   - parseLevel (1, 2, both, invalid)
 *   - parseOnAmbiguous (3 modes accepted, pick-first rejected, TTY default)
 *   - parseLanguage (fr/en accepted, others rejected)
 *   - Command action wires input correctly to validateDossier
 *   - --json mode triggers fetchValidateReport + JSON stdout
 *   - status=failed exits 1 (non-JSON path)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('chalk', () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

vi.mock('../../utils/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue('dep_live_test'),
}));

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn(() => ({})),
  getBaseUrl: vi.fn(() => 'http://localhost:3000'),
  // initializeCommand also reads `isInsecureMode()` to pass to getBaseUrl.
  isInsecureMode: vi.fn(() => false),
}));

const { validateDossierMock, fetchValidateReportMock } = vi.hoisted(() => ({
  validateDossierMock: vi.fn(),
  fetchValidateReportMock: vi.fn(),
}));

vi.mock('../../client/mcp-client', async () => {
  const actual =
    await vi.importActual<typeof import('../../client/mcp-client')>('../../client/mcp-client');
  // Use a real class so `new MCPClient(...)` works — vi.fn() with an arrow
  // implementation isn't constructible.
  class MockMCPClient {
    validateDossier = validateDossierMock;
    fetchValidateReport = fetchValidateReportMock;
  }
  return {
    ...actual,
    MCPClient: MockMCPClient,
  };
});

import {
  parseLevel,
  parseOnAmbiguous,
  parseLanguage,
  validateCommand,
} from '../../commands/validate';

describe('parseLevel', () => {
  test.each([
    ['1', 1],
    ['2', 2],
    ['both', 'both' as const],
  ])("'%s' parses to %s", (input, expected) => {
    expect(parseLevel(input)).toBe(expected);
  });

  test('rejects unknown level with explicit error', () => {
    expect(() => parseLevel('3')).toThrow(/Invalid --level value: '3'/);
  });
});

describe('parseOnAmbiguous', () => {
  test.each([['prompt' as const], ['fail' as const], ['dump' as const]])(
    "'%s' is accepted",
    (mode) => {
      expect(parseOnAmbiguous(mode)).toBe(mode);
    }
  );

  test('pick-first is rejected (chat-only — validate emits only form prompts)', () => {
    expect(() => parseOnAmbiguous('pick-first')).toThrow(/pick-first is chat-only/);
  });

  test('default is TTY-aware (prompt in TTY, fail otherwise)', () => {
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    expect(parseOnAmbiguous(undefined)).toBe('prompt');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    expect(parseOnAmbiguous(undefined)).toBe('fail');
    Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
  });

  test('--json forces fail by default even in a TTY (M4 regression)', () => {
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    expect(parseOnAmbiguous(undefined, { json: true })).toBe('fail');
    Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
  });

  test('--json + explicit --on-ambiguous=prompt is rejected (M4 regression)', () => {
    expect(() => parseOnAmbiguous('prompt', { json: true })).toThrow(/incompatible with --json/);
  });

  test('--json + explicit --on-ambiguous=dump is accepted', () => {
    expect(parseOnAmbiguous('dump', { json: true })).toBe('dump');
  });
});

describe('parseLanguage', () => {
  test('fr / en accepted', () => {
    expect(parseLanguage('fr')).toBe('fr');
    expect(parseLanguage('en')).toBe('en');
  });

  test('undefined returns undefined (server picks default)', () => {
    expect(parseLanguage(undefined)).toBeUndefined();
  });

  test('rejects unknown languages', () => {
    expect(() => parseLanguage('de')).toThrow(/Invalid --language value: 'de'/);
  });
});

describe('validateCommand action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Force TTY so default --on-ambiguous = 'prompt' for predictability.
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Run a parsed command with the provided argv. Bypasses the global
   * commander program by parseAsync()-ing on a fresh test program rooted
   * at validateCommand.
   */
  async function runCommand(argv: string[]): Promise<void> {
    // commander's parseAsync expects ['node', 'script', ...args]
    await validateCommand.parseAsync(['node', 'validate', ...argv]);
  }

  test('forwards dossier_id, level, on-ambiguous, language to validateDossier', async () => {
    validateDossierMock.mockResolvedValueOnce({ run_id: 'r1', status: 'complete' });

    await runCommand(['d-uuid-1', '--level', 'both', '--on-ambiguous', 'fail', '--language', 'en']);

    expect(validateDossierMock).toHaveBeenCalledOnce();
    const [input] = validateDossierMock.mock.calls[0];
    expect(input).toEqual({
      dossier_id: 'd-uuid-1',
      level: 'both',
      on_ambiguity: 'fail',
      language: 'en',
    });
  });

  test('--run-id forwards as run_id (resume an existing run)', async () => {
    validateDossierMock.mockResolvedValueOnce({ run_id: 'r1', status: 'complete' });

    await runCommand(['d-1', '--run-id', 'existing-run-uuid']);

    const [input] = validateDossierMock.mock.calls[0];
    expect(input.run_id).toBe('existing-run-uuid');
  });

  test('--json mode: fetches report and pipes JSON to stdout', async () => {
    validateDossierMock.mockResolvedValueOnce({ run_id: 'rJ', status: 'complete' });
    const fakeReport = { run_id: 'rJ', dossier_id: 'd-1', status: 'complete' };
    fetchValidateReportMock.mockResolvedValueOnce(fakeReport);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCommand(['d-1', '--json']);

    expect(fetchValidateReportMock).toHaveBeenCalledWith('rJ');
    // Find the call whose first arg parses to the report (the only JSON.stringify(...) call).
    const printedBlocks = logSpy.mock.calls.map((c) => c[0] as string);
    const reportPrinted = printedBlocks.some((s) => {
      try {
        return JSON.parse(s).run_id === 'rJ';
      } catch {
        return false;
      }
    });
    expect(reportPrinted).toBe(true);

    logSpy.mockRestore();
  });

  test('non-JSON status=failed exits 1', async () => {
    validateDossierMock.mockResolvedValueOnce({ run_id: 'rF', status: 'failed' });

    const exitError = new Error('__TEST_EXIT__');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });

    await expect(runCommand(['d-1'])).rejects.toBe(exitError);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  test('--json status=failed: prints report AND exits 1 so CI scripts can fail fast', async () => {
    validateDossierMock.mockResolvedValueOnce({ run_id: 'rF', status: 'failed' });
    fetchValidateReportMock.mockResolvedValueOnce({
      run_id: 'rF',
      status: 'failed',
      verdicts: { thematic: {} },
    });

    const exitError = new Error('__TEST_EXIT__');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // The report is printed BEFORE process.exit(1) is called, so the
    // caller still gets the full JSON body on stdout.
    await expect(runCommand(['d-1', '--json'])).rejects.toBe(exitError);
    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(printed).toContain('"status": "failed"');

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
