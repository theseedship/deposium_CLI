import { readFile } from 'node:fs/promises';
import { encodeBatchUploadFile } from './batch-upload-request';

type BatchFile = { path: string; name: string; mimeType: string };

/** Encode one file at a time, allowing fetch backpressure to bound request memory. */
export function createBatchUploadStream(
  files: BatchFile[],
  options: { spaceId?: string; folderId?: string }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = (async function* (): AsyncGenerator<string> {
    yield '{"files":[';
    for (const [index, file] of files.entries()) {
      const content = await readFile(file.path);
      yield `${index ? ',' : ''}${JSON.stringify(
        encodeBatchUploadFile(content, file.name, file.mimeType)
      )}`;
    }
    yield `],"options":${JSON.stringify({
      ...(options.spaceId ? { space_id: options.spaceId } : {}),
      ...(options.folderId ? { folder_id: options.folderId } : {}),
    })}}`;
  })();

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const next = await chunks.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(next.value));
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        await chunks.return(undefined);
      },
    },
    { highWaterMark: 0 }
  );
}
