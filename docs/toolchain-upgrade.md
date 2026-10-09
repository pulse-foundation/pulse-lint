# Toolchain upgrade — 2026-10-08

Versions below record the initial upgrade. The 2026-10-09 simplification removes
two plugins as described below; `package.json` and `yarn.lock` are authoritative.

Direct dependencies were checked against the npm registry `latest` tags. Versions
are pinned exactly; Yarn 4.18.1 and its lockfile remain the installation contract.
TypeScript 7.0.2 is the stable `typescript` package and uses `tsc` for build/typecheck.
See the [official TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

## Versions

| Package                            | Version    |
| ---------------------------------- | ---------- |
| `@commitlint/cli`                  | `21.2.3`   |
| `@commitlint/config-conventional`  | `21.2.3`   |
| `eslint-plugin-n`                  | `18.4.1`   |
| `eslint-plugin-react-hooks`        | `7.1.1`    |
| `eslint-plugin-simple-import-sort` | `14.0.0`   |
| `execa`                            | `10.1.0`   |
| `lefthook`                         | `2.1.17`   |
| `oxfmt`                            | `0.72.0`   |
| `oxlint`                           | `1.87.0`   |
| `oxlint-tsgolint`                  | `7.0.2003` |
| `@commitlint/types`                | `21.2.3`   |
| `@types/eslint`                    | `9.6.1`    |
| `@types/estree`                    | `1.0.9`    |
| `@types/estree-jsx`                | `1.0.5`    |
| `@types/node`                      | `26.6.4`   |
| `@types/react`                     | `19.3.0`   |
| `react`                            | `19.3.0`   |
| `react-dom`                        | `19.3.0`   |
| `typescript`                       | `7.0.2`    |

Lefthook is the only direct dependency below its `latest` tag: 2.2.0 and 2.2.1 were
published within Yarn's default 1440-minute age gate when checked. Use 2.1.17 until
the newer release clears quarantine and passes the real-commit tests. No age-gate
bypass is configured. Recheck the registry when upgrading; these are dated values.

## Compatibility corrections

- Oxlint 1.87.0 rejects unknown rules. The extraction contained 48 unsupported
  entries (including disabled entries and duplicate references). All were checked
  individually: Oxlint 1.35.0 accepted their exact configuration with exit 0;
  1.87.0 rejects each as a missing rule. Their implementations were also absent
  from 1.35.0's successful `--rules` output. Exact previous values are retained in
  [the inventory](unsupported-legacy-rules.json). Removing them does not supply the
  originally intended checks: variable naming, mixed-script string detection,
  PropsWithChildren bans and unused exports are still not enforced by those entries.
  Adding such policies requires supported rules/plugins and behavior tests.
- `react/jsx-no-duplicate-props` remains an error without the unsupported
  `ignoreCase` option. Case-insensitive JSX prop checks are not promised.
- `ignoreMiddleExtensions` belongs to the filename rule, not the folder rule.
  It is retained only where supported.
- The native CLI passes ignore patterns relative to the project through
  `--ignore-pattern`. Overrides retain project-root anchoring, including projects
  below a `test` directory and paths containing spaces/brackets.
- At the initial upgrade, JS React Compiler rules remained error gates with
  corresponding built-ins disabled. The 2026-10-09 migration below replaces this.
  Other newly enabled upstream defaults can change diagnostics; full consumer
  migrations still need their own quality checks.
- CLI dispatch preserves separated option values and `--`. Native dispatch keeps
  its fixed warning policy. All subprocesses inherit stdin, so piped Commitlint
  messages terminate normally.
- Regression tests understand current diagnostic names and graphical, agent and
  GitHub Actions annotation output. File counts use explicit JSON output.

## Verification and release boundary

Run `yarn install --immutable` and `yarn test`. The suite builds from TypeScript 7,
checks types/lint/format, exercises real hooks, and installs a packed archive into
an independent consumer, including valid/invalid piped Commitlint input without
the development TypeScript dependency. Yarn still reports the ESLint peers of
Oxlint-hosted plugins and upstream TS-loader peers inside Commitlint; these are
not hidden or replaced with unused runtime engines. All runtime exports, assets and CLI paths remain in
`dist`. No publication or consumer rollout is implied by these local checks.

## Preset simplification — 2026-10-09

- Import sorting moved from `simple-import-sort/imports` (lint warning) into
  Oxfmt's `sortImports`. Preserve the major import groups, leave side-effect order
  unchanged, and run `oxfmt:check` as a required CI gate. The sorting algorithm is
  different; this is a consumer-visible migration, not exact formatting parity.
  [Oxfmt reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference#sortimports).
- Folder naming was expanded to ordinary directories (formerly the `**/` glob), with regression coverage for
  root and nested invalid directories and valid kebab-case paths. It can reject
  folders that previously slipped through. Native keeps its Expo-aware rule.
- Removed `check-file/filename-blocklist`: its only target was JSON, which Oxlint
  does not lint. This does not introduce a replacement JSON filename restriction.
- Native enables 13 built-in React Compiler rules at error severity. A comparison
  corpus exercises every migrated rule and a valid component. `config` and
  `gating` are omitted because Oxlint fixes compiler options and exposes no gating
  configuration. [Oxc explanation](https://oxc.rs/blog/2026-08-18-react-compiler-support).
  These examples establish covered behavior, not universal engine equivalence.
- Removed runtime dependencies `eslint-plugin-react-hooks` and
  `eslint-plugin-simple-import-sort`. `eslint-plugin-check-file` was subsequently
  replaced by the bundled `pulse-naming` TypeScript plugin, removing micromatch
  and braces. Keep `eslint-plugin-n` and the Pulse plugins for remaining checks.
  In particular, installed native `node/no-path-concat` misses concatenation of
  `import.meta.dirname` / `import.meta.url`, while `n/no-path-concat` catches it.

Import sorting is tested through compiled formatter commands, including check,
autofix, idempotence and side-effect order. Real-hook coverage verifies that sorted
imports enter the commit and unrelated unstaged edits remain untouched. The packed
consumer checks directory naming, formatter sorting and built-in compiler errors.
Root `.prettierignore` excludes deliberately invalid/unsorted test fixtures from
repository-wide formatting; consumer formatting still uses the shipped preset.

## Vitest and naming migration — 2026-10-09

All test suites now use Vitest 5.0.3 and its `expect` API. Vite 8.3.3 is the newest
version accepted by the 24-hour age gate during this change; 8.3.4 was quarantined.
The Node environment, bounded concurrency, build setup and explicit fixture exclusions
are shared by local, IDE and CI runs. The native diagnostic parser handles GitHub
annotations explicitly; negative lint fixtures continue to assert actual rejection.

The new `pulse-naming` plugin implements the two previously shipped kebab-case
checks without a glob library. The naming matrix covers 32 paths per base/web/server
profile, including dot paths, digits, middle extensions and Expo-style names.
Native keeps its separate Expo-aware rule. Rule overrides must use `pulse-naming/*`
instead of `check-file/*`; the new rules have no arbitrary glob-map options.
