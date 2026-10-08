// Regression tests for the React Native lint gates: `oxlint:native`, the file-aware `lint`
// dispatcher and the lefthook pre-commit preset. Run with `node --test`.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

import { partitionLintTargets } from '../src/cli/partition.ts';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(packageRoot, 'dist/cli/index.js');
const fixtureSource = path.join(packageRoot, 'test/native-fixture');
const webFixture = path.join(packageRoot, 'test/web-fixture/logo-image.tsx');
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
// The import-order case is a warning: native runs --deny-warnings, also behind `lint --max-warnings`.
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
  [`${V}/ref-in-render.tsx`, 'react-hooks-js(refs)', /Cannot access refs during render/],
  [`${V}/unsorted-imports.ts`, 'simple-import-sort(imports)', /sort these imports/],
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
type Diagnostic = { rule: string; message: string; file: string | null };
const parseDiagnostics = (output: string) => {
  const diagnostics: Diagnostic[] = [];
  for (const line of stripVTControlCharacters(output).split(/\r?\n/)) {
    const agent = /^(.+):\d+:\d+: (?:error|warning) ([\w-]+\([\w/-]+\)): (.*)$/u.exec(line);
    const header = /^\s+([x!×⚠]) ([\w-]+\([\w/-]+\)): (.*)$/u.exec(line);
    const location = /^\s+(?:,-|╭─)\[(.+):\d+:\d+\]$/u.exec(line);
    const last = diagnostics.at(-1);
    if (agent) {
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
after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

// Lint runs use a copy of the checked-in fixture: `react` and `@types/react` resolve from the
// package root node_modules (development dependencies); the copy gets
// the same through a symlink. `react-native` and `expo-router` are typed stubs in `types/`.
const workspace = path.join(tempRoot, 'workspace');
const fixtureRoot = path.join(workspace, 'native-fixture');
before(() => {
  fs.cpSync(fixtureSource, fixtureRoot, { recursive: true });
  fs.symlinkSync(path.join(packageRoot, 'node_modules'), path.join(workspace, 'node_modules'));
});

describe('native preset', { concurrency: 4 }, () => {
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
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.number_of_files, VALID_FILES.length);
    for (const result of [direct, dispatched]) {
      assert.equal(result.status, 0, result.output);
      assert.deepEqual(parseDiagnostics(result.output), [], result.output);
    }
  });

  for (const [file, rule, message] of INVALID_FILES) {
    test(`${rule} rejects ${file}`, async () => {
      const [direct, dispatched] = await Promise.all([
        pulseLint(['oxlint:native', file], fixtureRoot),
        pulseLint(['lint', '--max-warnings=20', path.join('native-fixture', file)], workspace),
      ]);
      for (const result of [direct, dispatched]) {
        assert.notEqual(result.status, 0, result.output);
        const diagnostics = parseDiagnostics(result.output);
        assert.deepEqual(summarize(diagnostics), [`${rule} @ ${file}`], result.output);
        assert.match(diagnostics[0].message, message, result.output);
      }
    });
  }
});

