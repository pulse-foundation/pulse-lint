---
'@pulse-kit/lint': patch
---

Remove the vulnerable check-file dependency chain while preserving shipped kebab-case naming checks in a bundled TypeScript plugin. Rule overrides now use pulse-naming/* without custom glob-map options. Migrate regression tests to Vitest, fix GitHub annotation parsing, and separate editor TypeScript settings from the unchanged consumer preset.

Group all published sources under src and separate unit/integration tests from fixtures, preserving package exports and the compiled dist layout.
