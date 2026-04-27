/**
 * Phase II PR-3 — file upload helper for `missing_document` HITL responses.
 *
 * When a `validate` run pauses with `waiting_for=missing_document`, the CLI
 * collects a local path from the user (see `validate-hitl-form.ts`) and
 * sends the file to Solid's `/api/v2/files/batch-upload` endpoint. Solid
 * persists it, attributes it to the dossier, and the CLI then re-calls
 * `tools/call deposium_validate_foncier` with the same `run_id` to resume
 * (Mode A — see ADR-010 §4.2).
 *
 * Solid path is intentional (greenlight §8.3): billing-aware, scope-checked,
 * existing path. Direct MCPs upload would bypass billing.
 *
 * @module utils/validate-file-upload
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildAuthError } from '../client/auth-error';

/**
 * Upload a single file to Solid's batch-upload endpoint.
 *
 * @param baseUrl  Solid base URL (`getBaseUrl()` value).
 * @param apiKey   User-key (already screened by the service-key guardrail).
 * @param spaceId  Dossier space — Solid scopes the upload to it.
 * @param filePath Local path to the file. Caller has already validated
 *                 existence + size via `validate-hitl-form.ts`.
 *
 * @returns The server-issued `file_id` (used by the resume flow to re-classify).
 */
export async function uploadFileForValidate(
  baseUrl: string,
  apiKey: string,
  spaceId: string,
  filePath: string
): Promise<{ file_id: number; file_name: string }> {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Cannot upload — not a regular file: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const form = new FormData();
  form.append('files', new Blob([fs.readFileSync(filePath)]), fileName);
  form.append('space_id', spaceId);

  const url = `${baseUrl.replace(/\/$/, '')}/api/v2/files/batch-upload`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form,
  });

  if (!response.ok) {
    await throwForUploadError(response);
  }

  return parseUploadResponse(await response.json(), fileName);
}

/**
 * Map a non-2xx upload response to a thrown error. 401 routes through
 * `buildAuthError` so consumers see the structured `MCPAuthError`; other
 * statuses get a generic message + body excerpt.
 */
async function throwForUploadError(response: Response): Promise<never> {
  if (response.status === 401) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw buildAuthError(body);
  }
  const text = await response.text().catch(() => '');
  throw new Error(`Upload failed (${response.status}): ${text || response.statusText}`);
}

interface UploadResponseShape {
  files?: Array<{ id?: number; file_id?: number; file_name?: string; name?: string }>;
  file_id?: number;
  file_name?: string;
}

/**
 * Normalize Solid's batch-upload response. Accepts both
 * `{files: [{id, file_name}]}` and the flat `{file_id, file_name}` shape so
 * we don't crash if the endpoint changes its envelope on single-file
 * uploads.
 */
function parseUploadResponse(
  raw: unknown,
  fallbackName: string
): { file_id: number; file_name: string } {
  const data = raw as UploadResponseShape;
  const first = data.files?.[0];
  const file_id = first?.id ?? first?.file_id ?? data.file_id;
  const file_name = first?.file_name ?? first?.name ?? data.file_name ?? fallbackName;

  if (typeof file_id !== 'number') {
    throw new Error(
      `Upload succeeded but server response is missing file_id. Body: ${JSON.stringify(data)}`
    );
  }

  return { file_id, file_name };
}
