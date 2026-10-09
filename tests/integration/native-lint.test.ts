// Regression tests for the React Native lint gates: `oxlint:native`, the file-aware `lint`
// dispatcher and the lefthook pre-commit preset. Run with `yarn test:native`.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { afterAll, beforeAll, describe, test, expect } from 'vitest';

import { partitionLintTargets } from '../../src/cli/partition.ts';
import { packageRoot } from '../helpers/paths.ts';

const cliPath = path.join(packageRoot, 'dist/cli/index.js');
const fixtureSource = path.join(packageRoot, 'tests/fixtures/native-app');
const webFixture = path.join(packageRoot, 'tests/fixtures/web-invalid/logo-image.tsx');
const lefthookPreset = path.join(packageRoot, 'dist/lefthook/index.yml');
const lefthookBin = path.join(packageRoot, 'node_modules/.bin/lefthook');

const VALID_FILES = [
  'src/app/_layout.tsx',
  'src/app/+not-found.tsx',
  'src/app/(group)/[id].tsx',
  'src/app/(group)/[...rest].tsx',
  'src/features/greeting/index.ts',
  'src/features/greeting/greeting-text.tsx',
  'src/features/inbox/index.ts',
  'src/features/inbox/inbox-screen.tsx',
  'src/features/web-parity/logo-image.tsx',
  'src/shared/i18n/index.ts',
  'test/render-helper.tsx',
];

// One violation per file, so every failure is attributable: [file, rule id, message pattern].
// The debugger case is a warning: native runs --deny-warnings, also behind `lint --max-warnings`.
const V = 'src/features/violations';
const INVALID_FILES: Array<[string, string, RegExp]> = [
  [`${V}/conditional-hook.tsx`, 'react-hooks(rules-of-hooks)', /conditionally/],
  [`${V}/document-global.ts`, 'eslint(no-restricted-globals)', /'document'/],
  [`${V}/react-dom-import.ts`, 'eslint(no-restricted-imports)', /'react-dom'/],
  [`${V}/web-app-import.ts`, 'eslint(no-restricted-imports)', /apps\/frontend/],
  [`${V}/floating-promise.ts`, 'typescript(no-floating-promises)', /be awaited/],
  [`${V}/misused-promise.tsx`, 'typescript(no-misused-promises)', /void return/],
  [`${V}/deep-import.tsx`, 'pulse-native(no-cross-feature-deep-import)', /public entry/],
  [
    'src/platform/storage/feature-import.ts',
    'pulse-native(no-cross-feature-deep-import)',
    /^platform/,
  ],
  [`${V}/raw-text.tsx`, 'pulse-native(no-raw-jsx-text)', /"Hello there"/],
  [`${V}/memo-comparator.tsx`, 'pulse-native(no-memo-comparator)', /memo comparators/],
  ['src/shared/format/formatName.ts', 'pulse-native(filename-convention)', /'formatName'/],
  [`${V}/ref-in-render.tsx`, 'react(refs)', /Cannot access refs during render/],
  [`${V}/debugger.ts`, 'eslint(no-debugger)', /debugger/],
];

// Expo Router segments plus a space: must reach oxlint as one argv entry, never through a shell.
const SPECIAL_PATH_FILE = 'src/app/(group)/[id]/legacy screen.tsx';

// Child processes must never inherit hook state (GIT_DIR, GIT_INDEX_FILE...) from an outer
// `git commit`, which would point git at the real repository, nor lefthook switches.
const childEnv = (extra: NodeJS.ProcessEnv = {}) => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('GIT_') && !key.startsWith('LEFTHOOK') && key !== 'FORCE_COLOR',
    ),
  );
  return { ...env, NO_COLOR: '1', ...extra };
};

const run = (
  file: string,
  args: string[],
  { cwd, env = childEnv() }: { cwd: string; env?: NodeJS.ProcessEnv },
) =>
  new Promise<{ status: number | null; output: string }>((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, output });
    });
  });

const pulseLint = (args: string[], cwd: string) =>
  run(process.execPath, [cliPath, ...args], { cwd });

