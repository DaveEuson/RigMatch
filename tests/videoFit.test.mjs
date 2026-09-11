// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { videoModelSpec } from '../src/lib/videoCatalog.ts';
import {
  estimateVideoSeconds,
  formatVideoDuration,
  formatVideoEstimate,
  machineFactor,
  recordCalibration,
  videoFit,
} from '../src/lib/videoFit.ts';

/**
 * Fit and time, on every card, before anything is downloaded. The lineup runs
 * from 17 seconds to three hours a clip and up to 56 GB of download, so both
 * answers have to be right enough to decide on — and honest about how rough
 * they are before this machine has been timed.
 */

const RTX_4070 = { vramGb: 12, ramGb: 61.6, gpuName: 'NVIDIA GeForce RTX 4070', platform: 'win32' };
const spec = (key) => videoModelSpec(key);

/**
 * Timed on the reference 4070 by videobench on 2026-09-10: five seconds of
 * footage, cold start. Two models were run twice; both runs are here.
 */
const MEASURED_ON_4070 = [
  ['ltxv-2b', 16.5],
  ['ltxv-13b', 48.7],
  ['ltx-2.3', 65.1],
  ['ltx-2.3', 74],
  ['minimax-h3', 109.8],
  ['minimax-h3', 120],
  ['wan-2.1-1.3b', 370.6],
  ['kandinsky-5', 1278],
];

test('on the reference 4070, every measured run falls inside its estimate', () => {
  for (const [key, seconds] of MEASURED_ON_4070) {
    const estimate = estimateVideoSeconds(spec(key), RTX_4070);
    assert.ok(estimate.low <= seconds && seconds <= estimate.high,
      `${key} took ${seconds}s, outside ${estimate.low.toFixed(1)}-${estimate.high.toFixed(1)}s`);
  }
});

test('they still fall inside once the 4070 has calibrated itself', () => {
  const calibration = recordCalibration(null, RTX_4070.gpuName, 16.5);
  for (const [key, seconds] of MEASURED_ON_4070) {
    const estimate = estimateVideoSeconds(spec(key), RTX_4070, { calibration });
    assert.equal(estimate.basis, 'calibrated');
    assert.ok(estimate.low <= seconds && seconds <= estimate.high, `${key} took ${seconds}s`);
  }
});

test('the reference 4070 sorts the lineup the way the handoff found it', () => {
  assert.equal(videoFit(spec('ltxv-2b'), RTX_4070).status, 'fits');
  assert.equal(videoFit(spec('kandinsky-5'), RTX_4070).status, 'fits');
  // A 21 GB model on a 12 GB card, which still finished in under two minutes.
  assert.equal(videoFit(spec('minimax-h3'), RTX_4070).status, 'offload');
  assert.equal(videoFit(spec('ltx-2.3'), RTX_4070).status, 'offload');
});

test('a gated model says it needs a token before it says anything about size', () => {
  assert.equal(videoFit(spec('ltx-2.5'), RTX_4070).status, 'needs-token');
  assert.notEqual(videoFit(spec('ltx-2.5'), RTX_4070, { hasToken: true }).status, 'needs-token');
});

test('a smaller machine gets a different, honest answer', () => {
  const laptop = { vramGb: 8, ramGb: 32, gpuName: 'RTX 4060 Laptop', platform: 'win32' };
  assert.equal(videoFit(spec('kandinsky-5'), laptop).status, 'fits');
  assert.equal(videoFit(spec('wan-2.1-14b'), laptop).status, 'offload');
  // MiniMax H3's 27 GB text encoder cannot be offloaded into 32 GB.
  const minimax = videoFit(spec('minimax-h3'), laptop);
  assert.equal(minimax.status, 'too-big');
  assert.match(minimax.detail, /system memory/);
});

test('a card under 6 GB is told it needs a bigger one, rather than offered a crawl', () => {
  const fit = videoFit(spec('ltxv-2b'), { vramGb: 4, ramGb: 16, platform: 'win32' });
  assert.equal(fit.status, 'too-big');
  assert.match(fit.detail, /6 GB or more/);
});

