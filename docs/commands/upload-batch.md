# Upload Batch Command

The `upload-batch` command uploads multiple files to Deposium efficiently.

It uses the same auth + URL resolution as every other command:
`DEPOSIUM_API_KEY` / `DEPOSIUM_URL` env vars, then the config file
(`~/.deposium/credentials` for the key, `~/.deposium/config.json` for
the URL), then an interactive prompt for the key on first run.

## Usage

```bash
deposium upload-batch <pattern> [options]
```

## Arguments

- `pattern`: Glob pattern to match files (e.g., `./docs/*.pdf`, `src/**/*.ts`).

## Options

- `--space-id <id>`: Target space ID for the upload.
- `--folder-id <id>`: Target folder ID within the space.
- `--dry-run`: Show files found and estimated cost without uploading.

## Examples

```bash
# Upload all PDFs in the docs folder to a specific space
deposium upload-batch ./docs/*.pdf --space-id=myspace

# Dry run to check what would be uploaded
deposium upload-batch ./**/*.md --dry-run
```
