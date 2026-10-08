import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const packageRoot = path.resolve(dirname, '..');

const aliasBeforeRelativeFile = path.resolve(
  packageRoot,
  'test/import-order/alias-before-relative.ts',
);
const relativeBeforeAliasFile = path.resolve(
  packageRoot,
  'test/import-order/relative-before-alias.ts',
);

const runOxlint = (targetFile: string) =>
  spawnSync(process.execPath, ['./dist/cli/index.js', 'oxlint', '--deny-warnings', targetFile], {
    cwd: packageRoot,
    encoding: 'utf8',
  });

const validOrderResult = runOxlint(aliasBeforeRelativeFile);
assert.equal(
  validOrderResult.status,
  0,
  `Expected valid import order to pass.\n${validOrderResult.stdout}\n${validOrderResult.stderr}`,
);

const invalidOrderResult = runOxlint(relativeBeforeAliasFile);
assert.notEqual(
  invalidOrderResult.status,
  0,
  'Expected invalid import order to fail when warnings are denied.',
);

const invalidOrderOutput = `${invalidOrderResult.stdout}\n${invalidOrderResult.stderr}`;
assert.match(
  invalidOrderOutput,
  /simple-import-sort\(imports\)/,
  `Expected simple-import-sort warning for invalid import order.\n${invalidOrderOutput}`,
);

console.log('Import order regression checks passed.');
