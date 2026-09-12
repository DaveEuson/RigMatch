// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  BALANCE_NOTCHES, BALANCED, JUDGE_PASS, accuracyCounted, applyBalance, balanceLabel, balanceSplit, balanceWeights,
  crowned, notchAt, rankByBalance, rankedAtLabel, readBalances, speedOnly,
} = await import('../src/lib/balance.ts');
const { SCORE_PRIORITIES, SCORE_WEIGHTS, applyScorePriority } = await import('../src/lib/scoring.ts');
const { rankLineupByBalance } = await import('../src/lib/videoLineup.ts');

/**
 * The fader replaced three fixed answers with a range asked before every test.
 * These lock the two promises that make that safe: the old answers sit exactly
 * where they were, and no position can crown a result that failed its check.
 */

const score = (over = {}) => ({ sobriety: 50, speed: 50, stability: 50, fit: 50, total: 50, grade: 'D', ...over });
const sum = (weights) => Object.values(weights).reduce((a, b) => a + b, 0);
const run = (name, seconds, accuracy, extra = {}) => ({ item: name, pace: 1 / seconds, accuracy, ...extra });

test('the three old presets are notches at exactly their old weights', () => {
  for (const notch of BALANCE_NOTCHES) {
    assert.deepEqual(balanceWeights(notch.value), SCORE_PRIORITIES[notch.id].weights, notch.id);
  }
  assert.equal(notchAt(BALANCED)?.id, 'balanced');
});

test('the whole-number positions a person can reach land on the notches', () => {
  // The fader moves in whole steps and the notches are not whole numbers.
  assert.deepEqual(balanceWeights(21), SCORE_PRIORITIES.speed.weights);
  assert.deepEqual(balanceWeights(52), SCORE_WEIGHTS);
  assert.deepEqual(balanceWeights(79), SCORE_PRIORITIES.accuracy.weights);
  assert.equal(notchAt(51), null);
  assert.equal(notchAt(53), null);
});

test('between the notches only accuracy and speed trade places', () => {
  for (const position of [0, 10, 35, 70, 90, 100]) {
    const weights = balanceWeights(position);
    assert.ok(Math.abs(sum(weights) - 1) < 1e-9, `${position} sums to ${sum(weights)}`);
    assert.equal(weights.stability, SCORE_WEIGHTS.stability);
    assert.equal(weights.fit, SCORE_WEIGHTS.fit);
  }
  assert.equal(balanceWeights(0).sobriety, 0);
  assert.equal(balanceWeights(100).speed, 0);
  assert.ok(balanceWeights(70).sobriety > balanceWeights(70).speed);
});

test('re-weighting at a notch matches the old priority setting exactly', () => {
  const saved = {
    'a:7b': score({ sobriety: 92, speed: 31, stability: 80, fit: 70 }),
    'b:1b': score({ sobriety: 40, speed: 98, stability: 90, fit: 95 }),
  };
  for (const notch of BALANCE_NOTCHES) {
    assert.deepEqual(applyBalance(saved, notch.value), applyScorePriority(saved, notch.id), notch.id);
  }
});

test('Balanced rewrites nothing', () => {
  const saved = { 'a:7b': score() };
  assert.equal(applyBalance(saved, BALANCED), saved);
  assert.equal(applyBalance(saved, 52), saved);
});

test('moving toward accuracy lifts the careful model over the quick one', () => {
  const saved = { careful: score({ sobriety: 95, speed: 20 }), quick: score({ sobriety: 45, speed: 100 }) };
  const accurate = applyBalance(saved, 100);
  const fast = applyBalance(saved, 0);
  assert.ok(accurate.careful.preciseTotal > accurate.quick.preciseTotal);
  assert.ok(fast.quick.preciseTotal > fast.careful.preciseTotal);
  // Only the headline moves; the measurements never do.
  assert.equal(accurate.careful.sobriety, 95);
  assert.equal(fast.quick.speed, 100);
});

test('every score can say what it was ranked at', () => {
  assert.equal(balanceLabel(BALANCED), 'balanced');
  assert.equal(balanceLabel(21), 'speed first');
  assert.equal(balanceLabel(79), 'accuracy first');
  assert.equal(balanceLabel(70), '70% accuracy');
  assert.equal(balanceSplit(70), '70% accuracy · 30% speed');
  assert.equal(balanceSplit(0), '0% accuracy · 100% speed');
  // The ends say what they mean rather than "0% accuracy".
  assert.equal(balanceLabel(0), 'speed only');
  assert.equal(balanceLabel(100), 'accuracy only');
});

test('a ranking with nothing judged says it was ranked on speed alone', () => {
  const unjudged = rankByBalance([run('slow', 50, null), run('fast', 10, null)], 70);
  assert.equal(accuracyCounted(unjudged), false);
  assert.equal(rankedAtLabel(unjudged, 70), 'speed only');
  const judged = rankByBalance([run('slow', 50, 1), run('fast', 10, null)], 70);
  assert.equal(accuracyCounted(judged), true);
  assert.equal(rankedAtLabel(judged, 70), '70% accuracy');
  // A judged result that failed its check does not make the rest judged.
  const onlyFailed = rankByBalance([run('short', 5, 0.3, { failed: true }), run('fast', 10, null)], 70);
  assert.equal(accuracyCounted(onlyFailed), false);
});

