import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createChatActivity } from '../utils/chat-activity';
const state = vi.hoisted(() => ({
  spinner: { text: '', start: vi.fn(), stop: vi.fn() },
  ora: vi.fn(),
}));
vi.mock('ora', () => ({ default: state.ora }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  state.spinner.start.mockReturnValue(state.spinner);
  state.ora.mockReturnValue(state.spinner);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test('shows elapsed time and real phase changes, then releases its interval', () => {
  const activity = createChatActivity(true);
  activity.start();
  vi.advanceTimersByTime(2200);
  expect(state.spinner.text).toContain('2s');
  activity.phase('Working with tools');
  expect(state.spinner.text).toContain('Working with tools');
  activity.stop();
  expect(state.spinner.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('restart owns only one interval and silent noninteractive mode creates none', () => {
  const activity = createChatActivity(true);
  activity.start();
  activity.start('Resuming request');
  expect(vi.getTimerCount()).toBe(1);
  activity.stop();
  state.ora.mockClear();
  const quiet = createChatActivity(false);
  quiet.start();
  quiet.phase('Processing');
  quiet.stop();
  expect(state.ora).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
