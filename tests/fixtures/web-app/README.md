# Web application fixture

Minimal application-shaped input for the shared web lint and formatter presets.
This is a private test fixture, not a workspace or deployable application.

From the repository root, run `yarn build` then `yarn test:app`.
The scripts invoke the built CLI, which selects configs inside `dist/`.
Dependencies come from the repository install; no separate install is needed here.
