import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot } from '../helpers/paths.ts';

const yarnPath = process.env.npm_execpath ?? 'yarn';

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
    expect(result.status, `${file} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`).toBe(0);
    return result.stdout;
  };
  try {
    const archive = process.env.PULSE_LINT_ARCHIVE
      ? path.resolve(process.env.PULSE_LINT_ARCHIVE)
      : path.join(temporary, 'pulse-lint.tgz');
    if (!process.env.PULSE_LINT_ARCHIVE) run(yarnPath, ['pack', '--out', archive], packageRoot);
    const entries = run('tar', ['-tzf', archive]).split('\n');
    expect(
      entries.some((file) =>
        /^package\/(src\/|scripts\/|tests?\/|test-app\/|\.agent-tmp\/|\.agents\/|AGENTS\.md)/.test(
          file,
        ),
      ),
      'Development sources and fixtures must not be shipped to consumers.',
    ).toBe(false);
    expect(
      entries.some((file) =>
        /^package\/(oxlint\/|oxfmt\/|lefthook\/|tsconfig\/|tsconfig\.json$)/.test(file),
      ),
      'All runtime configs must be shipped under dist.',
    ).toBe(false);
    expect(
      entries.filter(
        (file) =>
          file.startsWith('package/dist/') && /\.tsx?$/.test(file) && !file.endsWith('.d.ts'),
      ),
      'Only compiled runtime and declarations belong in dist, never TypeScript implementation sources.',
    ).toStrictEqual([]);
    expect(entries.includes('package/dist/cli/index.js')).toBeTruthy();
    expect(entries.includes('package/dist/oxlint/plugins/pulse-native.js')).toBeTruthy();
    expect(entries.includes('package/dist/oxlint/plugins/pulse-naming.js')).toBeTruthy();
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
          '@pulse-kit/lint': `file:${archive}`,
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
    const installed = path.join(temporary, 'node_modules/@pulse-kit/lint');
    const cli = path.join(installed, 'dist/cli/index.js');
    const published = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
      bin: Record<string, string>;
    };
    for (const target of [...Object.values(published.exports), ...Object.values(published.bin)]) {
      expect(target.startsWith('./dist/'), `Public entry must use dist: ${target}`).toBeTruthy();
      expect(fs.existsSync(path.join(installed, target)), `Missing entry: ${target}`).toBeTruthy();
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
        expect(target.startsWith(`${path.join(installed, 'dist')}${path.sep}`)).toBeTruthy();
        expect(fs.existsSync(target), `Missing config dependency: ${target}`).toBeTruthy();
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
      expect(commit.error).toBe(undefined);
      expect(commit.status, commit.stdout + commit.stderr).toBe(expectedStatus);
      if (expectedStatus !== 0)
        expect(commit.stdout + commit.stderr).toMatch(/type-empty|subject-empty/);
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
    expect(invalid.status, invalid.stdout + invalid.stderr).not.toBe(0);
    expect(invalid.stdout + invalid.stderr).toMatch(/eqeqeq/);
    run(process.execPath, [cli, 'oxfmt:check', 'valid.ts']);
    fs.mkdirSync(path.join(temporary, 'badFolder'));
    fs.writeFileSync(path.join(temporary, 'badFolder/file.ts'), 'export const value = 1;\n');
    const folder = spawnSync(process.execPath, [cli, 'oxlint:base', 'badFolder/file.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    expect(folder.status, folder.stdout + folder.stderr).toBe(1);
    expect(folder.stdout + folder.stderr).toMatch(/folder-naming-convention/);
    fs.writeFileSync(path.join(temporary, 'badFile.ts'), 'export const value = 1;\n');
    const filename = spawnSync(process.execPath, [cli, 'oxlint:base', 'badFile.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    expect(filename.status, filename.stdout + filename.stderr).toBe(1);
    expect(filename.stdout + filename.stderr).toMatch(/pulse-naming\(filename-naming-convention\)/);
    fs.writeFileSync(
      path.join(temporary, 'imports.ts'),
      "import local from './valid';\nimport alias from '@/alias';\n\nexport const values = [local, alias];\n",
    );
    const order = spawnSync(process.execPath, [cli, 'oxfmt:check', 'imports.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    expect(order.status, order.stdout + order.stderr).toBe(1);
    run(process.execPath, [cli, 'oxfmt', 'imports.ts']);
    run(process.execPath, [cli, 'oxfmt:check', 'imports.ts']);
    expect(
      fs.readFileSync(path.join(temporary, 'imports.ts'), 'utf8').startsWith('import alias'),
    ).toBeTruthy();

    fs.writeFileSync(
      path.join(temporary, 'tsconfig.json'),
      JSON.stringify({
        extends: '@pulse-kit/lint/tsconfig',
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
    expect(resolveExport('@pulse-kit/lint/oxlint/native')).toMatch(/native\.json$/);
    expect(resolveExport('@pulse-kit/lint/oxlint/strict')).toMatch(/strict\.json$/);
    for (const name of ['base', 'web', 'server', 'server-strict', 'overlays/strict']) {
      expect(
        resolveExport(`@pulse-kit/lint/oxlint/${name}`).endsWith(`/${name}.json`),
      ).toBeTruthy();
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
    expect(webImage.status).not.toBe(0);
    expect(webImage.stdout + webImage.stderr).toMatch(/alt-text/);
    fs.writeFileSync(path.join(temporary, 'browser.ts'), 'export const title = document.title;\n');
    const browser = spawnSync(process.execPath, [cli, 'oxlint:server', 'browser.ts'], {
      cwd: temporary,
      env,
      encoding: 'utf8',
    });
    expect(browser.status).not.toBe(0);
    expect(browser.stdout + browser.stderr).toMatch(/no-restricted-globals/);
    const server = path.join(temporary, 'server-app');
    fs.mkdirSync(server);
    fs.writeFileSync(
      path.join(server, 'package.json'),
      JSON.stringify({
        private: true,
        pulseLint: { preset: 'server' },
      }),
    );
    fs.copyFileSync(path.join(temporary, 'image.tsx'), path.join(server, 'image.tsx'));
    run(process.execPath, [cli, 'lint', '--deny-warnings', 'server-app/image.tsx']);
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
    expect(long.status).not.toBe(0);
    expect(long.stdout + long.stderr).toMatch(/max-lines/);
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
    fs.cpSync(path.join(packageRoot, 'tests/fixtures/native-app'), native, { recursive: true });
    run(process.execPath, [cli, 'oxlint:native', 'src/app/(group)/[id].tsx'], native);
    const nativeInvalid = spawnSync(
      process.execPath,
      [cli, 'oxlint:native', 'src/features/violations/raw-text.tsx'],
      { cwd: native, env, encoding: 'utf8' },
    );
    expect(nativeInvalid.status).not.toBe(0);
    expect(nativeInvalid.stdout + nativeInvalid.stderr).toMatch(/no-raw-jsx-text/);
    run(process.execPath, [cli, 'lint', 'src/shared/generated/tokens.tsx'], native);
    const compiler = spawnSync(
      process.execPath,
      [cli, 'oxlint:native', 'src/features/violations/ref-in-render.tsx'],
      { cwd: native, env, encoding: 'utf8' },
    );
    expect(compiler.status, compiler.stdout + compiler.stderr).toBe(1);
    expect(compiler.stdout + compiler.stderr).toMatch(/react\(refs\)/);

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
      expect(result.status, result.stdout + result.stderr).toBe(1);
      const report = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
      expect(
        report.diagnostics.some(({ code }) => code === `pulse-native(${rule})`),
        result.stdout,
      ).toBeTruthy();
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
