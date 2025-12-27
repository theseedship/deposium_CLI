/**
 * Integration tests for health command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions
const mockHealth = vi.fn();
const mockCallTool = vi.fn();

// Mock modules before importing command
vi.mock('../../client/mcp-client', () => ({
  MCPClient: class MockMCPClient {
    health = mockHealth;
    callTool = mockCallTool;
  },
}));

vi.mock('../../utils/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue('test-api-key'),
}));

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn().mockReturnValue({}),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
}));

import { healthCommand } from '../../commands/health';

describe('health command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockHealth.mockClear();
    mockCallTool.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
