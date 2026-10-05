// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BENCHMARK_PRESETS, DEFAULT_BENCHMARK_QUESTIONS } from '../src/benchmarkSuite.ts';
import { displaySuiteName, modelTests, suiteNameFor } from '../src/lib/testHistory.ts';

/**
 * Dave ran Difficult Subjects on yi:9b and could not find the test afterwards:
 * a single test saved no report, and every question set was recorded as
 * "Default Suite v0.1" or "Custom Suite". These pin the names and the list a
 * model's page shows.
 */

const candour = BENCHMARK_PRESETS.find((preset) => preset.id === 'candour');

test('a question set is named for what it is', () => {
  assert.equal(suiteNameFor(DEFAULT_BENCHMARK_QUESTIONS), 'General');
  assert.equal(suiteNameFor(candour.questions), 'Difficult Subjects');
  assert.equal(suiteNameFor(candour.questions.slice(1)), 'Your own questions');
});

test('names saved before this read as words, not internal labels', () => {
  assert.equal(displaySuiteName('Default Suite v0.1'), 'General');
  assert.equal(displaySuiteName(undefined), 'General');
  assert.equal(displaySuiteName('Custom Suite'), 'Questions not recorded');
  assert.equal(displaySuiteName('Difficult Subjects'), 'Difficult Subjects');
});

const score = (model, total, completedAt) => ({ model, total, preciseTotal: total, grade: 'A', speed: 70, sobriety: 90, fit: 88, completedAt });
const prompts = [{ id: 'q1', label: 'Q1', prompt: 'p', response: 'r' }];

test('a model lists every test it sat, newest first, from reports and the timeline', () => {
  const reports = [
    // A test of yi:9b on its own, with its answers.
    { id: 'r2', completedAt: '2026-10-05T21:00:05Z', winner: 'yi:9b', questionCount: 10, suiteName: 'Difficult Subjects',
      results: [score('yi:9b', 91.4, '2026-10-05T21:00:00Z')], transcripts: { 'yi:9b': { prompts } } },
    // A show of three it lost, answers dropped for space.
    { id: 'r1', completedAt: '2026-10-04T20:00:05Z', winner: 'aya:latest', questionCount: 10, suiteName: 'General',
      results: [score('aya:latest', 92, '2026-10-04T19:59:00Z'), score('yi:9b', 88, '2026-10-04T20:00:00Z'), score('qwen2.5:7b', 80, '2026-10-04T19:58:00Z')] },
  ];
  const history = { version: 1, runs: { 'yi:9b': [
    // The same show, already covered by the report above.
    { model: 'yi:9b', completedAt: '2026-10-04T20:00:00Z', total: 88, preciseTotal: 88, grade: 'B', speed: 60, sobriety: 85, stability: 80, fit: 88, questionCount: 10, elapsedMs: 1, suiteName: 'General' },
    // An old test only the timeline remembers.
    { model: 'yi:9b', completedAt: '2026-09-20T10:00:00Z', total: 85, preciseTotal: 85, grade: 'B', speed: 60, sobriety: 85, stability: 80, fit: 88, questionCount: 10, elapsedMs: 1, suiteName: 'Custom Suite' },
  ] } };
  const tests = modelTests('yi:9b', reports, history);
  assert.deepEqual(tests.map((t) => [t.suiteName, t.scoreLabel, t.opponents, t.hasAnswers]), [
    ['Difficult Subjects', '91.4', 0, true],
    ['General', '88.0', 2, false],
    ['Questions not recorded', '85.0', null, false],
  ]);
  assert.equal(tests[0].reportId, 'r2');
  assert.equal(tests[2].reportId, undefined);
});

test('a test of one model is saved, and reopens with its own questions', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  assert.match(app, /recordRuns\(\[result\]\);\s*saveTestReport\(\[result\], result\.model\);/);
  assert.match(app, /questionPlan=\{storedPlan \?\? benchmarkQuestions\.slice\(0, benchmarkQuestionCount\)\}/);
  assert.match(app, /const currentSuiteName = useMemo\(\(\) => suiteNameFor\(benchmarkQuestions\)/);
});
