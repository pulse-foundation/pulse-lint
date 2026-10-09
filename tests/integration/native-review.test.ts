import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, test, expect } from 'vitest';

import { packageRoot as root } from '../helpers/paths.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-native-review-'));
const fixture = path.join(temporary, 'native');
fs.cpSync(path.join(root, 'tests/fixtures/native-app'), fixture, { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'));
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

const check = (file: string, source: string, rule?: string) => {
  fs.writeFileSync(path.join(fixture, file), source);
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'dist/cli/index.js'), 'oxlint:native', '--format=json', file],
    {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(result.error).toBe(undefined);
  const report = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
  if (rule) {
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(
      report.diagnostics.some(({ code }) => code === `pulse-native(${rule})`),
      result.stdout,
    ).toBeTruthy();
  } else {
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(report.diagnostics).toStrictEqual([]);
  }
};

test('relative imports cannot cross feature internals or reach features from shared', () => {
  check(
    'src/features/inbox/relative-deep.ts',
    "export { GreetingText } from '../greeting/greeting-text';\n",
    'no-cross-feature-deep-import',
  );
  check(
    'src/shared/relative-layer.ts',
    "export { GreetingText } from '../features/greeting/greeting-text';\n",
    'no-cross-feature-deep-import',
  );
  check(
    'src/features/greeting/local-entry.ts',
    "export { GreetingText } from './greeting-text';\n",
  );
  check(
    'src/features/inbox/public-entry.ts',
    "export { GreetingText } from '../greeting/index';\n",
  );
});

test('rendered templates require translation while expressions and non-text props remain valid', () => {
  check(
    'src/features/greeting/template-child.tsx',
    // oxlint-disable-next-line no-template-curly-in-string -- template interpolation belongs to the generated fixture
    "import { Text } from 'react-native';\n\nexport const Example = ({ name }: { name: string }) => <Text>{`Hello ${name}`}</Text>;\n",
    'no-raw-jsx-text',
  );
  check(
    'src/features/greeting/dynamic-child.tsx',
    // oxlint-disable-next-line no-template-curly-in-string -- template interpolation belongs to the generated fixture
    "import { Text } from 'react-native';\n\nexport const Example = ({ name }: { name: string }) => <Text testID={`greeting-${name}`}>{name}</Text>;\n",
  );
});

test('React memo aliases are checked without rejecting unrelated or shadowed functions', () => {
  check(
    'src/features/greeting/aliased-memo.ts',
    "import { memo as reactMemo } from 'react';\n\nconst View = () => null;\nexport const Example = reactMemo(View, () => true);\n",
    'no-memo-comparator',
  );
  check(
    'src/features/greeting/namespace-memo.ts',
    "import * as UI from 'react';\n\nconst View = () => null;\nexport const Example = UI.memo(View, () => true);\n",
    'no-memo-comparator',
  );
  check(
    'src/features/greeting/local-memo.ts',
    'const memo = (value: number, transform: (value: number) => number) => transform(value);\nexport const example = memo(1, (value) => value + 1);\n',
  );
  check(
    'src/features/greeting/shadowed-memo.ts',
    "import { memo as reactMemo } from 'react';\n\nexport const View = reactMemo(() => null);\n// oxlint-disable-next-line no-shadow -- verify lexical shadowing of a React import\nexport const calculate = (reactMemo: (value: number, other: number) => number) => reactMemo(1, 2);\n",
  );
});
