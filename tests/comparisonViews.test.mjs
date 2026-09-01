// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildComparisonRail, defaultComparisonView, describeRankingCoverage } = await import('../src/lib/comparisonViews.ts');

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
  assert.deepEqual(rail.map((i) => i.id), ['ranking', 'transcript', 'lineup', 'questions', 'process']);
});

test('the ranking leads', () => {
  // It was the final card of eight, then second in the rail. The nav entry
  // that reaches this screen promises "Ranked results & details", and
  // defaultComparisonView already lands here after a run — the rail was the
  // last thing still ordering the details ahead of the answer.
  const rail = buildComparisonRail(input());
  assert.equal(rail[0].id, 'ranking');
});

test('results come before setup', () => {
  const ids = buildComparisonRail(input()).map((i) => i.id);
  for (const setup of ['lineup', 'questions', 'process']) {
    assert.ok(ids.indexOf(setup) > ids.indexOf('ranking'), `${setup} should follow the ranking`);
    assert.ok(ids.indexOf(setup) > ids.indexOf('transcript'), `${setup} should follow the answers`);
  }
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

// --- what the ranking is a ranking of ---------------------------------------

/**
 * The screen crowned a Best Match and never said how much of the lineup that
 * rested on. A ranking of three models sat under a banner reading "Five
 * contestants, one rig, same questions" with nothing reconciling the two.
 */

const coverage = (over = {}) => describeRankingCoverage({
  ranked: ['a:7b', 'b:7b', 'c:7b'],
  lineup: ['a:7b', 'b:7b', 'c:7b'],
  questionCount: 10,
  ...over,
});

test('a full lineup says so plainly', () => {
  assert.equal(coverage(), 'All 3 models in your lineup answered the same 10 questions.');
});

test('an unrun comparison says nothing rather than nothing-shaped', () => {
  // The caller draws its own empty state; a coverage line for a ranking that
  // does not exist would be a sentence about no models.
  assert.equal(coverage({ ranked: [] }), '');
});

test('models in the lineup that never answered are counted out loud', () => {
  const line = coverage({ lineup: ['a:7b', 'b:7b', 'c:7b', 'd:7b', 'e:7b'] });
  assert.equal(line, '3 of 5 in your lineup ranked on the same 10 questions.');
});

test('a ranked model swapped out of the lineup is named as stale', () => {
  // The reason this matters: the ranking survives across sessions, so the
  // crown can outlive the lineup that earned it.
  const line = coverage({ lineup: ['a:7b', 'b:7b'] });
  assert.match(line, /2 of 2 in your lineup/);
  assert.match(line, /1 ranked model is no longer in it/);
});

test('several swapped-out models read as plural', () => {
  const line = coverage({ lineup: ['a:7b'] });
  assert.match(line, /2 ranked models are no longer in it/);
});

test('a ranking with nothing left in the lineup still reports honestly', () => {
  const line = coverage({ lineup: ['x:7b', 'y:7b'] });
  assert.match(line, /^0 of 2 in your lineup/);
  assert.match(line, /3 ranked models are no longer in it/);
});

test('one question is not "1 questions"', () => {
  assert.equal(coverage({ questionCount: 1 }), 'All 3 models in your lineup answered the same 1 question.');
});

test('no question count claims no number', () => {
  // "the same 0 questions" would be worse than saying nothing precise.
  assert.equal(coverage({ questionCount: 0 }), 'All 3 models in your lineup answered the same questions.');
});

test('a single-model lineup is not described as "All 1 model"', () => {
  // A comparison needs two, so this should never reach a reader — but the
  // sentence is written, and a written sentence should be English.
  assert.equal(
    describeRankingCoverage({ ranked: ['a:7b'], lineup: ['a:7b'], questionCount: 4 }),
    'Your one model answered the same 4 questions.',
  );
});
