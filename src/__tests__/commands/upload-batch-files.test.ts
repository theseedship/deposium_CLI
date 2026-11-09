import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const upload = vi.hoisted(() => vi.fn());
vi.mock('../../utils/command-helpers', () => ({
  initializeCommand: async () => ({
    client: { uploadBatch: upload },
    baseUrl: 'https://example.invalid',
  }),
  withErrorHandling: (action: (...args: unknown[]) => Promise<void>) => action,
  getErrorMessage: (error: unknown) => String(error),
}));

// Keep glob, stat and the command's file resolver real. Only the upload transport
// is replaced: the recursive match must reach it as absolute files, not folders.
import { uploadBatchCommand } from '../../commands/upload-batch';

let fixture: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

it('recursively matches real PDF files, including paths with spaces, and excludes matching directories', async () => {
  fixture = await mkdtemp(path.join(os.tmpdir(), 'deposium-glob-contract-'));
  const nested = path.join(fixture, 'nested folder');
  await mkdir(nested);
  await mkdir(path.join(fixture, 'directory.pdf'));
  const first = path.join(fixture, 'first.pdf');
  const second = path.join(nested, 'second.pdf');
  await writeFile(first, 'first fixture');
  await writeFile(second, 'second fixture');
  await writeFile(path.join(fixture, 'excluded.txt'), 'not a PDF match');
  upload.mockResolvedValue({
    batch_id: 'fixture',
    status: 'completed',
    files: [],
    total_size_mb: 0,
    total_cost_cents: 1,
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const pattern = `${fixture.split(path.sep).join('/')}/**/*.pdf`;

  await uploadBatchCommand.parseAsync(['node', 'test', pattern, '--space-id', 'fixture-space']);

  expect(upload).toHaveBeenCalledTimes(1);
  const files = upload.mock.calls[0]?.[0] as Array<{
    path: string;
    name: string;
    mimeType: string;
  }>;
  expect(files.map((file) => file.path).sort()).toEqual([first, second].sort());
  expect(files.every((file) => path.isAbsolute(file.path))).toBe(true);
  expect(files.every((file) => file.mimeType === 'application/pdf')).toBe(true);
  expect(upload.mock.calls[0]?.[1]).toMatchObject({ spaceId: 'fixture-space' });
});
