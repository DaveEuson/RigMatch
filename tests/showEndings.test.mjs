// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { describeRunFailure, droppedOutMessage, showStoppedMessage } from '../src/lib/runFailure.ts';
import { minPicksFor, pickShortHint } from '../src/lib/wizardCopy.ts';
import { topPickPresentation } from '../src/lib/format.ts';
import { getCudaDetail } from '../src/lib/modelCatalog.ts';

/**
 * How a show ends, from a fault-injection run of the real app against a fake
 * Ollama before 0.9.1. Every raw message below is one the app actually showed.
 */

const name = (model) => ({ 'qwen3:0.6b': 'Qwen3', 'gemma3:1b': 'Gemma3', 'llama3.2:1b': 'Llama3.2' })[model] ?? model;

test('a crashed runner is named as a crash, without the HTTP plumbing', () => {
  const said = describeRunFailure('Error: 500 Internal Server Error from http://127.0.0.1:11499/api/generate: fake: model runner has unexpectedly stopped');
  assert.equal(said.kind, 'crashed');
  assert.doesNotMatch(said.reason, /500|http|Error:/);
});

test('a lost connection is not blamed on Ollama being uninstalled', () => {
  // One dropped response, with Ollama still running, was reported as "Make
  // sure Ollama or LM Studio is installed, running, and serving a local API."
  const said = describeRunFailure('Error: Cannot reach local AI service at http://127.0.0.1:11499. Make sure Ollama or LM Studio is installed, running, and serving a local API.');
  assert.equal(said.kind, 'unreachable');
  assert.doesNotMatch(said.reason, /installed/i);
});

test('pressing Stop is not an error', () => {
  const said = describeRunFailure('Error: Benchmark stopped by user');
  assert.equal(said.kind, 'stopped');
  assert.doesNotMatch(said.reason, /error/i);
});

test('a question over the time limit says how long the limit was', () => {
  const said = describeRunFailure('Error: http://127.0.0.1:11499 accepted the request but did not finish within 120s. The service is reachable — it is just slow.');
  assert.equal(said.kind, 'timeout');
  assert.match(said.reason, /2 minutes/);
});

test('anything else keeps Ollama\'s own words and drops the wrapping', () => {
  const said = describeRunFailure("Error invoking remote method 'benchmark:run': Error: 400 Bad Request from http://127.0.0.1:11434/api/generate: invalid option");
  assert.equal(said.kind, 'other');
  assert.doesNotMatch(said.reason, /Error invoking|http/);
  assert.match(said.reason, /invalid option/);
});

test('a show that went on without someone says who, and why', () => {
  const crash = { model: 'qwen3:0.6b', ...describeRunFailure('model runner has unexpectedly stopped') };
  assert.match(droppedOutMessage([crash], name), /^Qwen3 couldn't finish, so the show went on without it\. Ollama's model runner/);
  const lost = { model: 'gemma3:1b', ...describeRunFailure('fetch failed') };
  assert.match(droppedOutMessage([crash, lost], name), /^Qwen3 and Gemma3 couldn't finish, so the show went on without them\.$/);
  assert.equal(droppedOutMessage([], name), '');
});

test('a show nobody finished says why, and what kind of stop it was', () => {
  assert.equal(showStoppedMessage([], true, name).kind, 'stopped');
  const lost = (model) => ({ model, ...describeRunFailure('Cannot reach local AI service at http://127.0.0.1:11434') });
  const allLost = showStoppedMessage([lost('llama3.2:1b'), lost('qwen3:0.6b')], false, name);
  assert.equal(allLost.kind, 'unreachable');
  assert.match(allLost.message, /Check that Ollama is still running/);
  const crashed = showStoppedMessage([{ model: 'qwen3:0.6b', ...describeRunFailure('model runner has unexpectedly stopped') }], false, name);
  assert.equal(crashed.kind, 'crashed');
  assert.match(crashed.message, /^No model finished\. Qwen3: /);
});

test('the question rounds need two picks, the graded rounds one', () => {
  // Pick allowed one; the chat show needs two, so a one-model lineup failed the
  // instant it began and landed on a Winner screen that crowned nobody.
  assert.equal(minPicksFor('chat'), 2);
  assert.equal(minPicksFor('code'), 2);
  assert.equal(minPicksFor(undefined), 2);
  assert.equal(minPicksFor('vision'), 1);
  assert.equal(minPicksFor('listening'), 1);
  assert.equal(pickShortHint(1, 2), 'Pick 1 more — the show compares them');
  assert.equal(pickShortHint(0, 2), 'Pick at least 2 to continue');
  assert.equal(pickShortHint(2, 2), '');
});

test('the header never calls an untested model tested', () => {
  assert.deepEqual(topPickPresentation('installed', undefined), { label: 'Untested pick', testLabel: 'Test it', canUse: true });
  // Not downloaded: "Test again" only set a status line, and "Use this model"
  // chose a model that could not run. Neither is offered.
  assert.deepEqual(topPickPresentation('download', undefined), { label: 'Worth downloading', testLabel: null, canUse: false });
  const scored = topPickPresentation('scored', 'A');
  assert.equal(scored.testLabel, 'Test again');
  assert.notEqual(scored.label, 'Untested pick');
});

const cuda = (over) => ({ detected: false, status: 'unknown', driverVersion: null, driverCudaVersion: null, toolkitVersion: null, latestToolkitVersion: null, source: '', error: null, ...over });

test('no NVIDIA card does not mean the CPU', () => {
  const said = getCudaDetail(cuda({ status: 'not-nvidia', error: 'No NVIDIA GPU detected.' }));
  assert.doesNotMatch(said, /run on CPU/i);
  assert.match(said, /Metal/);
});

test('a CUDA check that failed says so, not the command that failed', () => {
  const said = getCudaDetail(cuda({ error: 'Command failed: nvidia-smi libnvrm_gpu.so: NvRmGpuLibOpen failed, error=4 CUDA Toolkit compiler not found in PATH.' }));
  assert.doesNotMatch(said, /nvidia-smi|NvRmGpuLibOpen|Command failed/);
});

test('one model failing no longer ends the whole show', () => {
  // The loop over contestants sat inside one try, so the first failure jumped
  // straight to "Speed Dating stopped" and nobody after it ran.
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  const loop = app.slice(app.indexOf('const runListTest = useCallback'), app.indexOf('const runListTest = useCallback') + 12000);
  assert.match(loop, /failures\.push\(\{ model: row\.displayName, \.\.\.failure \}\);\s*[\s\S]{0,900}?continue;/);
  assert.doesNotMatch(loop, /throw new Error\('No models finished a run/);
});

test('a failed show stays on Compare instead of reaching Winner', () => {
  const wizard = readFileSync(new URL('../src/components/SimpleWizard.tsx', import.meta.url), 'utf-8');
  assert.match(wizard, /const compareDone = !awaitingRun && !benchmarkActive && !showFailed && /);
  assert.match(wizard, /Run the show again/);
});
