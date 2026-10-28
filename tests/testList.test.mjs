// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatHistoryTime } from '../src/lib/modelCatalog.ts';
import { parseRigHistory } from '../src/lib/rigScoreHistory.ts';
import { parseStoredReports } from '../src/lib/runReports.ts';
import { formatMatchScore } from '../src/lib/scoring.ts';
import { buildTestList, findTest, testWhen } from '../src/lib/testList.ts';

/**
 * Results opened on the Top Match with no way to the other tests. These pin the
 * list that fixes it: every kind of record in one list, newest first, no test
 * twice, nothing dropped, and a blind show's names kept back.
 */

const score = (model, total, completedAt, extra = {}) => ({
  model, total, grade: total >= 90 ? 'A' : total >= 80 ? 'B+' : 'B', speed: 80, sobriety: 85, fit: 90, completedAt, ...extra,
});
const run = (model, total, completedAt, extra = {}) => ({
  model, completedAt, total, grade: 'A', speed: 80, sobriety: 85, stability: 90, fit: 90, questionCount: 10, elapsedMs: 40000, ...extra,
});
const transcript = (model) => ({ model, prompts: [{ id: 'q1', label: 'One', prompt: 'Hi', response: 'Hello' }] });

const SHOW_AT = '2026-10-20T15:00:00.000Z';
const SINGLE_AT = '2026-10-22T09:30:00.000Z';
const OLD_AT = '2026-09-02T12:00:00.000Z';

const reports = [
  {
    id: `${SINGLE_AT}::yi:9b`, completedAt: SINGLE_AT, winner: 'yi:9b', questionCount: 6, suiteName: 'Difficult Subjects',
    results: [score('yi:9b', 91.4, SINGLE_AT)], transcripts: { 'yi:9b': transcript('yi:9b') },
  },
  {
    id: `${SHOW_AT}::qwen3:8b`, completedAt: SHOW_AT, winner: 'qwen3:8b', questionCount: 10, suiteName: 'Default Suite v0.1',
    results: [score('qwen3:8b', 92.1, '2026-10-20T14:58:00.000Z'), score('gemma3:4b', 84, '2026-10-20T14:59:00.000Z'), score('llama3.2:3b', 71, SHOW_AT)],
    transcripts: { 'qwen3:8b': transcript('qwen3:8b'), 'gemma3:4b': transcript('gemma3:4b'), 'llama3.2:3b': transcript('llama3.2:3b') },
  },
  // Saved by 0.9.x: no suite name, answers dropped to fit the browser's space.
  { id: `${OLD_AT}::mistral:7b`, completedAt: OLD_AT, winner: 'mistral:7b', questionCount: 0, results: [score('mistral:7b', 77, OLD_AT)] },
];

const history = {
  version: 1,
  runs: {
    'yi:9b': [run('yi:9b', 91, SINGLE_AT, { suiteName: 'Difficult Subjects' })],
    'qwen3:8b': [run('qwen3:8b', 92, '2026-10-20T14:58:00.000Z'), run('qwen3:8b', 88, '2026-08-14T10:00:00.000Z', { suiteName: 'Custom Suite', questionCount: 5 })],
    'gemma3:4b': [run('gemma3:4b', 84, '2026-10-20T14:59:00.000Z')],
    'llama3.2:3b': [run('llama3.2:3b', 71, SHOW_AT)],
    'mistral:7b': [run('mistral:7b', 77, OLD_AT)],
  },
};

const scores = {
  'yi:9b': score('yi:9b', 91.4, SINGLE_AT),
  'qwen3:8b': score('qwen3:8b', 92.1, '2026-10-20T14:58:00.000Z'),
  // Scored before the timeline existed: only here.
  'phi3:mini': score('phi3:mini', 60, '2026-07-01T08:00:00.000Z'),
};

