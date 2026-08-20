// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateBenchmarkMs,
  estimateSpeedDateMs,
  formatDuration,
  estimateLine,
} from '../src/lib/runEstimates.ts';

const RIG = { gpu: 'RTX 4070', vramGb: 12, ramGb: 32, cpu: 'Ryzen', os: 'Windows 11' };
const OTHER_RIG = { ...RIG, gpu: 'RTX 3060' };

const run = (elapsedMs, questionCount, hardware = RIG) => ({
  model: 'llama3.1:8b', completedAt: '2026-08-13T00:00:00Z', total: 90, grade: 'A',
  speed: 90, sobriety: 90, stability: 90, fit: 90,
  questionCount, elapsedMs, hardware,
});

const history = (runsByModel) => ({ version: 1, runs: runsByModel });

test("a model's own history on this rig beats everything", () => {
  const h = history({
    'llama3.1:8b': [run(100_000, 10), run(120_000, 10), run(80_000, 10)],
    'other:7b': [run(900_000, 10)],
  });
  const estimate = estimateBenchmarkMs(h, { model: 'llama3.1:8b', questionCount: 20, hardware: RIG });
  assert.equal(estimate.source, 'measured');
  assert.equal(estimate.sampleCount, 3);
  // Median per-question rate is 10s -> 20 questions is 200s. The slow
  // stranger's 90s/question never enters it.
  assert.equal(estimate.ms, 200_000);
});

test("any model's history on this rig still beats a rule of thumb", () => {
  const h = history({ 'other:7b': [run(60_000, 10)] });
  const estimate = estimateBenchmarkMs(h, { model: 'never-tested:3b', questionCount: 10, hardware: RIG });
  assert.equal(estimate.source, 'measured');
  assert.equal(estimate.ms, 60_000);
});

test("another rig's pace says nothing about this one", () => {
  // The laptop's history moved to the desktop: exclude it, fall to heuristic.
  const h = history({ 'llama3.1:8b': [run(600_000, 10, OTHER_RIG)] });
  const estimate = estimateBenchmarkMs(h, { model: 'llama3.1:8b', questionCount: 10, hardware: RIG });
  assert.equal(estimate.source, 'heuristic');
  assert.equal(estimate.sampleCount, 0);
});

test('no history at all is an honest rule of thumb', () => {
  const estimate = estimateBenchmarkMs(null, { questionCount: 20 });
  assert.equal(estimate.source, 'heuristic');
  assert.equal(estimate.ms, 200_000);
  assert.match(estimateLine(estimate), /rule of thumb/i);
});

test('speed dating sums per-contestant estimates and only claims measured when all are', () => {
  const h = history({ 'a:7b': [run(100_000, 10)] });
  const mixed = estimateSpeedDateMs(h, { models: ['a:7b', 'b:7b'], questionCount: 10, hardware: RIG });
  // b:7b borrows the rig's pace (still measured data), so the total is
  // measured; a lineup with NO history anywhere is the heuristic case.
  assert.equal(mixed.source, 'measured');
  assert.equal(mixed.ms, 200_000);
  const cold = estimateSpeedDateMs(null, { models: ['a:7b', 'b:7b'], questionCount: 10 });
  assert.equal(cold.source, 'heuristic');
});

test('durations format coarsely — forecasts, not promises', () => {
  assert.equal(formatDuration(12_000), '~10s');
  assert.equal(formatDuration(43_000), '~45s');
  assert.equal(formatDuration(120_000), '~2 min');
  assert.equal(formatDuration(14 * 60_000), '~15 min');
  assert.equal(formatDuration(0), '');
});
