#!/usr/bin/env node

import { execa, ExecaError } from 'execa';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitLintArgs } from './args.js';
import { partitionLintTargets } from './partition.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const distRoot = path.resolve(dirname, '..');
const packageRoot = path.resolve(distRoot, '..');

const oxlintConfigPath = path.join(distRoot, 'oxlint/index.json');
const strictConfigPath = path.join(distRoot, 'oxlint/strict.json');
const nativeConfigPath = path.join(distRoot, 'oxlint/native.json');
const baseConfigPath = path.join(distRoot, 'oxlint/base.json');
const webConfigPath = path.join(distRoot, 'oxlint/web.json');
const serverConfigPath = path.join(distRoot, 'oxlint/server.json');
const serverStrictConfigPath = path.join(distRoot, 'oxlint/server-strict.json');
const oxfmtConfigPath = path.join(distRoot, 'oxfmt/index.json');

// Arguments are passed as argv, never joined into a shell string: Expo Router paths
// contain parentheses and brackets (`src/app/(app)/[id].tsx`) and paths may contain spaces.
const withDefaultTarget = (args: string[]) => (args.length > 0 ? args : ['.']);

const run = async (
  file: string,
  args: string[],
  options: { cwd?: string; localDir?: string } = {},
) => {
  try {
    await execa(file, args, {
      cwd: options.cwd ?? process.cwd(),
      localDir: options.localDir ?? packageRoot,
      preferLocal: true,
      stdio: 'inherit',
    });
    return 0;
  } catch (error) {
    const exitCode = error instanceof ExecaError ? error.exitCode : undefined;
    if (exitCode === undefined)
      console.error(error instanceof Error ? error.message : String(error));
    return exitCode ?? 1;
  }
};

const oxlint = (args: string[]) =>
  run('oxlint', ['-c', oxlintConfigPath, ...withDefaultTarget(args)]);

const oxlintServer = (args: string[], cwd = process.cwd()) =>
  run('oxlint', ['-c', serverConfigPath, ...withDefaultTarget(args)], { cwd });

const oxlintStrict = (config: string, args: string[]) =>
  run('oxlint', [
    '-c',
    config,
    '--deny-warnings',
    '--report-unused-disable-directives-severity=error',
    ...withDefaultTarget(args),
  ]);

// Directory overrides in native.json are project-relative (`test/**`). Oxlint matches override
// globs of a config outside the project against absolute paths, where `**/test/**` would also
// exempt every project below a `test` folder: each run anchors them to its project root in a
// generated config that extends the preset.
const isProjectRelativeGlob = (glob: string) => !glob.startsWith('**/') && !path.isAbsolute(glob);
const escapeGlob = (value: string) => value.replace(/[\\[\]{}()*?]/g, '\\$&');

const writeNativeConfig = (projectRoot: string, dir: string) => {
  const preset = JSON.parse(fs.readFileSync(nativeConfigPath, 'utf8')) as {
    overrides: Array<{ files: string[]; rules: Record<string, unknown> }>;
    ignorePatterns: string[];
  };
  // Oxlint sees paths as given or symlink-resolved (macOS /var → /private/var): anchor both.
  const roots = [...new Set([path.resolve(projectRoot), fs.realpathSync(projectRoot)])];
  const overrides = preset.overrides.flatMap(({ files, rules }) => {
    const relative = files.filter(isProjectRelativeGlob);
    if (relative.length === 0) return [];
    const anchored = roots.flatMap((root) => relative.map((glob) => `${escapeGlob(root)}/${glob}`));
    return [{ files: anchored, rules }];
  });
  const config = { extends: [nativeConfigPath], overrides };
  const configPath = path.join(dir, 'native.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  return { configPath, ignorePatterns: preset.ignorePatterns };
};

// React Native preset: type-aware (tsgolint reads the project's tsconfig), React Compiler
// diagnostics and Pulse boundary rules. Runs from the native project root, which the custom
// rules use to resolve `src/...` paths; warnings are not allowed.
const oxlintNative = async (args: string[], cwd = process.cwd()) => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-lint-config-'));
  try {
    const { configPath, ignorePatterns } = writeNativeConfig(cwd, configDir);
    return await run(
      'oxlint',
      [
        '-c',
        configPath,
        // CLI ignores are project-relative; config ignores are relative to the
        // temporary config file in current Oxlint.
        ...ignorePatterns.flatMap((pattern) => ['--ignore-pattern', pattern]),
        '--type-aware',
        '--deny-warnings',
        ...withDefaultTarget(args),
      ],
      { cwd },
    );
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
};

// `lint` is the file-aware dispatcher used by hooks: files of a project whose package.json sets
// `pulseLint.preset = "native"` or "server" use that preset from the project's root.
// Everything else keeps web. Caller options apply to web/server; native always rejects warnings.
const lint = async (args: string[]) => {
  const { options, targets } = splitLintArgs(args);
  const { webTargets, nativeGroups, serverGroups } = partitionLintTargets(targets, process.cwd());

  let exitCode = 0;
  if (webTargets.length > 0 || targets.length === 0) {
    exitCode = Math.max(
      exitCode,
      await oxlint([...options, '--', ...withDefaultTarget(webTargets)]),
    );
  }
  for (const { projectRoot, files } of nativeGroups) {
    exitCode = Math.max(
      exitCode,
      // oxlint-disable-next-line no-await-in-loop -- keep per-project diagnostics readable
      await oxlintNative(
        [
          '--no-error-on-unmatched-pattern',
          '--',
          ...files.map((file) => path.relative(projectRoot, file)),
        ],
        projectRoot,
      ),
    );
  }
  for (const { files } of serverGroups) {
    exitCode = Math.max(
      exitCode,
      // oxlint-disable-next-line no-await-in-loop -- keep per-project diagnostics readable
      await oxlintServer([
        ...options,
        '--',
        ...files.map((file) => path.relative(process.cwd(), file)),
      ]),
    );
  }
  return exitCode;
};

const commandsMap: Record<string, (args: string[]) => Promise<number>> = {
  lint,
  oxlint,
  'oxlint:base': (args) => run('oxlint', ['-c', baseConfigPath, ...withDefaultTarget(args)]),
  'oxlint:web': (args) => run('oxlint', ['-c', webConfigPath, ...withDefaultTarget(args)]),
  'oxlint:server': (args) => oxlintServer(args),
  'oxlint:strict': (args) => oxlintStrict(strictConfigPath, args),
  'oxlint:server:strict': (args) => oxlintStrict(serverStrictConfigPath, args),
  'oxlint:native': (args) => oxlintNative(args),
  oxfmt: (args) => run('oxfmt', ['-c', oxfmtConfigPath, ...withDefaultTarget(args)]),
  'oxfmt:check': (args) =>
    run('oxfmt', ['--check', '-c', oxfmtConfigPath, ...withDefaultTarget(args)]),
  commitlint: (args) => run('commitlint', args),
  lefthook: (args) => run('lefthook', args),
};

const commands = Object.keys(commandsMap);
const enableEcho = process.argv[2] === '--echo';
const command = enableEcho ? process.argv[3] : process.argv[2];

if (!command || !commands.includes(command)) {
  console.error(`Please specify one of available commands: ${commands.join(' ')}`);

  process.exit(-1);
}

const args = enableEcho ? process.argv.slice(4) : process.argv.slice(3);

if (enableEcho) {
  console.log('>>', command, JSON.stringify(args));
}

process.exit(await commandsMap[command](args));
