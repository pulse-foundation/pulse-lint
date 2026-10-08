import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export type ReleaseInput = {
  eventName: string;
  ref: string;
  repository: string;
  hasChangesets: boolean;
  version: string;
  previousVersion: string | null;
};

export const selectReleaseMode = (input: ReleaseInput): 'none' | 'version' | 'stage' => {
  if (
    input.repository !== 'pulse-foundation/pulse-lint' ||
    input.ref !== 'refs/heads/main' ||
    !['push', 'workflow_dispatch'].includes(input.eventName)
  )
    return 'none';
  if (input.hasChangesets) return 'version';
  if (input.eventName === 'workflow_dispatch') return 'stage';
  return input.previousVersion !== null && input.previousVersion !== input.version
    ? 'stage'
    : 'none';
};

if (process.argv.includes('--github')) {
  const status = JSON.parse(fs.readFileSync('release-status.json', 'utf8')) as {
    changesets: unknown[];
  };
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
  const before = process.env.RELEASE_BASE_SHA ?? '';
  let previousVersion: string | null = null;
  if (/^[a-f0-9]{40}$/.test(before) && !/^0+$/.test(before)) {
    // A missing/unreachable base fails closed rather than staging an unrelated commit.
    const previous = execFileSync('git', ['show', `${before}:package.json`], { encoding: 'utf8' });
    previousVersion = (JSON.parse(previous) as { version: string }).version;
  }
  const mode = selectReleaseMode({
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
    hasChangesets: status.changesets.length > 0,
    version: manifest.version,
    previousVersion,
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
}
