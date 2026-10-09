import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

const cli = path.join(root, 'dist/cli/index.js');

const run = (cwd: string, args: string[], input?: string) =>
  spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: 'utf8', timeout: 5000 });

test('dispatcher keeps separated option values and end-of-options filenames intact', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cli-'));
  try {
    fs.writeFileSync(path.join(cwd, 'valid.ts'), 'export const value = 42;\n');
    fs.writeFileSync(path.join(cwd, '-valid.ts'), 'export const value = 42;\n');
    fs.writeFileSync(path.join(cwd, 'invalid.ts'), 'export const same = (x: number) => x == 42;\n');
    for (const target of ['valid.ts', '-valid.ts']) {
      const result = run(cwd, ['lint', '--format', 'json', '--max-warnings', '20', '--', target]);
      expect(result.status, result.stdout + result.stderr).toBe(target === 'valid.ts' ? 0 : 1);
      const output = JSON.parse(result.stdout) as {
        diagnostics: Array<{ filename: string; code: string }>;
        number_of_files: number;
      };
      if (target === 'valid.ts') expect(output.diagnostics).toStrictEqual([]);
      else {
        expect(output.diagnostics.length).toBe(1);
        expect(output.diagnostics[0].filename).toBe('-valid.ts');
        expect(output.diagnostics[0].code).toMatch(/filename-naming-convention/);
      }
      expect(output.number_of_files).toBe(1);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('native-only dispatch does not interpret a warning-limit value as a web target', () => {
  const result = run(root, [
    'lint',
    '--max-warnings',
    '20',
    'tests/fixtures/native-app/src/app/(group)/[id].tsx',
  ]);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout + result.stderr).not.toMatch(
    /invalid digit|Failed to parse|no files found/i,
  );
});

test('Commitlint receives piped messages and terminates for valid and invalid input', () => {
  const args = ['commitlint', '--config', path.join(root, 'dist/commitlint/index.js')];
  const valid = run(root, args, 'feat(lint): support piped messages\n');
  expect(valid.error).toBe(undefined);
  expect(valid.status, valid.stdout + valid.stderr).toBe(0);
  const invalid = run(root, args, 'not a conventional commit\n');
  expect(invalid.error).toBe(undefined);
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout + invalid.stderr).toMatch(/type-empty|subject-empty/);
});

test('native dispatch succeeds when all selected files are ignored but still rejects violations', () => {
  const ignored = run(root, ['lint', 'tests/fixtures/native-app/src/shared/generated/tokens.tsx']);
  expect(ignored.status, ignored.stdout + ignored.stderr).toBe(0);
  const invalid = run(root, [
    'lint',
    'tests/fixtures/native-app/src/features/violations/raw-text.tsx',
  ]);
  expect(invalid.status, invalid.stdout + invalid.stderr).toBe(1);
  expect(invalid.stdout + invalid.stderr).toMatch(/no-raw-jsx-text/);
});

test('server dispatch preserves caller-relative ignore files and patterns', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cli-server-'));
  try {
    fs.mkdirSync(path.join(cwd, 'server'));
    fs.writeFileSync(
      path.join(cwd, 'server/package.json'),
      JSON.stringify({ pulseLint: { preset: 'server' } }),
    );
    fs.writeFileSync(path.join(cwd, 'server/invalid.ts'), 'export const title = document.title;\n');
    fs.writeFileSync(path.join(cwd, 'ignore.txt'), 'server/invalid.ts\n');
    for (const options of [
      ['--ignore-path', 'ignore.txt'],
      ['--ignore-path=ignore.txt'],
      ['--ignore-pattern', 'server/invalid.ts'],
    ]) {
      const result = run(cwd, [
        'lint',
        ...options,
        '--no-error-on-unmatched-pattern',
        'server/invalid.ts',
      ]);
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
