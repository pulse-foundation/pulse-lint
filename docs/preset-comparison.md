# Pulse Chat and VPN lint comparison

Inspected on 2026-10-08. Sources: Chat `packages/pulse-lint`, VPN `oxlint.json`,
`lefthook.yml`, root scripts and `scripts/oxlint/frontend-layout-plugin.mjs`.

VPN's baseline was adapted from Chat. It uses fewer explicit rules and stricter
execution gates. Neither profile is uniformly stronger.

| Area                        | Chat baseline                                      | VPN                                                                      | Extraction decision                                     |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Oxlint / Oxfmt              | 1.35.0 / ^0.35.0                                   | 1.83.0 / 0.68.0                                                          | Updated after extraction; see toolchain upgrade notes   |
| File size                   | Warning at 350 lines                               | Error over 220 nonblank, noncomment lines                                | Add optional strict preset                              |
| Function size               | No explicit limit                                  | Error over 80 nonblank, noncomment lines                                 | Add to strict; exempt tests                             |
| Warnings                    | Web hooks permit 20                                | Zero allowed                                                             | Strict CLI rejects warnings; default remains compatible |
| Unused disable directives   | Not a default error                                | Errors                                                                   | Enable in strict CLI                                    |
| Import ordering / filenames | JavaScript plugins                                 | No equivalent general rule                                               | Preserve Chat checks                                    |
| Duplicate imports           | `import/no-duplicates`, query strings considered   | `no-duplicate-imports`                                                   | Preserve Chat's existing rule; avoid double reporting   |
| React dynamic links         | Explicit `enforceDynamicLinks: always`             | Default options                                                          | Preserve Chat options                                   |
| Duplicate JSX props         | Explicit `ignoreCase: true`                        | Default options                                                          | Use supported native options                            |
| Native applications         | Typed rules, React Compiler and feature boundaries | No native profile                                                        | Preserve and export native preset                       |
| Component layout            | Allows several components per file                 | Single component, `component-folder/index.tsx`, hooks/mutations separate | Keep VPN architecture local                             |
| Format preferences          | Single quotes for TS/JS and JSX                    | Same                                                                     | Preserve shared formatter config; ignores stay local    |
| Full quality checks         | Depend on each app                                 | Format, lint, typecheck, Knip; tests/build separately                    | Document consumer-owned gates                           |

Chat's merged JSON contains 307 explicit rule entries, including disabled rules;
VPN's root config has 50. Of those 50, 39 have literally identical JSON values,
10 differ and only `max-lines-per-function` is absent from Chat. These counts are
not counts of effective checks: defaults, plugin support, overrides and disabled
rules also affect behavior. Several JSON differences are merely equivalent
syntax or diagnostic wording.

The current package has since been upgraded to Oxlint 1.87.0 / Oxfmt 0.72.0
and TypeScript 7.0.2. The table above records source baselines, not current
dependencies. [Upgrade notes](toolchain-upgrade.md) document removed unsupported
entries and compatibility adjustments.

## What stays local

VPN's component-layout plugin is tied to a specific React folder convention.
Its application globs, test exceptions, Knip entries and build/typecheck commands
belong to VPN. Applying them to Chat would require an unrelated restructuring.
The strict preset imports the size limits and test exemptions, not this layout.

The strict preset composes the supported web profile extracted from Chat with the framework-neutral
`oxlint/overlays/strict.json` layer. `server-strict` applies that same layer to
the Node server profile; `oxlint/node` remains only a rule module.
The strict CLI commands additionally reject warnings and unused disable directives.
The web strict preset extends the package's web preset. It is not a replacement preserving
all of VPN's current behavior. VPN also opts into native Oxlint promise, node and
vitest plugins. Keep its current config until a separately
verified migration preserves its gates. Native-only here means rules implemented
by Oxlint itself; it is distinct from the React Native application preset.

## Migration order

1. Install this archive in an independent consumer and run the package suite.
2. Switch Chat and Track to a published, pinned package version while retaining
   their default presets, local exceptions and existing quality gates.
3. Add strict checks where the project agrees to the stricter policy.
4. Align tool versions and migrate VPN separately, validating its existing layout
   plugin and full quality checks before replacing its local configuration.

Extraction does not change either consumer or authorize publishing a release.
