/**
 * Tests for `parseSSEEvent` in src/client/internals.ts.
 *
 * Per SSE spec (https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation),
 * multiple `data:` lines in one event must be concatenated with `\n`,
 * not overwritten. Tests cover this and other spec-mandated behaviors
 * that previous implementations broke.
 */

import { describe, test, expect } from 'vitest';
import { parseSSEEvent } from '../client/internals';

describe('parseSSEEvent', () => {
  test('single event + single data line', () => {
    expect(parseSSEEvent('event: token\ndata: {"token":"hi"}')).toEqual({
      eventType: 'token',
      dataStr: '{"token":"hi"}',
    });
  });

  test('multiple data: lines concatenated with \\n (spec requirement)', () => {
    const part = 'event: metadata\ndata: {"a":1,\ndata: "b":2}';
    expect(parseSSEEvent(part)).toEqual({
      eventType: 'metadata',
      dataStr: '{"a":1,\n"b":2}',
    });
    // And the result is valid JSON when joined this way
    expect(JSON.parse(parseSSEEvent(part).dataStr)).toEqual({ a: 1, b: 2 });
  });

  test('data: without leading space is accepted (spec: space is optional)', () => {
    expect(parseSSEEvent('event: token\ndata:{"x":1}')).toEqual({
      eventType: 'token',
      dataStr: '{"x":1}',
    });
  });

  test('exactly one leading space is stripped, additional spaces preserved', () => {
    expect(parseSSEEvent('event: t\ndata:   foo').dataStr).toBe('  foo');
  });

  test('SSE comment lines (starting with :) are ignored as heartbeats', () => {
    expect(parseSSEEvent(': heartbeat\nevent: token\n: another comment\ndata: {"x":1}')).toEqual({
      eventType: 'token',
      dataStr: '{"x":1}',
    });
  });

  test('unknown field names are ignored', () => {
    expect(parseSSEEvent('event: t\nid: 42\nretry: 1000\ndata: payload')).toEqual({
      eventType: 't',
      dataStr: 'payload',
    });
  });

  test('event with no data: returns empty dataStr', () => {
    expect(parseSSEEvent('event: ping')).toEqual({ eventType: 'ping', dataStr: '' });
  });

  test('event without event: line returns empty eventType', () => {
    expect(parseSSEEvent('data: orphan')).toEqual({ eventType: '', dataStr: 'orphan' });
  });

  test('lines without a colon are ignored (no NPE)', () => {
    expect(parseSSEEvent('event: t\nmalformed-line\ndata: ok')).toEqual({
      eventType: 't',
      dataStr: 'ok',
    });
  });
});
