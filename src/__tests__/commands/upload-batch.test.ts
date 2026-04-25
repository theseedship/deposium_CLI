/**
 * Integration tests for `upload-batch` command.
 *
 * upload-batch is a single-action command that uses HTTP fetch directly
 * (not MCPClient.callTool) and reads files from disk via glob. We focus
 * on configuration and the dry-run path, which exercises the full
 * file-resolution pipeline without performing the upload.
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
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('exposes the documented options', () => {
    const optionNames = uploadBatchCommand.options.map((o) => o.long);
    expect(optionNames).toEqual(
      expect.arrayContaining([
        '--space-id',
        '--folder-id',
        '--api-key',
        '--api-url',
        '--dry-run',
        '--parallel',
      ])
    );
  });

  it('exits with code 1 when no files match the glob pattern', async () => {
    await uploadBatchCommand.parseAsync(['node', 'test', './nope/*.pdf']);
    // Empty glob match → command logs error and exits 1
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
