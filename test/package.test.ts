import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yarnPath = process.env.npm_execpath;
assert.ok(yarnPath, 'Run this test through Yarn.');

test('packed package installs and runs outside its source repository', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-lint-consumer-'));
  const env = {
    ...process.env,
    YARN_ENABLE_NETWORK: '0',
    YARN_ENABLE_OFFLINE_MODE: '1',
    YARN_ENABLE_IMMUTABLE_INSTALLS: '0',
  };
  const run = (file: string, args: string[], cwd = temporary) => {
    const result = spawnSync(file, args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `${file} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  try {
    const archive = path.join(temporary, 'pulse-lint.tgz');
    run(yarnPath, ['pack', '--out', archive], packageRoot);
    const entries = run('tar', ['-tzf', archive]).split('\n');
    assert.equal(
      entries.some((file) =>
        /^package\/(src\/|scripts\/|test\/|test-app\/|\.agent-tmp\/|\.agents\/|AGENTS\.md)/.test(
          file,
        ),
      ),
      false,
      'Development sources and fixtures must not be shipped to consumers.',
    );
    assert.equal(
      entries.some((file) => /^package\/(oxlint\/|oxfmt\/|lefthook\/|tsconfig\.json$)/.test(file)),
      false,
      'All runtime configs must be shipped under dist.',
    );
    assert.ok(entries.includes('package/dist/cli/index.js'));
    assert.ok(entries.includes('package/dist/oxlint/plugins/pulse-native.js'));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      packageManager: string;
      devDependencies: Record<string, string>;
    };
    fs.writeFileSync(
      path.join(temporary, 'package.json'),
      JSON.stringify({
        name: 'isolated-lint-consumer',
        private: true,
        type: 'module',
        packageManager: manifest.packageManager,
        dependencies: {
          '@pulse/lint': `file:${archive}`,
          ...Object.fromEntries(
            ['react', '@types/react'].map((name) => [name, manifest.devDependencies[name]]),
          ),
        },
      }),
    );
    fs.writeFileSync(path.join(temporary, '.yarnrc.yml'), 'nodeLinker: node-modules\n');
    // Reuse pinned external resolutions, not source directories, so the install needs no network.
    fs.copyFileSync(path.join(packageRoot, 'yarn.lock'), path.join(temporary, 'yarn.lock'));
    run(yarnPath, ['install']);
    const installed = path.join(temporary, 'node_modules/@pulse/lint');
    const cli = path.join(installed, 'dist/cli/index.js');
    const published = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
      bin: Record<string, string>;
    };
    for (const target of [...Object.values(published.exports), ...Object.values(published.bin)]) {
      assert.ok(target.startsWith('./dist/'), `Public entry must use dist: ${target}`);
      assert.ok(fs.existsSync(path.join(installed, target)), `Missing entry: ${target}`);
    }
    const configs = path.join(installed, 'dist/oxlint');
    const configFiles = fs.readdirSync(configs, { recursive: true, encoding: 'utf8' });
    for (const file of configFiles.filter((name) => name.endsWith('.json'))) {
      const configPath = path.join(configs, file);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        extends?: string[];
        jsPlugins?: Array<string | { specifier: string }>;
      };
      const references = [
        ...(config.extends ?? []),
        ...(config.jsPlugins ?? []).map((plugin) =>
          typeof plugin === 'string' ? plugin : plugin.specifier,
        ),
      ];
      for (const reference of references.filter((value) => value.startsWith('.'))) {
        const target = path.resolve(path.dirname(configPath), reference);
        assert.ok(target.startsWith(`${path.join(installed, 'dist')}${path.sep}`));
        assert.ok(fs.existsSync(target), `Missing config dependency: ${target}`);
      }
    }
    for (const [message, expectedStatus] of [
      ['feat(lint): validate installed Commitlint\n', 0],
      ['not a conventional commit\n', 1],
    ] as const) {
      const commit = spawnSync(
        process.execPath,
        [cli, 'commitlint', '--config', path.join(installed, 'dist/commitlint/index.js')],
        { cwd: temporary, env, encoding: 'utf8', input: message, timeout: 5000 },
      );
      assert.equal(commit.error, undefined);
      assert.equal(commit.status, expectedStatus, commit.stdout + commit.stderr);
      if (expectedStatus !== 0)
        assert.match(commit.stdout + commit.stderr, /type-empty|subject-empty/);
    }
    fs.writeFileSync(path.join(temporary, 'valid.ts'), 'export const answer = 42;\n');
    run(process.execPath, [cli, 'oxlint', '--deny-warnings', 'valid.ts']);
    fs.writeFileSync(
      path.join(temporary, 'invalid.ts'),
      'export const same = (value: number) => value == 42;\n',
    );
    const invalid = spawnSync(process.execPath, [cli, 'oxlint', 'invalid.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(invalid.status, 0, invalid.stdout + invalid.stderr);
    assert.match(invalid.stdout + invalid.stderr, /eqeqeq/);
    run(process.execPath, [cli, 'oxfmt:check', 'valid.ts']);
    fs.writeFileSync(
      path.join(temporary, 'tsconfig.json'),
      JSON.stringify({
        extends: '@pulse/lint/tsconfig',
        include: ['valid.ts'],
      }),
    );
    run(process.execPath, [
      path.join(packageRoot, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.json',
    ]);
    const resolveExport = (specifier: string) =>
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `console.log(import.meta.resolve(${JSON.stringify(specifier)}))`,
        ],
        { cwd: temporary, env, encoding: 'utf8' },
      ).trim();
    assert.match(resolveExport('@pulse/lint/oxlint/native'), /native\.json$/);
    assert.match(resolveExport('@pulse/lint/oxlint/strict'), /strict\.json$/);
    for (const name of ['base', 'web', 'server', 'server-strict', 'overlays/strict']) {
      assert.ok(resolveExport(`@pulse/lint/oxlint/${name}`).endsWith(`/${name}.json`));
    }
    fs.writeFileSync(
      path.join(temporary, 'image.tsx'),
      "export const image = <img src='/logo.svg' />;\n",
    );
    run(process.execPath, [cli, 'oxlint:base', '--deny-warnings', 'image.tsx']);
    run(process.execPath, [cli, 'oxlint:server', '--deny-warnings', 'image.tsx']);
    const webImage = spawnSync(process.execPath, [cli, 'oxlint:web', 'image.tsx'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(webImage.status, 0);
    assert.match(webImage.stdout + webImage.stderr, /alt-text/);
    fs.writeFileSync(path.join(temporary, 'browser.ts'), 'export const title = document.title;\n');
    const browser = spawnSync(process.execPath, [cli, 'oxlint:server', 'browser.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(browser.status, 0);
    assert.match(browser.stdout + browser.stderr, /no-restricted-globals/);
    const server = path.join(temporary, 'server app');
    fs.mkdirSync(server);
    fs.writeFileSync(
      path.join(server, 'package.json'),
      JSON.stringify({
        private: true,
        pulseLint: { preset: 'server' },
      }),
    );
    fs.copyFileSync(path.join(temporary, 'image.tsx'), path.join(server, 'image.tsx'));
    run(process.execPath, [cli, 'lint', '--deny-warnings', 'server app/image.tsx']);
    fs.writeFileSync(
      path.join(temporary, 'long.ts'),
      `${Array.from({ length: 221 }, (_, index) => `export const value${index} = ${index};`).join(
        '\n',
      )}\n`,
    );
    const long = spawnSync(process.execPath, [cli, 'oxlint:server:strict', 'long.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(long.status, 0);
    assert.match(long.stdout + long.stderr, /max-lines/);
    fs.writeFileSync(
      path.join(temporary, 'base-strict.json'),
      JSON.stringify({
        extends: [
          path.join(installed, 'dist/oxlint/base.json'),
          path.join(installed, 'dist/oxlint/overlays/strict.json'),
        ],
      }),
    );
    run(path.join(temporary, 'node_modules/.bin/oxlint'), ['-c', 'base-strict.json', 'image.tsx']);
    const native = path.join(temporary, 'native-app');
    fs.cpSync(path.join(packageRoot, 'test/native-fixture'), native, { recursive: true });
    run(process.execPath, [cli, 'oxlint:native', 'src/app/(group)/[id].tsx'], native);
    const nativeInvalid = spawnSync(
      process.execPath,
      [cli, 'oxlint:native', 'src/features/violations/raw-text.tsx'],
      { cwd: native, env, encoding: 'utf8' },
    );
    assert.notEqual(nativeInvalid.status, 0);
    assert.match(nativeInvalid.stdout + nativeInvalid.stderr, /no-raw-jsx-text/);
    run(process.execPath, [cli, 'lint', 'src/shared/generated/tokens.tsx'], native);
    for (const [file, source, rule] of [
      [
        'src/features/inbox/relative-deep.ts',
        "export { GreetingText } from '../greeting/greeting-text';\n",
        'no-cross-feature-deep-import',
      ],
      [
        'src/features/greeting/template-child.tsx',
        // oxlint-disable-next-line no-template-curly-in-string -- template interpolation belongs to the generated fixture
        "import { Text } from 'react-native';\n\nexport const Example = ({ name }: { name: string }) => <Text>{`Hello ${name}`}</Text>;\n",
        'no-raw-jsx-text',
      ],
      [
        'src/features/greeting/aliased-memo.ts',
        "import { memo as reactMemo } from 'react';\n\nconst View = () => null;\nexport const Example = reactMemo(View, () => true);\n",
        'no-memo-comparator',
      ],
    ]) {
      fs.writeFileSync(path.join(native, file), source);
      const result = spawnSync(process.execPath, [cli, 'oxlint:native', '--format=json', file], {
        cwd: native,
        env,
        encoding: 'utf8',
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
      assert.ok(
        report.diagnostics.some(({ code }) => code === `pulse-native(${rule})`),
        result.stdout,
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
