import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

for (const command of ['oxlint:strict', 'oxlint:server:strict']) {
  test(`${command} enforces VPN size limits while retaining test exemptions`, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-lint-strict-'));
    const lint = (file: string, strict = true) =>
      spawnSync(
        process.execPath,
        [path.join(root, 'dist/cli/index.js'), strict ? command : 'oxlint', file],
        { cwd: temporary, encoding: 'utf8' },
      );
    try {
      fs.writeFileSync(path.join(temporary, 'package.json'), '{"private":true}');
      fs.writeFileSync(
        path.join(temporary, 'long.ts'),
        `${Array.from({ length: 221 }, (_, index) => `export const value${index} = ${index};`).join('\n')}\n`,
      );
      expect(lint('long.ts', false).status).toBe(0);
      const longFile = lint('long.ts');
      expect(longFile.status).not.toBe(0);
      expect(longFile.stdout + longFile.stderr).toMatch(/max-lines/);
      const longFunction = `export const calculate = (value: number) => {\n  let result = value;\n${'  result += 1;\n'.repeat(80)}  return result;\n};\n`;
      fs.writeFileSync(path.join(temporary, 'calculate.ts'), longFunction);
      const result = lint('calculate.ts');
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/max-lines-per-function/);
      fs.writeFileSync(path.join(temporary, 'calculate.test.ts'), longFunction);
      const exempt = lint('calculate.test.ts');
      expect(exempt.status, exempt.stdout + exempt.stderr).toBe(0);
      fs.writeFileSync(path.join(temporary, 'warning.ts'), 'console.log(42);\n');
      expect(lint('warning.ts', false).status).toBe(0);
      const warning = lint('warning.ts');
      expect(warning.status).not.toBe(0);
      expect(warning.stdout + warning.stderr).toMatch(/no-console/);
      fs.writeFileSync(
        path.join(temporary, 'unused.ts'),
        '// oxlint-disable-next-line eqeqeq\nexport const answer = 42;\n',
      );
      const unused = lint('unused.ts');
      expect(unused.status).not.toBe(0);
      expect(unused.stdout + unused.stderr).toMatch(/unused.*directive|directive.*unused/i);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}