// Oxlint graphical output: `  x scope(rule): message` followed by `,-[path:line:column]`. Under a
// terminal (lefthook runs commands in a pty) the markers are `×`/`⚠` and `╭─[`.
// GitHub Actions emits workflow annotations instead, even for hook subprocesses.
type Diagnostic = { rule: string; message: string; file: string | null };
const parseDiagnostics = (output: string) => {
  const diagnostics: Diagnostic[] = [];
  for (const line of stripVTControlCharacters(output).split(/\r?\n/)) {
    const github =
      /^::(?:error|warning) file=(.+?),line=\d+,.*?title=([\w-]+\([\w/-]+\))::.+?:\d+:\d+: (.*)$/u.exec(
        line,
      );
    const agent = /^(.+):\d+:\d+: (?:error|warning) ([\w-]+\([\w/-]+\)): (.*)$/u.exec(line);
    const header = /^\s+([x!×⚠]) ([\w-]+\([\w/-]+\)): (.*)$/u.exec(line);
    const location = /^\s+(?:,-|╭─)\[(.+):\d+:\d+\]$/u.exec(line);
    const last = diagnostics.at(-1);
    if (github) {
      const decode = (value: string) =>
        value.replace(/%(?:25|0A|0D|3A|2C)/gi, (escape) =>
          String.fromCharCode(Number.parseInt(escape.slice(1), 16)),
        );
      diagnostics.push({ rule: github[2], message: decode(github[3]), file: decode(github[1]) });
    } else if (agent) {
      diagnostics.push({ rule: agent[2], message: agent[3], file: agent[1] });
    } else if (header) {
      diagnostics.push({ rule: header[2], message: header[3], file: null });
    } else if (location && last && last.file === null) {
      [, last.file] = location;
    }
  }
  return diagnostics;
};

const summarize = (diagnostics: Diagnostic[]) =>
  diagnostics.map(({ rule, file }) => `${rule} @ ${file}`);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-lint-native-'));
afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

// Lint runs use a copy of the checked-in fixture: `react` and `@types/react` resolve from the
// package root node_modules (development dependencies); the copy gets
// the same through a symlink. `react-native` and `expo-router` are typed stubs in `types/`.
const workspace = path.join(tempRoot, 'workspace');
const fixtureRoot = path.join(workspace, 'native-fixture');
beforeAll(() => {
  fs.cpSync(fixtureSource, fixtureRoot, { recursive: true });
  fs.symlinkSync(path.join(packageRoot, 'node_modules'), path.join(workspace, 'node_modules'));
});

test.each([
  INVALID_FILES[7],
  INVALID_FILES[12],
  [SPECIAL_PATH_FILE, 'pulse-native(filename-convention)', /'legacy screen'/],
] as Array<[string, string, RegExp]>)(
  'GitHub annotations preserve diagnostics for %s',
  async (file, rule, message) => {
    const result = await pulseLint(['oxlint:native', '--format=github', file], fixtureRoot);
    expect(result.status, result.output).toBe(1);
    const diagnostics = parseDiagnostics(result.output);
    expect(summarize(diagnostics), result.output).toStrictEqual([`${rule} @ ${file}`]);
    expect(diagnostics[0].message).toMatch(message);
  },
);

describe('native preset', { concurrent: true }, () => {
  test('valid files lint clean through oxlint:native and lint', async () => {
    const [direct, dispatched] = await Promise.all([
      pulseLint(['oxlint:native', '--format=json', ...VALID_FILES], fixtureRoot),
      pulseLint(
        [
          'lint',
          '--max-warnings=20',
          ...VALID_FILES.map((file) => path.join('native-fixture', file)),
        ],
        workspace,
      ),
    ]);
    const report = JSON.parse(direct.output) as { diagnostics: unknown[]; number_of_files: number };
    expect(report.diagnostics).toStrictEqual([]);
    expect(report.number_of_files).toBe(VALID_FILES.length);
    for (const result of [direct, dispatched]) {
      expect(result.status, result.output).toBe(0);
      expect(parseDiagnostics(result.output), result.output).toStrictEqual([]);
    }
  });

  for (const [file, rule, message] of INVALID_FILES) {
    test(`${rule} rejects ${file}`, async () => {
      const [direct, dispatched] = await Promise.all([
        pulseLint(['oxlint:native', file], fixtureRoot),
        pulseLint(['lint', '--max-warnings=20', path.join('native-fixture', file)], workspace),
      ]);
      for (const result of [direct, dispatched]) {
        expect(result.status, result.output).not.toBe(0);
        const diagnostics = parseDiagnostics(result.output);
        expect(summarize(diagnostics), result.output).toStrictEqual([`${rule} @ ${file}`]);
        expect(diagnostics[0].message, result.output).toMatch(message);
      }
    });
  }
});

