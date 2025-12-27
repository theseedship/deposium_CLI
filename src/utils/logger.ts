/**
 * Structured Logging Utility
 *
 * Provides consistent, configurable logging throughout the CLI.
 * Supports multiple log levels, file output, and JSON formatting.
 */

import chalk from 'chalk';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

/** Log levels in order of severity */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured log entry */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/** Logger configuration */
export interface LoggerConfig {
  /** Minimum log level to output (default: 'info') */
  level: LogLevel;
  /** Output logs as JSON (default: false) */
  json: boolean;
  /** Write logs to file (default: false) */
  fileOutput: boolean;
  /** Log file path (default: ~/.deposium/logs/cli.log) */
  filePath: string;
  /** Include timestamps in console output (default: true) */
  timestamps: boolean;
  /** Silent mode - suppress all console output (default: false) */
  silent: boolean;
}

/** Log level numeric values for comparison */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Default log file path */
const DEFAULT_LOG_PATH = join(homedir(), '.deposium', 'logs', 'cli.log');

/** Global logger configuration */
let config: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  json: process.env.LOG_JSON === 'true',
  fileOutput: process.env.LOG_FILE === 'true',
  filePath: process.env.LOG_PATH || DEFAULT_LOG_PATH,
  timestamps: true,
  silent: false,
};

/**
 * Configure the logger
 *
 * @param options - Partial configuration to merge with defaults
 *
 * @example
 * ```typescript
 * configureLogger({ level: 'debug', fileOutput: true });
 * ```
 */
export function configureLogger(options: Partial<LoggerConfig>): void {
  config = { ...config, ...options };
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...config };
}

/**
 * Check if a log level should be output based on current configuration
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

/**
 * Format timestamp for log output
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get colored level string for console output
 */
function getColoredLevel(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return chalk.gray('DEBUG');
    case 'info':
      return chalk.blue('INFO ');
    case 'warn':
      return chalk.yellow('WARN ');
    case 'error':
      return chalk.red('ERROR');
  }
}

/**
 * Get level icon for console output
 */
function getLevelIcon(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return '🔍';
    case 'info':
      return 'ℹ️ ';
    case 'warn':
      return '⚠️ ';
    case 'error':
      return '❌';
  }
}

/**
 * Write log entry to file
 */
function writeToFile(entry: LogEntry): void {
  try {
    const dir = dirname(config.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(config.filePath, JSON.stringify(entry) + '\n');
  } catch {
    // Silently fail file logging to avoid disrupting CLI
  }
}

/**
 * Format and output a log entry
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level) || config.silent) {
    return;
  }

  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(context && { context }),
  };

  // Write to file if enabled
  if (config.fileOutput) {
    writeToFile(entry);
  }

  // Console output
  if (config.json) {
    console.log(JSON.stringify(entry));
  } else {
    const timestamp = config.timestamps ? chalk.gray(`[${entry.timestamp}]`) + ' ' : '';
    const levelStr = getColoredLevel(level);
    const icon = getLevelIcon(level);

    let output = `${timestamp}${icon} ${levelStr} ${message}`;

    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .map(([k, v]) => `${chalk.cyan(k)}=${chalk.white(JSON.stringify(v))}`)
        .join(' ');
      output += ` ${chalk.gray('|')} ${contextStr}`;
    }

    if (level === 'error') {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}

/**
 * Log debug message
 *
 * @param message - Log message
 * @param context - Optional structured context
 *
 * @example
 * ```typescript
 * logger.debug('Processing request', { requestId: '123', method: 'POST' });
 * ```
 */
export function debug(message: string, context?: Record<string, unknown>): void {
  log('debug', message, context);
}

/**
 * Log info message
 *
 * @param message - Log message
 * @param context - Optional structured context
 *
 * @example
 * ```typescript
 * logger.info('Search completed', { results: 10, duration: '150ms' });
 * ```
 */
export function info(message: string, context?: Record<string, unknown>): void {
  log('info', message, context);
}

/**
 * Log warning message
 *
 * @param message - Log message
 * @param context - Optional structured context
 *
 * @example
 * ```typescript
 * logger.warn('Rate limit approaching', { remaining: 10, resetIn: '60s' });
 * ```
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  log('warn', message, context);
}

/**
 * Log error message
 *
 * @param message - Log message
 * @param error - Optional Error object
 * @param context - Optional structured context
 *
 * @example
 * ```typescript
 * logger.error('API call failed', new Error('Connection refused'), { endpoint: '/api/search' });
 * ```
 */
export function error(
  message: string,
  errorObj?: Error | unknown,
  context?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level: 'error',
    message,
    ...(context && { context }),
  };

  if (errorObj instanceof Error) {
    entry.error = {
      name: errorObj.name,
      message: errorObj.message,
      ...(process.env.DEBUG && { stack: errorObj.stack }),
    };
  }

  if (!shouldLog('error') || config.silent) {
    return;
  }

  // Write to file if enabled
  if (config.fileOutput) {
    writeToFile(entry);
  }

  // Console output
  if (config.json) {
    console.error(JSON.stringify(entry));
  } else {
    const timestamp = config.timestamps ? chalk.gray(`[${entry.timestamp}]`) + ' ' : '';
    const levelStr = getColoredLevel('error');
    const icon = getLevelIcon('error');

    let output = `${timestamp}${icon} ${levelStr} ${message}`;

    if (entry.error) {
      output += ` ${chalk.gray('|')} ${chalk.red(entry.error.message)}`;
      if (entry.error.stack && process.env.DEBUG) {
        output += `\n${chalk.gray(entry.error.stack)}`;
      }
    }

    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .map(([k, v]) => `${chalk.cyan(k)}=${chalk.white(JSON.stringify(v))}`)
        .join(' ');
      output += ` ${chalk.gray('|')} ${contextStr}`;
    }

    console.error(output);
  }
}

/**
 * Create a child logger with preset context
 *
 * @param baseContext - Context to include in all log entries
 * @returns Logger functions with preset context
 *
 * @example
 * ```typescript
 * const cmdLogger = createLogger({ command: 'search', requestId: '123' });
 * cmdLogger.info('Starting search');
 * cmdLogger.debug('Query parsed', { tokens: 5 });
 * ```
 */
export function createLogger(baseContext: Record<string, unknown>) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      debug(message, { ...baseContext, ...context }),
    info: (message: string, context?: Record<string, unknown>) =>
      info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: Record<string, unknown>) =>
      warn(message, { ...baseContext, ...context }),
    error: (message: string, errorObj?: Error | unknown, context?: Record<string, unknown>) =>
      error(message, errorObj, { ...baseContext, ...context }),
  };
}

/** Default logger instance */
const logger = {
  debug,
  info,
  warn,
  error,
  configure: configureLogger,
  getConfig: getLoggerConfig,
  createLogger,
};

export default logger;
