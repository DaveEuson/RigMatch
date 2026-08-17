import test from 'node:test';
import assert from 'node:assert/strict';

import { getPullProgressDetailLabel } from '../src/lib/modelCatalog.ts';

/**
 * The line under a download's progress bar must not contradict the bar.
 *
 * Dave's real ComfyUI download sat at 3% with the bar visibly filling while
 * the line beneath read "-- MB/s · waiting for bytes". The bytes were
 * arriving; the ComfyUI path just never sent completedBytes or speedBps, so
 * the line fell through to the "nothing yet" branch and called the user a
 * liar about what they could see.
 */

const pulling = (progress) => getPullProgressDetailLabel('pulling', false, progress);

test('a moving download never says it is waiting for bytes', () => {
  const line = pulling({ percent: 3, completedBytes: 120_000_000, totalBytes: 4_000_000_000, speedBps: 8_400_000 });
  assert.doesNotMatch(line, /waiting for bytes/);
  assert.match(line, /3%/);
});

test('the rate appears once the main process measures one', () => {
  const line = pulling({ percent: 12, completedBytes: 500_000_000, totalBytes: 4_000_000_000, speedBps: 12_000_000 });
  assert.doesNotMatch(line, /--\s*MB\/s/, 'a measured rate must not render as "--"');
  assert.match(line, /\d/, 'the rate should be a number');
});

test('bytes and total are both reported when known', () => {
  const line = pulling({ percent: 50, completedBytes: 2_000_000_000, totalBytes: 4_000_000_000, speedBps: 9_000_000 });
  assert.match(line, /of|\//, 'should show progress against the total');
});

test('before the first byte it is honest about that', () => {
  // The genuine "nothing has arrived" case still has to read correctly.
  const line = getPullProgressDetailLabel('pulling', true, { percent: 0 });
  assert.match(line, /waiting for bytes/);
});

test('a stalled download keeps its progress and stops short of claiming a rate', () => {
  // formatBytesPerSecond renders 0 as "-- MB/s", which is the right call for a
  // stall: there is no rate to report. What must NOT happen is the rest of the
  // line regressing to "waiting for bytes" when 1.6 GB has already landed.
  const line = pulling({ percent: 41, completedBytes: 1_600_000_000, totalBytes: 4_000_000_000, speedBps: 0 });
  assert.match(line, /-- MB\/s/, 'a stall reports no rate rather than a fake one');
  // formatBytes is binary, so 1.6e9 bytes reads as "1.49 GB".
  assert.match(line, /1\.49 GB \/ 3\.73 GB/, 'the bytes already received stay on screen');
  assert.doesNotMatch(line, /waiting for bytes/);
  assert.match(line, /41%/);
});
