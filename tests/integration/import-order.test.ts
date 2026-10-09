import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

test('formatter sorts import groups, preserves side effects and is idempotent', () => {
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
    fs.copyFileSync(
      path.join(root, 'tests/fixtures/import-order/unsorted.ts'),
      path.join(cwd, file),
    );
    const invalid = run('oxfmt:check', file);
    expect(invalid.status, invalid.output).not.toBe(0);
    const fixed = run('oxfmt', file);
    expect(fixed.status, fixed.output).toBe(0);
    const formatted = fs.readFileSync(path.join(cwd, file), 'utf8');
    const sources = [...formatted.matchAll(/^import .* from '([^']+)';$/gm)].map(
      (match) => match[1],
    );
    expect(sources).toStrictEqual([
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
    expect(checked.status, checked.output).toBe(0);
    expect(run('oxfmt', file).status).toBe(0);
    expect(fs.readFileSync(path.join(cwd, file), 'utf8'), 'Formatting must be idempotent.').toBe(
      formatted,
    );

    const sideEffects = 'side-effects.ts';
    fs.writeFileSync(path.join(cwd, sideEffects), "import './z-init';\nimport './a-init';\n");
    expect(run('oxfmt', sideEffects).status).toBe(0);
    expect(fs.readFileSync(path.join(cwd, sideEffects), 'utf8')).toBe(
      "import './z-init';\nimport './a-init';\n",
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
