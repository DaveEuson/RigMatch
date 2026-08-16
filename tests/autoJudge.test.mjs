import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { textJudgeCandidates } from '../src/lib/modelCatalog.ts';
import { BENCHMARK_PRESETS, DEFAULT_BENCHMARK_QUESTIONS } from '../src/benchmarkSuite.ts';

const require = createRequire(import.meta.url);
const { buildBenchmarkPromptPlan } = require('../electron/benchmarkSuite.cjs');
const { heuristicCanGrade } = require('../electron/benchmarkScoring.cjs');

/**
 * Chat and writing answers have no shape for the rules to match, so 0.6 stopped
 * them crowning anyone — which left those goals graded but uncrownable unless
 * the user found the judge setting. The judge now marks exactly those questions
 * and nothing else, so the cost is paid only where it buys a real score.
 */

const judgeCallsFor = (questions) =>
  buildBenchmarkPromptPlan(10, questions).filter((q) => !heuristicCanGrade(q.type, q.prompt)).length;

test('a run of nothing but checkable questions pays no judge cost', () => {
  const tools = BENCHMARK_PRESETS.find((p) => p.id === 'tools');
  assert.equal(judgeCallsFor(tools.questions), 0,
    'json, formatting and refusals all have a right answer to check against');
});

test('prose-heavy runs are where the judge earns its time', () => {
  for (const id of ['chat', 'writing']) {
    const preset = BENCHMARK_PRESETS.find((p) => p.id === id);
    const calls = judgeCallsFor(preset.questions);
    assert.ok(calls >= 3, `${id} needs at least three marked answers to crown, got ${calls}`);
    assert.ok(calls < 10, `${id} should not need judging on every question, got ${calls}`);
  }
});

test('the default suite stays cheap', () => {
  // Whatever else changes, the out-of-the-box run must not become a run where
  // every question costs two model calls.
  assert.ok(judgeCallsFor(DEFAULT_BENCHMARK_QUESTIONS) <= 5);
});

test('a judge has to be able to hold a conversation', () => {
  // The old default was "largest installed model", and on a real machine the
  // largest is often an embedding or OCR model — which does not fail loudly,
  // it grades prose as confident nonsense.
  const picked = textJudgeCandidates([
    { displayName: 'nomic-embed-text', sizeGb: 0.3 },
    { displayName: 'sd15.safetensors', sizeGb: 4.0, generationKind: 'image' },
    { displayName: 'gemma4:e2b', sizeGb: 7.2 },
    { displayName: 'granite4:3b', sizeGb: 2.1 },
  ]);
  assert.deepEqual(picked, ['gemma4:e2b', 'granite4:3b']);
});

test('known-bad graders go last rather than being dropped', () => {
  // Still better than scoring prose by its length, so keep them available —
  // just never as the automatic pick when anything else is installed.
  const picked = textJudgeCandidates([
    { displayName: 'deepseek-ocr:latest', sizeGb: 9 },
    { displayName: 'granite4:3b', sizeGb: 2.1 },
  ]);
  assert.deepEqual(picked, ['granite4:3b', 'deepseek-ocr:latest']);
  assert.deepEqual(textJudgeCandidates([{ displayName: 'deepseek-ocr:latest', sizeGb: 9 }]), ['deepseek-ocr:latest']);
});

test('the weak-judge rule matches whole words, not substrings', () => {
  // This regex has been written twice with a literal backspace byte instead of
  // a word boundary, because \b means backspace inside a shell heredoc. It is
  // invisible in the file and makes the rule silently match nothing.
  const source = readFileSync(new URL('../src/lib/modelCatalog.ts', import.meta.url), 'utf-8');
  assert.ok(!source.includes(String.fromCharCode(8)), 'modelCatalog.ts contains a literal backspace byte');

  // "socratic" contains o-c-r; a boundary-less rule would demote it.
  const picked = textJudgeCandidates([
    { displayName: 'socratic-tutor:7b', sizeGb: 5 },
    { displayName: 'deepseek-ocr:latest', sizeGb: 9 },
  ]);
  assert.equal(picked[0], 'socratic-tutor:7b', 'a real model was demoted by a substring match');
});
