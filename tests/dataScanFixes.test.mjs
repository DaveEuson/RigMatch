// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEmptyBenchmark, isPlaceholderBenchmark } from '../src/lib/modelCatalog.ts';
import { restoreSavedScores } from '../src/lib/savedHistory.ts';
import { dropChat, dropTranscripts } from '../src/lib/safeStorage.ts';
import { removeModelFromReports } from '../src/lib/runReports.ts';

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

test('Clear all scores empties the reports, and the empty list is written', () => {
  const start = app.indexOf('const confirmClearScores = useCallback(');
  const body = app.slice(start, app.indexOf('\n  }, [', start));
  const all = body.slice(0, body.indexOf("return;\n    }"));
  assert.match(all, /setRunReports\(\[\]\);\s*writeLocalJson\(RUN_REPORTS_STORAGE_KEY, \[\]\);/);
  assert.match(body, /setRunReports\(\(current\) => \{\s*const next = removeModelFromReports\(current, aliases\);/);
});
