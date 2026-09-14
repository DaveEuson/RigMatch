// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  codeWinner, comparisonGroups, labWinner, rankCoding, rankLabList, rankLabResults, rankMatchResults, videoWinner,
} = await import('../src/lib/channelWinners.ts');
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

test('listening ranks on its own score against time, and reading on how much of the picture it named', () => {
  const results = {
    'listening:a': lab('listening', 'gemma4:e2b', 20, { score: 96 }),
    'listening:b': lab('listening', 'gemma4:e4b', 8, { score: 70 }),
    'vision:c': lab('image-recognition', 'qwen2.5vl:7b', 9, { score: 80, adherence: 0.8, picture: 'lineup' }),
  };
  assert.equal(labWinner(results, 'listening', 100)?.model, 'gemma4:e2b');
  assert.equal(labWinner(results, 'listening', 0)?.model, 'gemma4:e4b');
  assert.equal(labWinner(results, 'reading', 50)?.model, 'qwen2.5vl:7b');
  assert.match(labWinner(results, 'reading', 50)?.detail ?? '', /named 80% of the picture/);
  assert.equal(labWinner(results, 'listening', 50)?.usable, true);
  assert.equal(labWinner(results, 'listening', 50)?.speedOnly, false);
});

test('a description that missed the picture never wins, and one scored by the old rubric is unjudged', () => {
  const results = {
    // Gemma 4 on the contestant wall: Java code on a white background, quickly.
    'vision:quick': lab('image-recognition', 'gemma4:e2b', 3, { score: 0, adherence: 0, picture: 'lineup' }),
    'vision:right': lab('image-recognition', 'qwen2.5vl:7b', 11, { score: 100, adherence: 1, picture: 'lineup' }),
    // Scored 100 by the old rubric, whatever it said.
    'vision:old': lab('image-recognition', 'llava:7b', 2, { score: 100 }),
  };
  // With any weight on accuracy, only a description that passed can win.
  assert.equal(labWinner(results, 'reading', 1)?.model, 'qwen2.5vl:7b');
  assert.equal(labWinner(results, 'reading', 100)?.model, 'qwen2.5vl:7b');
  const ranked = rankLabResults(results, 'reading', 50);
  const entry = (model) => ranked.find((item) => item.item.model === model);
  assert.equal(entry('gemma4:e2b')?.standing, 'failed', 'fast, and it described code');
  assert.equal(entry('llava:7b')?.standing, 'unjudged', 'the old rubric measured the answer, not the picture');
  // Speed alone weighs nothing but time, so the old result is fastest there;
  // the one that failed its check still cannot win.
  assert.equal(labWinner(results, 'reading', 0)?.model, 'llava:7b');
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

test('a clip that fell short of the prompt is never the best audio maker, and nobody chats with the winner', () => {
  const results = {
    'audio:quick': lab('audio-generation', 'Stable Audio Open 1.0', 12, { adherence: 0.33 }),
    'audio:heard': lab('audio-generation', 'ACE-Step 1.5 Turbo', 20, { adherence: 1 }),
    'image:sdxl': lab('image-generation', 'sdxl', 2, { adherence: 1 }),
  };
  const winner = labWinner(results, 'audio', 0);
  assert.equal(winner?.model, 'ACE-Step 1.5 Turbo');
  assert.equal(winner?.usable, false);
  assert.match(winner?.detail ?? '', /100% of the prompt/);
  assert.deepEqual(rankLabResults(results, 'audio', 0).map((entry) => entry.standing), ['ranked', 'failed']);
});

test('your ear can crown an audio maker the listener could not judge, and fail one', () => {
  const results = {
    'audio:ace': lab('audio-generation', 'ACE-Step 1.5 Turbo', 8, { adherence: null }),
    'audio:stable': lab('audio-generation', 'Stable Audio Open 1.0', 9, { adherence: null, verdict: { matches: true, at: 'T' } }),
  };
  const winner = labWinner(results, 'audio', 50);
  assert.equal(winner?.model, 'Stable Audio Open 1.0', 'the slower clip wins on what you heard');
  assert.equal(winner?.speedOnly, false);
  assert.match(winner?.detail ?? '', /sounds right to you/);
  // "Doesn't" fails it, as a judge's miss would.
  const doesnt = { ...results, 'audio:stable': { ...results['audio:stable'], verdict: { matches: false, at: 'T' } } };
  assert.deepEqual(
    rankLabResults(doesnt, 'audio', 50).map((entry) => [entry.item.model, entry.standing]),
    [['ACE-Step 1.5 Turbo', 'ranked'], ['Stable Audio Open 1.0', 'failed']],
  );
});

test('made audio is compared only with audio made from the same prompt', () => {
  const results = [
    lab('audio-generation', 'a', 10, { response: 'rain on a tin roof', completedAt: '2026-09-11T10:00:00.000Z' }),
    lab('audio-generation', 'b', 12, { response: 'rain on a tin roof', completedAt: '2026-09-11T11:00:00.000Z' }),
    lab('audio-generation', 'c', 9, { response: 'dance music', completedAt: '2026-09-10T11:00:00.000Z' }),
    lab('listening', 'd', 5),
  ];
  assert.deepEqual(
    comparisonGroups(results, 'audio').map((group) => [group.key, group.results.length]),
    [['rain on a tin roof', 2], ['dance music', 1]],
  );
});

const matchScore = (model, over = {}) => ({
  model, total: 50, grade: 'D', speed: 50, sobriety: 50, stability: 80, fit: 80,
  completedAt: '2026-09-11T00:00:00.000Z', scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION, ...over,
});

test('a comparison re-ranks at the chat fader without running again', () => {
  const results = [matchScore('careful:7b', { sobriety: 95, speed: 30 }), matchScore('quick:1b', { sobriety: 50, speed: 100 })];
  assert.deepEqual(rankMatchResults(results, 100).map((score) => score.model), ['careful:7b', 'quick:1b']);
  assert.deepEqual(rankMatchResults(results, 0).map((score) => score.model), ['quick:1b', 'careful:7b']);
  // The measurements are the run's; only the headline moves.
  assert.equal(rankMatchResults(results, 0)[1].sobriety, 95);
});

test('the code board keeps the models it cannot rank, and says which', () => {
  const { ranked, unmeasured } = rankCoding([
    { ...coder(80, 90), model: 'graded:7b' },
    { ...coder(100, 70, 1), model: 'ungraded:1b' },
  ], 50);
  assert.deepEqual(ranked.map((entry) => entry.item.model), ['graded:7b']);
  assert.deepEqual(unmeasured.map((score) => score.model), ['ungraded:1b']);
});

test('video results rank on the frame check, like pictures', () => {
  const ranked = rankLabList([
    lab('video-generation', 'Wan 2.2 5B', 161, { adherence: 0.6 }),
    lab('video-generation', 'Wan 2.2 A14B', 160, { adherence: 1 }),
    lab('image-generation', 'sdxl', 2, { adherence: 1 }),
  ], 'video', 0);
  assert.deepEqual(ranked.map((entry) => [entry.item.model, entry.standing]), [['Wan 2.2 A14B', 'ranked'], ['Wan 2.2 5B', 'failed']]);
});

test('only results given the same thing are put side by side', () => {
  const results = [
    lab('image-generation', 'a', 2, { response: 'a lighthouse', completedAt: '2026-09-10T10:00:00.000Z' }),
    lab('image-generation', 'b', 3, { response: 'a lighthouse', completedAt: '2026-09-11T10:00:00.000Z' }),
    lab('image-generation', 'c', 4, { response: 'a cat', completedAt: '2026-09-09T10:00:00.000Z' }),
    lab('image-recognition', 'd', 5, { imageDataUrl: '/cat.webp' }),
    lab('image-recognition', 'e', 5, { imageDataUrl: '/dog.webp', completedAt: '2026-09-12T00:00:00.000Z' }),
    // A test picture groups by its id, whatever it was drawn to.
    lab('image-recognition', 'g', 5, { imageDataUrl: 'data:image/png;base64,AA', picture: 'lineup', completedAt: '2026-09-13T00:00:00.000Z' }),
    lab('image-recognition', 'h', 5, { imageDataUrl: 'data:image/png;base64,BB', picture: 'lineup', completedAt: '2026-09-13T01:00:00.000Z' }),
    lab('listening', 'f', 5),
  ];
  assert.deepEqual(comparisonGroups(results, 'images').map((group) => [group.key, group.results.length]), [['a lighthouse', 2], ['a cat', 1]]);
  assert.deepEqual(
    comparisonGroups(results, 'reading').map((group) => [group.key, group.results.length]),
    [['lineup', 2], ['/dog.webp', 1], ['/cat.webp', 1]],
  );
  // Listening keeps no record of what it heard, so it is one group.
  assert.equal(comparisonGroups(results, 'listening').length, 1);
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
