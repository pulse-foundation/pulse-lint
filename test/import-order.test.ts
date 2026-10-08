import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-import-order-'));
const run = (command: string, file: string) => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'dist/cli/index.js'), command, file],
    {
      cwd,
      encoding: 'utf8',
    },
  );
  return { status: result.status, output: result.stdout + result.stderr };
};

try {
  // Already formatted except for import order: this must fail only after sorting is enabled.
  const file = 'example.ts';
  fs.writeFileSync(
    path.join(cwd, file),
    [
      "import local from './local';",
      "import parent from '../parent';",
      "import alias from '@/alias';",
      "import nestedHash from '#shared/path';",
      "import hash from '#shared';",
      "import pulse from '@pulse/core';",
      "import React from 'react';",
      "import fs from 'node:fs';",
      '',
      'export const values = [local, parent, alias, hash, nestedHash, pulse, React, fs];',
      '',
    ].join('\n'),
  );
  const invalid = run('oxfmt:check', file);
  assert.notEqual(invalid.status, 0, invalid.output);
  const fixed = run('oxfmt', file);
  assert.equal(fixed.status, 0, fixed.output);
  const formatted = fs.readFileSync(path.join(cwd, file), 'utf8');
  const sources = [...formatted.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(sources, [
    'node:fs',
    'react',
    '@pulse/core',
    '@/alias',
    '#shared',
    '#shared/path',
    '../parent',
    './local',
  ]);
  const checked = run('oxfmt:check', file);
  assert.equal(checked.status, 0, checked.output);
  assert.equal(run('oxfmt', file).status, 0);
  assert.equal(
    fs.readFileSync(path.join(cwd, file), 'utf8'),
    formatted,
    'Formatting must be idempotent.',
  );

  const sideEffects = 'side-effects.ts';
  fs.writeFileSync(path.join(cwd, sideEffects), "import './z-init';\nimport './a-init';\n");
  assert.equal(run('oxfmt', sideEffects).status, 0);
  assert.equal(
    fs.readFileSync(path.join(cwd, sideEffects), 'utf8'),
    "import './z-init';\nimport './a-init';\n",
  );
  console.log('Formatter import order regression checks passed.');
} finally {
  fs.rmSync(cwd, { recursive: true, force: true });
}
