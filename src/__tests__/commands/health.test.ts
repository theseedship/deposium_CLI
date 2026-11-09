/**
 * Integration tests for health command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions
const mockHealth = vi.fn();
const mockCallTool = vi.fn();
const mockListSpaces = vi.fn();

// Mock modules before importing command
vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    health = mockHealth;
    callTool = mockCallTool;
    listSpaces = mockListSpaces;
  },
}));

vi.mock('../../utils/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue('test-api-key'),
}));

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn().mockReturnValue({}),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
  isInsecureMode: vi.fn().mockReturnValue(false),
}));

import { healthCommand } from '../../commands/health';
import { getConfig } from '../../utils/config';

describe('health command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockHealth.mockClear();
    mockListSpaces.mockClear();
    vi.mocked(getConfig).mockReturnValue({});
    healthCommand.setOptionValue('context', false);
    mockCallTool.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('context JSON distinguishes inaccessible saved scope without changing the raw health contract', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaultSpace: 'revoked',
      apiKey: 'PRIVATE',
      edgeUrl: fixtureUrl('https://edge.example.test'),
    });
    const health = { status: 'healthy', services: [] };
    mockHealth.mockResolvedValue(health);
    mockListSpaces.mockResolvedValue([]);
    await healthCommand.parseAsync(['node', 'test', '--format', 'json', '--context']);
    const result = JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'));
    expect(result.health).toEqual(health);
    expect(result.context.space).toMatchObject({ id: 'revoked', status: 'inaccessible' });
    expect(result.context.edge).toBe('https://edge.example.test');
    expect(JSON.stringify(result.context)).not.toMatch(/PRIVATE|secret|token/);
    expect(mockCallTool).not.toHaveBeenCalled();
  });
  it('context honours verbose details and catalogue failure is reported separately from health', async () => {
    vi.mocked(getConfig).mockReturnValue({ defaultSpace: 'saved' });
    mockHealth.mockResolvedValue({ status: 'healthy' });
    mockListSpaces.mockRejectedValue(new Error('catalogue unavailable'));
    mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: 'details' }] });
    await healthCommand.parseAsync(['node', 'test', '--format', 'json', '--verbose', '--context']);
    const result = JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'));
    expect(result.context.space.status).toBe('unavailable');
    expect(result.details).toEqual([{ type: 'text', text: 'details' }]);
    expect(mockCallTool).toHaveBeenCalledExactlyOnceWith(
      'system_health',
      { verbose: true },
      { spinner: false }
    );
  });
  it('should have correct command configuration', () => {
    expect(healthCommand.name()).toBe('health');
    expect(healthCommand.description()).toContain('health');
  });

  it('should have verbose and format options', () => {
    const optionNames = healthCommand.options.map((o) => o.long);
    expect(optionNames).toContain('--verbose');
    expect(optionNames).toContain('--format');
  });

  it('JSON mode emits only the actual health response', async () => {
    const health = { status: 'healthy', services: [] };
    mockHealth.mockResolvedValue(health);
    await healthCommand.parseAsync(['node', 'test', '--format', 'json']);
    expect(JSON.parse(consoleSpy.mock.calls.map((c) => String(c[0])).join('\n'))).toEqual(health);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('JSON mode keeps failures on stderr and returns nonzero', async () => {
    mockHealth.mockRejectedValue(new Error('Connection refused'));
    await healthCommand.parseAsync(['node', 'test', '--format', 'json']);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should display health status for healthy services', async () => {
    mockHealth.mockResolvedValue({
      status: 'healthy',
      services: [
        { name: 'database', status: 'healthy' },
        { name: 'search', status: 'healthy' },
        { name: 'embeddings', status: 'online' },
      ],
    });

    await healthCommand.parseAsync(['node', 'test']);

    expect(mockHealth).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should display degraded services', async () => {
    mockHealth.mockResolvedValue({
      status: 'degraded',
      services: [
        { name: 'database', status: 'healthy' },
        { name: 'search', status: 'degraded', message: 'High latency detected' },
      ],
    });

    await healthCommand.parseAsync(['node', 'test']);

    expect(mockHealth).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should display offline services', async () => {
    mockHealth.mockResolvedValue({
      status: 'unhealthy',
      services: [
        { name: 'database', status: 'offline' },
        { name: 'search', status: 'healthy' },
      ],
    });

    await healthCommand.parseAsync(['node', 'test']);

    expect(mockHealth).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should call system_health tool when verbose', async () => {
    mockHealth.mockResolvedValue({ status: 'healthy', services: [] });
    mockCallTool.mockResolvedValue({
      content: {
        status: 'healthy',
        uptime: '5d 12h 30m',
        memory: { used: 512, total: 2048 },
        cpu: 25,
      },
      isError: false,
    });

    await healthCommand.parseAsync(['node', 'test', '--verbose']);

    expect(mockCallTool).toHaveBeenCalledWith(
      'system_health',
      { verbose: true },
      expect.any(Object)
    );
  });

  it('should handle connection errors', async () => {
    mockHealth.mockRejectedValue(new Error('Connection refused'));

    await healthCommand.parseAsync(['node', 'test']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle verbose mode errors', async () => {
    mockHealth.mockResolvedValue({ status: 'healthy', services: [] });
    mockCallTool.mockResolvedValue({
      content: 'Internal error',
      isError: true,
    });

    await healthCommand.parseAsync(['node', 'test', '--verbose']);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle empty services array', async () => {
    mockHealth.mockResolvedValue({
      status: 'healthy',
      services: [],
    });

    await healthCommand.parseAsync(['node', 'test']);

    expect(mockHealth).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should handle missing services in response', async () => {
    mockHealth.mockResolvedValue({
      status: 'healthy',
    });

    await healthCommand.parseAsync(['node', 'test']);

    expect(mockHealth).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// Reserved test origins only; construct synthetic credentials at runtime so the
// secret scanner can keep scanning every committed file without an exclusion.
function fixtureUrl(origin: string): string {
  const url = new URL(origin);
  url.username = 'fixture-user';
  url.password = 'fixture-password';
  url.pathname = '/private';
  url.searchParams.set('token', 'fixture-value');
  url.hash = 'fixture-fragment';
  return url.toString();
}
