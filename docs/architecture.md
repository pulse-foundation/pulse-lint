# Pulse Lint architecture

Decision and research recorded on 2026-10-08. Scope: the `pulse-lint` repository,
its distribution as `@pulse-kit/lint`, and reusable context for maintainers/agents.
The deployment manager belongs to Track and has a separate architecture.

## Package boundary

Keep a single versioned package with explicit preset exports and a small CLI.
The CLI, presets and custom plugin are tested and released together. Web, strict
and React Native are configuration profiles, not independently deployed services.

| Approach                                                 | Benefit                                             | Cost                                                          | Decision                                                    |
| -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| One package, explicit subpath exports                    | One install/version; config and CLI stay compatible | Every consumer installs the same runtime dependencies         | Use now                                                     |
| Yarn workspaces with separate config/CLI/plugin packages | Independent dependencies and releases               | More manifests, compatibility ranges and release coordination | Revisit when a real consumer needs independent distribution |
| Separate repositories per tool                           | Independent ownership                               | Cross-repository changes for one policy                       | Unnecessary for the current shared toolkit                  |

This is a recommendation based on the current package boundary, not a general
argument against monorepos. [Yarn documents workspaces](https://yarnpkg.com/features/workspaces)
for multiple packages, add-ons and dependency isolation. None of those currently
requires splitting this small toolkit. A substantial docs application could be
a private workspace later; the existing `tests/fixtures/web-app` has no such requirement.

Explicit [Node subpath exports](https://nodejs.org/api/packages.html#subpath-exports)
give each preset a public name without a separate package. A useful comparison
is [antfu/eslint-config's published manifest](https://github.com/antfu/eslint-config/blob/main/package.json):
its CLI and configuration library are shipped from the same package. This is a
packaging example, not a proposal to adopt its lint engine or dependencies.

## Directory ownership

```text
pulse-lint/
  src/                       # all published package sources
    cli/                     # commands, argv and project dispatch
    commitlint/              # executable commit-message config
    oxlint/                  # JSON profiles, modules and policy overlays
      rules/
      overlays/
      plugins/               # custom TypeScript rules
    oxfmt/index.json          # consumer formatter preset
    lefthook/index.yml        # consumer hook preset
    tsconfig/index.json      # independent consumer TypeScript base
  tests/
    unit/                    # pure logic, no tool processes
    integration/             # CLI, lint, hooks, archive and release checks
    fixtures/                # inputs; never discovered as test suites
      web-app/               # positive web application fixture
      native-app/            # native application with valid and invalid cases
      compiler/              # React Compiler cases
      web-invalid/           # isolated a11y violations
      import-order/          # intentionally unsorted imports
    helpers/                 # shared test utilities and repository paths
    setup.ts                 # build before initial test runs and reruns
    README.md                # testing conventions
  scripts/                   # build and release maintenance
  dist/                      # generated JS, declarations and config assets
  docs/                      # architecture, migration and release guidance
  .github/                   # CI and ownership
  .changeset/                # version notes and Changesets configuration
  .agents/skills/            # maintenance workflow
  AGENTS.md                  # repository instructions
  .oxlintrc.json             # this repository's lint policy
  lefthook.yml               # this repository's Git hooks
  tsconfig.json              # editor and development type checking
  tsconfig.build.json        # compiler settings for dist
  vitest.config.ts           # test discovery and execution
  package.json               # manifest, public exports and commands
  yarn.lock                  # pinned dependency resolutions
```

All consumer presets and executable sources live under `src/`. The build copies
only JSON/YAML assets into `dist` alongside compiled JavaScript and declarations;
TypeScript implementation sources are never copied. The one deliberate layout
mapping is `src/tsconfig/index.json` → `dist/tsconfig.json`, preserving the public path. Consumers use exported names or documented paths
under `node_modules/@pulse-kit/lint/dist`; source directories are not published.
Config-relative references are authored for the built layout, so native linting
uses the built preset rather than the source JSON.

The root `tsconfig.json` provides Node types and includes only development sources
and test harnesses, keeping deliberately invalid fixtures out of type checking.
The consumer preset remains independent under `src/tsconfig/index.json`.

Repository tool configs stay at the root where editors and tools discover them.
`tests/fixtures` is excluded from the root TypeScript project and test discovery;
format ignores cover only deliberately invalid fixtures, so the positive web app
remains checked. Fixtures are neither packages to publish nor Yarn workspaces.

The root `lefthook.yml` and `.oxlintrc.json` are for developing this repository;
`src/lefthook/index.yml` and `src/oxlint/*.json` are consumer-facing presets. Fixtures are
not deployable applications or workspaces. Self-linting extends the built default
preset; `yarn lint` builds first. Vitest builds before initial and repeated runs,
and serializes files because the archive test rebuilds that same output.
If a custom plugin becomes too large,
split its rules into focused source modules while retaining the compiled entry.

## Build and published contracts

`yarn build` removes old `dist`, compiles `src`, copies Oxlint/Oxfmt/Lefthook
presets and the standalone TypeScript config into `dist`, then marks the CLI executable.
All `exports` and `bin` targets point inside `dist`; the package allowlist includes
that directory plus documentation and license files. Runtime dependencies are
installed from the package manifest.
`prepack` rebuilds before `yarn pack`. Consumers run JavaScript through Node;
they do not need a TypeScript loader or this repository's development tools.

`package.json` is the authority for `exports`, `bin`, `files`, engine requirements
and pinned tooling. [Yarn's files allowlist](https://yarnpkg.com/configuration/manifest#files)
defines the archive contents. Root-anchored entries keep nested fixture metadata
out. [Yarn pack](https://yarnpkg.com/cli/pack) provides an archive and a dry-run file list.

Compatibility has two forms here:

- Module/config consumers use exported names such as `@pulse-kit/lint/tsconfig` and
  `@pulse-kit/lint/commitlint`.
- JSON/YAML integrations use documented filesystem paths under
  `node_modules/@pulse-kit/lint`, including `dist/oxlint/*.json` and `dist/lefthook/index.yml`.
  A Node export alias does not repair a changed filesystem path for these tools.

Oxlint [resolves JS plugin specifiers relative to their config](https://oxc.rs/docs/guide/usage/linter/js-plugins.html).
Built base/web/server presets point to `./plugins/pulse-naming.js`;
`dist/oxlint/native.json` additionally points to `./plugins/pulse-native.js`. Moving either
side requires checking that link in the installed archive, not only the source tree.
Archive tests enforce that every export, binary and relative config/plugin reference
exists inside `dist`, with no runtime config directories at package root.
This pre-release layout replaces earlier root-level physical config paths;
exported preset names are unchanged.
Native project overrides are additionally anchored by the CLI; ignores are passed
as project-relative CLI patterns because external config ignores resolve elsewhere; preserve the
regressions covering projects below a `test` folder and route names with spaces/brackets.

The current CLI selects packaged configs explicitly. Consumer-specific overrides
use a local config and the installed Oxlint binary, as described in the README;
they are not automatically merged by the CLI. Hook integrations currently use
`node_modules`; [Yarn supports that linker](https://yarnpkg.com/features/linkers).

## Policy ownership and releases

The default web profile derives from the tested Chat lint gates; the 2026-10-09
upgrade moves import sorting to Oxfmt and activates directory naming checks. The toolchain update
removes legacy entries that Oxlint never implemented; see [upgrade notes](toolchain-upgrade.md). `strict` adds
opt-in limits and execution gates adopted from VPN. `native` adds React Native
type-aware checks, compiler diagnostics and existing Pulse-specific boundaries.
It is an opinionated native profile, not a universal React Native baseline.

### Profile composition

| Concept                 | Responsibility                                                     | Files                                                                            |
| ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Rule modules            | Reusable groups, not complete project configurations               | `rules/core.json`, `typescript.json`, `node.json`, `imports.json`, React modules |
| Environment profiles    | Compose modules with runtime/framework requirements                | `base.json`, `web.json`, `server.json`, `native.json`                            |
| Policy overlays         | Add constraints without choosing a framework                       | `overlays/strict.json`                                                           |
| Compatible compositions | Preserve existing entry points and provide convenient combinations | `index.json`, `strict.json`, `server-strict.json`                                |

`base` combines neutral core, imports, TypeScript and variable rules plus import
naming checks. Import sorting belongs to the formatter. `web` adds legacy React, accessibility and Node plugin
rules. `server` adds Node rules/environment and rejects `window`/`document`;
it does not enable React or a11y plugins. `native` retains its existing Pulse
rules and built-in compiler/type-aware integration while using the shared base.

The legacy `best-practices.json` export now aliases the shared core. Its former
`no-restricted-syntax` entry was not implemented by Oxlint and has been removed
along with other unsupported legacy entries. `index.json` keeps the
same rules as web. `strict.json` composes web with the strict overlay;
`server-strict.json` composes server with it. The `node` export remains a rule
module, not a server profile.

[Oxlint extends](https://oxc.rs/docs/guide/usage/linter/config) composes these
JSON files. The strict overlay contains size rules and test exemptions only;
CLI strict commands additionally reject warnings and unused disable directives.
Base/server commands do not imply type-aware linting or replace a typecheck.
Both server entry points explicitly declare the Node environment, and custom
server configs should do the same. Older Oxlint versions did not inherit `env`
and omitted inherited options/overrides in `--print-config`. Keep runtime
regressions authoritative when upgrading rather than relying on printed config.

`pulse-lint oxlint:base`, `oxlint:web`, `oxlint:server` and
`oxlint:server:strict` select the new profiles. The existing `oxlint`,
`oxlint:strict` and `oxlint:native` commands retain their roles. For file-aware
hooks, `pulseLint.preset` supports `server` and `native`; the nearest package
boundary wins, including an unconfigured nested package. Directory targets
still use web; invoke a specific command for a whole server/native project.

Profile regression tests cover runtime boundaries, strict composition and
mixed file routing. Archive tests resolve new exports and exercise installed
base/web/server/native commands, server dispatch and strict size rejection.

Project-specific directory architecture, deployment recipes, Knip configuration,
app tests/builds and product exceptions belong to consumer repositories. Read the
[comparison](preset-comparison.md) before attempting to replace VPN's configuration;
the strict preset does not reproduce all of VPN's checks.

After the first release, classify compatibility by observable consumer behavior:
new optional presets can be additive; changing default failures, severities,
autofixes, command semantics or supported paths needs explicit migration treatment.
Use a major release for an intentional breaking contract change, following
[SemVer](https://semver.org/). Verify tool/plugin
upgrades as a separate concern from reorganizing files. Current online Oxlint docs
describe a newer evolving toolchain; TS config support and other new APIs are not
evidence that the pinned binary supports them.

Public npm releases now use Changesets and an isolated OIDC staging workflow; see
[releasing](releasing.md) for the manual approval boundary and required remote setup.
Consumer rollouts remain separate work. A successful pack test proves the tested archive works; it
does not prove publication or all real consumer pipelines.

## Persistent agent context

Use three layers with distinct purposes:

| File                                                   | Purpose                                               | When to update                                    |
| ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| `AGENTS.md`                                            | Package boundary, permanent choices and skill routing | A repository-wide constraint changes              |
| `.agents/skills/maintain-pulse-lint/SKILL.md`          | Where to edit and how to verify a package change      | Commands, build prerequisites or workflows change |
| `docs/architecture.md` and `docs/preset-comparison.md` | Reasons, contracts and migration evidence             | A design/policy decision changes                  |

[Codex loads AGENTS.md as project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
[Repository skills](https://learn.chatgpt.com/docs/build-skills) live in `.agents/skills`;
their descriptions are discovered first and their bodies load when relevant.
Keep one maintenance skill while the workflow is cohesive. Add another when a
distinct repeated workflow, such as actual release automation, has concrete steps.

These files are versioned repository context and excluded from the package archive.
Open Codex in `pulse-lint` for automatic project discovery; a chat rooted in the
sibling `track` repository does not automatically inherit this repository's guidance.
The skill can also be invoked explicitly as `$maintain-pulse-lint`.

Keep one canonical copy of each decision, link to details and verify only the
current task's implementation. Refresh the guidance in the same change that alters
its contract. Instructions cannot replace regression tests or archive validation.
