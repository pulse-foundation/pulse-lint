import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
      assert.equal(result.status, target === 'valid.ts' ? 0 : 1, result.stdout + result.stderr);
      const output = JSON.parse(result.stdout) as {
        diagnostics: Array<{ filename: string; code: string }>;
        number_of_files: number;
      };
      if (target === 'valid.ts') assert.deepEqual(output.diagnostics, []);
      else {
        assert.equal(output.diagnostics.length, 1);
        assert.equal(output.diagnostics[0].filename, '-valid.ts');
        assert.match(output.diagnostics[0].code, /filename-naming-convention/);
      }
      assert.equal(output.number_of_files, 1);
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
    'test/native-fixture/src/app/(group)/[id].tsx',
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /invalid digit|Failed to parse|no files found/i,
  );
});

test('Commitlint receives piped messages and terminates for valid and invalid input', () => {
  const args = ['commitlint', '--config', path.join(root, 'dist/commitlint/index.js')];
  const valid = run(root, args, 'feat(lint): support piped messages\n');
  assert.equal(valid.error, undefined);
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const invalid = run(root, args, 'not a conventional commit\n');
  assert.equal(invalid.error, undefined);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stdout + invalid.stderr, /type-empty|subject-empty/);
});

test('native dispatch succeeds when all selected files are ignored but still rejects violations', () => {
  const ignored = run(root, ['lint', 'test/native-fixture/src/shared/generated/tokens.tsx']);
  assert.equal(ignored.status, 0, ignored.stdout + ignored.stderr);
  const invalid = run(root, ['lint', 'test/native-fixture/src/features/violations/raw-text.tsx']);
  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout + invalid.stderr, /no-raw-jsx-text/);
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
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