describe('lint dispatch', { concurrent: true }, () => {
  test('passes paths with parentheses, brackets and spaces as single arguments', async () => {
    const target = path.join('native-fixture', SPECIAL_PATH_FILE);
    const result = await pulseLint(['lint', '--max-warnings=20', target], workspace);
    expect(result.status, result.output).toBe(1);
    expect(summarize(parseDiagnostics(result.output)), result.output).toStrictEqual([
      `pulse-native(filename-convention) @ ${SPECIAL_PATH_FILE}`,
    ]);
    expect(result.output).toMatch(
      /'legacy screen' in src\/app\/\(group\)\/\[id\]\/legacy screen\.tsx/,
    );

    expect(result.output).not.toMatch(/syntax error|no matches found|command not found/i);
  });

  test('lints an Expo Router route path as exactly that file', async () => {
    const target = path.join('native-fixture', 'src/app/(group)/[id].tsx');
    const result = await pulseLint(['lint', '--max-warnings=20', target], workspace);
    expect(result.status, result.output).toBe(0);
  });

  test('routes web files to the web preset and native files to the native preset', async () => {
    const nativeFile = path.join(fixtureRoot, 'src/features/web-parity/logo-image.tsx');
    const result = await pulseLint(
      ['lint', '--max-warnings=20', path.relative(packageRoot, webFixture), nativeFile],
      packageRoot,
    );
    expect(result.status, result.output).toBe(1);
    const diagnostics = parseDiagnostics(result.output);
    expect(summarize(diagnostics), result.output).toStrictEqual([
      'jsx-a11y(alt-text) @ tests/fixtures/web-invalid/logo-image.tsx',
    ]);
  });

  test('the native preset does not run jsx-a11y on the same JSX', async () => {
    const result = await pulseLint(
      ['oxlint:native', 'src/features/web-parity/logo-image.tsx'],
      fixtureRoot,
    );
    expect(result.status, result.output).toBe(0);
    expect(result.output, result.output).not.toMatch(/jsx-a11y/);
  });

  test('keeps the preset ignore patterns', async () => {
    const result = await pulseLint(
      ['oxlint:native', '--format=json', 'src/shared/generated', 'src/shared/i18n'],
      fixtureRoot,
    );
    expect(result.status, result.output).toBe(0);
    const report = JSON.parse(result.output) as { diagnostics: unknown[]; number_of_files: number };
    expect(report.diagnostics).toStrictEqual([]);
    expect(report.number_of_files).toBe(1);
  });

  test('partitions targets by the nearest package.json preset', () => {
    const nativeFile = path.join(fixtureSource, 'src/app/(group)/[id].tsx');
    const { webTargets, nativeGroups } = partitionLintTargets(
      [webFixture, nativeFile, fixtureSource, 'dist/cli/index.js'],
      packageRoot,
    );
    expect(webTargets).toStrictEqual([webFixture, fixtureSource, 'dist/cli/index.js']);
    expect(nativeGroups).toStrictEqual([{ projectRoot: fixtureSource, files: [nativeFile] }]);
  });

  // Ancestor folders must not activate overrides intended for paths inside the project.
  test('native rules apply to a project located below a `test` folder', async () => {
    const nestedFixture = path.join(workspace, 'test/native-app');
    fs.cpSync(fixtureSource, nestedFixture, { recursive: true });
    const result = await pulseLint(
      ['oxlint:native', 'src/features/violations/raw-text.tsx', 'test/render-helper.tsx'],
      nestedFixture,
    );
    expect(result.status, result.output).not.toBe(0);
    expect(summarize(parseDiagnostics(result.output)), result.output).toStrictEqual([
      'pulse-native(no-raw-jsx-text) @ src/features/violations/raw-text.tsx',
    ]);
  });
});

