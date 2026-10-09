import { test, expect } from 'vitest';

import { selectReleaseMode } from '../../scripts/release-plan.ts';

const base = {
  eventName: 'push',
  ref: 'refs/heads/main',
  repository: 'pulse-foundation/pulse-lint',
  hasChangesets: false,
  version: '1.1.0',
  previousVersion: '1.0.0',
};

test('release only stages main version changes or explicit main retries', () => {
  expect(selectReleaseMode(base)).toBe('stage');
  expect(selectReleaseMode({ ...base, previousVersion: '1.1.0' })).toBe('none');
  expect(selectReleaseMode({ ...base, previousVersion: null })).toBe('none');
  expect(
    selectReleaseMode({ ...base, eventName: 'workflow_dispatch', previousVersion: null }),
  ).toBe('stage');
});

test('pending changesets create a version PR instead of staging', () => {
  expect(selectReleaseMode({ ...base, hasChangesets: true })).toBe('version');
});

test('forks, tags, PR events and other branches cannot prepare a release', () => {
  for (const override of [
    { repository: 'someone/pulse-lint' },
    { ref: 'refs/heads/feature' },
    { ref: 'refs/tags/v1.1.0' },
    { eventName: 'pull_request' },
  ]) {
    expect(selectReleaseMode({ ...base, ...override })).toBe('none');
  }
});
