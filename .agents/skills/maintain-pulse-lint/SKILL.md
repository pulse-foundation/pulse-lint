---
name: maintain-pulse-lint
description: Use when changing pulse-lint presets, CLI, custom Oxlint rules, hooks, tool dependencies, build output or package exports, or diagnosing regressions in the installed @pulse-kit/lint archive.
---

# Maintain Pulse Lint

Use the task map below to enter the relevant files directly. Read
[architecture](../../../docs/architecture.md) for package-boundary or compatibility
decisions, and [Chat/VPN comparison](../../../docs/preset-comparison.md) for policy
alignment. Resolve these links from this skill directory; command paths below are
relative to the repository root. Read current `package.json` for versions/scripts.

## Edit and verify

| Change                                        | Implementation and coverage                                                                                                                                                      | Targeted check after `yarn build`                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Default web/import rules                      | `src/oxlint/*.json`, `tests/fixtures/import-order/`, `tests/integration/import-order.test.ts`, `tests/fixtures/web-app/`                                                         | `yarn test:import-order`, `yarn test:app`                           |
| Strict gates                                  | `src/oxlint/overlays/strict.json`, `src/oxlint/strict.json`, `src/oxlint/server-strict.json`, strict command in `src/cli/index.ts`, `tests/integration/strict-lint.test.ts`      | `yarn test:strict`                                                  |
| Native rule                                   | `src/oxlint/native.json`, `src/oxlint/plugins/pulse-native.ts`, `tests/fixtures/native-app/`, `tests/integration/native-lint.test.ts`, `tests/integration/native-review.test.ts` | `yarn test:native`                                                  |
| CLI target routing or argv                    | `src/cli/index.ts`, `src/cli/args.ts`, `src/cli/partition.ts`, `tests/integration/cli.test.ts`, `tests/integration/native-lint.test.ts`                                          | `yarn test:native`                                                  |
| Hooks or Commitlint                           | `src/lefthook/index.yml`, `src/commitlint/index.ts`, hook tests in `tests/integration/native-lint.test.ts`                                                                       | `yarn test:native`; exercise changed Commitlint behavior separately |
| Build, exports, paths or runtime dependencies | `package.json`, `tsconfig.build.json`, `scripts/clean-dist.ts`, `scripts/prepare-dist.ts`, `tests/integration/package.test.ts`                                                   | `yarn test:package`                                                 |

Some profiles/plugins need additional case-specific coverage; this map describes
existing checks, not complete coverage of every possible rule.

For a code/config change, add valid and invalid examples for changed behavior,
then build before invoking individual test scripts: they run the compiled CLI.
Invalid fixtures are intentional; keep each violation attributable to its rule.
For a custom native rule, enable/configure it in the native JSON, implement it in
the TS plugin and register its regression case in `tests/integration/native-lint.test.ts`.

Run `yarn test` for final verification of package code, shipped configs, hooks,
build or dependency changes. It includes build, typecheck, lint/format and all
test scripts. A dependency change also needs `yarn install --immutable` against
the updated lockfile. Documentation-only edits use formatting/link checks instead.

`yarn test:profiles` covers base/web/server boundaries, server browser-global
rejection, framework-neutral strict composition and nearest-package dispatch.
Run it after changing profile composition, shared core rules or server routing.
The `node` export is a rule module; complete backend projects select `server`.
`strict` stays a web composition; reusable constraints live in `overlays/strict`.

## Installed-package evidence

`yarn test:package` creates an actual archive, installs it into a temporary
consumer and runs web/native smoke checks plus the shared tsconfig. Run it through
Yarn; IDE runs fall back to the `yarn` executable on PATH. It installs offline,
using the cache warmed by `yarn install --immutable`; use the same cache for both.
It reuses external lockfile resolutions, but consumes this package from its tarball.

The archive test also covers base/web/server profiles, strict server size gates,
server file dispatch and base + strict overlay composition. The native archive
smoke covers a valid route, ignored native dispatch, rendered template text,
relative cross-feature imports and aliased React memo comparators.
When proving another changed rule survives installation, extend that smoke with
the relevant case; the existing smoke does not test every native rule.

For a manual artifact, run `yarn pack --out /tmp/pulse-lint.tgz`. To inspect file
selection, use `yarn pack --dry-run`. Compare `exports`, `bin`, `files`, preset
references and archive entries together when paths change. Ship compiled runtime
and all required configs inside `dist`; keep fixtures, agent guidance and source
tooling out. `yarn build` cleans `dist`, compiles TS, then copies JSON/YAML assets.
The archive test checks every public entry and relative config/plugin reference
inside `dist`, and rejects runtime configs published at package root.

