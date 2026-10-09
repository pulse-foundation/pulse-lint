# Tests

Use `yarn test` for the full quality pipeline, `yarn test:run` for Vitest and
`yarn test:watch` for watch mode. Targeted `test:*` commands use the same config.
Vitest collects `unit/**/*.test.ts` and `integration/**/*.test.ts` under this folder.

- `unit/`: pure functions such as release-mode selection.
- `integration/`: real CLI/tool processes, Git hooks, versioning and archive installation.
- `fixtures/`: application-shaped inputs and intentional violations, never test suites.
- `helpers/`: shared paths/utilities; `setup.ts` prepares compiled output.

Fixtures are excluded from repository-wide type checking. Formatter ignores cover
native/compiler/invalid-web/import-order inputs; the positive `web-app` stays checked.
Run `yarn test:app` from the repository root to check it. Do not install dependencies
inside fixture apps or treat them as workspaces. Temporary fixture copies isolate autofixes.

Vitest setup builds the CLI/plugins before each initial run and rerun. Test files
run sequentially because the archive test rebuilds the shared `dist` directory.
Independent native cases use bounded concurrency; Git-hook cases run sequentially.
The package test installs a real archive into a temporary offline consumer. Install
repository dependencies through Yarn first to warm the cache. All temporary files
and Git commits belong to disposable fixture repositories, never the source checkout.
