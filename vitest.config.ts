import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/setup.ts'],
    // Integration suites execute built files and read fixtures outside Vite's import graph.
    forceRerunTriggers: [
      'package.json',
      'vitest.config.ts',
      'src/**',
      'scripts/**',
      'tsconfig*.json',
      'tests/fixtures/**',
      'tests/helpers/**',
      'tests/setup.ts',
    ].map((pattern) => fileURLToPath(new URL(pattern, import.meta.url))),
    // Packing rebuilds dist, which the other integration suites execute.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    maxConcurrency: 4,
  },
});
