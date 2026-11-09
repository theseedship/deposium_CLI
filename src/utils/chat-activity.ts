import ora from 'ora';

export interface ChatActivity {
  start: (phase?: string) => void;
  phase: (phase: string) => void;
  stop: () => void;
}

/** Show bounded terminal activity only in a real interactive session; never invent progress. */
export function createChatActivity(
  enabled = Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.stderr.isTTY &&
    !process.env.CI &&
    process.env.TERM !== 'dumb'
  )
): ChatActivity {
  let spinner: ReturnType<typeof ora> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let label = 'Waiting for server';
  let started = 0;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    spinner?.stop();
    spinner = undefined;
  };
  const render = () => {
    if (spinner) spinner.text = `${label}… ${Math.floor((performance.now() - started) / 1000)}s`;
  };
  return {
    start(phase = 'Waiting for server') {
      stop();
      if (!enabled) return;
      label = phase;
      started = performance.now();
      spinner = ora({ text: `${label}… 0s`, stream: process.stderr }).start();
      timer = setInterval(render, 1000);
      timer.unref();
    },
    phase(phase) {
      label = phase;
      render();
    },
    stop,
  };
}
