# Toolchain upgrade — 2026-10-08

Direct dependencies were checked against the npm registry `latest` tags. Versions
are pinned exactly; Yarn 4.18.1 and its lockfile remain the installation contract.
TypeScript 7.0.2 is the stable `typescript` package and uses `tsc` for build/typecheck.
See the [official TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

## Versions

| Package                            | Version    |
| ---------------------------------- | ---------- |
| `@commitlint/cli`                  | `21.2.3`   |
| `@commitlint/config-conventional`  | `21.2.3`   |
| `eslint-plugin-check-file`         | `3.3.2`    |
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
- The existing JS React Compiler rules remain error gates. Corresponding native
  Oxlint rules are off in the native profile to avoid duplicate diagnostics.
  Other newly enabled upstream defaults can change diagnostics; full consumer
  migrations still need their own quality checks.
- CLI dispatch preserves separated option values and `--`. Native dispatch keeps
  its fixed warning policy. All subprocesses inherit stdin, so piped Commitlint
  messages terminate normally.
- Regression tests understand current diagnostic names and both graphical and
  agent output. File counts use explicit JSON output.

## Verification and release boundary

Run `yarn install --immutable` and `yarn test`. The suite builds from TypeScript 7,
checks types/lint/format, exercises real hooks, and installs a packed archive into
an independent consumer, including valid/invalid piped Commitlint input without
the development TypeScript dependency. Yarn still reports the ESLint peers of
Oxlint-hosted plugins and upstream TS-loader peers inside Commitlint; these are
not hidden or replaced with unused runtime engines. All runtime exports, assets and CLI paths remain in
`dist`. No publication or consumer rollout is implied by these local checks.
