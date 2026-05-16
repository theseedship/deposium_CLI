/**
 * Batch Upload Command — uploads multiple files to Deposium via the
 * `/api/v2/files/batch-upload` endpoint.
 *
 * Routes through `MCPClient.uploadBatch()` (rather than a hand-rolled
 * fetch) so TLS enforcement, the service-key guardrail, the standard
 * ECONNREFUSED message, and the `X-Client-Type: cli` telemetry tag all
 * apply consistently across CLI surfaces.
 *
 * Usage:
 *   deposium upload-batch ./docs/*.pdf --space-id=abc123
 *
 * @module commands/upload-batch
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { glob } from 'glob';
import { stat } from 'fs/promises';
import * as path from 'path';
import * as mimeTypes from 'mime-types';
import { divider, createInfoBox } from '../utils/formatter';
import { initializeCommand, withErrorHandling, getErrorMessage } from '../utils/command-helpers';

interface FileInfo {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

interface BatchUploadOptions {
  spaceId?: string;
  folderId?: string;
  dryRun?: boolean;
  parallel?: number;
}

interface BatchUploadResponse {
  batch_id: string;
  status: string;
  total_cost_cents: number;
  total_size_mb: number;
  files: Array<{
    name: string;
    status: string;
    file_id?: number;
    error?: string;
  }>;
  created_at: string;
}

/**
 * Get file info including size and MIME type
 */
async function getFileInfo(filePath: string): Promise<FileInfo> {
  const stats = await stat(filePath);
  const name = path.basename(filePath);
  const mimeType = mimeTypes.lookup(filePath) || 'application/octet-stream';

  return {
    path: filePath,
    name,
    size: stats.size,
    mimeType,
  };
}

/**
 * Format bytes as human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format cost in cents as EUR
 */
