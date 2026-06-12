import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scoring = require('../electron/benchmarkScoring.cjs');

test('benchmark generate body disables thinking for scored parity requests', () => {
  const body = scoring.buildBenchmarkGenerateBody({
    model: 'qwen3:1.7b',
    prompt: 'Return only valid JSON.',
    keepAlive: '10m',
    options: { num_predict: 300 },
  });

  assert.equal(body.model, 'qwen3:1.7b');
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.keep_alive, '10m');
  assert.deepEqual(body.options, { num_predict: 300 });
});

test('empty length-finished answer is diagnosed as a visible-answer failure', () => {
  const status = scoring.getBenchmarkPromptStatus('', 'length');
  const diagnostic = scoring.buildPromptDiagnostic({
    responseText: '',
    doneReason: 'length',
    evalCount: 300,
    evalDurationSeconds: 1.42,
    status,
    thinkingDisabled: false,
  });

  assert.equal(status, 'no-response');
  assert.match(diagnostic, /No visible answer/);
  assert.match(diagnostic, /hidden thinking/);
  assert.match(diagnostic, /300 eval tokens/);
});

test('empty length-finished answer explains RigMatch thinking-disabled mode', () => {
  const diagnostic = scoring.buildPromptDiagnostic({
    responseText: '',
    doneReason: 'length',
    evalCount: 300,
    evalDurationSeconds: 1.42,
    status: 'no-response',
    thinkingDisabled: true,
  });

  assert.match(diagnostic, /thinking disabled/);
  assert.match(diagnostic, /output limit/);
});

test('scoring accepts fenced JSON with required keys', () => {
  const score = scoring.scoreSobriety(
    { type: 'json' },
    '```json\n{"intent":"chat","action":"answer","target":"user","urgency":"low"}\n```',
  );

  assert.equal(score, 92);
});

test('status detects truncated non-empty responses', () => {
  assert.equal(scoring.getBenchmarkPromptStatus('partial answer', 'length'), 'truncated');
  assert.equal(scoring.getBenchmarkPromptStatus('complete answer', 'stop'), 'ok');
});