test('a Jetson is told plainly why nothing fits, instead of being offered a failure', () => {
  const orin = { vramGb: 7.4, ramGb: 7.4, unifiedMemory: true, platform: 'linux' };
  for (const key of ['ltxv-2b', 'wan-2.1-1.3b', 'kandinsky-5']) {
    const fit = videoFit(spec(key), orin);
    assert.equal(fit.status, 'too-big', key);
    assert.match(fit.detail, /GGUF/);
  }
});

test('Apple silicon is sized against system memory, as videobench sizes it', () => {
  const mac = { vramGb: 36, ramGb: 36, unifiedMemory: true, platform: 'darwin' };
  assert.equal(videoFit(spec('ltxv-2b'), mac).status, 'fits');
  assert.equal(videoFit(spec('minimax-h3'), mac).status, 'too-big');
});

test('more VRAM than the reference card is faster for a model that offloads there', () => {
  const big = { ...RTX_4070, vramGb: 24, gpuName: 'RTX 4090' };
  const onReference = estimateVideoSeconds(spec('minimax-h3'), RTX_4070).seconds;
  assert.ok(estimateVideoSeconds(spec('minimax-h3'), big).seconds < onReference);
  // A model that fits either way is unchanged by the extra VRAM.
  assert.equal(estimateVideoSeconds(spec('ltxv-2b'), big).seconds, estimateVideoSeconds(spec('ltxv-2b'), RTX_4070).seconds);
});

test('calibration scales every estimate by this machine\'s own LTX-Video 2B run', () => {
  const slow = recordCalibration(null, 'Slow GPU', 34); // twice the reference 17 s
  assert.equal(machineFactor(slow, 'Slow GPU').factor, 2);
  const machine = { ...RTX_4070, gpuName: 'Slow GPU' };
  assert.equal(
    estimateVideoSeconds(spec('kandinsky-5'), machine, { calibration: slow }).seconds,
    2 * estimateVideoSeconds(spec('kandinsky-5'), machine).seconds,
  );
});

test('the fastest calibration is kept, because a busy GPU only ever reads slow', () => {
  const first = recordCalibration(null, 'GPU', 20);
  assert.equal(recordCalibration(first, 'GPU', 31).seconds, 20);
  assert.equal(recordCalibration(first, 'GPU', 17.2).seconds, 17.2);
});

test('a new GPU forgets the old calibration', () => {
  const old = recordCalibration(null, 'Old GPU', 40);
  assert.equal(machineFactor(old, 'New GPU').calibrated, false);
  assert.equal(recordCalibration(old, 'New GPU', 25).gpu, 'New GPU');
});

test('before calibration an estimate says it is rough', () => {
  const estimate = estimateVideoSeconds(spec('ltx-2.3'), RTX_4070);
  assert.equal(estimate.basis, 'rough');
  assert.match(formatVideoEstimate(estimate), /rough/);
});

test('a time measured here replaces the estimate outright', () => {
  const estimate = estimateVideoSeconds(spec('kandinsky-5'), RTX_4070, { measuredSeconds: 1278 });
  assert.equal(estimate.basis, 'measured');
  assert.equal(formatVideoEstimate(estimate), 'Took 21 min 18 s here');
});

test('times read in the unit a person plans around', () => {
  assert.equal(formatVideoDuration(16.5), '17 s');
  assert.equal(formatVideoDuration(370.6), '6 min 11 s');
  assert.equal(formatVideoDuration(10800), '3 h');
  const calibration = recordCalibration(null, RTX_4070.gpuName, 17);
  assert.equal(formatVideoEstimate(estimateVideoSeconds(spec('ltxv-2b'), RTX_4070, { calibration })), 'About 10–27 s');
  assert.equal(formatVideoEstimate(estimateVideoSeconds(spec('kandinsky-5-pro'), RTX_4070, { calibration })), 'About 1.8–4.8 h');
});
