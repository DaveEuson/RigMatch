// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { downloadTimeLeft } from '../src/lib/wizardCopy.ts';

const require = createRequire(import.meta.url);
const { smoothRate } = require('../electron/downloadRate.cjs');

/**
 * The time left on a download used to jump from "about 8 minutes" to "about
 * 74" on the same model: the speed under it was measured between two
 * progress lines milliseconds apart, while Ollama's parallel parts land in
 * bursts. These pin the smoothing and the rounding that fixed it.
 */

const MB = 1_000_000;

/** Feed samples of [bytesPerSecond, ms] through the smoother. */
const run = (samples, start = null) => samples.reduce((bps, [sample, ms]) => smoothRate(bps, sample, ms), start);

test('the first sample is taken as it is, and a non-number keeps the last', () => {
  assert.equal(smoothRate(null, 5 * MB, 400), 5 * MB);
  assert.equal(smoothRate(5 * MB, Number.NaN, 400), 5 * MB);
  assert.equal(smoothRate(5 * MB, -1, 400), 5 * MB);
});

test('a burst lasting milliseconds barely moves a steady speed', () => {
  // 8 MB/s for ten seconds, then one 4 ms line that read as 900 KB/s.
  const steady = run(Array.from({ length: 50 }, () => [8 * MB, 200]), 8 * MB);
  const afterDip = smoothRate(steady, 0.9 * MB, 4);
  assert.ok(Math.abs(afterDip - 8 * MB) / (8 * MB) < 0.01, `moved to ${afterDip}`);
});

test('the swing Dave saw no longer swings the estimate tenfold', () => {
  // Alternating 8 MB/s and 0.9 MB/s lines, 50 ms apart, for a minute; the
  // last twenty seconds, once it has settled, must hold still.
  const samples = Array.from({ length: 1200 }, (_, i) => [i % 2 ? 0.9 * MB : 8 * MB, 50]);
  let bps = null;
  const seen = [];
  samples.forEach(([sample, ms], i) => { bps = smoothRate(bps, sample, ms); if (i >= 800) seen.push(bps); });
  const spread = Math.max(...seen) / Math.min(...seen);
  assert.ok(spread < 1.1, `still swings ${spread.toFixed(2)}x`);
});

test('a real change in speed shows within seconds', () => {
  const settled = run(Array.from({ length: 25 }, () => [2 * MB, 400]), 10 * MB);
  assert.ok(settled < 3.5 * MB, `after ten seconds at 2 MB/s it still reads ${(settled / MB).toFixed(1)} MB/s`);
});

test('the time left is coarser the further off it is', () => {
  const left = (seconds) => downloadTimeLeft({ speedBps: MB, totalBytes: seconds * MB + 1, completedBytes: 1 });
  assert.equal(left(30), 'under a minute left');
  assert.equal(left(8 * 60), 'about 8 minutes left');
  assert.equal(left(74 * 60), 'about 75 minutes left');
  assert.equal(left(3 * 3600 + 600), 'about 3 hours left');
  assert.equal(left(100 * 60), 'about 1.5 hours left');
  assert.equal(downloadTimeLeft({ speedBps: 0, totalBytes: 10, completedBytes: 1 }), '');
});
