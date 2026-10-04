// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  BENCHMARK_PRESETS, BENCHMARK_QUESTION_LEVELS, DEFAULT_BENCHMARK_QUESTIONS, QUICK_CHECK_QUESTIONS,
} from '../src/benchmarkSuite.ts';
import {
  COUNT_OPTIONS, EDITABLE_QUESTION_TYPES, QUESTION_TYPE_LABELS, activeQuestionSet, judgeChoiceOf, questionMarker,
  questionsForSet, sheetButtonLabel,
} from '../src/lib/runSheet.ts';

/**
 * The run sheet: "Before the show" and "Before the test". One sheet in front
 * of every run that works the graphics card, replacing the run warning, the
 * quick-check warning, the floating question editor and Simple Mode's own
 * balance dialog.
 */

const require = createRequire(import.meta.url);
const { heuristicCanGrade } = require('../electron/benchmarkScoring.cjs');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

test('the question list says who marks each question, the same way the scorer decides it', () => {
  // The scorer is the authority; the sheet asks before there is an answer,
  // which is the call heuristicCanGrade makes with no response.
  const everyQuestion = [
    ...DEFAULT_BENCHMARK_QUESTIONS,
    ...BENCHMARK_PRESETS.flatMap((preset) => preset.questions),
    ...QUICK_CHECK_QUESTIONS,
  ];
  for (const question of everyQuestion) {
    const rulesCan = heuristicCanGrade(question.type, question.prompt, undefined);
    assert.equal(questionMarker(question), rulesCan ? 'rules' : 'judge', `${question.id} (${question.type})`);
  }
});

test('a set is named only while it is unchanged', () => {
  assert.equal(activeQuestionSet(DEFAULT_BENCHMARK_QUESTIONS), 'general');
  for (const preset of BENCHMARK_PRESETS) {
    assert.equal(activeQuestionSet(questionsForSet(preset.id)), preset.id);
    // A reworded question keeps its id but asks something else.
    const edited = preset.questions.map((q, i) => (i === 0 ? { ...q, prompt: `${q.prompt} Briefly.` } : q));
    assert.equal(activeQuestionSet(edited), 'custom', `${preset.id} edited`);
  }
  assert.equal(activeQuestionSet(DEFAULT_BENCHMARK_QUESTIONS.slice(1)), 'custom');
  // Picking a set hands back a copy, so editing it never edits the preset.
  assert.notEqual(questionsForSet('coding'), BENCHMARK_PRESETS.find((p) => p.id === 'coding').questions);
});

test('the counts on offer are the levels a run accepts, and every type has a name', () => {
  assert.deepEqual(COUNT_OPTIONS.map((o) => o.count), [...BENCHMARK_QUESTION_LEVELS]);
  for (const type of EDITABLE_QUESTION_TYPES) assert.ok(QUESTION_TYPE_LABELS[type], type);
  // A tool question is checked against the call its task expects, which a
  // written question has none of.
  assert.ok(!EDITABLE_QUESTION_TYPES.includes('tools'));
});

test('the judge choice reads both stored settings, and built-in wins whenever judging is off', () => {
  assert.equal(judgeChoiceOf('heuristic', 'openrouter'), 'built-in');
  assert.equal(judgeChoiceOf('judge', 'local'), 'local');
  assert.equal(judgeChoiceOf('judge', 'openrouter'), 'cloud');
});

test('the gold button says what starts and how long it takes, and whether that was measured here', () => {
  assert.equal(sheetButtonLabel({ quick: false, mode: 'speed-date', skillsOnly: false, duration: 'about 15 min', measured: false }),
    'Start the show · about 15 min · estimate');
  assert.equal(sheetButtonLabel({ quick: false, mode: 'single', skillsOnly: false, duration: 'about 4 min', measured: true }),
    'Run the test · about 4 min · measured here');
  assert.equal(sheetButtonLabel({ quick: true, mode: 'single', skillsOnly: false, duration: 'about 1 min', measured: true }),
    'Run the quick check · about 1 min');
  assert.equal(sheetButtonLabel({ quick: false, mode: 'speed-date', skillsOnly: true, duration: null, measured: false }),
    'Run the skill tests');
});

