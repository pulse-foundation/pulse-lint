# @pulse-kit/lint

Shared Pulse linting and formatting presets, extracted from Pulse Chat. Includes
Oxlint, Oxfmt, React Native checks, Commitlint and an optional Lefthook preset.
Requires Node.js >=24.13.1. Development uses Yarn 4.18.1 and TypeScript 7.0.2.
The installed CLI and consumer hooks run compiled JavaScript on ordinary Node.js.

## Install

The package is prepared for distribution; it has not been published by this extraction.
Build a local archive and install it in a consumer first:

```sh
corepack enable
corepack install
yarn install --immutable
yarn pack --out /tmp/pulse-lint.tgz
# From the consumer repository, using the archive's absolute path:
yarn add --dev /tmp/pulse-lint.tgz
```

After a release is published to your chosen registry, consumers can install
`@pulse-kit/lint` by version using `yarn add --dev @pulse-kit/lint@<version>`. The
included hook preset expects Yarn's `nodeLinker: node-modules`.
The package is configured for public npm access. Changesets prepares release PRs;
CI stages a tested archive and a maintainer approves publication with 2FA.
See [the release guide](docs/releasing.md) for setup, security controls and the
current vulnerability blocker. Nothing has been published by these local changes.

## Presets

One package provides rule modules, complete environment profiles and a reusable
strict policy overlay. Preset names below resolve through package exports; JSON
`extends` uses the corresponding physical file under `node_modules/@pulse-kit/lint`.

| Export                                                                                                             | Purpose                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `@pulse-kit/lint/oxlint`                                                                                           | Default web profile; see migration notes below                                       |
| `@pulse-kit/lint/oxlint/base`                                                                                      | Shared JS/TS, imports and naming rules without React, a11y or Node plugin rules      |
| `@pulse-kit/lint/oxlint/web`                                                                                       | Explicit web/React profile, equivalent to the default                                |
| `@pulse-kit/lint/oxlint/server`                                                                                    | Base plus Node rules and environment; rejects `window` and `document`                |
| `@pulse-kit/lint/oxlint/strict`                                                                                    | Compatible strict web profile: web + strict overlay                                  |
| `@pulse-kit/lint/oxlint/server-strict`                                                                             | Server + strict overlay                                                              |
| `@pulse-kit/lint/oxlint/overlays/strict`                                                                           | Framework-neutral 220-line file / 80-line function limits and test exemptions        |
| `@pulse-kit/lint/oxlint/native`                                                                                    | React Native, type-aware checks, React Compiler and Pulse boundaries                 |
| `@pulse-kit/lint/oxlint/typescript`, `/react`, `/react-a11y`, `/node`, `/imports`, `/variables`, `/best-practices` | Rule modules for composition; these are not complete project profiles                |
| `@pulse-kit/lint/oxfmt`                                                                                            | Single quotes and grouped import sorting                                             |
| `@pulse-kit/lint/tsconfig`                                                                                         | Standalone strict TypeScript base; consumers provide includes, JSX and runtime types |
| `@pulse-kit/lint/commitlint`                                                                                       | Conventional commit configuration                                                    |
| `@pulse-kit/lint/lefthook`                                                                                         | Optional staged-file formatting/linting and commit-message checks                    |

Choose `server`, rather than the individual `node` rule module, for a Node
application. Base/server profiles do not require React dependencies. The native
profile retains existing Pulse architecture conventions; it is opinionated.

Yarn may report missing ESLint peers from the existing third-party plugins.
These plugins run under Oxlint; no ESLint engine is installed or run. The archive
test verifies the actual runtime in an independent consumer without ESLint.
Commitlint also reports upstream peers for its optional TS config loader; our
exported config is compiled JavaScript and is tested in that consumer without
the development TypeScript dependency.
Dependencies are pinned to the stable versions checked on 2026-10-08.
Lefthook was held at 2.1.17 by Yarn's 24-hour age gate on that date; recheck before upgrading.
See [upgrade notes](docs/toolchain-upgrade.md) for compatibility changes and
[the comparison with VPN](docs/preset-comparison.md) for the original baselines.

