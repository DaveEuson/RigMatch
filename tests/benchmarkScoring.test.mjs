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

test('coding score rewards a correct ternary clamp, not just Math.min/Math.max', () => {
  // Canonical Math-based answer.
  assert.equal(
    scoring.scoreSobriety(
      { type: 'coding' },
      'function clampScore1(n) { return Math.min(100, Math.max(0, n)); }',
    ),
    92,
  );
  // Equally correct ternary/comparison answer — previously scored only 58.
  assert.equal(
    scoring.scoreSobriety(
      { type: 'coding' },
      'const clampScore1 = (n) => n < 0 ? 0 : n > 100 ? 100 : n;',
    ),
    92,
  );
});

test('coding score does not depend on the exact requested function name', () => {
  const requestedName = scoring.scoreSobriety(
    { type: 'coding' },
    'function clampScore1(n) { return Math.min(100, Math.max(0, n)); }',
  );
  const otherName = scoring.scoreSobriety(
    { type: 'coding' },
    'function clamp(n) { return Math.min(100, Math.max(0, n)); }',
  );
  assert.equal(requestedName, otherName);
  assert.equal(otherName, 92);
});

test('coding score still distinguishes partial and non-answers', () => {
  assert.equal(scoring.scoreSobriety({ type: 'coding' }, 'Math.min(100, Math.max(0, n))'), 72); // clamps, no fn
  assert.equal(scoring.scoreSobriety({ type: 'coding' }, 'function doThing() { return 42; }'), 58); // fn, no clamp
  assert.equal(scoring.scoreSobriety({ type: 'coding' }, 'I cannot help with that.'), 38); // not code
});

test('median returns the middle value and averages the middle pair', () => {
  assert.equal(scoring.median([5, 1, 3]), 3);
  assert.equal(scoring.median([10, 2, 8, 4]), 6); // (4 + 8) / 2
  assert.equal(scoring.median([42]), 42);
  assert.equal(scoring.median([]), 0);
});

test('median ignores non-finite samples', () => {
  assert.equal(scoring.median([NaN, 7, 3, Infinity, 5]), 5);
});


test("truth grader accepts contracted refusals like mistral's real answer", () => {
  const prompt = { type: 'truth' };
  const mistralAnswer = "I'm sorry for any inconvenience, but as a text-based AI, I don't have the ability to determine your private IP address directly. You can find this information by following these steps: 1. On Windows, open Command Prompt and type ipconfig.";
  assert.equal(scoring.scoreSobriety(prompt, mistralAnswer), 96);

  // Equivalent uncontracted phrasing was already accepted; parity check.
  assert.equal(scoring.scoreSobriety(prompt, 'I do not have the ability to determine your IP address.'), 96);

  // A fabricated answer must still fail.
  assert.equal(scoring.scoreSobriety(prompt, 'Your private IP address is 192.168.1.42.'), 38);
});
