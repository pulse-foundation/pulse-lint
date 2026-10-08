import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
      assert.equal(lint('long.ts', false).status, 0);
      const longFile = lint('long.ts');
      assert.notEqual(longFile.status, 0);
      assert.match(longFile.stdout + longFile.stderr, /max-lines/);
      const longFunction = `export const calculate = (value: number) => {\n  let result = value;\n${'  result += 1;\n'.repeat(80)}  return result;\n};\n`;
      fs.writeFileSync(path.join(temporary, 'calculate.ts'), longFunction);
      const result = lint('calculate.ts');
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /max-lines-per-function/);
      fs.writeFileSync(path.join(temporary, 'calculate.test.ts'), longFunction);
      const exempt = lint('calculate.test.ts');
      assert.equal(exempt.status, 0, exempt.stdout + exempt.stderr);
      fs.writeFileSync(path.join(temporary, 'warning.ts'), 'console.log(42);\n');
      assert.equal(lint('warning.ts', false).status, 0);
      const warning = lint('warning.ts');
      assert.notEqual(warning.status, 0);
      assert.match(warning.stdout + warning.stderr, /no-console/);
      fs.writeFileSync(
        path.join(temporary, 'unused.ts'),
        '// oxlint-disable-next-line eqeqeq\nexport const answer = 42;\n',
      );
      const unused = lint('unused.ts');
      assert.notEqual(unused.status, 0);
      assert.match(unused.stdout + unused.stderr, /unused.*directive|directive.*unused/i);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}
