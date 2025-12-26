/**
 * Tests for src/utils/formatter.ts
 *
 * Tests JSON parsing utilities, output formatting, and UI helpers.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeParseJSON, parseAPIResponse, formatOutput, divider } from '../utils/formatter';

describe('formatter.ts', () => {
  describe('safeParseJSON', () => {
    test('should parse valid JSON objects', () => {
      const result = safeParseJSON<{ key: string }>('{"key": "value"}', '--test');
      expect(result).toEqual({ key: 'value' });
    });

    test('should parse valid JSON arrays', () => {
      const result = safeParseJSON<number[]>('[1, 2, 3]', '--test');
      expect(result).toEqual([1, 2, 3]);
    });

    test('should parse nested JSON', () => {
      const json = '{"nested": {"deep": {"value": 42}}}';
      const result = safeParseJSON<{ nested: { deep: { value: number } } }>(json, '--test');
      expect(result.nested.deep.value).toBe(42);
    });

    test('should throw descriptive error for invalid JSON', () => {
      expect(() => safeParseJSON('not json', '--sources')).toThrow();
      try {
        safeParseJSON('not json', '--sources');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Invalid JSON');
        expect(message).toContain('--sources');
        expect(message).toContain('not json');
      }
    });

    test('should truncate long invalid input in error message', () => {
      const longInput = 'x'.repeat(200);
      try {
        safeParseJSON(longInput, '--data');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('...');
        expect(message.length).toBeLessThan(longInput.length + 100);
      }
    });

    test('should handle empty string', () => {
      expect(() => safeParseJSON('', '--test')).toThrow();
    });

    test('should handle null and undefined as valid JSON', () => {
      expect(safeParseJSON('null', '--test')).toBeNull();
    });
  });

  describe('parseAPIResponse', () => {
    test('should parse JSON string responses', () => {
      const result = parseAPIResponse('{"data": "test"}');
      expect(result).toEqual({ data: 'test' });
    });

    test('should return objects as-is', () => {
      const obj = { data: 'test' };
      const result = parseAPIResponse(obj);
      expect(result).toBe(obj); // Same reference
    });

    test('should return non-JSON strings as-is', () => {
      const text = 'This is plain text';
      const result = parseAPIResponse(text);
      expect(result).toBe(text);
    });

    test('should handle arrays', () => {
      const arr = [1, 2, 3];
      expect(parseAPIResponse(arr)).toBe(arr);
      expect(parseAPIResponse('[1,2,3]')).toEqual([1, 2, 3]);
    });

    test('should handle null and undefined', () => {
      expect(parseAPIResponse(null)).toBeNull();
      expect(parseAPIResponse(undefined)).toBeUndefined();
    });
  });

  describe('formatOutput', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    test('should output JSON format', () => {
      const data = { key: 'value' };
      formatOutput(data, 'json');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(JSON.parse(output)).toEqual(data);
    });

    test('should handle table format for arrays', () => {
      const data = [
        { id: 1, name: 'Test' },
        { id: 2, name: 'Test2' },
      ];
      formatOutput(data, 'table');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('should handle empty arrays', () => {
      formatOutput([], 'table');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('No results');
    });

    test('should default to table format for unknown format', () => {
      const data = { key: 'value' };
      formatOutput(data, 'unknown');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('should handle markdown format', () => {
      const data = '# Test Header\n\nSome content';
      formatOutput(data, 'markdown');

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('divider', () => {
    test('should create light divider without label', () => {
      const result = divider();
      expect(result).toContain('─');
      expect(result.length).toBeGreaterThan(50);
    });

    test('should create divider with label', () => {
      const result = divider('Test');
      expect(result).toContain('Test');
      expect(result).toContain('─');
    });

    test('should create heavy divider', () => {
      const result = divider(undefined, 'heavy');
      expect(result).toContain('━');
    });

    test('should create double divider', () => {
      const result = divider(undefined, 'double');
      expect(result).toContain('═');
    });
  });
});