test('a chat priority chosen before the fader carries over to chat and code only', () => {
  const balances = readBalances(null, 'accuracy');
  assert.equal(notchAt(balances.chat)?.id, 'accuracy');
  assert.equal(notchAt(balances.code)?.id, 'accuracy');
  for (const channel of ['images', 'video', 'listening', 'reading']) {
    assert.equal(notchAt(balances[channel])?.id, 'balanced', channel);
  }
});

test('saved positions win over the old setting, and damage falls back to Balanced', () => {
  const saved = readBalances(JSON.stringify({ video: 85, chat: 30 }), 'speed');
  assert.equal(saved.video, 85);
  assert.equal(saved.chat, 30);
  assert.equal(notchAt(saved.code)?.id, 'speed');
  assert.equal(notchAt(readBalances('{not json', null).chat)?.id, 'balanced');
  const wild = readBalances(JSON.stringify({ video: 400, images: 'lots' }), null);
  assert.equal(wild.video, 100);
  assert.equal(notchAt(wild.images)?.id, 'balanced');
});

test('a result that failed its check never wins, even at Speed first', () => {
  const ranked = rankByBalance([run('broken-but-fast', 5, 0.9, { failed: true }), run('slow', 60, 1)], 0);
  assert.equal(crowned(ranked)?.item, 'slow');
  assert.equal(ranked.at(-1).item, 'broken-but-fast');
  assert.equal(ranked.at(-1).standing, 'failed');
});

test('Speed first crowns the fastest that passed; Accuracy first the most accurate', () => {
  const field = [run('quick', 30, 0.8), run('careful', 90, 1)];
  assert.equal(crowned(rankByBalance(field, 0))?.item, 'quick');
  assert.equal(crowned(rankByBalance(field, 100))?.item, 'careful');
});

test('a notch ranks the same wherever the fader sits inside it', () => {
  // The default Balanced is 51.5...; clicking Balanced stores 52. Seen on the
  // RTX 4070 race: one label read 73 on the board and 74 in Scorecards.
  const field = [run('Wan 2.2 A14B', 160.6, 1), run('Wan 2.1 1.3B', 358.1, 1)];
  const values = (position) => rankByBalance(field, position).map((entry) => Math.round(entry.value * 100));
  assert.deepEqual(values(52), values(BALANCED));
  assert.deepEqual(values(21), values(BALANCE_NOTCHES[0].value));
});

test('speed is scored against the race, not a fixed scale', () => {
  const ranked = rankByBalance([run('a', 160, 1), run('b', 320, 1)], 50);
  assert.equal(ranked[0].speed, 1);
  assert.equal(ranked[1].speed, 0.5);
});

test('an unjudged result cannot win on accuracy it never showed', () => {
  const field = [run('unjudged-fast', 10, null), run('judged', 40, 0.9)];
  const ranked = rankByBalance(field, 60);
  assert.equal(crowned(ranked)?.item, 'judged');
  assert.equal(ranked[1].standing, 'unjudged');
  // With accuracy weighted at nothing, time is all that counts, and it is honest.
  assert.equal(crowned(rankByBalance(field, 0))?.item, 'unjudged-fast');
});

test('when nothing was judged the ranking is speed alone', () => {
  const field = [run('slow', 50, null), run('fast', 10, null)];
  assert.ok(speedOnly(field));
  const ranked = rankByBalance(field, 100);
  assert.deepEqual(ranked.map((entry) => entry.item), ['fast', 'slow']);
  assert.ok(ranked.every((entry) => entry.standing === 'ranked'));
});

test('nothing is crowned when every result failed', () => {
  assert.equal(crowned(rankByBalance([run('a', 5, 0.2, { failed: true })], 50)), null);
  assert.equal(crowned(rankByBalance([], 50)), null);
});

test('a video clip below the judge line cannot win the lineup', () => {
  const entry = (key, seconds, adherence, extra = {}) => ({
    key, name: key, elapsedMs: seconds * 1000, realtimeCost: 1, score: 50, grade: 'F',
    judged: adherence !== null, adherence, ...extra,
  });
  const entries = [
    entry('barn', 160, 0.6),
    entry('lighthouse', 161, 1),
    entry('slowest', 358, 1),
    entry('crashed', 0, null, { error: 'Out of memory' }),
  ];
  const speedFirst = rankLineupByBalance(entries, 0);
  assert.equal(crowned(speedFirst)?.item.key, 'lighthouse');
  assert.deepEqual(speedFirst.filter((e) => e.standing === 'failed').map((e) => e.item.key), ['barn', 'crashed']);
  assert.ok(JUDGE_PASS > 0.6);
});
