// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
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

test('a model never marks its own answers', () => {
  // autoJudgeModel is picked from an ordered list by the main process, which
  // drops the model under test. Without that, benchmarking the largest
  // installed model — or running on a one-model machine — has the model
  // grading itself, which marks generously and then crowns a Match.
  const pickJudge = (candidates, modelUnderTest) => candidates
    .map((name) => String(name || '').trim())
    .find((name) => name && name !== modelUnderTest) || '';

  assert.equal(pickJudge(['gemma4:e2b', 'granite4:3b'], 'gemma4:e2b'), 'granite4:3b',
    'the top candidate is the model being tested, so the next one judges');
  assert.equal(pickJudge(['gemma4:e2b', 'granite4:3b'], 'llama3.2:3b'), 'gemma4:e2b');
  assert.equal(pickJudge(['solo:7b'], 'solo:7b'), '',
    'one model installed means no judge at all — better than self-grading');
  assert.equal(pickJudge([], 'anything'), '');
});

test('the clamp rubric is not tripped by a custom question about clamping', () => {
  // Custom suites are a feature. "how do I clamp an audio buffer" must not be
  // marked against Math.min/Math.max and the literal 0 and 100 bounds.
  assert.equal(heuristicCanGrade('coding', 'Explain how to clamp an audio buffer in Rust.'), false);
  assert.equal(heuristicCanGrade('coding', 'Write a clamp for a slider value.'), false);
  // The built-in ones still are, by the function name the rubric grades.
  assert.equal(heuristicCanGrade('coding', 'Write a compact JavaScript function named clampScore that accepts a number.'), true);
});

test('the rubric marks questions that ask for a clamp, not ones that mention one', () => {
  // Two coding questions ship in the default suite and only one is markable.
  // coding_help asks the model to WRITE clampScore, which the rubric knows the
  // answer to. tiny_code_review asks it to REVIEW a snippet that happens to
  // contain Math.min/Math.max — grading that with the write-a-clamp rubric
  // would score an answer for echoing the snippet back, so it must stay
  // unmarkable and go to the judge.
  const coding = [
    ...DEFAULT_BENCHMARK_QUESTIONS,
    ...BENCHMARK_PRESETS.flatMap((p) => p.questions),
  ].filter((q) => q.type === 'coding');

  const asksToWrite = coding.filter((q) => /named clampScore/i.test(q.prompt));
  assert.ok(asksToWrite.length >= 2, 'expected the built-in write-a-clamp questions to exist');
  for (const question of asksToWrite) {
    assert.equal(heuristicCanGrade('coding', question.prompt), true, `${question.id} should be markable`);
  }

  const review = coding.find((q) => /Review this JavaScript snippet/i.test(q.prompt));
  assert.ok(review, 'expected the code-review question to exist');
  assert.equal(heuristicCanGrade('coding', review.prompt), false,
    'reviewing a clamp is not writing one — the rubric cannot mark it');
});
