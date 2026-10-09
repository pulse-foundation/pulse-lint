# Releases and package security

Decision checked on 2026-10-09: one public npm package, Yarn 4 for dependency
management/build/packing, Changesets 3 for versions and changelogs. CI stages a
tested archive; a human approves the actual npm publication with 2FA. npm CLI is
used only as the registry upload/approval client, not as a second package manager.

## Release flow

1. Add a change with `yarn changeset`. Commit its Markdown with the implementation.
   Use patch for compatible fixes, minor for additive features and major for
   intentional changes to default failures, autofixes, exports or CLI behavior.
2. Merge to protected `main`. `release.yml` prepares a version PR using
   `yarn version:packages`. Review the version, changelog and lockfile.
3. Run CI on the version PR and merge it. A version change on `main` starts a
   clean build with immutable dependencies, checksum verification, vulnerability
   audit and the full test suite. Ordinary commits without changesets/version
   changes do not stage another copy of a pending release.
4. CI packs `release/pulse-lint.tgz` with Yarn and installs/tests that exact file
   using `PULSE_LINT_ARCHIVE`. The archive, SHA-512 digest and source commit become
   a single immutable workflow artifact.
5. A separate GitHub-hosted runner downloads that artifact by ID in the same run,
   checks its digest/commit, and submits it with `npm stage publish --ignore-scripts`.
   It has OIDC permission but never checks out source, installs dependencies or
   runs package scripts. Build/version jobs have no OIDC publishing permission.
6. Review the npm staging entry, source commit, version/changelog and archive
   digest. Download the staged archive if needed and compare its SHA-512 digest
   with the build summary. Approve on npmjs.com with 2FA, or use
   `npm stage approve <stage-id>`. Only then is the version available to users.

Staging success is not publication success. GitHub tags/releases are not created
at staging time. Do not announce a release until npm approval is complete.
A `workflow_dispatch` on `main` supports recovery/initial preparation. It does not
bypass tests or the audit. Re-staging an already staged/published version fails;
inspect the existing stage instead of rerunning blindly. To replace a bad candidate,
reject it and follow npm's version availability rules, or prepare a new version.

Changesets' built-in publish action is deliberately not used: it publishes directly.
We use only its version action and keep the privileged upload job minimal.
[Changesets automation](https://changesets.dev/guide/automating).

## One-time npm setup

- Publish as **`@pulse-kit/lint`** under the npm organization **`pulse-kit`**.
  Its creation and owner `reabiliti` with 2FA enabled were confirmed in the npm UI
  on 2026-10-09. The GitHub repository remains `pulse-foundation/pulse-lint`.
- Enable **2FA Enforcement** for the npm organization so all members require 2FA;
  organization creation alone does not enable this requirement.
- Enable phishing-resistant 2FA/passkeys on maintainer npm and GitHub accounts;
  store recovery codes offline and keep account recovery email secure. Minimize
  package owners; give consumers read access only.
- Bootstrap the package under an authenticated maintainer account if it does not
  exist yet. Use a reviewed, audited archive and interactive npm staging, not a
  persistent CI token. Staging a new name can create a public placeholder; treat
  this as an external publication action requiring an explicit decision.
- In npm package settings, add a trusted GitHub publisher: owner `pulse-foundation`,
  repository `pulse-lint`, workflow **`release.yml`**, environment **`npm-release`**.
  Grant **stage-only** access: no direct publish or dist-tag management.
- Choose **Require two-factor authentication and disallow tokens** for package
  publishing/settings. Remove obsolete write tokens after testing the trust setup.
  Complete a newly configured publisher's first successful use within its npm
  validity window (currently two days); create it when the pipeline is ready.

OIDC replaces stored publishing credentials. Stage-only permissions plus human
approval limit what a compromised CI run can publish. They do not prove the code
is safe. [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## One-time GitHub setup

- Configure a ruleset for `main`: PRs, required `test` and `audit` checks, reviewed
  changes, dismissed stale approvals, no force-push/deletion, and tightly restricted
  bypass rights. Require CODEOWNERS review for workflows, release scripts, manifest
  and lockfile; nominate another trusted reviewer if enforcing approval on owner PRs.
- Create environment `npm-release`, limit deployment branches to `main`, and bind
  that exact name in npm. Optional GitHub reviewers can approve the staging job;
  the required publication approval remains on npm with 2FA.
- Allow Actions to create PRs for Changesets. Keep default workflow permissions
  read-only. Enable Dependabot alerts/security updates and secret scanning/push
  protection where the plan supports them. Review dependency/Action update PRs;
  there is no automatic merge configuration.
- PRs created by `GITHUB_TOKEN` do not automatically trigger normal PR workflows.
  Run `gh workflow run ci.yml --ref changeset-release/main` and wait for both checks
  before merging. The CI workflow permits dispatch on that branch. If fully
  automatic PR checks are required later, use a narrowly scoped GitHub App for
  version PR creation; do not introduce a broad personal token.

Every external Action is pinned to a verified commit SHA, and checkout does not
persist credentials. Dependency install scripts are disabled, lock checksums must
match, and new package resolutions have a 24-hour minimum age. Release jobs do not
restore shared caches. These controls reduce exposure; code review and artifact
inspection remain necessary. [GitHub security guidance](https://docs.github.com/en/actions/reference/security/secure-use),
[Yarn security](https://yarnpkg.com/features/security).

## Provenance and current setup status

The repository was **private** when checked. npm provenance requires both a public
source repository and a public package; OIDC authentication still works without
provenance. Making npm access public does not make this repository public. Choose
whether to open the source repository separately; do not claim provenance until
an actual published version has the attestation.
[npm provenance requirements](https://docs.npmjs.com/generating-provenance-statements/).

GitHub returned HTTP 403 for rulesets on the current private repository, with a
request to upgrade the plan or make the repository public. No environments existed.
The npm organization `pulse-kit` has been created by the owner. Repository
protection, environment creation and trusted publisher configuration have **not**
been completed by these local file changes; organization 2FA enforcement still
needs confirmation.
Resolve the plan/visibility choice before treating branch protections as enforced.

## Dependency security

The previously reported high-severity
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reached
`braces@3.0.3` through `eslint-plugin-check-file → micromatch → braces`.
The external naming plugin has been removed and replaced by two bundled TypeScript
rules with regression coverage. That dependency chain is no longer in the lockfile;
the audit still blocks releases on new high-severity findings, without suppression.

Run a fresh audit before each release. This package's development lockfile does
not freeze every transitive resolution in consumer repositories.

## Local verification without publication

```sh
yarn install --immutable
yarn changeset status
yarn test
yarn audit:dependencies
mkdir -p release
yarn pack --out release/pulse-lint.tgz
PULSE_LINT_ARCHIVE=release/pulse-lint.tgz yarn test:package
npm stage publish ./release/pulse-lint.tgz --access public --ignore-scripts --dry-run
```

The dry run does not establish GitHub OIDC trust or approve a release. A real
staging/publishing attempt is separate from preparing these repository files.
