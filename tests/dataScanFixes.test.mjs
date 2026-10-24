// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEmptyBenchmark, getModelScore, isPlaceholderBenchmark } from '../src/lib/modelCatalog.ts';
import { restoreSavedScores } from '../src/lib/savedHistory.ts';
import { dropChat, dropTranscripts, historySaveNote } from '../src/lib/safeStorage.ts';
import { removeModelFromReports, reportRows } from '../src/lib/runReports.ts';
import { resultsOfShow } from '../src/lib/labResults.ts';
import { codeJudgeFor } from '../src/lib/labJudge.ts';
import { describeRunError } from '../src/lib/format.ts';

/**
 * Scores and saved data from the 2026-10-18 bug scan: what clearing leaves
 * behind, and what a restart brings back.
 */

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

const realResult = (model, total = 82) => ({
  model,
  baseUrl: 'http://127.0.0.1:11434',
  questionCount: 2,
  completedAt: '2026-10-18T10:00:00.000Z',
  elapsedMs: 41_000,
  prompts: [{ id: 'q1', prompt: 'Hi', response: 'Hello', score: 90 }, { id: 'q2', prompt: '2+2', response: '4', score: 74 }],
  scores: { speed: 70, sobriety: 85, stability: 80, fit: 90, total, grade: 'B' },
});

test('after Clear all scores and a restart there is no 0.0 / N/A score', () => {
  // What App saved after "Clear all scores" (or "Clear all data"): the empty
  // stand-in benchmark, and nothing else.
  const saved = roundTrip({
    benchmark: createEmptyBenchmark('qwen2.5:7b', 'http://127.0.0.1:11434'),
    benchmarkByModel: {},
    listTestResult: null,
    modelScores: {},
    chatMessagesByModel: {},
    selectedModel: 'qwen2.5:7b',
    savedAt: '2026-10-18T10:00:00.000Z',
  });
  assert.equal(restoreSavedScores(saved), null, 'nothing to restore');
  // The fallback rungs the history write takes when storage is full.
  assert.equal(restoreSavedScores(roundTrip(dropTranscripts(dropChat(saved)))), null);
  // A save from before this fix that already carried the stand-in per model.
  assert.equal(restoreSavedScores({ ...saved, benchmarkByModel: { 'qwen2.5:7b': saved.benchmark } }), null);
});

test('a real result still restores, and a stand-in beside it is left out', () => {
  const placeholder = createEmptyBenchmark('qwen2.5:7b', 'http://127.0.0.1:11434');
  assert.equal(isPlaceholderBenchmark(placeholder), true);
  assert.equal(isPlaceholderBenchmark(realResult('yi:9b')), false);
  // Answer text dropped for space keeps the questions, so it is still a result.
  assert.equal(isPlaceholderBenchmark(dropTranscripts({ benchmarkByModel: { y: realResult('yi:9b') } }).benchmarkByModel.y), false);

  const restored = restoreSavedScores(roundTrip({
    benchmark: placeholder,
    benchmarkByModel: { 'yi:9b': realResult('yi:9b'), 'qwen2.5:7b': placeholder },
    modelScores: {},
  }));
  assert.ok(restored);
  assert.equal(restored.benchmark, null);
  assert.deepEqual(Object.keys(restored.benchmarkByModel), ['yi:9b']);
  assert.deepEqual(Object.keys(restored.modelScores), ['yi:9b']);
  assert.equal(restored.modelScores['yi:9b'].total, 82);
});

test('the stand-in is not written to the saved history at all', () => {
  assert.match(app, /benchmark: benchmark && isPlaceholderBenchmark\(benchmark\) \? null : benchmark,/);
  assert.match(app, /const scores = restoreSavedScores\(parsed\);/);
});

const report = (id, winner, models, withAnswers = true) => ({
  id,
  completedAt: '2026-10-18T10:00:00.000Z',
  winner,
  results: models.map((model, index) => ({ model, total: 90 - index * 5, grade: 'A' })),
  questionCount: 10,
  transcripts: withAnswers ? Object.fromEntries(models.map((model) => [model, realResult(model)])) : undefined,
});

