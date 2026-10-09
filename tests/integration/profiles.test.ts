import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

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
      expect(result.status, result.output).toBe(0);
    }
    const web = lint(cwd, 'oxlint:web', 'image.tsx');
    expect(web.status, web.output).not.toBe(0);
    expect(web.output).toMatch(/alt-text/);
    const legacy = lint(cwd, 'oxlint', 'image.tsx');
    expect(legacy.status).toBe(web.status);
    expect(legacy.output).toMatch(/alt-text/);
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
      expect(result.status, result.output).toBe(0);
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
    expect(valid.status, valid.output).toBe(0);
    for (const name of ['window', 'document', 'isFinite']) {
      fs.writeFileSync(path.join(cwd, 'invalid.ts'), `export const value = ${name};\n`);
      const invalid = lint(cwd, 'oxlint:server', 'invalid.ts');
      expect(invalid.status, invalid.output).not.toBe(0);
      expect(invalid.output).toMatch(/no-restricted-globals/);
      expect(invalid.output).toMatch(new RegExp(name));
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
    expect(valid.status, valid.output).toBe(0);
    fs.writeFileSync(
      path.join(cwd, 'long.ts'),
      `${Array.from({ length: 221 }, (_, index) => `export const value${index} = ${index};`).join('\n')}\n`,
    );
    const invalid = run('long.ts');
    expect(invalid.status, invalid.output).not.toBe(0);
    expect(invalid.output).toMatch(/max-lines/);
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
    expect(valid.status, valid.output).toBe(0);
    const mixed = lint(cwd, 'lint', 'server-app/image.tsx', 'server-app/web/image.tsx');
    expect(mixed.status, mixed.output).not.toBe(0);
    expect(mixed.output).toMatch(/alt-text/);
    expect(mixed.output).toMatch(/web\/image.tsx/);
    expect(mixed.output).not.toMatch(/server-app\/image.tsx/);
    fs.writeFileSync(path.join(server, 'browser.ts'), 'export const title = document.title;\n');
    const invalid = lint(cwd, 'lint', 'server-app/browser.ts');
    expect(invalid.status, invalid.output).not.toBe(0);
    expect(invalid.output).toMatch(/no-restricted-globals/);
    fs.writeFileSync(path.join(server, 'warning.ts'), 'console.log(42);\n');
    const warning = lint(cwd, 'lint', '--deny-warnings', 'server-app/warning.ts');
    expect(warning.status, warning.output).not.toBe(0);
    expect(warning.output).toMatch(/no-console/);
    const directory = lint(cwd, 'lint', 'server-app');
    expect(directory.status, directory.output).not.toBe(0);
    expect(directory.output).toMatch(/alt-text/);
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
        expect(result.status, result.output).toBe(1);
        expect(result.output).toMatch(/folder-naming-convention/);
      } else {
        expect(result.status, result.output).toBe(0);
      }
    }
  });
});
