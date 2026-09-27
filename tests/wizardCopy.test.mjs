// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { STEPS, STEP_LABELS, footerHint, nextBlockedHint, showAnnouncement } from '../src/lib/wizardCopy.ts';

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

/**
 * The show ran for minutes and said nothing to a screen reader until "Report
 * ready". What it says now is read from a live region, so it must change only
 * at milestones — a line that changed with every question would be read ten
 * times a model and bury the moments that matter.
 */
test('the show announces a model starting, and the one before it finishing', () => {
  const base = { answering: 'Gemma4', modelNumber: 1, modelCount: 2, failed: false };
  assert.equal(showAnnouncement(base), 'Gemma4 is answering, model 1 of 2.');
  assert.equal(
    showAnnouncement({ ...base, answering: 'Qwen3.5', modelNumber: 2, finished: { name: 'Gemma4', total: 90.3 } }),
    'Gemma4 finished with 90. Qwen3.5 is answering, model 2 of 2.',
  );
  // A lone contestant has no "1 of 1" to count.
  assert.equal(showAnnouncement({ ...base, modelCount: 1 }), 'Gemma4 is answering.');
  assert.equal(showAnnouncement({ ...base, answering: '' }), '');
});

test('a failed show says it stopped, and why', () => {
  const said = showAnnouncement({ answering: 'Gemma4', modelNumber: 1, modelCount: 2, failed: true, failure: 'Ollama stopped responding.' });
  assert.equal(said, 'The show stopped early. Ollama stopped responding.');
  assert.doesNotMatch(said, /is answering/);
});