describe('lint dispatch', { concurrency: 4 }, () => {
  test('passes paths with parentheses, brackets and spaces as single arguments', async () => {
    const target = path.join('native-fixture', SPECIAL_PATH_FILE);
    const result = await pulseLint(['lint', '--max-warnings=20', target], workspace);
    assert.equal(result.status, 1, result.output);
    assert.deepEqual(
      summarize(parseDiagnostics(result.output)),
      [`pulse-native(filename-convention) @ ${SPECIAL_PATH_FILE}`],
      result.output,
    );
    assert.match(
      result.output,
      /'legacy screen' in src\/app\/\(group\)\/\[id\]\/legacy screen\.tsx/,
    );

    assert.doesNotMatch(result.output, /syntax error|no matches found|command not found/i);
  });

  test('lints an Expo Router route path as exactly that file', async () => {
    const target = path.join('native-fixture', 'src/app/(group)/[id].tsx');
    const result = await pulseLint(['lint', '--max-warnings=20', target], workspace);
    assert.equal(result.status, 0, result.output);
  });

  test('routes web files to the web preset and native files to the native preset', async () => {
    const nativeFile = path.join(fixtureRoot, 'src/features/web-parity/logo-image.tsx');
    const result = await pulseLint(
      ['lint', '--max-warnings=20', path.relative(packageRoot, webFixture), nativeFile],
      packageRoot,
    );
    assert.equal(result.status, 1, result.output);
    const diagnostics = parseDiagnostics(result.output);
    assert.deepEqual(
      summarize(diagnostics),
      ['jsx-a11y(alt-text) @ test/web-fixture/logo-image.tsx'],
      result.output,
    );
  });

  test('the native preset does not run jsx-a11y on the same JSX', async () => {
    const result = await pulseLint(
      ['oxlint:native', 'src/features/web-parity/logo-image.tsx'],
      fixtureRoot,
    );
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /jsx-a11y/, result.output);
  });

  test('keeps the preset ignore patterns', async () => {
    const result = await pulseLint(
      ['oxlint:native', '--format=json', 'src/shared/generated', 'src/shared/i18n'],
      fixtureRoot,
    );
    assert.equal(result.status, 0, result.output);
    const report = JSON.parse(result.output) as { diagnostics: unknown[]; number_of_files: number };
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.number_of_files, 1);
  });

  test('partitions targets by the nearest package.json preset', () => {
    const nativeFile = path.join(fixtureSource, 'src/app/(group)/[id].tsx');
    const { webTargets, nativeGroups } = partitionLintTargets(
      [webFixture, nativeFile, fixtureSource, 'dist/cli/index.js'],
      packageRoot,
    );
    assert.deepEqual(webTargets, [webFixture, fixtureSource, 'dist/cli/index.js']);
    assert.deepEqual(nativeGroups, [{ projectRoot: fixtureSource, files: [nativeFile] }]);
  });

  // The checked-in fixture lives below `packages/pulse-lint/test/`: directory overrides apply to
  // folders inside the project only.
  test('native rules apply to a project located below a `test` folder', async () => {
    const result = await pulseLint(
      ['oxlint:native', 'src/features/violations/raw-text.tsx', 'test/render-helper.tsx'],
      fixtureSource,
    );
    assert.notEqual(result.status, 0, result.output);
    assert.deepEqual(
      summarize(parseDiagnostics(result.output)),
      ['pulse-native(no-raw-jsx-text) @ src/features/violations/raw-text.tsx'],
      result.output,
    );
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
    assert.equal(git('diff', '--cached', '--name-only'), '');
    assert.equal(git('diff', '--name-only'), `${unrelatedFile}\n`);
    assert.equal(fs.readFileSync(path.join(repo, unrelatedFile), 'utf8'), unrelatedEdit);
    assert.equal(git('show', `HEAD:${unrelatedFile}`), baselineUnrelated);
  };

  before(() => {
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

    assert.notEqual(hook.status, 0, hook.output);
    assert.equal(git('rev-parse', 'HEAD'), head);
    const direct = await pulseLint(['oxlint:native', file], repoFixture);
    assert.notEqual(direct.status, 0, direct.output);
    const expected = summarize(parseDiagnostics(direct.output));
    assert.ok(expected.length > 0, direct.output);
    assert.deepEqual(summarize(parseDiagnostics(hook.output)), expected, hook.output);
    assertUnrelatedEditUntouched();
  };

  test('rejects a staged native-only violation with the oxlint:native rule', async () => {
    await assertRejectedLikeOxlintNative('src/features/violations/raw-text.tsx');
  });

  test('keeps --deny-warnings for native files although the hook passes --max-warnings', async () => {
    await assertRejectedLikeOxlintNative('src/features/violations/unsorted-imports.ts');
  });

  test('rejects a staged path with parentheses, brackets and a space', async () => {
    await assertRejectedLikeOxlintNative(SPECIAL_PATH_FILE);
  });

  test('commits when the only staged native file is ignored', async () => {
    const file = 'native-fixture/src/shared/generated/tokens.tsx';
    git('add', file);
    const hook = await commit('chore: update generated tokens');
    assert.equal(hook.status, 0, hook.output);
    assert.equal(git('ls-tree', '--name-only', 'HEAD', file), `${file}\n`);
    assertUnrelatedEditUntouched();
  });

  test('commits a valid native route and leaves unrelated unstaged edits unstaged', async () => {
    const file = path.join('native-fixture', 'src/app/(group)/[id].tsx');
    git('add', file);
    const hook = await commit('feat: add item route');

    assert.equal(hook.status, 0, hook.output);

    assert.equal(git('ls-tree', '--name-only', 'HEAD', file), `${file}\n`);
    assertUnrelatedEditUntouched();
  });
});