## Preset changes — 2026-10-09

Import sorting now belongs to Oxfmt. Run `pulse-lint oxfmt:check` in CI alongside
lint; lint alone no longer checks import order. The shipped pre-commit hook formats
and sorts staged files before linting and stages the fixes. Groups are Node builtins,
external packages, `@pulse`, `@/`, `#`, parent imports, siblings/indexes and styles.
Side-effect import order is preserved. Oxfmt's algorithm differs from the former
`simple-import-sort` rule, so a first formatting pass may change existing imports.

Folder naming now checks ordinary directories, including nested directories;
previously its glob missed names such as `badFolder`. Base/web/server require
kebab-case; native retains its custom Expo-aware naming rule. The inactive
`tsconfig.eslint.json` blocklist has been removed because Oxlint does not lint JSON.

Native React Compiler errors use Oxlint's built-in rules. `config` and `gating`
are omitted because Oxlint uses fixed compiler options and does not expose gating.
The `react-hooks` and `simple-import-sort` npm plugins are no longer dependencies.
`eslint-plugin-n` stays: its `no-path-concat` catches `import.meta` cases missing
from the built-in equivalent. See [upgrade notes](docs/toolchain-upgrade.md).

## Commands

```json
{
  "scripts": {
    "lint": "pulse-lint oxlint",
    "lint:fix": "pulse-lint oxlint --fix",
    "format": "pulse-lint oxfmt",
    "format:check": "pulse-lint oxfmt:check"
  }
}
```

Run scripts through Yarn (`yarn lint`, `yarn format:check`). Commands also accept
explicit files or directories. Select the project profile explicitly:

```sh
pulse-lint oxlint:base src
pulse-lint oxlint:web src
pulse-lint oxlint:server src
pulse-lint oxlint:server:strict src
```

`oxlint` remains the default web command. Server/base runs are not type-aware;
run the project's typechecker separately.

`pulse-lint oxlint:strict` uses the strict preset, rejects warnings and reports
unused disable directives as errors. Size limits and `no-await-in-loop` are
disabled for test/spec files. This is opt-in because it changes the default gates.
This command uses the web preset. `oxlint:server:strict` applies the same gates
to server code. The strict overlay itself contains lint rules and exemptions;
warning rejection and unused-disable reporting are CLI gates, not JSON rules.

`pulse-lint oxlint:native` runs the native preset with type information and rejects
warnings. Set `"pulseLint": { "preset": "native" }` in a native project's
`package.json` to route individual staged files through it with `pulse-lint lint`.
Server projects can set `"pulseLint": { "preset": "server" }` for the same
file-aware dispatch through `pulse-lint lint`. The nearest `package.json` owns
each file; a nested package without a preset uses web. Caller lint options apply
to web/server groups, while native groups always reject warnings. Server dispatch
preserves the caller working directory and relative option paths. Native dispatch
succeeds when every selected file is ignored, so generated-only commits can pass.
The dispatcher keeps directory targets on web for compatibility; use
`oxlint:server` or `oxlint:native` for whole projects. Consumers supply their own React/React Native dependencies
and TypeScript configuration.

Native boundaries cover alias and relative imports/re-exports, allowing same-feature
access and public `index` entries. User-visible template text in JSX children must
use i18n. The memo-comparator check resolves React import bindings, including
aliases and namespaces; unrelated local functions are not React memo calls.

## Project-specific overrides

Projects own ignore patterns, directory boundaries and architecture conventions.
To extend a preset, create a project-local `oxlint.json`:

```json
{
  "extends": ["./node_modules/@pulse-kit/lint/dist/oxlint/strict.json"],
  "ignorePatterns": ["dist/**", "coverage/**"],
  "rules": {}
}
```