const lab = {
  'app-builder::qwen3:8b': { model: 'qwen3:8b', challenge: 'app-builder', score: 88, grade: 'B+', elapsedMs: 90000, response: '<html></html>', checks: [], completedAt: '2026-10-23T18:00:00.000Z' },
  'code::gemma3:4b': { model: 'gemma3:4b', challenge: 'code', score: 70, grade: 'B', elapsedMs: 20000, response: 'x', checks: [], completedAt: '2026-10-21T11:00:00.000Z', language: 'python' },
  'image-generation::flux': { model: 'flux', challenge: 'image-generation', score: 80, grade: 'B+', elapsedMs: 50000, response: '', checks: [], completedAt: '2026-10-24T10:00:00.000Z', lineupId: 'L1' },
  'image-generation::zimage': { model: 'zimage', challenge: 'image-generation', score: 90, grade: 'A', elapsedMs: 30000, response: '', checks: [], completedAt: '2026-10-24T10:05:00.000Z', lineupId: 'L1' },
  'listening::qwen3:0.6b': { model: 'qwen3:0.6b', challenge: 'listening', score: 0, grade: 'F', elapsedMs: 1000, response: '', checks: [], completedAt: '2026-10-19T09:00:00.000Z', error: 'no audio' },
  'future::x': { model: 'x', challenge: 'something-new', score: 5, grade: 'F', elapsedMs: 1, response: '', checks: [], completedAt: '2026-10-18T09:00:00.000Z' },
};

const speed = [
  {
    id: 'rig-1', completedAt: '2026-10-25T07:00:00.000Z', tier: 'standard', measure: { prefillTps: 900, decodeTps: 54.4, loadSeconds: 3, runs: 3 },
    stamp: { tier: 'standard', model: 'qwen3:8b', appVersion: '0.10.0', workloadVersion: 1, numCtx: 4096 }, gpuShare: 1,
  },
];

const everything = { reports, history, scores, lab, speed };
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

