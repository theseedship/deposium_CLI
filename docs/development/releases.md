# Releasing the CLI to npm

The [`Stage npm release`](https://github.com/theseedship/deposium_CLI/blob/main/.github/workflows/publish.yml) workflow validates and stages
`@deposium/cli`. A successful GitHub job is **not** a public npm release. A maintainer must review
and approve the staged package with npm two-factor authentication (2FA).

## Prepare a version

1. Prepare the release changes on a branch.
2. Choose a version that is neither public nor already staged. Check the exact version with
   `npm view @deposium/cli@<version> version` and `npm stage list @deposium/cli`. If that version is
   already staged, review or approve that stage instead of bumping and staging again.
3. Update `package.json` and `package-lock.json` to the new version and add its changelog entry,
   then merge that change into `main`. This automatically starts the staging workflow. A merge
   that does not change the package version does not create a release; versions are not bumped
   automatically. A version that is already public cannot be staged again as a new release.
4. Follow the `Stage npm release` run in GitHub Actions and verify its staging result. You can
   also push a `v<version>` tag at the release commit; the workflow checks that the tag and
   `package.json` versions match. It reuses an existing stage instead of staging the version twice.

The workflow runs `npm ci`, type checking, lint, tests, a clean build, and an artifact check. It
uses Node 24 and npm 11.15.0, then runs `npm stage publish --provenance --access public --tag latest`.
Both a version change on `main` and a version tag stage automatically; neither approves or
publishes the package. Before staging, the workflow checks whether the exact version is already
public or staged and skips duplicate uploads. Authentication or registry errors fail the run.

The release gate has offline regression tests in `src/__tests__/release-gate.test.ts`, included
in `npm test` on platforms with Bash. They use stub registry responses and never stage a package.

## Check the npm credential without staging

Configure the repository's `NPM_TOKEN` secret with an npm granular access token authorized for
`@deposium/cli` and staged publishing. Never print or copy the token into logs. From the Actions
tab, run `Stage npm release` with `check_auth_only=true`. This job only sets up Node and calls
`npm whoami`; it does not check out the repository, install dependencies, or stage a package. A
successful `whoami` confirms authentication, not the token's package-level publishing permission.

For a package validation run, dispatch the workflow with its default `dry_run=true` and
`check_auth_only=false`. It runs the full quality gates and `npm pack --dry-run` to inspect the
package contents without using the npm token or creating a stage. This does not test registry
write permission or provenance. Set `dry_run=false` only when ready to create a staged release.
The dispatch uses the version in the selected ref's `package.json`; use the intended release ref.
The tag/version match check applies to tag-triggered runs.

## Review and approve the stage

After staging, inspect `npm stage list @deposium/cli` and the stage details with
`npm stage view <stage-id>` or the npm **Staged Packages** page. Verify the version, files,
provenance, and release intent. An authorized maintainer then approves the package in npm with 2FA.
If a job is retried after a stage was created, inspect and reuse that stage; staged and public
versions share a uniqueness constraint. Do not bump the version merely to recover from a failed
retry.

Approval is the public release boundary. Verify it with
`npm view @deposium/cli@<version> version --registry=https://registry.npmjs.org` and confirm the
`latest` dist-tag points to the intended version with `npm dist-tag ls @deposium/cli`. If the
version remains staged, do not announce a public release.

## Refresh the documentation after approval

Staging no longer triggers the docs deployment. Once the version is public and verified, run
`gh workflow run deploy.yml --repo theseedship/deposium_docs` with access to dispatch that
repository's workflow, then verify its deployment. The docs site's scheduled rebuild remains a
fallback if an immediate refresh is not needed.

See the [npm staged publishing guide](https://docs.npmjs.com/staged-publishing/) and
[`npm stage` command reference](https://docs.npmjs.com/cli/v11/commands/npm-stage/) for the current
staging and approval procedures.