function formatCost(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

const MAX_INLINE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_BATCH_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 10;

/** Resolve glob pattern to validated file infos */
async function resolveFiles(pattern: string): Promise<FileInfo[]> {
  const spinner = ora('Finding files...').start();

  let files: string[];
  try {
    files = await glob(pattern, { absolute: true, nodir: true });
  } catch (error: unknown) {
    spinner.fail('Failed to process pattern');
    console.log(chalk.red(`Error: ${getErrorMessage(error)}`));
    process.exit(1);
  }

  if (files.length === 0) {
    spinner.fail('No files found matching pattern');
    console.log(chalk.yellow(`\nPattern: ${pattern}`));
    console.log(chalk.gray('Make sure the path is correct and files exist.\n'));
    process.exit(1);
  }

  spinner.succeed(`Found ${files.length} file(s)`);

  const fileInfos: FileInfo[] = [];
  for (const file of files) {
    try {
      fileInfos.push(await getFileInfo(file));
    } catch (error: unknown) {
      console.log(chalk.yellow(`⚠️  Skipping ${file}: ${getErrorMessage(error)}`));
    }
  }

  if (fileInfos.length === 0) {
    console.log(chalk.red('\n❌ No valid files to upload\n'));
    process.exit(1);
  }

  return fileInfos;
}

/** Validate file size limits */
function validateLimits(fileInfos: FileInfo[], totalSize: number): void {
  if (fileInfos.length > MAX_FILES) {
    console.log(chalk.red(`\n❌ Too many files (max ${MAX_FILES})`));
    console.log(chalk.gray('Split your upload into multiple batches.\n'));
    process.exit(1);
  }

  if (totalSize > MAX_BATCH_SIZE) {
    console.log(chalk.red(`\n❌ Total size exceeds limit (max ${formatBytes(MAX_BATCH_SIZE)})`));
    console.log(chalk.gray('Split your upload into multiple batches.\n'));
    process.exit(1);
  }

  const oversizedFiles = fileInfos.filter((f) => f.size > MAX_INLINE_SIZE);
  if (oversizedFiles.length > 0) {
    console.log(
      chalk.red(`\n❌ Some files exceed inline upload limit (${formatBytes(MAX_INLINE_SIZE)}):`)
    );
    oversizedFiles.forEach((f) => {
      console.log(chalk.yellow(`  - ${f.name} (${formatBytes(f.size)})`));
    });
    console.log(chalk.gray('Presigned URL uploads are not yet supported.\n'));
    process.exit(1);
  }
}

/** Display upload results */
function displayResults(result: BatchUploadResponse): void {
  console.log('\n' + divider('Results', 'light'));
  console.log('');

  const successFiles = result.files.filter(
    (f) => f.status === 'uploaded' || f.status === 'completed'
  );
  const failedFiles = result.files.filter((f) => f.status === 'failed');

  if (successFiles.length > 0) {
    console.log(chalk.green(`✅ Uploaded: ${successFiles.length} file(s)`));
    successFiles.forEach((f) => {
      console.log(
        chalk.gray(`   - ${f.name}`) + (f.file_id ? chalk.cyan(` (ID: ${f.file_id})`) : '')
      );
    });
  }

  if (failedFiles.length > 0) {
    console.log(chalk.red(`\n❌ Failed: ${failedFiles.length} file(s)`));
    failedFiles.forEach((f) => {
      console.log(chalk.yellow(`   - ${f.name}: ${f.error ?? 'Unknown error'}`));
    });
  }

  console.log('');
  console.log(createInfoBox('Batch Info', '', successFiles.length > 0 ? 'success' : 'error'));
  console.log(chalk.gray(`  Batch ID:     ${result.batch_id}`));
  console.log(chalk.gray(`  Status:       ${result.status}`));
  console.log(chalk.gray(`  Total size:   ${result.total_size_mb.toFixed(2)} MB`));
  console.log(chalk.cyan(`  Cost:         ${formatCost(result.total_cost_cents)}`));
  console.log('');
}

export const uploadBatchCommand = new Command('upload-batch')
  .description('Upload multiple files to Deposium')
  .argument('<pattern>', 'Glob pattern for files (e.g., "./docs/*.pdf")')
  .option('--space-id <id>', 'Target space ID')
  .option('--folder-id <id>', 'Target folder ID within the space')
  .option('--dry-run', 'Show cost estimate without uploading')
  .option('--parallel <n>', 'Number of parallel uploads (reserved for future use)', '3')
  .action(
    withErrorHandling(async (pattern: string, options: BatchUploadOptions) => {
      console.log(chalk.bold('\n📦 Deposium Batch Upload\n'));

      const fileInfos = await resolveFiles(pattern);
      const totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0);
      const estimatedCostCents = Math.max(1, Math.ceil((totalSize / (1024 * 1024)) * 0.1));

      // Display file list and summary
      console.log(divider('Files to Upload', 'light'));
      console.log('');
      fileInfos.forEach((file) => {
        console.log(chalk.gray(`  - ${file.name} (${formatBytes(file.size)})`));
      });
      console.log('');
      console.log(createInfoBox('Summary', '', 'info'));
      console.log(chalk.white(`  Files:        ${fileInfos.length}`));
      console.log(chalk.white(`  Total size:   ${formatBytes(totalSize)}`));
      console.log(chalk.cyan(`  Est. cost:    ${formatCost(estimatedCostCents)}`));
      if (options.spaceId) console.log(chalk.gray(`  Space ID:     ${options.spaceId}`));
      if (options.folderId) console.log(chalk.gray(`  Folder ID:    ${options.folderId}`));
      console.log('');

      if (options.dryRun) {
        console.log(chalk.yellow('🔍 Dry run - no files uploaded'));
        console.log(chalk.gray('Remove --dry-run to actually upload files.\n'));
        process.exit(0);
      }

      validateLimits(fileInfos, totalSize);

      // Centralized client: routes through enforceUrlSecurity() (HTTPS
      // outside localhost), the service-key guardrail, and the standard
      // ECONNREFUSED message — same security posture as every other
      // command. (H2 / M3 / M7 audit fixes.)
      const { client, baseUrl } = await initializeCommand();
      const batchSpinner = ora('Uploading to Deposium...').start();

      try {
        const result = (await client.uploadBatch(
          fileInfos.map((f) => ({ path: f.path, name: f.name, mimeType: f.mimeType })),
          { spaceId: options.spaceId, folderId: options.folderId }
        )) as BatchUploadResponse;
        batchSpinner.succeed('Batch upload completed!');
        displayResults(result);
      } catch (error: unknown) {
        batchSpinner.fail('Batch upload failed');
        // The client already shapes the common cases (auth, ECONNREFUSED)
        // into human messages. Surface them verbatim with one extra
        // contextual line for upload-specific framing.
        console.log(chalk.red(`\n❌ ${getErrorMessage(error)}`));
        console.log(chalk.gray(`  URL: ${baseUrl}\n`));
        process.exit(1);
      }
    })
  );
