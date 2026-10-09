import { chmodSync, cpSync, statSync } from 'node:fs';

// Presets share src/oxlint with TypeScript plugins. Copy only native config assets;
// tsc already emitted the executable plugins and their declarations into dist.
for (const asset of ['oxlint', 'oxfmt', 'lefthook/index.yml']) {
  cpSync(
    new URL(`../src/${asset}`, import.meta.url),
    new URL(`../dist/${asset}`, import.meta.url),
    {
      recursive: true,
      filter: (source) => statSync(source).isDirectory() || /\.(json|ya?ml)$/.test(source),
    },
  );
}

// Preserve the established public physical path as well as the export alias.
cpSync(
  new URL('../src/tsconfig/index.json', import.meta.url),
  new URL('../dist/tsconfig.json', import.meta.url),
);

chmodSync(new URL('../dist/cli/index.js', import.meta.url), 0o755);
