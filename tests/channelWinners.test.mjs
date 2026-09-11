// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { codeWinner, labWinner, rankLabResults, videoWinner } = await import('../src/lib/channelWinners.ts');
const { CURRENT_SCORE_SCHEMA_VERSION } = await import('../src/lib/scoring.ts');

/**
 * One winner per channel, each crowned by its own measurement at its own
 * fader. These lock what may and may not be crowned.
 */

const coder = (speed, coding, graded = 4, over = {}) => ({
  speed,
  scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
  taskScores: { coding: { score: coding, questions: 4, graded } },
  ...over,
});

const lab = (challenge, model, seconds, over = {}) => ({
  model, challenge, score: 80, grade: 'B', elapsedMs: seconds * 1000,
  response: '', checks: [], completedAt: '2026-09-11T00:00:00.000Z', ...over,
});

test('Code crowns only a model with enough graded coding answers, on the current schema', () => {
  const scores = {
    // Four coding answers, but only one that anything could grade.
    'quick:1b': coder(100, 95, 1),
    'steady:7b': coder(60, 80),
    'old:3b': coder(100, 99, 4, { scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION - 1 }),
  };
  assert.equal(codeWinner(scores, 50)?.model, 'steady:7b');
  assert.equal(codeWinner(scores, 50)?.usable, true);
  assert.equal(codeWinner({}, 50), null);
});

test('the Code fader trades coding accuracy against speed', () => {
  const scores = { 'careful:14b': coder(40, 95), 'quick:3b': coder(100, 70) };
  assert.equal(codeWinner(scores, 100)?.model, 'careful:14b');
  assert.equal(codeWinner(scores, 0)?.model, 'quick:3b');
});

test('an image that fell short of the prompt is never the best image model', () => {
  const results = {
    'image:turbo': lab('image-generation', 'sdxl-turbo', 2, { adherence: 0.5 }),
    'image:base': lab('image-generation', 'sdxl-base', 12, { adherence: 1 }),
    'vision:gemma3': lab('image-recognition', 'gemma3:4b', 3),
  };
  assert.equal(labWinner(results, 'images', 0)?.model, 'sdxl-base');
  assert.deepEqual(rankLabResults(results, 'images', 0).map((entry) => entry.standing), ['ranked', 'failed']);
  // A checkpoint draws; there is nothing to chat with.
  assert.equal(labWinner(results, 'images', 0)?.usable, false);
});

test('listening and reading rank on their own scores against time', () => {
  const results = {
    'listening:a': lab('listening', 'gemma4:e2b', 20, { score: 96 }),
    'listening:b': lab('listening', 'gemma4:e4b', 8, { score: 70 }),
    'vision:c': lab('image-recognition', 'qwen2.5vl:7b', 9, { score: 88 }),
  };
  assert.equal(labWinner(results, 'listening', 100)?.model, 'gemma4:e2b');
  assert.equal(labWinner(results, 'listening', 0)?.model, 'gemma4:e4b');
  assert.equal(labWinner(results, 'reading', 50)?.model, 'qwen2.5vl:7b');
  assert.equal(labWinner(results, 'listening', 50)?.usable, true);
  assert.equal(labWinner(results, 'listening', 50)?.speedOnly, false);
});

test('a winner from results nothing judged says it won on speed alone', () => {
  const results = {
    'image:a': lab('image-generation', 'quick', 2, { adherence: null }),
    'image:b': lab('image-generation', 'slow', 9, { adherence: null }),
  };
  const winner = labWinner(results, 'images', 90);
  assert.equal(winner?.model, 'quick');
  assert.equal(winner?.speedOnly, true);
});

test('the video winner moves with the fader without re-running anything', () => {
  const entry = (key, seconds, adherence) => ({
    key, name: key, elapsedMs: seconds * 1000, realtimeCost: 1, score: 40, grade: 'F', judged: true, adherence,
  });
  const record = {
    id: 'lineup-1', prompt: 'a lighthouse', seed: 1, gpu: 'RTX 4070', unloaded: true,
    startedAt: '', finishedAt: '', stopped: false, planned: [],
    entries: [entry('Wan 2.2 A14B', 161, 1), entry('Wan 2.1 1.3B', 358, 1), entry('quick-but-close', 90, 0.8)],
  };
  assert.equal(videoWinner(record, 0)?.model, 'quick-but-close');
  assert.equal(videoWinner(record, 100)?.model, 'Wan 2.2 A14B');
  assert.equal(videoWinner(null, 50), null);
});
