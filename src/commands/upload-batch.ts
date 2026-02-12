/**
 * Sprint 59: CLI Batch Upload Command
 * Uploads multiple files to Deposium via the batch upload API
 *
 * Usage:
 *   deposium upload-batch ./docs/*.pdf --space-id=abc123
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { glob } from 'glob';
import { readFile, stat } from 'fs/promises';
import * as path from 'path';
import * as mimeTypes from 'mime-types';
import { getConfig } from '../utils/config';
import { divider, createInfoBox } from '../utils/formatter';
import { getErrorMessage } from '../utils/command-helpers';

interface FileInfo {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

interface BatchUploadOptions {
  spaceId?: string;
  folderId?: string;
  apiKey?: string;
  dryRun?: boolean;
  parallel?: number;
  apiUrl?: string;
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
 * Get API URL from options or config
 */
function getApiUrl(options: BatchUploadOptions): string {
  // Priority: CLI option > Environment variable > Config > Default
  return (
    options.apiUrl ??
    process.env.DEPOSIUM_API_URL ??
    process.env.DEPOSIUM_URL ??
    'http://localhost:3003'
  );
}

/**
 * Get API key from options or config
 */
function getApiKey(options: BatchUploadOptions): string | undefined {
  const config = getConfig();
  return options.apiKey ?? process.env.DEPOSIUM_API_KEY ?? config.apiKey;
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
 * Read file and convert to base64
 */
async function readFileAsBase64(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return buffer.toString('base64');
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

export const uploadBatchCommand = new Command('upload-batch')
  .description('Upload multiple files to Deposium')
  .argument('<pattern>', 'Glob pattern for files (e.g., "./docs/*.pdf")')
  .option('--space-id <id>', 'Target space ID')
  .option('--folder-id <id>', 'Target folder ID within the space')
  .option('--api-key <key>', 'API key (overrides DEPOSIUM_API_KEY)')
  .option('--api-url <url>', 'API URL (overrides DEPOSIUM_API_URL)')
  .option('--dry-run', 'Show cost estimate without uploading')
  .option('--parallel <n>', 'Number of parallel uploads (reserved for future use)', '3')
  .action(async (pattern: string, options: BatchUploadOptions) => {
    const apiUrl = getApiUrl(options);
    const apiKey = getApiKey(options);

    if (!apiKey) {
      console.log(chalk.red('\n❌ API key is required'));
      console.log(chalk.yellow('\nSet your API key:'));
      console.log(chalk.cyan('  export DEPOSIUM_API_KEY=your-api-key'));
      console.log(chalk.gray('  or use --api-key option\n'));
      process.exit(1);
    }

    console.log(chalk.bold('\n📦 Deposium Batch Upload\n'));

    // Expand glob pattern
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

    // Get file info
    const fileInfos: FileInfo[] = [];
    for (const file of files) {
      try {
        const info = await getFileInfo(file);
        fileInfos.push(info);
      } catch (error: unknown) {
        console.log(chalk.yellow(`⚠️  Skipping ${file}: ${getErrorMessage(error)}`));
      }
    }

    if (fileInfos.length === 0) {
      console.log(chalk.red('\n❌ No valid files to upload\n'));
      process.exit(1);
    }

    // Calculate totals
    const totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0);
    const estimatedCostCents = Math.max(1, Math.ceil((totalSize / (1024 * 1024)) * 0.1));

    // Display file list
    console.log(divider('Files to Upload', 'light'));
    console.log('');
    fileInfos.forEach((file) => {
      console.log(chalk.gray(`  - ${file.name} (${formatBytes(file.size)})`));
    });
    console.log('');

    // Display summary
    console.log(createInfoBox('Summary', '', 'info'));
    console.log(chalk.white(`  Files:        ${fileInfos.length}`));
    console.log(chalk.white(`  Total size:   ${formatBytes(totalSize)}`));
    console.log(chalk.cyan(`  Est. cost:    ${formatCost(estimatedCostCents)}`));
    if (options.spaceId) {
      console.log(chalk.gray(`  Space ID:     ${options.spaceId}`));
    }
    if (options.folderId) {
      console.log(chalk.gray(`  Folder ID:    ${options.folderId}`));
    }
    console.log('');

    // Dry run - stop here
    if (options.dryRun) {
      console.log(chalk.yellow('🔍 Dry run - no files uploaded'));
      console.log(chalk.gray('Remove --dry-run to actually upload files.\n'));
      process.exit(0);
    }

    // Check file size limits
    const MAX_INLINE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_BATCH_SIZE = 100 * 1024 * 1024; // 100MB
    const MAX_FILES = 10;

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

    // Prepare batch request
    const batchSpinner = ora('Preparing batch upload...').start();

    try {
      // Read all files and encode as base64
      const filesWithContent = await Promise.all(
        fileInfos.map(async (file) => ({
          name: file.name,
          size: file.size,
          mime_type: file.mimeType,
          content_base64: await readFileAsBase64(file.path),
        }))
      );

      batchSpinner.text = 'Uploading to Deposium...';

      // Make API request
      const response = await fetch(`${apiUrl}/api/v2/files/batch-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          files: filesWithContent,
          options: {
            space_id: options.spaceId,
            folder_id: options.folderId,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `HTTP ${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.error ?? errorJson.message ?? errorMessage;
          if (errorJson.details) {
            errorMessage +=
              ': ' +
              (Array.isArray(errorJson.details) ? errorJson.details.join(', ') : errorJson.details);
          }
        } catch {
          if (errorBody) errorMessage += `: ${errorBody.substring(0, 200)}`;
        }

        throw new Error(errorMessage);
      }

      const result = (await response.json()) as BatchUploadResponse;

      batchSpinner.succeed('Batch upload completed!');

      // Display results
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
    } catch (error: unknown) {
      batchSpinner.fail('Batch upload failed');

      if (
        getErrorMessage(error).includes('401') ||
        getErrorMessage(error).includes('Authentication')
      ) {
        console.log(chalk.red('\n❌ Authentication failed'));
        console.log(chalk.yellow('Check your API key and try again.\n'));
      } else if (
        getErrorMessage(error).includes('402') ||
        getErrorMessage(error).includes('Insufficient credits')
      ) {
        console.log(chalk.red('\n❌ Insufficient credits'));
        console.log(chalk.yellow('Add more credits to your account and try again.\n'));
      } else if (
        getErrorMessage(error).includes('ECONNREFUSED') ||
        getErrorMessage(error).includes('fetch failed')
      ) {
        console.log(chalk.red('\n❌ Cannot connect to Deposium API'));
        console.log(chalk.gray(`  URL: ${apiUrl}`));
        console.log(chalk.yellow('\nMake sure the server is running.\n'));
      } else {
        console.log(chalk.red(`\n❌ Error: ${getErrorMessage(error)}\n`));
      }

      process.exit(1);
    }
  });
