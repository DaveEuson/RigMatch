import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { keepValidEntries, isTestedModelScore, removeListTestScores } = await import('../src/lib/modelCatalog.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

const score = (model, total, extra = {}) => ({
  model, total, grade: 'A', speed: 90, sobriety: 90, fit: 90, completedAt: '2026-10-12T00:00:00Z', ...extra,
});

test('one bad saved score no longer discards the good ones', () => {
  const saved = { a: score('a', 90), b: { model: 'b', total: 'not a number' }, c: score('c', 80) };
  const kept = keepValidEntries(saved, isTestedModelScore);
  assert.deepEqual(Object.keys(kept), ['a', 'c']);
  assert.equal(keepValidEntries('nope', isTestedModelScore), null);
  assert.equal(keepValidEntries(null, isTestedModelScore), null);
  assert.deepEqual(keepValidEntries({}, isTestedModelScore), {});
});

test('removing a model from the last show keeps the order the board shows, and its failures', () => {
  const show = {
    winner: 'a',
    results: [score('a', 88, { preciseTotal: 87.5 }), score('b', 88, { preciseTotal: 87.6 }), score('c', 70)],
    failures: [{ model: 'd', reason: 'timed out' }],
  };
  const after = removeListTestScores(show, ['c']);
  assert.equal(after.winner, 'b', '87.6 ranks above 87.5, as the board shows it');
  assert.deepEqual(after.results.map((r) => r.model), ['b', 'a']);
  assert.deepEqual(after.failures, [{ model: 'd', reason: 'timed out' }]);
  assert.equal(removeListTestScores(show, ['a', 'b', 'c']), null);
});

test('loading history keeps entries one by one, and a deleted model leaves the last show', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /const keptScores = keepValidEntries\(parsed\.modelScores, isTestedModelScore\);/);
  assert.match(app, /Array\.isArray\(result\.prompts\) \? result : \{ \.\.\.result, prompts: \[\] \}/);
  assert.match(app, /setListTestResult\(\(current\) => removeListTestScores\(current, aliases\)\);\n\s*const nextModel/);
});

test('Clear all data also empties what was held in memory', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /setRunReports\(\[\]\);\n\s*refreshLabResults\(\);\n\s*resetAchievementsInMemory\(\);/);
});