test('the four dialogs it replaced are gone', () => {
  for (const file of ['RunWarningModal', 'QuickCheckWarningModal', 'TestSuiteEditorDock']) {
    assert.ok(!existsSync(new URL(`../src/components/${file}.tsx`, import.meta.url)), `${file}.tsx is back`);
  }
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.doesNotMatch(wizard, /PreShowQuestion|askingBalance/);
});

test('every way to start a run opens the sheet first', () => {
  const app = read('../src/App.tsx');
  // Test, quick check, the show and "Questions and judge" all set a pending
  // run mode, which is what renders the sheet.
  assert.match(app, /\{pendingRunMode && \(\s*<RunSheet/);
  const quick = app.slice(app.indexOf('const requestQuickCheckRow = useCallback'), app.indexOf('const queueModel = useCallback'));
  assert.match(quick, /requestBenchmarkForModel\(row\.displayName, \{ quick: true \}\)/);
  const show = app.slice(app.indexOf('const requestListTest = useCallback'), app.indexOf('const openQuestionsSheet'));
  assert.match(show, /setPendingRunMode\('speed-date'\)/);
  // Simple Mode's start opens it too, and the wizard moves on only when it is confirmed.
  assert.match(app, /onStartShow=\{\(begin\) => \{[\s\S]{0,400}setSheetSimple\(true\);\s*setPendingRunMode\('speed-date'\);/);
  const confirm = app.slice(app.indexOf('const confirmPendingRun = useCallback'), app.indexOf('const cancelPendingRun = useCallback'));
  assert.match(confirm, /if \(simple\) \{\s*startSimpleShow\(\);\s*beginSimple\?\.\(\);/);
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /props\.onStartShow\(\(\) => \{[\s\S]{0,300}setAwaitingRun\(true\);\s*setStep\('compare'\);/);
});

test('a quick check runs its three questions and nothing else, on one model or a lineup', () => {
  const app = read('../src/App.tsx');
  const confirm = app.slice(app.indexOf('const confirmPendingRun = useCallback'), app.indexOf('const cancelPendingRun = useCallback'));
  const quick = confirm.slice(confirm.indexOf('if (quick) {'), confirm.indexOf('if (skillsOnly) {'));
  assert.match(quick, /startBenchmark\(model, QUICK_CHECK_QUESTIONS\)/);
  assert.match(quick, /runListTest\(QUICK_CHECK_QUESTIONS\)/);
  assert.doesNotMatch(quick, /runSkillTestsAfterRun/);
  // The lineup run takes the override the way the one-model run always has.
  assert.match(app, /const runListTest = useCallback\(async \(questionsOverride\?: BenchmarkQuestion\[\]\) => \{/);
});

test('skills-only comes from the sheet, so every skill can skip the questions', () => {
  // App used to re-derive this from two of the six skills, so a code challenge
  // with "skip the questions" ticked ran the questions anyway.
  const app = read('../src/App.tsx');
  const confirm = app.slice(app.indexOf('const confirmPendingRun = useCallback'), app.indexOf('const cancelPendingRun = useCallback'));
  assert.match(confirm, /\{ skipQuickSheet, skillsOnly \}/);
  assert.doesNotMatch(confirm, /selection\.appBuilder \|\| selection\.image/);
});

test('the sheet keeps the promises the old dialog made', () => {
  const sheet = read('../src/components/RunSheet.tsx');
  // What leaves the computer is always stated, in the footer.
  assert.match(sheet, /'Nothing leaves this computer\.'/);
  // A judge that is also a contestant is called out.
  assert.match(sheet, /lineupModels\.includes\(judgeModel\)/);
  // A cloud judge is never assumed: without a key, the run says it uses the built-in checks.
  assert.match(sheet, /Without a key, this run uses the built-in checks\./);
  // Escape closes it.
  assert.match(sheet, /useDialog<HTMLElement>\(onCancel\)/);
  // One gold button.
  assert.equal(sheet.match(/btn-gold/g)?.length, 1);
});
