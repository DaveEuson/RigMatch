import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { BENCHMARK_QUESTION_LEVELS, BENCHMARK_PRESETS, DEFAULT_BENCHMARK_QUESTIONS } from '../src/benchmarkSuite.ts';

const require = createRequire(import.meta.url);
const cjs = require('../electron/benchmarkSuite.cjs');

/**
 * electron/benchmarkSuite.cjs is a hand-maintained copy of src/benchmarkSuite.ts,
 * because the main process is CommonJS and cannot import the TypeScript module.
 * Two copies of one truth drift, and this one did: 'writing' was added to the TS
 * type guard and not the CJS one, so the main process silently rewrote every
 * writing question to 'assistant'. They ran as chat questions, scored into the
 * chat group, and the writing goal could never be crowned — the exact bug the
 * type was added to fix, reintroduced one file over.
 *
 * Nothing about that is visible at build time. The types match, the tests on
 * the TS side pass, and only a real run through the main process shows it.
 */

test('both copies accept exactly the same question types', () => {
  const types = ['json', 'truth', 'format', 'assistant', 'coding', 'writing'];
  for (const type of types) {
    const plan = cjs.buildBenchmarkPromptPlan(1, [{ id: 't', label: 't', type, prompt: 'p' }]);
    assert.equal(plan[0].type, type,
      `the main process rewrote "${type}" to "${plan[0].type}" — add it to isBenchmarkQuestionType in electron/benchmarkSuite.cjs`);
  }
});

test('every type used by a shipped preset survives the main process', () => {
  // The renderer sends preset questions straight through to the main process,
  // so a preset carrying a type the CJS guard rejects is scored as chat.
  const shipped = new Set([
    ...DEFAULT_BENCHMARK_QUESTIONS.map((q) => q.type),
    ...BENCHMARK_PRESETS.flatMap((preset) => preset.questions.map((q) => q.type)),
  ]);
  for (const type of shipped) {
    const plan = cjs.buildBenchmarkPromptPlan(1, [{ id: 't', label: 't', type, prompt: 'p' }]);
    assert.equal(plan[0].type, type, `a shipped preset uses "${type}", which the main process does not accept`);
  }
});

test('an genuinely unknown type still falls back rather than crashing', () => {
  const plan = cjs.buildBenchmarkPromptPlan(1, [{ id: 't', label: 't', type: 'nonsense', prompt: 'p' }]);
  assert.equal(plan[0].type, 'assistant', 'the fallback itself is fine — silently losing a REAL type is the bug');
});

test('the generated default suite is identical in both copies', () => {
  // The type guard was the drift that bit, but the templates and scenarios are
  // duplicated too and were unguarded — a reworded or reordered template would
  // change what the main process actually asks while every TS-side test still
  // passed. Compare the built plan itself, which is the thing that runs.
  const fromTs = DEFAULT_BENCHMARK_QUESTIONS;
  const fromCjs = cjs.buildBenchmarkPromptPlan(fromTs.length, undefined);
  assert.equal(fromCjs.length, fromTs.length, 'the two copies build different default suites');
  for (const [index, question] of fromTs.entries()) {
    assert.equal(fromCjs[index].id, question.id, `default question ${index}: id drifted`);
    assert.equal(fromCjs[index].type, question.type, `default question ${index}: type drifted`);
    assert.equal(fromCjs[index].prompt, question.prompt, `default question ${index}: wording drifted`);
    assert.equal(fromCjs[index].label, question.label, `default question ${index}: label drifted`);
  }
});

test('both copies scale a suite to a requested length the same way', () => {
  // buildBenchmarkPromptPlan repeats the suite and suffixes the round; if the
  // two implementations disagree, the run asks different questions than the UI
  // counted — which is how the prose-question note went wrong.
  const suite = BENCHMARK_PRESETS.find((p) => p.id === 'chat').questions;
  for (const count of [10, 20, 50]) {
    const plan = cjs.buildBenchmarkPromptPlan(count, suite);
    assert.equal(plan.length, count);
    const ids = plan.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, `${count}: repeated questions must get distinct ids`);
  }
});

test('the question count levels match', () => {
  assert.deepEqual([...cjs.BENCHMARK_QUESTION_LEVELS ?? []], [...BENCHMARK_QUESTION_LEVELS],
    'the two copies offer different run lengths');
});

test('both copies plan the same number of prompts', () => {
  for (const count of BENCHMARK_QUESTION_LEVELS) {
    const plan = cjs.buildBenchmarkPromptPlan(count, DEFAULT_BENCHMARK_QUESTIONS);
    assert.equal(plan.length, count, `asked for ${count} prompts, planned ${plan.length}`);
  }
});
