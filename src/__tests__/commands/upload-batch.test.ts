/**
 * Integration tests for `upload-batch` command.
 *
 * After the H2/M3/M7 refactor the command routes through `MCPClient`
 * (instead of a hand-rolled fetch + bespoke env-var precedence). These
 * tests cover its public surface — argument/option wiring — and a smoke
 * check that an empty glob exits 1 without hitting the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/config', () => ({
  getConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue([]),
}));

import { uploadBatchCommand } from '../../commands/upload-batch';

describe('upload-batch command', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('configures the command', () => {
    expect(uploadBatchCommand.name()).toBe('upload-batch');
    expect(uploadBatchCommand.description()).toBeTruthy();
  });

  it('accepts <pattern> as a required argument', () => {
    const args = uploadBatchCommand.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0].name()).toBe('pattern');
    expect(args[0].required).toBe(true);
  });

  it('exposes the documented options (H2 regression: --api-key/--api-url removed; C5: --parallel dropped)', () => {
    const optionNames = uploadBatchCommand.options.map((o) => o.long);
    expect(optionNames).toEqual(expect.arrayContaining(['--space-id', '--folder-id', '--dry-run']));
    // H2: the bespoke `--api-key` / `--api-url` overrides are gone.
    // upload-batch now uses the shared resolution (env > config > prompt)
    // and shares TLS enforcement + service-key guards with the rest of
    // the CLI.
    expect(optionNames).not.toContain('--api-key');
    expect(optionNames).not.toContain('--api-url');
    // C5: --parallel was advertised "reserved for future use" but never
    // wired up. Dropped rather than shipping a flag that does nothing.
    expect(optionNames).not.toContain('--parallel');
  });

  it('exits with code 1 when no files match the glob pattern', async () => {
    await uploadBatchCommand.parseAsync(['node', 'test', './nope/*.pdf']);
    // Empty glob match → command logs error and exits 1
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