test('lists a show, a lone test, each Lab test and a speed run, newest first', () => {
  const list = buildTestList(everything);
  const times = list.filter((entry) => entry.at).map((entry) => Date.parse(entry.at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(list[0].kind, 'speed');
  assert.deepEqual(list.map((entry) => entry.kind).slice(0, 5), ['speed', 'picture', 'app', 'model', 'code']);
  // The three-model show, the lone test, the lineup and the two old model tests.
  assert.ok(list.some((entry) => entry.kind === 'show' && entry.models.length === 3));
  assert.ok(list.some((entry) => entry.kind === 'picture' && entry.models.length === 2));
});

test('a test the report holds is not listed again from the timeline or the saved scores', () => {
  const list = buildTestList(everything);
  // yi:9b sits in a report, the timeline and the scores: one row.
  assert.equal(list.filter((entry) => entry.models.includes('yi:9b')).length, 1);
  // The show's three models are three timeline entries and two scores: still one row.
  assert.equal(list.filter((entry) => entry.kind === 'show').length, 1);
  // Reports come first in their own rows, with their answers.
  assert.equal(list.find((entry) => entry.kind === 'show').hasAnswers, true);
});

test('a test only the timeline or the scores remember is still listed, as scores only', () => {
  const list = buildTestList(everything);
  const oldQwen = list.find((entry) => entry.at === '2026-08-14T10:00:00.000Z');
  assert.equal(oldQwen.source.type, 'scores');
  assert.equal(oldQwen.hasAnswers, false);
  assert.match(oldQwen.headline, /Questions not recorded, 5 questions/);
  const phi = list.find((entry) => entry.models[0] === 'phi3:mini');
  assert.equal(phi.source.type, 'scores');
});

test('says what each row was and its headline result', () => {
  const list = buildTestList(everything);
  const show = list.find((entry) => entry.kind === 'show');
  assert.equal(show.what, 'Show · 3 models');
  assert.equal(show.headline, `qwen3:8b won · ${formatMatchScore(reports[1].results[0])} · General, 10 questions`);
  const lone = list.find((entry) => entry.models[0] === 'yi:9b');
  assert.equal(lone.what, 'Single test');
  assert.equal(lone.headline, `${formatMatchScore(reports[0].results[0])} · ${reports[0].results[0].grade} · Difficult Subjects, 6 questions`);
  assert.equal(list.find((entry) => entry.kind === 'app').what, 'Build an app');
  assert.equal(list.find((entry) => entry.kind === 'code').what, 'Code challenge');
  const pictures = list.find((entry) => entry.kind === 'picture');
  assert.equal(pictures.what, 'Picture comparison · 2 models');
  assert.deepEqual(pictures.models, ['zimage', 'flux']);
  assert.equal(pictures.headline, 'zimage scored highest · 90');
  const speedRow = list.find((entry) => entry.kind === 'speed');
  assert.equal(speedRow.headline, 'Standard · 54 tokens a second');
  assert.deepEqual(speedRow.models, ['qwen3:8b']);
});

test('a failed Lab attempt and a Lab test from a newer RigMatch both stay in the list', () => {
  const list = buildTestList(everything);
  const failed = list.find((entry) => entry.kind === 'listening');
  assert.equal(failed.headline, 'Did not finish');
  const unknown = list.find((entry) => entry.models[0] === 'x');
  assert.equal(unknown.kind, 'lab');
  assert.equal(unknown.what, 'Lab test');
});

test('every stored record is reachable from some row: nothing is dropped', () => {
  const list = buildTestList(everything);
  const sources = list.map((entry) => entry.source);
  for (const report of reports) assert.ok(sources.some((source) => source.type === 'report' && source.reportId === report.id), report.id);
  for (const key of Object.keys(lab)) assert.ok(sources.some((source) => source.type === 'lab' && source.keys.includes(key)), key);
  for (const result of speed) assert.ok(sources.some((source) => source.type === 'speed' && source.id === result.id), result.id);
  // Each timeline entry is either under a report's row or a row of its own.
  const modelsListed = new Set(list.flatMap((entry) => entry.models));
  for (const model of Object.keys(history.runs)) assert.ok(modelsListed.has(model), model);
  assert.equal(new Set(list.map((entry) => entry.id)).size, list.length);
});

test('reads without writing: the inputs are untouched and the same list comes back', () => {
  deepFreeze(everything);
  const first = buildTestList(everything);
  const second = buildTestList(everything);
  assert.deepEqual(second, first);
});

test('records with no date sink to the end; equal times keep their order', () => {
  const list = buildTestList({
    lab: {
      a: { model: 'a', challenge: 'code', score: 1, grade: 'F', elapsedMs: 1, response: '', checks: [] },
      b: { model: 'b', challenge: 'code', score: 2, grade: 'F', elapsedMs: 1, response: '', checks: [], completedAt: '2026-10-01T00:00:00.000Z' },
      c: { model: 'c', challenge: 'code', score: 3, grade: 'F', elapsedMs: 1, response: '', checks: [], completedAt: '2026-10-01T00:00:00.000Z' },
    },
  });
  assert.deepEqual(list.map((entry) => entry.models[0]), ['b', 'c', 'a']);
  assert.equal(list[2].at, '');
});

test('a report with nobody in it is kept as a row rather than hidden', () => {
  const list = buildTestList({ reports: [{ id: 'e', completedAt: SHOW_AT, winner: '', questionCount: 0, results: [] }] });
  assert.equal(list.length, 1);
  assert.equal(list[0].headline, 'No results were kept');
});

test('no tests at all is an empty list, and nothing selects', () => {
  assert.deepEqual(buildTestList({}), []);
  assert.deepEqual(buildTestList({ reports: [], history: { version: 1, runs: {} }, scores: {}, lab: {}, speed: [] }), []);
  assert.equal(findTest([], 'report:x'), null);
});

test('selecting finds the row by id, and a cleared test falls back to the overview', () => {
  const list = buildTestList(everything);
  const show = list.find((entry) => entry.kind === 'show');
  assert.equal(findTest(list, show.id), show);
  assert.equal(findTest(list, null), null);
  assert.equal(findTest(list, 'report:gone'), null);
});

test('a blind show keeps its contestants back: their tests are not listed until the reveal', () => {
  const list = buildTestList(everything, { hide: ['Qwen3:8B', 'gemma3:4b'] });
  assert.ok(!list.some((entry) => entry.kind === 'show'));
  assert.ok(!list.some((entry) => entry.models.some((model) => model === 'qwen3:8b' || model === 'gemma3:4b')));
  assert.ok(list.some((entry) => entry.models.includes('yi:9b')));
});

test('old saved reports and speed history load unchanged, and the list shows them', () => {
  // What 0.9.x wrote: no suite name, no answers, extra fields from a later build.
  const stored = JSON.parse(JSON.stringify([
    ...reports,
    { id: 'old', completedAt: '2026-05-01T00:00:00.000Z', winner: 'a', questionCount: 3, results: [score('a', 70, '2026-05-01T00:00:00.000Z')], futureField: true },
    { nonsense: true },
  ]));
  const parsed = parseStoredReports(stored);
  assert.equal(parsed.length, reports.length + 1);
  assert.deepEqual(parsed.slice(0, reports.length), reports);
  assert.equal(parsed.at(-1).futureField, true);
  const rig = parseRigHistory(JSON.parse(JSON.stringify([...speed, { id: 'bad' }])));
  assert.deepEqual(rig, speed);
  const list = buildTestList({ reports: parsed, speed: rig });
  assert.equal(list.filter((entry) => entry.source.type === 'report').length, parsed.length);
  assert.equal(list.filter((entry) => entry.source.type === 'speed').length, 1);
});


test('a row says when in the regional format the rest of the app uses, and says so when the record has no date', () => {
  assert.equal(testWhen(SHOW_AT), formatHistoryTime(SHOW_AT));
  assert.equal(testWhen(''), 'Date not recorded');
});

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
// The code itself: neither its imports nor its comments say what it does.
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^import .*$/gm, '');

test('choosing a row only opens it: nothing the column or the detail is given runs a test', () => {
  const column = read('../src/components/TestListColumn.tsx');
  const detail = read('../src/components/TestDetail.tsx');
  for (const source of [column, detail]) {
    assert.doesNotMatch(code(source), /\b(request[A-Z]\w*|run[A-Z]\w*|onRun\w*|onRerun\w*|onTest\w*)\b/);
  }
  const app = read('../src/App.tsx');
  for (const tag of ['TestListColumn', 'TestDetail']) {
    const start = app.indexOf(`<${tag}\n`);
    assert.ok(start > 0, tag);
    // The saved results are passed in as data; what it is handed to call is what matters.
    const handlers = app.slice(start, app.indexOf('/>', start)).match(/^\s*on[A-Z]\w*=\{.*$/gm) ?? [];
    assert.ok(handlers.length >= 3, tag);
    for (const handler of handlers) {
      assert.doesNotMatch(handler, /request[A-Z]|\brun[A-Z]|rerun|Benchmark|ListTest/i, `${tag} is wired to something that runs`);
    }
  }
});

test('the column sits beside the screen from 1200px and slides over it below, behind a Tests button', () => {
  const css = read('../src/styles/testList.css');
  assert.match(css, /@media \(min-width: 1200px\)[\s\S]*grid-template-columns: 300px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 1199px\)[\s\S]*position: absolute/);
  // Hidden until opened below 1200px, so a squeezed screen is never the result.
  assert.match(css, /> \.test-list \{\s*display: none;/);
  const app = read('../src/App.tsx');
  assert.match(app, /className="test-list-toggle"[\s\S]{0,200}aria-expanded=\{testListOpen\}/);
});

test('the Results screen no longer lists the same tests twice: the Runs tab keeps to what is running', () => {
  const app = read('../src/App.tsx');
  assert.doesNotMatch(app, />Runs<\/button>/);
  assert.match(app, />Running now<\/button>/);
  const activity = read('../src/components/ActivityPanel.tsx');
  assert.match(activity, /!testsListed && runReports\.length > 0/);
  assert.match(activity, /\{!testsListed && \(\s*<article className="activity-card">\s*<div className="activity-card-head">\s*<History/);
});

test('with no tests the Results screen says so instead of crowning an untested pick', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /topMatch=\{testEntries\.length === 0 \? \(\s*<NoTestsYet/);
  const empty = read('../src/components/NoTestsYet.tsx');
  assert.doesNotMatch(code(empty), /Untested pick/);
  // One gold button in each branch, and never both on the screen.
  assert.equal((empty.match(/btn-gold/g) ?? []).length, 2);
  assert.match(empty, /\{installed \? \(/);
});
