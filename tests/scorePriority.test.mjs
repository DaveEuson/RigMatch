// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  SCORE_PRIORITIES, SCORE_WEIGHTS, DEFAULT_SCORE_PRIORITY, readScorePriority,
  calculatePreciseTotal, applyScorePriority, gradeForMatchScore,
} = await import('../src/lib/scoring.ts');
const { SCORE_WEIGHTS: DISPLAY_ROWS } = await import('../src/lib/scoreReference.ts');

/**
 * "Which model is best" had no stated answer: the app weighted answer quality
 * two points above speed and never said so. These lock the three profiles, and
 * the promise that switching between them re-summarizes saved measurements
 * rather than changing what was measured.
 */

const score = (over = {}) => ({ sobriety: 50, speed: 50, stability: 50, fit: 50, total: 50, ...over });

test('every priority is a real average — the weights sum to 1', () => {
  for (const [id, profile] of Object.entries(SCORE_PRIORITIES)) {
    const sum = Object.values(profile.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${id} sums to ${sum}`);
  }
});

test('balanced is exactly the historical weighting', () => {
  // The default path must be bit-for-bit what it always was, or every saved
  // score silently changes meaning the day this shipped.
  assert.deepEqual({ ...SCORE_PRIORITIES.balanced.weights }, { ...SCORE_WEIGHTS });
  assert.equal(DEFAULT_SCORE_PRIORITY, 'balanced');
});

test('the default argument keeps the old call signature honest', () => {
  const s = score({ sobriety: 90, speed: 40 });
  assert.equal(calculatePreciseTotal(s), calculatePreciseTotal(s, 'balanced'));
});

test('accuracy first ranks the slow careful model above the fast sloppy one', () => {
  const careful = score({ sobriety: 90, speed: 40 });
  const quick = score({ sobriety: 40, speed: 90 });
  assert.ok(calculatePreciseTotal(careful, 'accuracy') > calculatePreciseTotal(quick, 'accuracy'));
});

test('speed first reverses exactly that pair', () => {
  const careful = score({ sobriety: 90, speed: 40 });
  const quick = score({ sobriety: 40, speed: 90 });
  assert.ok(calculatePreciseTotal(quick, 'speed') > calculatePreciseTotal(careful, 'speed'));
});

test('reliability and fit hold their share in every profile', () => {
  // The argument is about accuracy against speed. Letting the other two drift
  // would make it a four-way preference nobody asked for.
  for (const profile of Object.values(SCORE_PRIORITIES)) {
    assert.equal(profile.weights.stability, SCORE_WEIGHTS.stability);
    assert.equal(profile.weights.fit, SCORE_WEIGHTS.fit);
  }
});

test('the three copies of the weights still agree', () => {
  // They live in scoring.ts, in a literal in electron/benchmarkTotals.cjs (the
  // main process's run totals), and as display percentages in scoreReference.ts.
  // The repo's pattern for a value the main process cannot import is to
  // duplicate it and lock it here, the same way the grade bands are locked.
  const totals = readFileSync(new URL('../electron/benchmarkTotals.cjs', import.meta.url), 'utf-8');
  const line = totals.split('\n').find((l) => l.includes('const total ='));
  assert.ok(line, 'benchmarkTotals.cjs no longer has a total line to check');
  for (const [signal, key] of [['speed', 'speed'], ['avgSobriety', 'sobriety'], ['stability', 'stability'], ['fitScore', 'fit']]) {
    assert.ok(
      line.includes(`${signal} * ${SCORE_WEIGHTS[key]}`),
      `benchmarkTotals.cjs weights ${signal} differently from SCORE_WEIGHTS.${key} (${SCORE_WEIGHTS[key]})`,
    );
  }
  const byLabel = Object.fromEntries(DISPLAY_ROWS.map((row) => [row.label, row.pct]));
  assert.equal(byLabel.Quality, SCORE_WEIGHTS.sobriety * 100);
  assert.equal(byLabel.Speed, SCORE_WEIGHTS.speed * 100);
  assert.equal(byLabel.Reliability, SCORE_WEIGHTS.stability * 100);
  assert.equal(byLabel['Computer Fit'], SCORE_WEIGHTS.fit * 100);
});
