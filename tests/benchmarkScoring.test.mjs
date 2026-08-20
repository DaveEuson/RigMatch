// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
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

test('non-object JSON is not scored by element/char count', () => {
  // A bare string parses fine; Object.keys("hello") would have counted 5 "keys"
  // and awarded 92 for a non-answer. It must land in the low bucket instead.
  assert.equal(scoring.scoreSobriety({ type: 'json' }, '"hello"'), 52);
  // A JSON array answer to a "use keys X,Y,Z" prompt is the wrong shape, not a
  // 3-key object — must not score 82.
  assert.equal(scoring.scoreSobriety({ type: 'json' }, '[{"a":1},{"b":2},{"c":3}]'), 52);
});

test('status detects truncated non-empty responses', () => {
  assert.equal(scoring.getBenchmarkPromptStatus('partial answer', 'length'), 'truncated');
  assert.equal(scoring.getBenchmarkPromptStatus('complete answer', 'stop'), 'ok');
});

// The one coding question the heuristic can genuinely mark: it knows the answer.
const CLAMP_PROMPT = 'Write a compact JavaScript function named clampScore that accepts a number and returns it clamped between 0 and 100.';

test('coding score rewards a correct ternary clamp, not just Math.min/Math.max', () => {
  // Canonical Math-based answer.
  assert.equal(
    scoring.scoreSobriety(
      { type: 'coding', prompt: CLAMP_PROMPT },
      'function clampScore1(n) { return Math.min(100, Math.max(0, n)); }',
    ),
    92,
  );
  // Equally correct ternary/comparison answer — previously scored only 58.
  assert.equal(
    scoring.scoreSobriety(
      { type: 'coding', prompt: CLAMP_PROMPT },
      'const clampScore1 = (n) => n < 0 ? 0 : n > 100 ? 100 : n;',
    ),
    92,
  );
});

test('coding score does not depend on the exact requested function name', () => {
  const requestedName = scoring.scoreSobriety(
    { type: 'coding', prompt: CLAMP_PROMPT },
    'function clampScore1(n) { return Math.min(100, Math.max(0, n)); }',
  );
  const otherName = scoring.scoreSobriety(
    { type: 'coding', prompt: CLAMP_PROMPT },
    'function clamp(n) { return Math.min(100, Math.max(0, n)); }',
  );
  assert.equal(requestedName, otherName);
  assert.equal(otherName, 92);
});

test('coding score still distinguishes partial and non-answers', () => {
  assert.equal(scoring.scoreSobriety({ type: 'coding', prompt: CLAMP_PROMPT }, 'Math.min(100, Math.max(0, n))'), 72); // clamps, no fn
  assert.equal(scoring.scoreSobriety({ type: 'coding', prompt: CLAMP_PROMPT }, 'function doThing() { return 42; }'), 58); // fn, no clamp
  assert.equal(scoring.scoreSobriety({ type: 'coding', prompt: CLAMP_PROMPT }, 'I cannot help with that.'), 38); // not code
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

test('a coding question the scorer does not know is not marked as if it were', () => {
  // Three real coding questions (SQL, a React fix, a code review) used to be
  // typed 'assistant' purely because this branch would have scored them 38 —
  // the scorer only ever knew the clamp question. It now says what it can
  // honestly tell (is this code at all) and heuristicCanGrade flags the rest
  // as needing the judge, so the questions can be typed truthfully.
  const sql = { type: 'coding', prompt: 'Write a SQL query that finds all users with more than 3 orders.' };
  assert.equal(scoring.scoreSobriety(sql, 'SELECT user_id FROM orders GROUP BY user_id HAVING COUNT(*) > 3'), 70);
  assert.equal(scoring.scoreSobriety(sql, 'I am not able to help with that.'), 30);
  assert.equal(scoring.heuristicCanGrade('coding', sql.prompt), false, 'depth needs the judge');
  assert.equal(scoring.heuristicCanGrade('coding', CLAMP_PROMPT), true, 'the clamp question it can mark');
});

test('prose types are declared ungradeable rather than scored by length in silence', () => {
  // The fallback returns 78-92 purely on character count. That number still
  // exists — a run needs a value — but heuristicCanGrade is what stops it
  // being presented as a measurement or crowning "best for talking".
  const chat = { type: 'assistant', prompt: 'Help me plan my morning.' };
  const short = scoring.scoreSobriety(chat, 'Wake up early.');
  const long = scoring.scoreSobriety(chat, 'x'.repeat(2000));
  assert.ok(long > short, 'the fallback is length-based, which is exactly the problem');
  assert.equal(scoring.heuristicCanGrade('assistant', chat.prompt), false);
  assert.equal(scoring.heuristicCanGrade('writing', 'Write a product description.'), false);
  // The types it genuinely marks stay gradeable.
  for (const type of ['json', 'truth', 'format']) {
    assert.equal(scoring.heuristicCanGrade(type, 'anything'), true, type);
  }
});
