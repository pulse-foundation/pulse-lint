import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

const cases: Array<[string, string[]]> = [
  ['valid.ts', []],
  ['a-b2.ts', []],
  ['a1.ts', []],
  ['a.test.ts', []],
  ['a.BAD.ts', []],
  ['a.d.ts', []],
  ['.hidden.ts', []],
  ['valid-dir/good.ts', []],
  ['a1/good.ts', []],
  ['good-dir/index.test.ts', []],
  ['camelCase.ts', ['filename']],
  ['PascalCase.ts', ['filename']],
  ['snake_case.ts', ['filename']],
  ['a--b.ts', ['filename']],
  ['1-name.ts', ['filename']],
  ['123.ts', ['filename']],
  ['[id].tsx', ['filename']],
  ['[...id].tsx', ['filename']],
  ['_layout.tsx', ['filename']],
  ['+not-found.tsx', ['filename']],
  ['école.ts', ['filename']],
  ['badDir/good.ts', ['folder']],
  ['valid-dir/badDir/good.ts', ['folder']],
  ['badDir/secondBad/good.ts', ['folder']],
  ['badDir/badFile.ts', ['filename', 'folder']],
  ['.hidden/good.ts', ['folder']],
  ['.hidden/badFile.ts', ['folder']],
  ['a--b/good.ts', ['folder']],
  ['123/good.ts', ['folder']],
  ['a.b/good.ts', ['folder']],
  ['src/app/(group)/good.ts', ['folder']],
  ['src/app/[id]/good.ts', ['folder']],
];

for (const profile of ['base', 'web', 'server']) {
  test(`${profile} preserves filename and folder naming policy without glob dependencies`, () => {
    // The containing folder is deliberately invalid: only project-relative folders count.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'PulseNaming-'));
    try {
      for (const [file] of cases) {
        const target = path.join(cwd, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(
          target,
          file.endsWith('.tsx') ? 'export const value = <div />;\n' : 'export const value = 1;\n',
        );
      }
      const result = spawnSync(
        path.join(root, 'node_modules/.bin/oxlint'),
        [
          '-c',
          path.join(root, `dist/oxlint/${profile}.json`),
          '--format=json',
          '--no-ignore',
          ...cases.map(([file]) => file),
        ],
        { cwd, encoding: 'utf8' },
      );
      expect(result.status, result.stdout + result.stderr).toBe(1);
      const report = JSON.parse(result.stdout) as {
        diagnostics: Array<{ filename: string; code: string }>;
      };
      expect(
        report.diagnostics.map(({ filename, code }) => `${filename}: ${code}`).sort(),
      ).toStrictEqual(
        cases
          .flatMap(([file, rules]) =>
            rules.map((rule) => `${file}: pulse-naming(${rule}-naming-convention)`),
          )
          .sort(),
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
}
