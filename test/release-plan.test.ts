import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectReleaseMode } from '../scripts/release-plan.ts';

const base = {
  eventName: 'push',
  ref: 'refs/heads/main',
  repository: 'pulse-foundation/pulse-lint',
  hasChangesets: false,
  version: '1.1.0',
  previousVersion: '1.0.0',
};

test('release only stages main version changes or explicit main retries', () => {
  assert.equal(selectReleaseMode(base), 'stage');
  assert.equal(selectReleaseMode({ ...base, previousVersion: '1.1.0' }), 'none');
  assert.equal(selectReleaseMode({ ...base, previousVersion: null }), 'none');
  assert.equal(
    selectReleaseMode({ ...base, eventName: 'workflow_dispatch', previousVersion: null }),
    'stage',
  );
});

test('pending changesets create a version PR instead of staging', () => {
  assert.equal(selectReleaseMode({ ...base, hasChangesets: true }), 'version');
});

test('forks, tags, PR events and other branches cannot prepare a release', () => {
  for (const override of [
    { repository: 'someone/pulse-lint' },
    { ref: 'refs/heads/feature' },
    { ref: 'refs/tags/v1.1.0' },
    { eventName: 'pull_request' },
  ]) {
    assert.equal(selectReleaseMode({ ...base, ...override }), 'none');
  }
});
