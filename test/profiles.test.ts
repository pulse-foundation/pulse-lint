import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist/cli/index.js');

const inProject = (check: (cwd: string) => void) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-lint-profiles-'));
  try {
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"private":true}');
    check(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
};

const lint = (cwd: string, command: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [cli, command, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
};

test('base and server stay framework-neutral while web keeps React and a11y gates', () => {
  inProject((cwd) => {
    fs.writeFileSync(
      path.join(cwd, 'image.tsx'),
      "export const image = <img src='/logo.svg' />;\n",
    );
    fs.writeFileSync(
      path.join(cwd, 'types.ts'),
      'type PropsWithChildren = { children?: string };\nexport type Widget = PropsWithChildren;\n',
    );
    for (const command of ['oxlint:base', 'oxlint:server', 'oxlint:server:strict']) {
      const options = command.endsWith(':strict') ? [] : ['--deny-warnings'];
      const result = lint(cwd, command, ...options, 'image.tsx', 'types.ts');
      assert.equal(result.status, 0, result.output);
    }
    const web = lint(cwd, 'oxlint:web', 'image.tsx');
    assert.notEqual(web.status, 0, web.output);
    assert.match(web.output, /alt-text/);
    const legacy = lint(cwd, 'oxlint', 'image.tsx');
    assert.equal(legacy.status, web.status);
    assert.match(legacy.output, /alt-text/);
  });
});

test('server profiles declare Node globals when undefined-variable checking is enabled', () => {
  inProject((cwd) => {
    fs.writeFileSync(
      path.join(cwd, 'globals.ts'),
      "export const workingDirectory = process.cwd();\nexport const payload = Buffer.from('hello');\n",
    );
    for (const command of ['oxlint:server', 'oxlint:server:strict']) {
      const result = lint(cwd, command, '-D', 'no-undef', 'globals.ts');
      assert.equal(result.status, 0, result.output);
    }
  });
});

test('server accepts Node code and rejects browser globals without losing base restrictions', () => {
  inProject((cwd) => {
    fs.writeFileSync(
      path.join(cwd, 'server.ts'),
      "import path from 'node:path';\n\nexport const root = path.resolve(process.env.PULSE_ROOT ?? '.');\n",
    );
    const valid = lint(cwd, 'oxlint:server', '--deny-warnings', 'server.ts');
    assert.equal(valid.status, 0, valid.output);
    for (const name of ['window', 'document', 'isFinite']) {
      fs.writeFileSync(path.join(cwd, 'invalid.ts'), `export const value = ${name};\n`);
      const invalid = lint(cwd, 'oxlint:server', 'invalid.ts');
      assert.notEqual(invalid.status, 0, invalid.output);
      assert.match(invalid.output, /no-restricted-globals/);
      assert.match(invalid.output, new RegExp(name));
    }
  });
});

test('strict overlay composes with base without enabling React', () => {
  inProject((cwd) => {
    const config = path.join(cwd, 'oxlint.json');
    fs.writeFileSync(
      config,
      JSON.stringify({
        extends: [
          path.join(root, 'dist/oxlint/base.json'),
          path.join(root, 'dist/oxlint/overlays/strict.json'),
        ],
      }),
    );
    const run = (file: string) => {
      const result = spawnSync(path.join(root, 'node_modules/.bin/oxlint'), ['-c', config, file], {
        cwd,
        encoding: 'utf8',
      });
      return { status: result.status, output: result.stdout + result.stderr };
    };
    fs.writeFileSync(
      path.join(cwd, 'image.tsx'),
      "export const image = <img src='/logo.svg' />;\n",
    );
    const valid = run('image.tsx');
    assert.equal(valid.status, 0, valid.output);
    fs.writeFileSync(
      path.join(cwd, 'long.ts'),
      `${Array.from({ length: 221 }, (_, index) => `export const value${index} = ${index};`).join('\n')}\n`,
    );
    const invalid = run('long.ts');
    assert.notEqual(invalid.status, 0, invalid.output);
    assert.match(invalid.output, /max-lines/);
  });
});

test('file dispatcher separates server projects and respects the nearest package boundary', () => {
  inProject((cwd) => {
    const server = path.join(cwd, 'server-app');
    const nested = path.join(server, 'web');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(server, 'package.json'),
      JSON.stringify({ private: true, pulseLint: { preset: 'server' } }),
    );
    fs.writeFileSync(path.join(nested, 'package.json'), '{"private":true}');
    const image = "export const image = <img src='/logo.svg' />;\n";
    fs.writeFileSync(path.join(server, 'image.tsx'), image);
    fs.writeFileSync(path.join(nested, 'image.tsx'), image);
    const valid = lint(cwd, 'lint', 'server-app/image.tsx');
    assert.equal(valid.status, 0, valid.output);
    const mixed = lint(cwd, 'lint', 'server-app/image.tsx', 'server-app/web/image.tsx');
    assert.notEqual(mixed.status, 0, mixed.output);
    assert.match(mixed.output, /alt-text/);
    assert.match(mixed.output, /web\/image.tsx/);
    assert.doesNotMatch(mixed.output, /server-app\/image.tsx/);
    fs.writeFileSync(path.join(server, 'browser.ts'), 'export const title = document.title;\n');
    const invalid = lint(cwd, 'lint', 'server-app/browser.ts');
    assert.notEqual(invalid.status, 0, invalid.output);
    assert.match(invalid.output, /no-restricted-globals/);
    fs.writeFileSync(path.join(server, 'warning.ts'), 'console.log(42);\n');
    const warning = lint(cwd, 'lint', '--deny-warnings', 'server-app/warning.ts');
    assert.notEqual(warning.status, 0, warning.output);
    assert.match(warning.output, /no-console/);
    const directory = lint(cwd, 'lint', 'server-app');
    assert.notEqual(directory.status, 0, directory.output);
    assert.match(directory.output, /alt-text/);
  });
});

test('base rejects non-kebab directories while allowing nested kebab directories', () => {
  inProject((cwd) => {
    for (const directory of ['badFolder', 'good-folder/badFolder', 'good-folder/deep-folder']) {
      fs.mkdirSync(path.join(cwd, directory), { recursive: true });
      const file = `${directory}/file.ts`;
      fs.writeFileSync(path.join(cwd, file), 'export const value = 42;\n');
      const result = lint(cwd, 'oxlint:base', file);
      if (directory.includes('badFolder')) {
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, /folder-naming-convention/);
      } else {
        assert.equal(result.status, 0, result.output);
      }
    }
  });
});
