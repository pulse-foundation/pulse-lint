import { chmodSync, cpSync } from 'node:fs';

for (const asset of ['oxlint', 'oxfmt', 'lefthook/index.yml', 'tsconfig.json']) {
  cpSync(new URL(`../${asset}`, import.meta.url), new URL(`../dist/${asset}`, import.meta.url), {
    recursive: true,
  });
}

chmodSync(new URL('../dist/cli/index.js', import.meta.url), 0o755);
