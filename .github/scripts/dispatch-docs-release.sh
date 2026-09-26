#!/usr/bin/env bash
set -euo pipefail

package='@deposium/cli'
registry='https://registry.npmjs.org'

# Accept stable SemVer only. Validate before invoking npm, gh, or node.
if [[ ! ${RELEASE_VERSION:-} =~ ^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
  echo 'RELEASE_VERSION must be a stable SemVer version (optional v prefix).' >&2
  exit 1
fi
version=${RELEASE_VERSION#v}

if [[ -z ${GH_TOKEN:-} ]]; then
  echo 'GH_TOKEN is required to dispatch the docs release.' >&2
  exit 1
fi

if ! public_json=$(npm view "$package@$version" version --json --prefer-online --registry="$registry"); then
  echo "Could not verify public npm release $package@$version." >&2
  exit 1
fi
if ! NPM_RESPONSE="$public_json" EXPECTED_VERSION="$version" node -e '
  try {
    const value = JSON.parse(process.env.NPM_RESPONSE);
    if (typeof value !== "string" || value !== process.env.EXPECTED_VERSION) process.exit(1);
  } catch { process.exit(1); }
'; then
  echo "Public npm release does not exactly match $package@$version." >&2
  exit 1
fi

if ! latest_json=$(npm view "$package" dist-tags.latest --json --prefer-online --registry="$registry"); then
  echo "Could not verify npm latest for $package." >&2
  exit 1
fi
if ! NPM_RESPONSE="$latest_json" EXPECTED_VERSION="$version" node -e '
  try {
    const value = JSON.parse(process.env.NPM_RESPONSE);
    if (typeof value !== "string" || value !== process.env.EXPECTED_VERSION) process.exit(1);
  } catch { process.exit(1); }
'; then
  echo "npm latest does not exactly match $package@$version." >&2
  exit 1
fi

if ! VERSION="$version" node -e '
  process.stdout.write(JSON.stringify({
    event_type: "cli-released",
    client_payload: { package: "@deposium/cli", version: process.env.VERSION },
  }));
' | gh api -X POST repos/theseedship/deposium_docs/dispatches --input -; then
  echo 'Could not queue the docs release dispatch.' >&2
  exit 1
fi

echo "Queued docs release sync for $package@$version."
