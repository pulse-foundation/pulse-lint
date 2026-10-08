# Pulse Lint

`@pulse/lint` is one shared tooling package for Pulse projects. Its public contracts
are the CLI commands, exported presets and documented config paths.

## Start here

- Use Node and Yarn versions from `package.json`; use Yarn 4, `yarn.lock` and
  `nodeLinker: node-modules`. Install with `yarn install --immutable`.
- For package code, presets, plugins, hooks, dependency upgrades or packaging,
  read [maintain-pulse-lint](.agents/skills/maintain-pulse-lint/SKILL.md).
- For structure and compatibility decisions, read [architecture](docs/architecture.md).
  Read [Chat/VPN comparison](docs/preset-comparison.md) when changing preset policy
  or planning a consumer migration. These documents are navigation aids; verify
  the relevant current code and tests instead of repeating a full repository audit.

## Repository constraints

- Keep one package until a concrete need for independent distribution or release
  cycles justifies workspaces. `test-app` and `test/*-fixture` are fixtures.
- Author executable code in TypeScript under `src/`. Build output belongs in
  ignored `dist/`; copy JSON/YAML presets there in their tool's native format.
  All public runtime exports and CLI config paths must resolve inside `dist/`.
- Keep reusable rule modules, environment profiles and policy overlays distinct.
  Server projects use `server`; the `node` export is only a rule module.
- Preserve the default Chat-compatible preset. Stricter gates belong in opt-in
  presets. Consumer folder conventions and application quality pipelines stay
  in their projects.
- Treat changes to preset severity, warning gates, public paths and CLI behavior
  as compatibility changes. Update the relevant documentation and regression
  coverage with the change.
- Root `.oxlintrc.json` controls this repository's own linting. Its exceptions
  must not silently weaken presets shipped to consumers.
- Some fixtures are deliberately invalid or incorrectly formatted. Change only
  the examples relevant to the task; avoid bulk autofixes over fixtures.
- Keep tool/plugin versions coordinated through the manifest and lockfile.
  Existing ESLint-compatible plugins run under Oxlint; an ESLint engine is not
  required. Validate an upgrade against this package, not just current online docs.
- Keep durable decisions in `docs/` and the matching workflow in the skill.
  Update existing guidance when behavior changes; keep temporary plans in ignored
  `.agent-tmp/`. Do not duplicate the same policy across multiple skill folders.

## Verification and scope

Use the skill's check matrix for code/config changes. For documentation-only
changes, check formatting, links and examples; package-surface changes also need
an archive check. Report exactly which checks ran.

Inspect and preserve existing working-tree changes. Routine reversible work
within the requested scope needs no additional approval stages. Leave changes
uncommitted and do not publish, push or modify consumer repositories unless the
user requests those actions.
