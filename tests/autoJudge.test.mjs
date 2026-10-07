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

test('a judge that cannot run hands its questions to the automatic judge', () => {
  // OpenRouter with no key, or a local judge with nothing installed: the run
  // sheet promises the built-in checks, which include the automatic judge.
  const hook = readFileSync(new URL('../src/hooks/useJudgeSettings.ts', import.meta.url), 'utf-8');
  assert.match(hook, /\(\) => \(effectiveJudge \? \[\] : judgeModelOptions\)/);
  assert.doesNotMatch(hook, /if \(qualityMode === 'judge'\) return \[\];/);
});

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

// The Jetson smoke for 0.9.0, with the models it actually had installed.
const JETSON_MODELS = [
  { displayName: 'gemma4:latest', sizeGb: 9.6, params: '8B' },
  { displayName: 'gemma4:12b', sizeGb: 7.6, params: '12B' },
  { displayName: 'mistral:7b', sizeGb: 4.4, params: '7B' },
  { displayName: 'qwen2.5:1.5b', sizeGb: 0.9, params: '1.5B' },
];

test('a judge that fits this computer goes ahead of a bigger one that does not', () => {
  // The largest-first rule picked a 9.6 GB gemma4 on a 7.4 GB Jetson. It loaded
  // as 12 GB mostly on the CPU, took minutes per verdict, and held the GPU while
  // the model under test was being timed.
  assert.deepEqual(textJudgeCandidates(JETSON_MODELS, 7.4),
    ['mistral:7b', 'qwen2.5:1.5b', 'gemma4:latest', 'gemma4:12b']);
});

test('with memory unknown the order stays by size alone', () => {
  assert.deepEqual(textJudgeCandidates(JETSON_MODELS),
    ['gemma4:latest', 'gemma4:12b', 'mistral:7b', 'qwen2.5:1.5b']);
});

test('fitting does not promote a known-bad grader over a real one', () => {
  const picked = textJudgeCandidates([
    { displayName: 'llava:7b', sizeGb: 4.7, params: '7B' },
    { displayName: 'gemma4:latest', sizeGb: 9.6, params: '8B' },
  ], 7.4);
  assert.deepEqual(picked, ['gemma4:latest', 'llava:7b']);
});

test('the judge leaves the GPU before the model under test is timed again', () => {
  // The judge runs after the first of each question's three timing runs. Kept
  // loaded, it had the other two measured with the model split onto the CPU.
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const judge = main.slice(main.indexOf('async function runJudgeGenerate'));
  assert.match(judge.slice(0, judge.indexOf('\n}\n')), /keep_alive: 0,/,
    'runJudgeGenerate must unload the judge as soon as it has answered');

  // Between the verdict and the answer's score being taken: the judge block.
  // A fixed character window broke the moment anything else joined the block.
  const verdict = main.indexOf('promptJudgeScore = verdict ? verdict.score : null;');
  const scored = main.indexOf('const sobrietyScore = promptJudgeScore != null', verdict);
  assert.ok(verdict > 0 && scored > verdict, 'the verdict or scoring line moved; follow it');
  assert.match(main.slice(verdict, scored), /await warmBenchmarkModel\(baseUrl, model\)/,
    'after a local verdict the model under test must be loaded again before its next timed run');
  assert.match(main.slice(verdict, scored), /await warmLmStudioBenchmarkModel\(baseUrl, model, signal\)/,
    'an LM Studio contestant is loaded again the same way');
});

test('the same installed models always give the same judge', () => {
  // Two models of one size kept the order their rows arrived in, and the
  // default judge changed between two otherwise identical runs (2026-10-06).
  const rows = [
    { displayName: 'qwen3:8b', sizeGb: 5.2 },
    { displayName: 'llama3.1:8b', sizeGb: 5.2 },
    { displayName: 'granite4:3b', sizeGb: 2.1 },
  ];
  const once = textJudgeCandidates(rows, 12);
  assert.deepEqual(once, ['llama3.1:8b', 'qwen3:8b', 'granite4:3b']);
  assert.deepEqual(textJudgeCandidates([...rows].reverse(), 12), once);
});

