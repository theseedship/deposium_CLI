import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { MCPClient } from '../client/mcp-client';
import { createBatchUploadStream } from '../utils/batch-upload-stream';

const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

test('MCPClient.uploadBatch sends Solid gateway JSON for multiple binary files and nested options', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-batch-contract-'));
  tempDirs.push(dir);
  const firstPath = path.join(dir, 'first.pdf');
  const secondPath = path.join(dir, 'second.txt');
  const firstBytes = Buffer.from([0, 1, 127, 128, 255]);
  const secondBytes = Buffer.from('héllo', 'utf8');
  fs.writeFileSync(firstPath, firstBytes);
  fs.writeFileSync(secondPath, secondBytes);

  let request: Request | undefined;
  const batchResponse = {
    batch_id: 'batch-1',
    status: 'completed',
    files: [
      { name: 'first.pdf', status: 'uploaded', file_id: 11 },
      { name: 'second.txt', status: 'uploaded', file_id: 12 },
    ],
  };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    request = new Request(url, init);
    return new Response(JSON.stringify(batchResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  const client = new MCPClient('http://localhost:3003/', 'dep_live_test');
  const result = await client.uploadBatch(
    [
      { path: firstPath, name: 'first.pdf', mimeType: 'application/pdf' },
      { path: secondPath, name: 'second.txt', mimeType: 'text/plain' },
    ],
    { spaceId: 'space-1', folderId: 'folder-2' }
  );

  expect(result).toEqual(batchResponse);
  expect(request?.url).toBe('http://localhost:3003/api/v2/files/batch-upload');
  expect(request?.headers.get('content-type')).toBe('application/json');
  expect(request?.headers.get('x-api-key')).toBe('dep_live_test');
  expect(request?.headers.get('x-client-type')).toBe('cli');
  expect(await request?.json()).toEqual({
    files: [
      {
        name: 'first.pdf',
        size: 5,
        mime_type: 'application/pdf',
        content_base64: firstBytes.toString('base64'),
      },
      {
        name: 'second.txt',
        size: secondBytes.length,
        mime_type: 'text/plain',
        content_base64: secondBytes.toString('base64'),
      },
    ],
    options: { space_id: 'space-1', folder_id: 'folder-2' },
  });
});

test('batch stream reads files only as pulled and cancellation skips later files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-batch-lazy-'));
  tempDirs.push(dir);
  const firstPath = path.join(dir, 'first.pdf');
  fs.writeFileSync(firstPath, Buffer.from([0, 255]));
  const stream = createBatchUploadStream(
    [
      { path: firstPath, name: 'first.pdf', mimeType: 'application/pdf' },
      { path: path.join(dir, 'missing.pdf'), name: 'missing.pdf', mimeType: 'application/pdf' },
    ],
    {}
  );
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toBe('{"files":[');
  expect(decoder.decode((await reader.read()).value)).toContain('"content_base64":"AP8="');
  await expect(reader.cancel()).resolves.toBeUndefined();
});

test('MCPClient.uploadBatch streams a valid single JSON request over Node fetch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-batch-http-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'one.bin');
  fs.writeFileSync(filePath, Buffer.from([0, 255, 10]));

  let requestCount = 0;
  let received: unknown;
  const server = createServer(async (req, res) => {
    requestCount++;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ batch_id: 'batch-loopback', status: 'completed' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
    const client = new MCPClient(`http://127.0.0.1:${address.port}`, 'dep_live_test');
    await expect(
      client.uploadBatch([
        { path: filePath, name: 'one.bin', mimeType: 'application/octet-stream' },
      ])
    ).resolves.toEqual({ batch_id: 'batch-loopback', status: 'completed' });
    expect(requestCount).toBe(1);
    expect(received).toEqual({
      files: [
        {
          name: 'one.bin',
          size: 3,
          mime_type: 'application/octet-stream',
          content_base64: 'AP8K',
        },
      ],
      options: {},
    });
  } finally {
    server.close();
  }
});