describe('pre-commit hook in an isolated git repository', () => {
  const repo = path.join(tempRoot, 'repo');
  const repoFixture = path.join(repo, 'native-fixture');
  const unrelatedFile = 'web/logo-image.tsx';
  const unrelatedEdit =
    '// Unstaged local edit, deliberately unformatted.\nexport const edit = "keep";\n';
  const gitEnv = childEnv({
    YARN_ENABLE_NETWORK: '0',
    GIT_AUTHOR_EMAIL: 'lint-test@example.invalid',
    GIT_AUTHOR_NAME: 'Lint Test',
    GIT_COMMITTER_EMAIL: 'lint-test@example.invalid',
    GIT_COMMITTER_NAME: 'Lint Test',
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    LEFTHOOK_BIN: lefthookBin,
  });
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, env: gitEnv, encoding: 'utf8' });
  const commit = (message: string) =>
    run('git', ['commit', '-m', message], { cwd: repo, env: gitEnv });
  let baselineUnrelated = '';

  const assertUnrelatedEditUntouched = () => {
    expect(git('diff', '--cached', '--name-only')).toBe('');
    expect(git('diff', '--name-only')).toBe(`${unrelatedFile}\n`);
    expect(fs.readFileSync(path.join(repo, unrelatedFile), 'utf8')).toBe(unrelatedEdit);
    expect(git('show', `HEAD:${unrelatedFile}`)).toBe(baselineUnrelated);
  };

  beforeAll(() => {
    fs.mkdirSync(path.join(repo, 'web'), { recursive: true });
    fs.cpSync(fixtureSource, repoFixture, { recursive: true });
    fs.copyFileSync(webFixture, path.join(repo, unrelatedFile));
    baselineUnrelated = fs.readFileSync(webFixture, 'utf8');

    // What the installed pulse-lint binary and tsgolint resolve in a consumer: the CLI bin and React types.
    const nodeModules = path.join(repo, 'node_modules');
    fs.mkdirSync(path.join(nodeModules, '.bin'), { recursive: true });
    fs.symlinkSync(cliPath, path.join(nodeModules, '.bin/pulse-lint'));
    fs.symlinkSync(path.join(packageRoot, 'node_modules/react'), path.join(nodeModules, 'react'));
    fs.symlinkSync(path.join(packageRoot, 'node_modules/@types'), path.join(nodeModules, '@types'));
    fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
    // The real preset by absolute path; commitlint is out of scope for these checks.
    fs.writeFileSync(
      path.join(repo, 'lefthook.yml'),
      `extends:\n  - ${JSON.stringify(lefthookPreset)}\ncommit-msg:\n  commands:\n    commitlint:\n      skip: true\n`,
    );

    git('init', '--quiet', '--initial-branch=main');
    git(
      'add',
      '.gitignore',
      'lefthook.yml',
      unrelatedFile,
      'native-fixture/package.json',
      'native-fixture/tsconfig.json',
      'native-fixture/types',
      'native-fixture/src/app/_layout.tsx',
      'native-fixture/src/features/greeting',
      'native-fixture/src/features/inbox',
      'native-fixture/src/shared/i18n',
    );
    git('commit', '--quiet', '-m', 'chore: baseline');
    execFileSync(lefthookBin, ['install'], { cwd: repo, env: gitEnv });
    fs.writeFileSync(path.join(repo, unrelatedFile), unrelatedEdit);
  });

  const assertRejectedLikeOxlintNative = async (file: string) => {
    const head = git('rev-parse', 'HEAD');
    git('add', path.join('native-fixture', file));
    const hook = await commit('feat: add invalid file');
    git('restore', '--staged', path.join('native-fixture', file));

    expect(hook.status, hook.output).not.toBe(0);
    expect(git('rev-parse', 'HEAD')).toBe(head);
    const direct = await pulseLint(['oxlint:native', file], repoFixture);
    expect(direct.status, direct.output).not.toBe(0);
    const expected = summarize(parseDiagnostics(direct.output));
    expect(expected.length > 0, direct.output).toBeTruthy();
    expect(summarize(parseDiagnostics(hook.output)), hook.output).toStrictEqual(expected);
    assertUnrelatedEditUntouched();
  };

  test('rejects a staged native-only violation with the oxlint:native rule', async () => {
    await assertRejectedLikeOxlintNative('src/features/violations/raw-text.tsx');
  });

  test('keeps --deny-warnings for native files although the hook passes --max-warnings', async () => {
    await assertRejectedLikeOxlintNative('src/features/violations/debugger.ts');
  });

  test('rejects a staged path with parentheses, brackets and a space', async () => {
    await assertRejectedLikeOxlintNative(SPECIAL_PATH_FILE);
  });

  test('sorts staged native imports before linting and commits the formatted result', async () => {
    const file = 'native-fixture/src/features/violations/unsorted-imports.ts';
    git('add', file);
    const hook = await commit('feat: sort native imports');
    expect(hook.status, hook.output).toBe(0);
    const committed = git('show', `HEAD:${file}`);
    expect(
      committed.indexOf("from 'react'") < committed.indexOf("from '@/shared/i18n'"),
      committed,
    ).toBeTruthy();
    assertUnrelatedEditUntouched();
  });

  test('commits when the only staged native file is ignored', async () => {
    const file = 'native-fixture/src/shared/generated/tokens.tsx';
    git('add', file);
    const hook = await commit('chore: update generated tokens');
    expect(hook.status, hook.output).toBe(0);
    expect(git('ls-tree', '--name-only', 'HEAD', file)).toBe(`${file}\n`);
    assertUnrelatedEditUntouched();
  });

  test('commits a valid native route and leaves unrelated unstaged edits unstaged', async () => {
    const file = path.join('native-fixture', 'src/app/(group)/[id].tsx');
    git('add', file);
    const hook = await commit('feat: add item route');

    expect(hook.status, hook.output).toBe(0);

    expect(git('ls-tree', '--name-only', 'HEAD', file)).toBe(`${file}\n`);
    assertUnrelatedEditUntouched();
  });
});
