// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_BENCHMARK_PROMPTS,
  COMFORTABLE_AUDIO_COST,
  PAINFUL_AUDIO_COST,
  audioPromptById,
  scoreAudioGeneration,
  scoreAudioSpeed,
} from '../src/lib/audioGenScoring.ts';
import { CUSTOM_IMAGE_PROMPT_ID } from '../src/lib/imageGenScoring.ts';
import { JUDGE_PASS } from '../src/lib/balance.ts';

/**
 * How a made clip is scored. Speed is cost per second of audio, accuracy is
 * what a listening model heard, and a clip nobody listened to says so rather
 * than scoring as if it had passed.
 */

test('speed is cost per second of audio: realtime or better is full marks, ten times realtime is none', () => {
  assert.equal(scoreAudioSpeed(30000 * COMFORTABLE_AUDIO_COST, 30), 1);
  assert.equal(scoreAudioSpeed(10000, 30), 1);
  assert.equal(scoreAudioSpeed(30000 * PAINFUL_AUDIO_COST, 30), 0);
  assert.equal(scoreAudioSpeed(165000, 30), 0.5);
  // Thirty seconds is not penalised against ten for being three times the work.
  assert.equal(scoreAudioSpeed(90000, 30), scoreAudioSpeed(30000, 10));
  assert.equal(scoreAudioSpeed(0, 30), 0);
  assert.equal(scoreAudioSpeed(1000, 0), 0);
});

test('a clip nobody listened to cannot score full marks, however fast it came', () => {
  const quick = scoreAudioGeneration({ produced: true, elapsedMs: 5000, seconds: 30, adherence: null });
  assert.equal(quick.judged, false);
  assert.equal(quick.score, 50);
  const heard = scoreAudioGeneration({ produced: true, elapsedMs: 5000, seconds: 30, adherence: 1 });
  assert.equal(heard.judged, true);
  assert.equal(heard.score, 100);
  assert.ok(heard.checks.every((check) => check.passed));
});

test('nothing made scores nothing', () => {
  const none = scoreAudioGeneration({ produced: false, elapsedMs: 5000, seconds: 30, adherence: null });
  assert.equal(none.score, 0);
  assert.equal(none.checks.find((check) => check.label === 'Audio produced').passed, false);
});

test('every benchmark prompt catches a listener that says yes to everything', () => {
  for (const prompt of AUDIO_BENCHMARK_PROMPTS) {
    const yes = prompt.propositions.filter((proposition) => proposition.expected).length;
    assert.ok(yes > 0 && yes < prompt.propositions.length, `${prompt.id} needs a question whose answer is no`);
    assert.ok(yes / prompt.propositions.length < JUDGE_PASS, `${prompt.id}: saying yes to everything would pass`);
  }
});

test('a tempo, where a prompt names one, is one ACE-Step 1.5 accepts', () => {
  const named = AUDIO_BENCHMARK_PROMPTS.filter((prompt) => prompt.bpm !== undefined);
  assert.ok(named.length > 0);
  for (const prompt of named) {
    assert.ok(Number.isInteger(prompt.bpm) && prompt.bpm >= 10 && prompt.bpm <= 300, prompt.id);
  }
});

test('your own prompt is made with nothing to check it against', () => {
  const own = audioPromptById(CUSTOM_IMAGE_PROMPT_ID, '  birdsong at dawn ');
  assert.equal(own.prompt, 'birdsong at dawn');
  assert.deepEqual(own.propositions, []);
  assert.equal(audioPromptById(CUSTOM_IMAGE_PROMPT_ID, '   ').id, AUDIO_BENCHMARK_PROMPTS[0].id, 'nothing typed falls back');
  assert.equal(audioPromptById('guitar').id, 'guitar');
  assert.equal(audioPromptById('no-such-prompt').id, AUDIO_BENCHMARK_PROMPTS[0].id);
});
