> Revision: 15/02/2025

# Upload Batch Command

The `upload-batch` command uploads multiple files to Deposium efficiently.

## Usage

```bash
deposium upload-batch <pattern> [options]
```

## Arguments

- `pattern`: Glob pattern to match files (e.g., `./docs/*.pdf`, `src/**/*.ts`).

## Options

- `--space-id <id>`: Target space ID for the upload.
- `--folder-id <id>`: Target folder ID within the space.
- `--api-key <key>`: API Key (overrides `DEPOSIUM_API_KEY` env var and config).
- `--api-url <url>`: API URL (overrides `DEPOSIUM_API_URL` env var).
- `--dry-run`: Show files found and estimated cost without uploading.
- `--parallel <n>`: Number of parallel uploads (default: 3).

## Examples

```bash
# Upload all PDFs in the docs folder to a specific space
deposium upload-batch ./docs/*.pdf --space-id=myspace

# Dry run to check what would be uploaded
deposium upload-batch ./**/*.md --dry-run
```