For a custom framework-neutral strict profile, compose the base and overlay:

```json
{
  "extends": [
    "./node_modules/@pulse-kit/lint/dist/oxlint/base.json",
    "./node_modules/@pulse-kit/lint/dist/oxlint/overlays/strict.json"
  ],
  "rules": {}
}
```

Run the installed Oxlint binary with
`oxlint -c oxlint.json --deny-warnings --report-unused-disable-directives-severity=error`
from a package script to apply both the rules and strict execution gates.
The CLI's default commands explicitly select their packaged presets.
Declare the Node environment explicitly at the root of a custom server config;
this also keeps it compatible with older Oxlint versions that do not inherit `env`.
Custom server configs must declare `"env": { "node": true, "browser": false }`
at the top level; the packaged `server` and `server-strict` presets already do.
Typechecking, Knip, tests and builds remain separate consumer-owned checks.

## Optional Git hooks

Consumer `lefthook.yml`:

```yaml
extends:
  - ./node_modules/@pulse-kit/lint/dist/lefthook/index.yml
```

Consumer `package.json`:

```json
{
  "commitlint": {
    "extends": ["@pulse-kit/lint/commitlint"]
  },
  "scripts": {
    "hooks:install": "pulse-lint lefthook install"
  }
}
```

Run `hooks:install` through the package manager after installing dependencies.
Hooks call installed local binaries and never download packages. The compatible
web hook allows up to 20 warnings; native checks always reject warnings. Repository
owners can replace this preset with stricter gates, as VPN currently does.

## Development and verification

```sh
corepack enable
corepack install
yarn install --immutable
yarn build
yarn typecheck
yarn test
yarn pack --out /tmp/pulse-lint.tgz
```

Run `corepack install` in your normal development environment to cache the pinned
Yarn before installing hooks. Repository hooks disable Corepack's interactive
download confirmation because Lefthook buffers command output; an unseen prompt
would otherwise block a commit on a cold cache.

Tests cover profile boundaries, server globals, strict composition, import ordering,
native rules, paths containing spaces/brackets,
real commits in disposable repositories, strict size limits, and installation of
the actual package archive in an independent consumer. The archive test installs
dependencies through Yarn with networking disabled, using its warmed cache.

CLI, plugin, Commitlint and test sources are TypeScript. `yarn build` emits the
CLI, plugin and Commitlint into a clean `dist`, then copies every JSON/YAML preset
and the shared TypeScript config there. `prepack` rebuilds this complete output
automatically. All public exports and CLI config paths point into `dist`. The
archive ships `dist` plus package metadata, documentation and licenses; it excludes
development sources and fixtures. Configs remain in their native JSON/YAML formats.
Filesystem integrations use `node_modules/@pulse-kit/lint/dist/...`; exported names
such as `@pulse-kit/lint/oxlint/server` stay unchanged.

CI runs Yarn immutable installs and the same suite on Node.js 24/Linux. Local verification does not establish
that the CI run or a registry publication has happened. The repository's existing
GPLv3 license is retained; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Repository maintenance

In the source checkout, `docs/architecture.md` records the package structure,
compatibility boundaries and research sources. `AGENTS.md` contains permanent
repository constraints and routes coding agents to the relevant workflow.

Open Codex in this repository to discover
`.agents/skills/maintain-pulse-lint/SKILL.md` automatically, or invoke
`$maintain-pulse-lint` explicitly. The skill maps changes to implementation files
and targeted checks, including build prerequisites and installed-archive testing.
These maintenance instructions belong to the source repository and are excluded
from the consumer archive. Update the guidance when its commands or contracts change.

## Versioning and releases

Run `yarn changeset` with consumer-visible changes. `yarn version:packages` applies
version/changelog changes; CI normally runs it in a release PR. Build and dependency
management remain on Yarn 4. The isolated upload job uses npm CLI for OIDC staging.
See [releasing](docs/releasing.md) before configuring or approving a release.
