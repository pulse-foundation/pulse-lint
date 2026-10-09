# @pulse-kit/lint

## 1.0.1

### Patch Changes

- e5b99b3: Remove the vulnerable check-file dependency chain while preserving shipped kebab-case naming checks in a bundled TypeScript plugin. Rule overrides now use pulse-naming/* without custom glob-map options. Migrate regression tests to Vitest, fix GitHub annotation parsing, and separate editor TypeScript settings from the unchanged consumer preset.

  Group all published sources under src and separate unit/integration tests from fixtures, preserving package exports and the compiled dist layout.

- fbc2ed7: Prepare public npm distribution with Changesets release notes and reviewed staged releases.
