/**
 * Tests for src/utils/validate-file-upload.ts.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { uploadFileForValidate } from '../utils/validate-file-upload';
import { MCPAuthError } from '../client/auth-error';

describe('uploadFileForValidate', () => {
  const originalFetch = globalThis.fetch;
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-upload-test-'));
    tmpFile = path.join(tmpDir, 'doc.pdf');
    fs.writeFileSync(tmpFile, 'fake pdf content');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('POSTs to /api/v2/files/batch-upload with X-API-Key header and FormData body', async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: BodyInit | null | undefined;

    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      capturedBody = init?.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ files: [{ id: 42, file_name: 'doc.pdf' }] }),
      } as Response);
    }) as unknown as typeof fetch;

    const result = await uploadFileForValidate(
      'http://localhost:3003',
      'dep_live_test',
      'space-uuid-1',
      tmpFile
    );

    expect(result).toEqual({ file_id: 42, file_name: 'doc.pdf' });
    expect(capturedUrl).toBe('http://localhost:3003/api/v2/files/batch-upload');
    expect((capturedHeaders as Record<string, string>)['X-API-Key']).toBe('dep_live_test');
    // body is FormData — test that it's the right type without inspecting internals
    expect(capturedBody).toBeInstanceOf(FormData);
  });

  test('strips trailing slash from baseUrl', async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ files: [{ id: 1, file_name: 'doc.pdf' }] }),
      } as Response);
    }) as unknown as typeof fetch;

    await uploadFileForValidate('http://localhost:3003/', 'k', 's', tmpFile);
    expect(capturedUrl).toBe('http://localhost:3003/api/v2/files/batch-upload');
  });

  test('returns the first file_id when server returns the {files: [...]} envelope', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            files: [
              { id: 99, file_name: 'first.pdf' },
              { id: 100, file_name: 'second.pdf' },
            ],
          }),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await uploadFileForValidate('http://x', 'k', 's', tmpFile);
    expect(result.file_id).toBe(99);
    expect(result.file_name).toBe('first.pdf');
  });

  test('falls back to flat shape when server returns {file_id, file_name}', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ file_id: 7, file_name: 'flat.pdf' }),
      } as Response)
    ) as unknown as typeof fetch;

    const result = await uploadFileForValidate('http://x', 'k', 's', tmpFile);
    expect(result).toEqual({ file_id: 7, file_name: 'flat.pdf' });
  });

  test('throws MCPAuthError on 401 with structured body', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () =>
          Promise.resolve({
            error: 'MCP Auth Error',
            message: 'API key invalid',
            error_code: 'key_invalid',
            hint: 'rotate via auth login',
          }),
        text: () => Promise.resolve(''),
      } as Response)
    ) as unknown as typeof fetch;

    await expect(uploadFileForValidate('http://x', 'bad', 's', tmpFile)).rejects.toBeInstanceOf(
      MCPAuthError
    );
  });

  test('throws on generic HTTP errors with status + body text', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('not json')),
        text: () => Promise.resolve('upstream timed out'),
      } as Response)
    ) as unknown as typeof fetch;

    await expect(uploadFileForValidate('http://x', 'k', 's', tmpFile)).rejects.toThrow(
      /Upload failed \(502\): upstream timed out/
    );
  });

  test('throws when server response is missing file_id', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }), // no file_id
      } as Response)
    ) as unknown as typeof fetch;

    await expect(uploadFileForValidate('http://x', 'k', 's', tmpFile)).rejects.toThrow(
      /missing file_id/
    );
  });

  test('throws if path is not a regular file', async () => {
    await expect(uploadFileForValidate('http://x', 'k', 's', tmpDir)).rejects.toThrow(
      /not a regular file/
    );
  });
});
