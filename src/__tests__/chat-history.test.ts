/**
 * Tests for src/utils/chat-history.ts
 *
 * In-session conversation history shared by `chat` + `compound` commands.
 * Covers: rotation, slice ordering, format conversions, mutation safety,
 * display branches.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('chalk', () => {
  const identity = (s: string) => s;
  return {
    default: {
      bold: identity,
      gray: identity,
      cyan: identity,
      green: identity,
    },
  };
});

import { ChatHistory } from '../utils/chat-history';

describe('ChatHistory', () => {
  let history: ChatHistory;

  beforeEach(() => {
    history = new ChatHistory();
  });

  describe('constructor', () => {
    test('default maxMessages is 10', () => {
      const h = new ChatHistory();
      for (let i = 0; i < 12; i++) h.addUserMessage(`msg ${i}`);
      expect(h.getMessages()).toHaveLength(10);
    });

    test('custom maxMessages respected', () => {
      const h = new ChatHistory(3);
      for (let i = 0; i < 5; i++) h.addUserMessage(`msg ${i}`);
      expect(h.getMessages()).toHaveLength(3);
      expect(h.getMessages()[0].content).toBe('msg 2');
      expect(h.getMessages()[2].content).toBe('msg 4');
    });
  });

  describe('addUserMessage / addAssistantMessage', () => {
    test('user message stored with role=user', () => {
      history.addUserMessage('hello');
      expect(history.getMessages()).toEqual([
        expect.objectContaining({ role: 'user', content: 'hello' }),
      ]);
    });

    test('assistant message stored with role=assistant', () => {
      history.addAssistantMessage('hi back');
      expect(history.getMessages()).toEqual([
        expect.objectContaining({ role: 'assistant', content: 'hi back' }),
      ]);
    });

    test('messages get a timestamp', () => {
      const before = Date.now();
      history.addUserMessage('msg');
      const after = Date.now();
      const ts = history.getMessages()[0].timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    test('alternating roles preserved in order', () => {
      history.addUserMessage('q1');
      history.addAssistantMessage('a1');
      history.addUserMessage('q2');
      const roles = history.getMessages().map((m) => m.role);
      expect(roles).toEqual(['user', 'assistant', 'user']);
    });

    test('rotation drops oldest when exceeding maxMessages', () => {
      const h = new ChatHistory(2);
      h.addUserMessage('a');
      h.addUserMessage('b');
      h.addUserMessage('c');
      const contents = h.getMessages().map((m) => m.content);
      expect(contents).toEqual(['b', 'c']);
    });
  });

  describe('getContext', () => {
    test('returns empty string when no messages', () => {
      expect(history.getContext()).toBe('');
    });

    test('formats single user message with User: prefix', () => {
      history.addUserMessage('hello');
      expect(history.getContext()).toBe('User: hello');
    });

    test('formats assistant message with Assistant: prefix', () => {
      history.addAssistantMessage('reply');
      expect(history.getContext()).toBe('Assistant: reply');
    });

    test('joins messages with double newline', () => {
      history.addUserMessage('q');
      history.addAssistantMessage('a');
      expect(history.getContext()).toBe('User: q\n\nAssistant: a');
    });

    test('default lastN is 6 — drops older messages', () => {
      for (let i = 0; i < 8; i++) history.addUserMessage(`m${i}`);
      const ctx = history.getContext();
      expect(ctx).not.toContain('m0');
      expect(ctx).not.toContain('m1');
      expect(ctx).toContain('m2');
      expect(ctx).toContain('m7');
    });

    test('custom lastN respected', () => {
      for (let i = 0; i < 5; i++) history.addUserMessage(`m${i}`);
      expect(history.getContext(2)).toBe('User: m3\n\nUser: m4');
    });

    test('lastN larger than history returns all', () => {
      history.addUserMessage('only');
      expect(history.getContext(100)).toBe('User: only');
    });
  });

  describe('toConversationHistory', () => {
    test('returns empty array when empty', () => {
      expect(history.toConversationHistory()).toEqual([]);
    });

    test('returns role+content objects (timestamp stripped)', () => {
      history.addUserMessage('q');
      history.addAssistantMessage('a');
      expect(history.toConversationHistory()).toEqual([
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ]);
    });

    test('default lastN is 10', () => {
      for (let i = 0; i < 12; i++) history.addUserMessage(`m${i}`);
      // history already trims to maxMessages=10, so toConversationHistory returns all 10
      expect(history.toConversationHistory()).toHaveLength(10);
    });

    test('custom lastN respected', () => {
      for (let i = 0; i < 5; i++) history.addUserMessage(`m${i}`);
      const result = history.toConversationHistory(2);
      expect(result).toEqual([
        { role: 'user', content: 'm3' },
        { role: 'user', content: 'm4' },
      ]);
    });
  });

  describe('getMessages', () => {
    test('returns a copy — mutating result does not affect history', () => {
      history.addUserMessage('q');
      const messages = history.getMessages();
      messages.push({ role: 'user', content: 'injected', timestamp: Date.now() });
      expect(history.getMessages()).toHaveLength(1);
    });
  });

  describe('clear', () => {
    test('empties the history', () => {
      history.addUserMessage('q');
      history.addAssistantMessage('a');
      history.clear();
      expect(history.getMessages()).toEqual([]);
      expect(history.isEmpty()).toBe(true);
    });
  });

  describe('removeLastMessage', () => {
    test('pops the last message', () => {
      history.addUserMessage('q1');
      history.addUserMessage('q2');
      history.removeLastMessage();
      expect(history.getMessages()).toHaveLength(1);
      expect(history.getMessages()[0].content).toBe('q1');
    });

    test('no-op when history is empty', () => {
      expect(() => history.removeLastMessage()).not.toThrow();
      expect(history.getMessages()).toEqual([]);
    });
  });

  describe('isEmpty', () => {
    test('true on a fresh instance', () => {
      expect(history.isEmpty()).toBe(true);
    });

    test('false after adding a message', () => {
      history.addUserMessage('q');
      expect(history.isEmpty()).toBe(false);
    });

    test('true after clear()', () => {
      history.addUserMessage('q');
      history.clear();
      expect(history.isEmpty()).toBe(true);
    });
  });

  describe('display', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    test('logs the empty-state message when history is empty', () => {
      history.display();
      const calls = logSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((s) => s.includes('No conversation history'))).toBe(true);
    });

    test('renders all messages without count param', () => {
      history.addUserMessage('q1');
      history.addAssistantMessage('a1');
      history.display();
      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('q1');
      expect(output).toContain('a1');
      expect(output).toContain('You');
      expect(output).toContain('AI');
    });

    test('renders only last N messages when count given', () => {
      history.addUserMessage('q1');
      history.addUserMessage('q2');
      history.addUserMessage('q3');
      history.display(2);
      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).not.toContain('q1');
      expect(output).toContain('q2');
      expect(output).toContain('q3');
    });
  });
});