## Preserve consumer behavior

- `lint` dispatches explicit native files by the nearest `package.json` setting
  `pulseLint.preset = "native"` or `"server"`; directory targets use web.
  Whole projects use `oxlint:native` or `oxlint:server` from their project root.
  An unconfigured nested package ends preset inheritance.
- Caller options apply to web/server groups. Native checks reject warnings even
  when a web hook supplies `--max-warnings`.
  Keep argv arrays intact for Expo paths containing brackets, parentheses and spaces.
  `args.ts` consumes value-taking Oxlint flags before routing; update its flag list
  with CLI changes. Preserve `--` and stdin forwarding. Run `yarn test:cli`.
  Server dispatch retains the caller cwd and caller-relative targets/options.
  Native dispatch tolerates an entirely ignored selection for staged-file hooks;
  direct `oxlint:native` retains unmatched-target errors.
- Native relative override globs need the CLI's project-root handling; ignores
  use CLI `--ignore-pattern` because config ignores resolve relative to the config file. Keep the regression for projects beneath a `test` directory.
- Preserve `dist/oxlint/native.json` → `./plugins/pulse-native.js`, CLI
  `dist/cli/index.js`, export names and documented physical preset paths.
- Keep Node env explicit on server entry points; historical Oxlint versions did
  not inherit it. Verify actual diagnostics rather than relying on printed config.
- Read `docs/toolchain-upgrade.md` before restoring legacy rules: 48 old entries
  were never implemented by Oxlint. Their exact values are retained in the linked
  JSON inventory. Do not silently reintroduce them to shipped presets.
- Native React Compiler gates use 13 built-in `react/*` rules at error severity.
  Run `tests/integration/compiler-rules.test.ts` for the migration corpus; do not re-add the JS
  compiler plugin or `config`/`gating` without a concrete need.
- Import order is enforced by Oxfmt, not Oxlint. Preserve `sortSideEffects: false`,
  test grouping/idempotence and real-hook staging when modifying sorting. Base/web/
  server naming uses `pulse-naming` without glob dependencies; native keeps Expo-aware naming.
  Use `tests/integration/naming.test.ts` for its path matrix and preserve middle-extension/dot-path policy.
  Do not re-add check-file/micromatch/braces; custom glob maps are not part of the new rules.
- Tests accept graphical, agent and GitHub annotation diagnostic output; use `--format=json` for
  exact file counts. Avoid relying on automatic terminal summary formatting.
- Root self-lint overrides are distinct from shipped rules. Public preset changes
  can alter consumer failures even when this repository still passes.

Report the consumer-visible effect and fresh verification. Update the matching
docs/skill when a contract changes. Packing/testing does not authorize publishing
or changes in Chat, VPN or Track.

## Release maintenance

Read [releasing](../../../docs/releasing.md) before changing Changesets, workflows,
registry configuration or package access. Use `yarn changeset` for version notes;
keep one package. Public npm access is intentional. The workflow stages an exact
pretested Yarn archive; final approval requires a human on npm with 2FA.
Keep build/install/test work outside the OIDC job, Actions pinned by commit, install
scripts disabled, and audit failures blocking. `PULSE_LINT_ARCHIVE` makes the
package test consume an existing archive instead of repacking. Run `yarn test`,
`yarn audit:dependencies`, workflow validation and an npm staging dry run when
changing this path. Report audit blockers separately from functional tests.
Do not claim branch rules, npm trust or provenance are enabled based on YAML alone.
Do not stage, approve, publish or change remote security settings without user scope.

## Vitest and editor configuration

Tests use explicit Vitest imports and `expect`; do not introduce another test runner.
`yarn test:run` runs all suites, `yarn test:watch` watches, and targeted `test:*`
commands use the same `vitest.config.ts`. Global setup builds before initial runs
and reruns. Keep file parallelism disabled while packing rebuilds shared `dist`.
Fixture/source changes outside Vite imports must trigger reruns too.
Root `tsconfig.json` owns Node development types and explicit source/test includes;
`src/tsconfig/index.json` is the independent published preset. Never publish development
includes, Vitest options or Node-only types through the consumer tsconfig.

Keep `tests/unit`, `tests/integration` and `tests/fixtures` separate. Shared test paths
live in `tests/helpers/paths.ts`. When moving source assets, preserve the physical
`dist` layout and filter JSON/YAML copies so TypeScript plugin sources cannot leak
into the archive. Keep the temporary native regression beneath a literal `test/`
ancestor even though checked-in fixtures live in `tests/fixtures`.
