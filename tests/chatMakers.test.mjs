// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { chatPicks, pickAudioMaker, pickVideoMaker } from '../src/lib/chatMakers.ts';
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

test('a clip is made by the Makes video winner when it runs here, and by the fastest that does when not', () => {
  const ltx = video('ltx', 'LTX-Video 2B');
  const wan = video('wan-5b', 'Wan 2.2 5B');
  const wanSmall = video('wan-1.3b', 'Wan 2.1 1.3B');
  // Wan 2.2 5B was quicker and drew a red barn for a lighthouse; Wan 2.1 1.3B drew the lighthouse.
  const record = raced([finished('wan-5b', 'Wan 2.2 5B', 161, 0.6), finished('wan-1.3b', 'Wan 2.1 1.3B', 358, 1)]);
  // Runnable, fastest first, as runnableLineup gives it.
  assert.equal(pickVideoMaker([ltx, wan, wanSmall], record, 100)?.key, 'wan-1.3b');
  assert.equal(pickVideoMaker([ltx, wan], record, 100)?.key, 'ltx', 'a winner that cannot run here is not offered');
  assert.equal(pickVideoMaker([ltx, wan], null, 50)?.key, 'ltx', 'with no race run yet, the fastest that can run');
  assert.equal(pickVideoMaker([], record, 50), null);
});

test('audio is made by the Makes audio winner when installed, else the first installed', () => {
  const installed = [
    { key: 'ace-step-1.5-turbo', name: 'ACE-Step 1.5 Turbo' },
    { key: 'stable-audio-open-1.0', name: 'Stable Audio Open 1.0' },
  ];
  // Judged by ear to sound like the prompt, as Dave heard Stable Audio's rain.
  const results = {
    'audio:stable': lab('audio-generation', 'Stable Audio Open 1.0', 8, { adherence: null, verdict: { matches: true, at: 'T' } }),
  };
  assert.equal(pickAudioMaker(installed, results, 50)?.key, 'stable-audio-open-1.0');
  assert.equal(pickAudioMaker(installed, {}, 50)?.key, 'ace-step-1.5-turbo');
  assert.equal(pickAudioMaker(installed.slice(0, 1), results, 50)?.key, 'ace-step-1.5-turbo', 'a winner no longer installed is not offered');
  assert.equal(pickAudioMaker([], results, 50), null);
});