test('Labs never has an automatic judge mark its own app and code', async () => {
  const { labJudgeFor } = await import('../src/lib/labJudge.ts');
  const candidates = ['qwen/qwen3-8b', 'qwen3:8b', 'gemma4:e4b'];
  const baseUrlOf = (name) => (name.includes('/') ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434');
  const auto = { provider: 'local', model: 'qwen3:8b', baseUrl: 'http://127.0.0.1:11434' };
  const pick = (contestant, judge = auto, chosen = false) => labJudgeFor(contestant, judge, { chosen, candidates, baseUrlOf });

  // The contestant, and its copy in LM Studio, both step aside.
  assert.deepEqual(pick('qwen3:8b'), { provider: 'local', model: 'gemma4:e4b', baseUrl: 'http://127.0.0.1:11434' });
  // Anyone else is marked by the automatic judge as before.
  assert.equal(pick('llama3.2:3b'), auto);
  // A judge the person chose is theirs, as in the show.
  assert.equal(pick('qwen3:8b', auto, true), auto);
  // Nobody else to ask: unmarked rather than self-marked.
  assert.equal(labJudgeFor('qwen3:8b', auto, { chosen: false, candidates: ['qwen3:8b'], baseUrlOf }), null);
  // A cloud judge is never a contestant.
  const cloud = { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5', apiKey: 'k' };
  assert.equal(pick('qwen3:8b', cloud), cloud);
  assert.equal(pick('qwen3:8b', null), null);

  // Every App Builder and Code run asks for its contestant's judge.
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  assert.doesNotMatch(app, /skillTestJudge \? \{ \.\.\.skillTestJudge/, 'a skill run still hands every contestant the same judge');
  // App Builder, the improve pass, and Code twice: once to skip a model
  // nobody else can mark, once to mark it.
  assert.equal(app.match(/skillJudgeFor\((?:job\.)?model\)/g)?.length, 4, 'App Builder, Code and the improve pass');
  assert.match(app, /if \(!skillJudgeFor\(job\.model\)\) \{\s*unjudgedCode\.push\(job\.model\);\s*continue;/);
  assert.match(app, /tellUser\(`The code challenge skipped \$\{names\}: no other model on this computer can mark its code/);
});

test('a copy of a model under another name is still that model', async () => {
  // Bug scan, 2026-10-07: names alone missed Ollama's `qwen3:latest` beside
  // `qwen3:8b` (one download) and 0.40's code-named copy of qwen3.5:9b.
  const { modelIdentities, sameModel } = await import('../src/lib/modelKey.ts');
  const { labJudgeFor } = await import('../src/lib/labJudge.ts');
  const installed = {
    'qwen3:8b': { digest: '500a1f067a9f', family: 'qwen3', parameterSize: '8.2B', quantization: 'Q4_K_M' },
    'qwen3:latest': { digest: '500a1f067a9f', family: 'qwen3', parameterSize: '8.2B', quantization: 'Q4_K_M' },
    'qwen3.5:9b': { digest: '9cda952e5d8f', family: 'qwen35', parameterSize: '9.7B', quantization: 'Q4_K_M' },
    'llamacpp:c97eb11d70b1acdc88af01eef566c1fe4f7fbe93eb1afc06871132f293ff425a': { digest: 'c97eb11d70b1', family: 'qwen35', parameterSize: '9.7B', quantization: 'Q4_K_M' },
    'gemma4:e4b': { digest: 'c6eb396dbd59', family: 'gemma4', parameterSize: '8.0B', quantization: 'Q4_K_M' },
  };
  const identityOf = (name) => modelIdentities(name, installed[name]);
  assert.ok(sameModel(identityOf('qwen3:8b'), identityOf('qwen3:latest')), 'one download under two tags');
  assert.ok(sameModel(identityOf('qwen3.5:9b'), identityOf('llamacpp:c97eb11d70b1acdc88af01eef566c1fe4f7fbe93eb1afc06871132f293ff425a')), 'a code-named copy');
  assert.ok(sameModel(modelIdentities('qwen3:8b'), modelIdentities('qwen/qwen3-8b')), 'Ollama and LM Studio, by name');
  assert.ok(!sameModel(identityOf('qwen3:8b'), identityOf('gemma4:e4b')));

  const auto = { provider: 'local', model: 'qwen3:latest' };
  const pick = labJudgeFor('qwen3:8b', auto, {
    chosen: false, candidates: ['qwen3:latest', 'qwen3:8b', 'gemma4:e4b'], baseUrlOf: () => 'http://127.0.0.1:11434', identityOf,
  });
  assert.equal(pick.model, 'gemma4:e4b', 'qwen3:latest stepped aside for qwen3:8b');
});
