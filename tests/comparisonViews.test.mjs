// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildComparisonRail, defaultComparisonView } = await import('../src/lib/comparisonViews.ts');

/**
 * Comparison was 1575px of stacked cards read through a 374px window, with the
 * ranking — the answer to the whole exercise — last in the pile. The cards are
 * views now, and this is the menu that says what each one holds.
 */

const input = (over = {}) => ({
  lineupCount: 5,
  maxContestants: 5,
  answeredCount: 0,
  questionCount: 10,
  winner: null,
  ...over,
});

test('every part of the screen is named in the rail', () => {
  const rail = buildComparisonRail(input());
  assert.deepEqual(rail.map((i) => i.id), ['transcript', 'ranking', 'lineup', 'questions', 'process']);
});

test('the ranking sits second, not last', () => {
  // It was the final card of eight. It is the answer to the whole exercise.
  const rail = buildComparisonRail(input());
  assert.equal(rail[1].id, 'ranking');
});

test('a finished run names its leader in the menu', () => {
  const rail = buildComparisonRail(input({ winner: 'qwen2.5:7b', answeredCount: 5 }));
  assert.equal(rail.find((i) => i.id === 'ranking').status, 'qwen2.5:7b leads');
});

test('an unrun comparison says so rather than showing a blank', () => {
  const rail = buildComparisonRail(input());
  assert.equal(rail.find((i) => i.id === 'ranking').status, 'Not run yet');
});

test('the transcript says how much of the lineup has actually answered', () => {
  const rail = buildComparisonRail(input({ answeredCount: 1 }));
  assert.equal(rail.find((i) => i.id === 'transcript').status, '1 of 5 tested');
});

test('an untested lineup reads as zero-of-five, not as broken', () => {
  const rail = buildComparisonRail(input({ answeredCount: 0 }));
  assert.equal(rail.find((i) => i.id === 'transcript').status, '0 of 5 tested');
});

test('the lineup carries its own fullness', () => {
  const rail = buildComparisonRail(input({ lineupCount: 3 }));
  assert.equal(rail.find((i) => i.id === 'lineup').status, '3/5 picked');
});

test('the question count is the one each model actually gets', () => {
  const rail = buildComparisonRail(input({ questionCount: 20 }));
  assert.equal(rail.find((i) => i.id === 'questions').status, '20 asked of each');
});

test('how-testing-works has no state to report and claims none', () => {
  const rail = buildComparisonRail(input());
  assert.equal(rail.find((i) => i.id === 'process').status, null);
});

// --- where the screen lands -------------------------------------------------

test('after a run you land on the ranking', () => {
  assert.equal(defaultComparisonView({ answeredCount: 5, winner: 'qwen2.5:7b' }), 'ranking');
});

test('with answers but no ranking you land on the answers', () => {
  assert.equal(defaultComparisonView({ answeredCount: 2, winner: null }), 'transcript');
});

test('before anything has run you land on the lineup you are still building', () => {
  assert.equal(defaultComparisonView({ answeredCount: 0, winner: null }), 'lineup');
});

test('a ranking wins over saved answers — it is the newer answer', () => {
  assert.equal(defaultComparisonView({ answeredCount: 5, winner: 'mistral:7b' }), 'ranking');
});
