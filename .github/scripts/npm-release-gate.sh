#!/usr/bin/env bash
set -euo pipefail

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")

if [[ "$GITHUB_EVENT_NAME" == push && "$GITHUB_REF" == refs/heads/main ]]; then
  previous=$(git show "${PUSH_BEFORE}:package.json" | node -e 'let s=""; process.stdin.on("data", c => s += c).on("end", () => console.log(JSON.parse(s).version))')
  if [[ "$version" == "$previous" ]]; then
    echo 'proceed=false' >> "$GITHUB_OUTPUT"
    echo "Package version remains $version; no release to stage." >> "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
fi

if [[ "$GITHUB_REF" == refs/tags/* ]]; then
  if [[ "${GITHUB_REF_NAME#v}" != "$version" ]]; then
    echo "Tag $GITHUB_REF_NAME does not match package.json version $version" >&2
    exit 1
  fi
fi

if [[ "$GITHUB_EVENT_NAME" == workflow_dispatch && "$DRY_RUN" == true ]]; then
  echo 'proceed=true' >> "$GITHUB_OUTPUT"
  exit 0
fi

versions=$(npm view "$name" versions --json --prefer-online)
published=$(VERSIONS="$versions" VERSION="$version" node -e 'const v=JSON.parse(process.env.VERSIONS); const versions=Array.isArray(v) ? v : [v]; if (!versions.every(x => typeof x === "string")) throw Error("Invalid npm versions response"); console.log(versions.includes(process.env.VERSION) ? "true" : "false")')
if [[ "$published" == true ]]; then
  echo 'proceed=false' >> "$GITHUB_OUTPUT"
  echo "$name@$version is already public; no release to stage." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

stages=$(npm stage list "$name" --json)
stage_id=$(STAGES="$stages" PACKAGE_NAME="$name" VERSION="$version" node -e 'const x=JSON.parse(process.env.STAGES); if (!Array.isArray(x) || !x.every(v => v && typeof v.packageName === "string" && typeof v.version === "string")) throw Error("Invalid npm staged versions response"); const s=x.find(v => v.packageName === process.env.PACKAGE_NAME && v.version === process.env.VERSION); if (s && (typeof s.id !== "string" || !s.id)) throw Error("Staged version has no ID"); console.log(s?.id ?? "")')
if [[ -n "$stage_id" ]]; then
  echo 'proceed=false' >> "$GITHUB_OUTPUT"
  echo "$name@$version is already staged (ID $stage_id); no duplicate stage." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

echo 'proceed=true' >> "$GITHUB_OUTPUT"
