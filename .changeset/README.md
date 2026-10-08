# Changesets

Run `yarn changeset` for consumer-visible changes and commit the generated Markdown.
Use patch for compatible fixes, minor for additive presets, major for changed default
failures, autofixes or public paths. Tooling-only changes can use `yarn changeset --empty`.

`yarn version:packages` consumes changesets, updates the version and changelog, and
refreshes the Yarn lockfile. CI prepares a release PR. npm publication requires human
2FA approval of the staged archive. See [release guide](../docs/releasing.md).