test('Clear score takes the model out of every report, answers included', () => {
  const reports = [
    report('r1', 'qwen2.5:7b', ['qwen2.5:7b', 'yi:9b', 'gemma3:4b']),
    report('r2', 'yi:9b', ['yi:9b']),
    report('r3', 'qwen2.5:7b', ['qwen2.5:7b']),
  ];
  const next = removeModelFromReports(reports, ['qwen2.5:7b', 'qwen2.5']);
  assert.deepEqual(next.map((r) => r.id), ['r1', 'r2'], 'a report left with nobody goes');
  assert.deepEqual(next[0].results.map((r) => r.model), ['yi:9b', 'gemma3:4b']);
  assert.deepEqual(Object.keys(next[0].transcripts), ['yi:9b', 'gemma3:4b']);
  assert.equal(next[0].winner, 'yi:9b', 'the next in the ranking heads it');
  assert.equal(next[1], reports[1], 'a report it was not in is untouched');
  assert.equal(removeModelFromReports(reports, ['mistral:7b']), reports, 'nothing to clear, same list');
});

test('an untested model does not take another tag\'s score through a dash', () => {
  const scoreOf = (model, total) => ({ [model]: { model, total, grade: 'A' } });
  const row = (displayName) => ({ displayName, name: displayName.split(':')[0], tag: displayName.split(':')[1] });
  // Different weights: quantization-aware training, another quant, another release.
  assert.equal(getModelScore(row('gemma3:4b-it-qat'), scoreOf('gemma3:4b', 81)), undefined);
  assert.equal(getModelScore(row('gemma3:4b'), scoreOf('gemma3:4b-it-qat', 81)), undefined);
  assert.equal(getModelScore(row('qwen2.5:7b-instruct-q8_0'), scoreOf('qwen2.5:7b', 70)), undefined);
  assert.equal(getModelScore(row('llama3.1:8b-text'), scoreOf('llama3.1:8b', 70)), undefined);
  // The same weights under the words Ollama adds.
  assert.equal(getModelScore(row('qwen2.5:7b'), scoreOf('qwen2.5:7b-instruct', 90))?.total, 90);
  assert.equal(getModelScore(row('gemma3:4b-it-q4_K_M'), scoreOf('gemma3:4b', 77))?.total, 77);
  assert.equal(getModelScore(row('mistral:7b'), scoreOf('mistral:7b-instruct-q4_0', 66))?.total, 66);
});

