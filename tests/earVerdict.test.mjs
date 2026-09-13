// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeEarVerdict, promptAccuracy, withEarVerdict } from '../src/lib/earVerdict.ts';

/**
 * The listeners Ollama offers could not tell rain from music; a person can.
 * These lock what your verdict on a made clip does: it becomes the clip's
 * accuracy, it is scored and described as yours, and taking it back returns
 * the result to exactly what the run said.
 */

const UNJUDGED = 'The listener gave every question the same answer, so it could not tell what is in the clip. Unjudged.';

const clip = (over = {}) => ({
  model: 'Stable Audio Open 1.0',
  challenge: 'audio-generation',
  score: 50,
  grade: 'F',
  elapsedMs: 7158,
  seconds: 30,
  response: 'Heavy rain on a tin roof with distant rolling thunder',
  checks: [],
  completedAt: '2026-09-12T16:49:00.000Z',
  adherence: null,
  unjudgedReason: UNJUDGED,
  ...over,
});
const matchCheck = (result) => result.checks.find((check) => check.label === 'Matches the prompt');

test('your verdict is the clip’s accuracy, and the listener’s check counts only without one', () => {
  assert.equal(promptAccuracy(clip()), null);
  assert.equal(promptAccuracy(clip({ adherence: 0.67 })), 0.67);
  assert.equal(promptAccuracy(clip({ adherence: 0.33, verdict: { matches: true, at: 'T' } })), 1);
  assert.equal(promptAccuracy(clip({ adherence: 1, verdict: { matches: false, at: 'T' } })), 0);
});

test('saying it sounds right scores the clip on your ear, and says so', () => {
  const judged = withEarVerdict(clip(), true, '2026-09-12T17:00:00.000Z');
  assert.deepEqual(judged.verdict, { matches: true, at: '2026-09-12T17:00:00.000Z' });
  // 7 s for 30 s of audio is full marks on speed, and your yes is full marks on the prompt.
  assert.equal(judged.score, 100);
  assert.equal(matchCheck(judged).passed, true);
  assert.equal(matchCheck(judged).detail, 'You listened, and it sounds like the prompt.');
  assert.equal(judged.adherence, null, 'what the listener made of it is kept');
});

test('saying it does not sound right fails the clip on the prompt', () => {
  const judged = withEarVerdict(clip(), false, 'T');
  assert.equal(promptAccuracy(judged), 0);
  assert.equal(judged.score, 50, 'speed still counts');
  assert.equal(matchCheck(judged).passed, false);
  assert.equal(matchCheck(judged).detail, 'You listened, and it does not sound like the prompt.');
  assert.equal(matchCheck(judged).unchecked, false, 'your No is a miss, not a line nobody checked');
});

test('taking your verdict back returns the result to what the run said', () => {
  const back = withEarVerdict(withEarVerdict(clip(), true, 'T'), null);
  assert.equal(back.verdict, undefined);
  assert.equal(back.score, 50);
  assert.equal(matchCheck(back).passed, false);
  assert.equal(matchCheck(back).detail, UNJUDGED);
  assert.equal(matchCheck(back).unchecked, true, 'back to Not checked, as the run left it');
});

test('it reads as yours beside a result', () => {
  assert.equal(describeEarVerdict({ matches: true, at: 'T' }), 'sounds right to you');
  assert.equal(describeEarVerdict({ matches: false, at: 'T' }), 'does not sound right to you');
});
