// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { samplingLine } from '../src/lib/answerRetest.ts';

const { samplingFromParameters, answerOptions } = createRequire(import.meta.url)('../electron/modelSettings.cjs');

const FIXED = Object.freeze({ temperature: 0, seed: 1, num_predict: 300, num_ctx: 2048 });

test('the fixed settings are sent as they are', () => {
  assert.equal(answerOptions(FIXED, 'fixed'), FIXED);
  assert.equal(answerOptions(FIXED, undefined), FIXED, 'a run that says nothing is asked the fixed way');
});

test('with a model\'s own settings, only temperature is left to the model', () => {
  // Ollama then uses the model file's temperature, or its default. The seed
  // stays, so the answers still repeat from run to run, and the context and
  // the answer allowance are the same for every model.
  assert.deepEqual(answerOptions(FIXED, 'model'), { seed: 1, num_predict: 300, num_ctx: 2048 });
  assert.equal(FIXED.temperature, 0, 'the fixed settings themselves are not changed');
});

test('the values a model sets are read from Ollama\'s parameters text', () => {
  // qwen3's model file, as /api/show gives it.
  const qwen3 = 'repeat_penalty                 1\nstop                           "<|im_start|>"\nstop                           "<|im_end|>"\ntemperature                    0.6\ntop_k                          20\ntop_p                          0.95';
  assert.deepEqual(samplingFromParameters(qwen3), { repeat_penalty: 1, temperature: 0.6, top_k: 20, top_p: 0.95 });
  // Stop words and context sizes are not sampling values.
  assert.deepEqual(samplingFromParameters('num_ctx 4096\nstop "<end>"'), {});
  assert.deepEqual(samplingFromParameters(undefined), {}, 'a model that sets none: Ollama\'s defaults');
});

test('the answers say how they were asked', () => {
  assert.equal(samplingLine({}), null, 'the fixed settings need no line');
  assert.equal(samplingLine({ sampling: 'model', modelSettings: { temperature: 0.6, top_p: 0.95 } }), 'Asked with its own settings: temperature 0.6, top_p 0.95.');
  assert.match(samplingLine({ sampling: 'model', modelSettings: {} }), /Ollama's defaults/);
});

test('every answer request goes through the one place that applies the choice', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  assert.match(main, /return answerOptions\(fixed, activeBenchmark\?\.sampling\);/);
  // LM Studio's chat sets its own temperature, so its runs stay fixed; a retest is asked as its run was.
  assert.match(main, /const sampling = request\.sampling === 'model' && provider !== 'lm-studio' \? 'model' : 'fixed';/);
  assert.match(main, /sampling: previous\.sampling === 'model' \? 'model' : 'fixed',/);
  // The judges are not the contestant: they stay at temperature 0 whatever the run's choice.
  const judge = main.slice(main.indexOf('async function runJudgeGenerate'));
  assert.match(judge.slice(0, judge.indexOf('\n}\n')), /temperature: 0/);
});
