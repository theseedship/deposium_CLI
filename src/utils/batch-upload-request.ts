/** A file entry accepted by POST /api/v2/files/batch-upload. */
export function encodeBatchUploadFile(content: Buffer, name: string, mimeType: string) {
  return {
    name,
    size: content.byteLength,
    mime_type: mimeType,
    content_base64: content.toString('base64'),
  };
}
