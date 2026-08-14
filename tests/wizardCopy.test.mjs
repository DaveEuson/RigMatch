import test from 'node:test';
import assert from 'node:assert/strict';

import { STEPS, STEP_LABELS, footerHint, nextBlockedHint } from '../src/lib/wizardCopy.ts';

/**
 * Simple Mode is the default mode and the one beginners use. When a run died it
 * kept insisting "The show is still running" over a frozen screen with no Back
 * button — the app stating something false while offering no way out.
 */
test('a dead run is never described as still running', () => {
  const failed = nextBlockedHint('compare', undefined, true);
  assert.doesNotMatch(failed, /still running/i);
  assert.match(failed, /stopped early/i);
  assert.match(failed, /back/i, 'it must point at the way out, not just name the problem');
});

test('a live run still says so', () => {
  assert.match(nextBlockedHint('compare', undefined, false), /still running/i);
  assert.match(nextBlockedHint('compare'), /still running/i, 'defaults to the running case');
});

test('a blocked download prefers the specific reason over the generic one', () => {
  assert.equal(nextBlockedHint('download', 'Two downloads failed'), 'Two downloads failed');
  assert.match(nextBlockedHint('download'), /waiting for downloads/i);
});

test('setup only congratulates a check that actually ran', () => {
  assert.match(footerHint('setup', false, 0), /one click checks/i);
  assert.equal(footerHint('setup', true, 0), '', 'the Setup screen already says it is ready');
});

test('every step has a label and the order is the flow order', () => {
  assert.deepEqual(STEPS, ['setup', 'pick', 'download', 'compare', 'winner']);
  for (const step of STEPS) assert.ok(STEP_LABELS[step], `${step} has no label`);
});
