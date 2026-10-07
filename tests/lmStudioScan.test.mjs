// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { modelWeightsKey } from '../src/lib/modelKey.ts';

/**
 * Found by a bug scan of the LM Studio show code, after 0.9.4.
 */
const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../src/components/RunSheet.tsx', import.meta.url), 'utf8');

test('the same weights get the same key whichever provider names them', () => {
  const same = [
    ['llama3.2:3b', 'llama-3.2-3b-instruct'],
    ['qwen3:8b', 'qwen/qwen3-8b'],
    ['gemma3:4b', 'google/gemma-3-4b'],
    ['qwen2.5:7b', 'qwen2.5-7b-instruct'],
    ['qwen2.5:7b-instruct-q8_0', 'lmstudio-community/qwen2.5-7b-instruct'],
    ['hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M', 'llama3.2:3b'],
    ['mistral:latest', 'mistral'],
  ];
  for (const [a, b] of same) assert.equal(modelWeightsKey(a), modelWeightsKey(b), `${a} = ${b}`);
});

test('a different size or a newer release is a different model', () => {
  const different = [
    ['qwen3:8b', 'qwen3:14b'],
    ['llama3.2:3b', 'llama3.2:1b'],
    ['qwen/qwen3-4b', 'qwen/qwen3-4b-2507'],
    ['gemma3:4b', 'gemma3n:e4b'],
  ];
  for (const [a, b] of different) assert.notEqual(modelWeightsKey(a), modelWeightsKey(b), `${a} ≠ ${b}`);
});

test('a model is never judged by its own copy in the other provider', () => {
  // Every identity of a model (name key, digest, build), and a plain string
  // from an older renderer still compares.
  assert.match(main, /const identities = \(name\) => \[\]\.concat\(request\.judgeEndpoints\?\.\[name\]\?\.weights \?\? \[\]\)\.filter\(Boolean\);/);
  assert.match(main, /name !== model && !identities\(name\)\.some\(\(identity\) => ownWeights\.includes\(identity\)\)/);
  assert.match(app, /weights: modelIdentities\(row\.displayName, row\.installedModel\)/, 'the renderer sends each model\'s identities');
  assert.match(app, /autoJudgeModels\.find\(\(m\) => !sameModel\(identityOf\(m\), identityOf\(pendingSingleModel \?\? selectedModel\)\)\)/,
    'and the run sheet names the judge the run will use');
});

test('the run sheet says the show is judged when its judge is in LM Studio', () => {
  // It was told only whether Labs had an Ollama judge, so an LM Studio-only
  // PC with a judge picked read "nothing else installed can" mark them.
  assert.match(app, /judgeActive=\{Boolean\(effectiveJudge\)\}/);
  // Code is marked on the judge's own program now, so any judge marks it.
  assert.doesNotMatch(app + sheet, /codeJudgeActive/);
  assert.match(sheet, /const codeCapable = appBuilderCapable && judgeActive;/);
});

test('a run that never reached its warm-up leaves LM Studio as it was', () => {
  assert.match(main, /lmStudioKeep: null,/);
  assert.match(main, /const keep = activeBenchmark\?\.lmStudioKeep;\s*if \(Array\.isArray\(keep\)\) await unloadLmStudioModel/);
});

test('Stop reaches the LM Studio warm-ups, and ends a run before it reloads a model', () => {
  assert.match(main, /await warmLmStudioBenchmarkModel\(baseUrl, model, signal\);/);
  assert.match(main, /throwIfCanceled\(\);\s*if \(judgedHere && provider === 'lm-studio'\)/);
});

test('a tool turn that times out is not asked again on another route', () => {
  const toolChat = main.slice(main.indexOf('async function lmStudioToolChat'), main.indexOf('async function lmStudioToolChat') + 2000);
  assert.match(toolChat, /if \(\/\^404 \/\.test\(getLogErrorMessage\(error\)\)\) return null;\s*throw error;/);
});

test('LM Studio found mid-session is added without a full refresh', () => {
  const poll = app.slice(app.indexOf('The same for LM Studio, which was only looked for'), app.indexOf('The same for LM Studio, which was only looked for') + 1600);
  assert.doesNotMatch(poll, /runRigRefresh/);
  assert.match(poll, /lmStudioHostFor\(status, system\.hostname\)/);
  assert.match(poll, /API token/, 'a server that wants a token is shown, not dropped');
});

test('a score from LM Studio is credited to this computer', () => {
  assert.match(app, /const remoteHost = installed\?\.provider !== 'lm-studio' && selectedHost/);
});
