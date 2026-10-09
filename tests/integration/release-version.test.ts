import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

test('version command updates changelog and keeps immutable installation valid in CI', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-version-ci-'));
  const yarn = process.env.npm_execpath ?? 'yarn';
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    CI: '1',
    LEFTHOOK: '0',
    YARN_ENABLE_NETWORK: '0',
    YARN_ENABLE_OFFLINE_MODE: '1',
  };
  const run = (file: string, args: string[]) => {
    const result = spawnSync(file, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  };
  try {
    for (const file of ['package.json', 'yarn.lock', '.yarnrc.yml']) {
      fs.copyFileSync(path.join(root, file), path.join(cwd, file));
    }
    fs.cpSync(path.join(root, 'src/oxfmt'), path.join(cwd, 'src/oxfmt'), { recursive: true });
    fs.mkdirSync(path.join(cwd, '.changeset'));
    fs.copyFileSync(
      path.join(root, '.changeset/config.json'),
      path.join(cwd, '.changeset/config.json'),
    );
    fs.writeFileSync(
      path.join(cwd, '.changeset/test-release.md'),
      "---\n'@pulse-kit/lint': patch\n---\n\nRelease command regression.\n",
    );
    const original = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      version: string;
    };
    run('git', ['init', '--quiet', '--initial-branch=main']);
    run('git', ['add', 'package.json', 'yarn.lock', '.changeset', 'src/oxfmt', '.yarnrc.yml']);
    run('git', [
      '-c',
      'user.name=Release Test',
      '-c',
      'user.email=release@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'test: baseline',
    ]);
    run(yarn, ['install', '--immutable']);
    run(yarn, ['version:packages']);
    run(yarn, ['install', '--immutable']);
    const changed = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(changed.version).not.toBe(original.version);
    expect(fs.readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf8')).toMatch(
      /Release command regression/,
    );
    expect(fs.existsSync(path.join(cwd, '.changeset/test-release.md'))).toBe(false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