test('Clear all scores empties the reports, and the empty list is written', () => {
  const start = app.indexOf('const confirmClearScores = useCallback(');
  const body = app.slice(start, app.indexOf('\n  }, [', start));
  const all = body.slice(0, body.indexOf("return;\n    }"));
  assert.match(all, /setRunReports\(\[\]\);\s*writeLocalJson\(RUN_REPORTS_STORAGE_KEY, \[\]\);/);
  assert.match(body, /setRunReports\(\(current\) => \{\s*const next = removeModelFromReports\(current, aliases\);/);
});

test('a failed Simple skill round is not ranked on a model\'s old result', () => {
  const lab = (model, completedAt, score = 80) => ({ model, challenge: 'image-recognition', score, grade: 'B', elapsedMs: 1, response: '', checks: [], completedAt });
  const results = {
    'vision:old:7b': lab('old:7b', '2026-10-01T09:00:00.000Z', 99),
    'vision:new:7b': lab('new:7b', '2026-10-18T12:05:00.000Z', 60),
    'vision:other:7b': lab('other:7b', '2026-10-18T12:06:00.000Z'),
  };
  const picked = new Set(['old:7b', 'new:7b']);
  assert.deepEqual(resultsOfShow(results, picked, '2026-10-18T12:00:00.000Z').map((r) => r.model), ['new:7b'],
    'old:7b failed this round; its 99 from another day does not stand in');
  assert.deepEqual(resultsOfShow(results, picked, null).map((r) => r.model), ['old:7b', 'new:7b'], 'no show this session: every saved one');
  assert.match(app, /const mine = resultsOfShow\(labResults, picked, simpleShowStartedAt\);/);
  const start = app.indexOf('const startSimpleShow = useCallback(');
  assert.ok(app.indexOf('setSimpleShowStartedAt(new Date().toISOString());', start) < app.indexOf('void runListTest()', start));
});

test('the Code challenge gets an automatic judge while judging is off, never the contestant', () => {
  const options = { chosen: false, candidates: ['big:14b', 'small:3b'], baseUrlOf: () => 'http://127.0.0.1:11434' };
  assert.equal(codeJudgeFor('small:3b', null, ['big:14b', 'small:3b'], options)?.model, 'big:14b');
  assert.equal(codeJudgeFor('big:14b', null, ['big:14b', 'small:3b'], options)?.model, 'small:3b', 'steps aside for itself');
  assert.equal(codeJudgeFor('big:14b', null, ['big:14b'], { ...options, candidates: ['big:14b'] }), null, 'nobody else to mark it');
  assert.equal(codeJudgeFor('big:14b', null, [], options), null);
  const chosen = { provider: 'local', model: 'big:14b' };
  assert.equal(codeJudgeFor('big:14b', chosen, [], { ...options, chosen: true })?.model, 'big:14b', 'a judge the person chose stays theirs');
  assert.match(app, /const codeJudge = codeSkillJudgeFor\(job\.model\);\s*if \(!codeJudge\) \{/);
});

test('Share after a skill round shares the winner or nothing', () => {
  const start = app.indexOf('const shareTarget = useMemo(');
  const body = app.slice(start, app.indexOf('\n  }, [', start));
  assert.ok(body.indexOf('if (wizardWinner) return null;') < body.indexOf('topRigPick?.score'),
    'a winner without a Match score never falls back to another model');
  assert.match(app, /onShareScore=\{shareTarget \? \(\) => setShareWinnerOpen\(true\) : undefined\}/);
  const wizard = readFileSync(new URL('../src/components/SimpleWizard.tsx', import.meta.url), 'utf-8');
  assert.match(wizard, /\{onShareScore && <button type="button" className="btn btn-link" onClick=\{onShareScore\}>Share<\/button>\}/);
});

test('a reopened report keeps models no longer listed, and its own answers only', () => {
  const rows = [{ displayName: 'yi:9b', installed: true }];
  const shown = reportRows([{ model: 'lmstudio/qwen3-8b' }, { model: 'yi:9b' }], rows);
  assert.deepEqual(shown.map((row) => row.displayName), ['lmstudio/qwen3-8b', 'yi:9b']);
  assert.equal(shown[1], rows[0]);
  assert.equal(shown[0].installed, false);
  assert.match(app, /const rows = stored \? reportRows\(result\.results, modelRows\) : shortlistedRows;/);
  assert.match(app, /const benchmarks = stored \? \(stored\.transcripts \?\? \{\}\) : benchmarkByModel;/);
});

test('"Report ready" opens the report that was saved, by id', () => {
  assert.match(app, /setReadyReportId\(saveTestReport\(results, winner\.model, runBalance\) \?\? null\);/);
  // Opening it also retires the notice, so it is gone whatever happens next.
  assert.match(app, /onClick=\{\(\) => \{ setOpenReportId\(readyReportId\); setReportOpen\(true\); setReportReady\(false\); \}\}>\s*See the report/);
});

test('the MLX message is for Ollama failing to load an MLX model, off a Mac', () => {
  assert.match(describeRunError('llama runner failed: mlx not supported', false), /Apple Silicon/i);
  assert.match(describeRunError('this model requires MLX', false), /Apple Silicon/i);
  assert.equal(describeRunError('llama runner failed: mlx not supported', true), 'llama runner failed: mlx not supported',
    'on a Mac it is not a Windows or Linux problem');
  const named = 'Could not reach mlx-community/Qwen3-8B-4bit: model is unsupported by this endpoint';
  assert.doesNotMatch(describeRunError(named, false), /Apple Silicon/i, 'a model name is not the error');
  assert.doesNotMatch(describeRunError('the judge said "mlx" once', false), /Apple Silicon/i);
});

test('a history save that fails at every rung tells the user, once', () => {
  assert.match(historySaveNote(-1), /could not save your scores/);
  assert.equal(historySaveNote(0), null);
  assert.match(historySaveNote(1), /some saved answer text was dropped/);
  assert.match(historySaveNote(3), /not enough browser storage left for the answer transcripts/);
  assert.match(app, /if \(!historySaveFailedRef\.current && note\) tellUser\(note\);/);
});
