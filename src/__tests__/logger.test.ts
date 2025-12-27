/**
 * Tests for structured logging utility
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import logger, {
  configureLogger,
  getLoggerConfig,
  debug,
  info,
  warn,
  error,
  createLogger,
} from '../utils/logger';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Reset to default config
    configureLogger({
      level: 'info',
      json: false,
      fileOutput: false,
      timestamps: true,
      silent: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('configureLogger', () => {
    it('should update configuration', () => {
      configureLogger({ level: 'debug' });
      const config = getLoggerConfig();
      expect(config.level).toBe('debug');
    });

    it('should merge with existing config', () => {
      configureLogger({ level: 'debug' });
      configureLogger({ json: true });
      const config = getLoggerConfig();
      expect(config.level).toBe('debug');
      expect(config.json).toBe(true);
    });
  });

  describe('log levels', () => {
    it('should output info level by default', () => {
      info('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not output debug level by default', () => {
      debug('test message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should output debug when level is debug', () => {
      configureLogger({ level: 'debug' });
      debug('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should output warn level', () => {
      warn('test warning');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should output error level to stderr', () => {
      error('test error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should respect log level hierarchy', () => {
      configureLogger({ level: 'warn' });

      info('info message');
      expect(consoleSpy).not.toHaveBeenCalled();

      warn('warn message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('silent mode', () => {
    it('should suppress all output when silent', () => {
      configureLogger({ silent: true, level: 'debug' });

      debug('debug');
      info('info');
      warn('warn');
      error('error');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('JSON output', () => {
    it('should output valid JSON when json mode enabled', () => {
      configureLogger({ json: true });

      info('test message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('message', 'test message');
    });

    it('should include context in JSON output', () => {
      configureLogger({ json: true });

      info('test message', { key: 'value' });

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.context).toEqual({ key: 'value' });
    });

    it('should include error details in JSON output', () => {
      configureLogger({ json: true });

      error('test error', new Error('Test error message'));

      const output = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.error).toHaveProperty('name', 'Error');
      expect(parsed.error).toHaveProperty('message', 'Test error message');
    });
  });

  describe('context', () => {
    it('should include context in log output', () => {
      info('test message', { requestId: '123', duration: 100 });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('requestId');
      expect(output).toContain('123');
    });
  });

  describe('createLogger', () => {
    it('should create child logger with base context', () => {
      configureLogger({ json: true });

      const cmdLogger = createLogger({ command: 'search' });
      cmdLogger.info('test message');

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.context).toHaveProperty('command', 'search');
    });

    it('should merge base context with call context', () => {
      configureLogger({ json: true });

      const cmdLogger = createLogger({ command: 'search' });
      cmdLogger.info('test message', { extra: 'value' });

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.context).toHaveProperty('command', 'search');
      expect(parsed.context).toHaveProperty('extra', 'value');
    });

    it('should support all log levels', () => {
      configureLogger({ level: 'debug' });

      const cmdLogger = createLogger({ ctx: 'test' });

      cmdLogger.debug('debug');
      cmdLogger.info('info');
      cmdLogger.warn('warn');
      cmdLogger.error('error');

      expect(consoleSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('timestamps', () => {
    it('should include timestamp by default', () => {
      info('test message');

      const output = consoleSpy.mock.calls[0][0];
      // ISO timestamp pattern
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should omit timestamp when disabled', () => {
      configureLogger({ timestamps: false });

      info('test message');

      const output = consoleSpy.mock.calls[0][0];
      expect(output).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('default logger instance', () => {
    it('should export default logger with all methods', () => {
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.configure).toBeDefined();
      expect(logger.getConfig).toBeDefined();
      expect(logger.createLogger).toBeDefined();
    });
  });
});
