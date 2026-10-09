import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-compiler-'));
const compilerRules = [
  'static-components',
  'use-memo',
  'void-use-memo',
  'preserve-manual-memoization',
  'incompatible-library',
  'immutability',
  'globals',
  'refs',
  'set-state-in-effect',
  'error-boundaries',
  'purity',
  'set-state-in-render',
  'unsupported-syntax',
];

beforeAll(() => {
  const native = JSON.parse(fs.readFileSync(path.join(root, 'src/oxlint/native.json'), 'utf8')) as {
    rules: Record<string, unknown>;
  };
  // Exercise the native preset's compiler gates without loading any JS plugin or unrelated
  // rule. Disabling a shipped compiler rule must stop rejecting its fixture and fail this test.
  fs.writeFileSync(
    path.join(temporary, 'oxlint.json'),
    JSON.stringify({
      plugins: ['react'],
      categories: { correctness: 'off' },
      rules: Object.fromEntries(
        compilerRules.map((rule) => [`react/${rule}`, native.rules[`react/${rule}`] ?? 'off']),
      ),
    }),
  );
  fs.cpSync(path.join(root, 'tests/fixtures/compiler'), path.join(temporary, 'fixtures'), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(root, 'tests/fixtures/native-app/src/features/violations/ref-in-render.tsx'),
    path.join(temporary, 'fixtures/native-ref-in-render.tsx'),
  );
});
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

const lint = (fixture: string) => {
  const result = spawnSync(
    path.join(root, 'node_modules/.bin/oxlint'),
    ['-c', path.join(temporary, 'oxlint.json'), '--format=json', `fixtures/${fixture}.tsx`],
    { cwd: temporary, encoding: 'utf8', timeout: 10000 },
  );
  expect(result.error).toBe(undefined);
  const report = JSON.parse(result.stdout) as {
    diagnostics: Array<{ code: string; severity: string }>;
    number_of_files: number;
  };
  expect(report.number_of_files, result.stdout + result.stderr).toBe(1);
  return { result, report };
};

// Compared against eslint-plugin-react-hooks 7.1.1 before migration: all thirteen invalid
// cases report the same rule/severity in Oxlint 1.87.0; the valid case is clean in both.
for (const [fixture, rule] of [
  ...compilerRules.map((name) => [name, name]),
  ['void-use-memo-no-return', 'void-use-memo'],
  ['native-ref-in-render', 'refs'],
]) {
  test(`native compiler rejects ${fixture}`, () => {
    const { result, report } = lint(fixture);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(
      report.diagnostics.map(({ code, severity }) => {
        return { code, severity };
      }),
      result.stdout,
    ).toStrictEqual([{ code: `react(${rule})`, severity: 'error' }]);
  });
}

test('native compiler accepts pure render, memo results and refs in effects/events', () => {
  const { result, report } = lint('valid');
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(report.diagnostics).toStrictEqual([]);
});
