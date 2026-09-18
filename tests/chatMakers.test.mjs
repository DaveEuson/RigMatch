// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { audioMakerChoices, chatPicks, videoMakerChoices } from '../src/lib/chatMakers.ts';
import { CURRENT_SCORE_SCHEMA_VERSION } from '../src/lib/scoring.ts';

/**
 * RigMatch Chat opens each of its choices on the model RigMatch's own tests
 * crowned for that use. These lock which model that is, and what happens when
 * nothing has been crowned yet.
 */

const lab = (challenge, model, seconds, over = {}) => ({
  model, challenge, score: 80, grade: 'B', elapsedMs: seconds * 1000,
  response: '', checks: [], completedAt: '2026-09-11T00:00:00.000Z', ...over,
});
const coder = (speed, coding) => ({
  speed,
  scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
  taskScores: { coding: { score: coding, questions: 4, graded: 4 } },
});
const video = (key, name) => ({
  key, name, publisher: 'x', sizing: { ditGb: 5, teGb: 5, refSeconds: 60 }, refMeasured: true,
  output: { width: 832, height: 480, frames: 81, fps: 16, seconds: 5, steps: 20, sound: false },
});
const finished = (key, name, seconds, adherence) => ({
  key, name, elapsedMs: seconds * 1000, realtimeCost: 1, score: 80, grade: 'B', judged: adherence !== null, adherence,
});
const raced = (entries) => ({
  id: 'race', prompt: 'a lighthouse', seed: 1, gpu: 'RTX 4070', unloaded: true, startedAt: 'T', finishedAt: 'T',
  stopped: false, planned: entries.map(({ key, name }) => ({ key, name })), entries,
});

test('each chat choice opens on the model its own test crowned', () => {
  const picks = chatPicks({
    chosen: 'qwen2.5:7b',
    scores: { 'qwen2.5-coder:7b': coder(60, 90), 'llama3.2:3b': coder(100, 40) },
    results: {
      'vision:a': lab('image-recognition', 'qwen3.5:9b', 7, { score: 100, adherence: 1, picture: 'lineup' }),
      'vision:b': lab('image-recognition', 'gemma4:e2b', 3, { score: 0, adherence: 0, picture: 'lineup' }),
      'listening:a': lab('listening', 'gemma4:e4b', 20, { score: 95 }),
    },
    balances: { code: 70, reading: 70, listening: 70 },
  });
  assert.deepEqual(picks, { chat: 'qwen2.5:7b', code: 'qwen2.5-coder:7b', reading: 'qwen3.5:9b', listening: 'gemma4:e4b' });
});

test('a use nothing has crowned has no pick, rather than a guess', () => {
  assert.deepEqual(
    chatPicks({ chosen: null, scores: {}, results: {}, balances: { code: 50, reading: 50, listening: 50 } }),
    { chat: null, code: null, reading: null, listening: null },
  );
});

const ltx = video('ltx', 'LTX-Video 2B');
const wan = video('wan-5b', 'Wan 2.2 5B');
const wanSmall = video('wan-1.3b', 'Wan 2.1 1.3B');
const stray = video('file:ltx-video-2b-v0.9.5.safetensors', 'LTX-Video 2B 0.9.5 (your own file)');
// Wan 2.2 5B was quicker and drew a red barn for a lighthouse; Wan 2.1 1.3B drew the lighthouse.
const record = raced([finished('wan-5b', 'Wan 2.2 5B', 161, 0.6), finished('wan-1.3b', 'Wan 2.1 1.3B', 358, 1)]);
/** The catalogue's own order, best first, and the seconds a machine would take. */
const catalogue = [wan, wanSmall, ltx, stray];
const seconds = { ltx: 12, 'wan-5b': 161, 'wan-1.3b': 358, 'file:ltx-video-2b-v0.9.5.safetensors': 12 };
const offered = (runnable, useRecord, balance = 100) => videoMakerChoices({
  runnable, catalogue, record: useRecord, balance, secondsFor: (entry) => seconds[entry.key] ?? null,
}).map((choice) => choice.key);

test('a clip is made by the model the race crowned, and every model that runs here is offered', () => {
  // Runnable, fastest first, as runnableLineup gives it.
  assert.deepEqual(offered([ltx, wan, wanSmall], record), ['wan-1.3b', 'wan-5b', 'ltx']);
  assert.deepEqual(offered([ltx, wan], record), ['wan-5b', 'ltx'], 'a winner that cannot run here is not offered');
});

test('with no race run, the catalogue order stands and a stray file goes last', () => {
  // The first real clip came from the stray 0.9.5 checkpoint, because it was the
  // fastest thing installed. Fastest is not best, and a file RigMatch never
  // downloaded runs the oldest graph it keeps.
  assert.deepEqual(offered([stray, wan, wanSmall], null), ['wan-5b', 'wan-1.3b', 'file:ltx-video-2b-v0.9.5.safetensors']);
  assert.deepEqual(offered([], record), []);
});

test('a video choice says what was measured here, and which model was crowned', () => {
  const choices = videoMakerChoices({
    runnable: [ltx, wan, wanSmall], catalogue, record, balance: 100, secondsFor: (entry) => seconds[entry.key] ?? null,
  });
  assert.deepEqual(choices[0], {
    key: 'wan-1.3b', name: 'Wan 2.1 1.3B', seconds: 358, tested: '6.0 min · 100% of the prompt', crowned: true,
  });
  assert.equal(choices[1].tested, '2.7 min · 60% of the prompt');
  assert.equal(choices[2].tested, null, 'a model this machine has never run has nothing measured');
  assert.equal(choices[2].seconds, 12, 'and is left with its estimate');
});

test('audio offers every installed model, the crowned one first', () => {
  const installed = [
    { key: 'ace-step-1.5-turbo', name: 'ACE-Step 1.5 Turbo' },
    { key: 'stable-audio-open-1.0', name: 'Stable Audio Open 1.0' },
  ];
  // Judged by ear to sound like the prompt, as Dave heard Stable Audio's rain.
  const results = {
    'audio:stable': lab('audio-generation', 'Stable Audio Open 1.0', 8, { adherence: null, verdict: { matches: true, at: 'T' } }),
  };
  const keys = (choices) => choices.map((choice) => choice.key);
  assert.deepEqual(keys(audioMakerChoices({ installed, results, balance: 50 })), ['stable-audio-open-1.0', 'ace-step-1.5-turbo']);
  assert.deepEqual(keys(audioMakerChoices({ installed, results: {}, balance: 50 })), ['ace-step-1.5-turbo', 'stable-audio-open-1.0']);
  assert.deepEqual(
    keys(audioMakerChoices({ installed: installed.slice(0, 1), results, balance: 50 })),
    ['ace-step-1.5-turbo'],
    'a winner no longer installed is not offered',
  );
  assert.equal(audioMakerChoices({ installed: [], results, balance: 50 }).length, 0);
  const [best] = audioMakerChoices({ installed, results, balance: 50 });
  assert.equal(best.tested, '8.0 s · B');
});
