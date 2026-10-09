import { execFileSync } from 'node:child_process';

import type { TestProject } from 'vitest/node';

export default function setup(project: TestProject) {
  const build = () => {
    execFileSync(process.env.npm_execpath ?? 'yarn', ['build'], {
      cwd: project.config.root,
      encoding: 'utf8',
      timeout: 30_000,
    });
  };
  build();
  project.onTestsRerun(build);
}
