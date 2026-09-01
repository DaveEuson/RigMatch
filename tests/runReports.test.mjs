// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  addRunReport, makeReportId, hasTranscripts, reportsWithoutTranscripts,
  reportStorageCandidates, parseStoredReports, describeReport, MAX_STORED_REPORTS,
} = await import('../src/lib/runReports.ts');

/**
 * Nothing recorded a comparison as a thing that happened. RunHistory is keyed
 * per model, so it knows qwen scored 92 on Tuesday and not that two other
 * models sat the same exam beside it; benchmarkByModel keeps only the most
 * recent result per model, so a second comparison erases the first one's
 * answers.
 */

const report = (over = {}) => ({
  id: makeReportId(over.completedAt ?? '2026-09-01T10:00:00.000Z', over.winner ?? 'a:7b'),
  completedAt: '2026-09-01T10:00:00.000Z',
  winner: 'a:7b',
  results: [{ model: 'a:7b', total: 90, grade: 'A' }, { model: 'b:7b', total: 80, grade: 'B' }],
  questionCount: 10,
  transcripts: { 'a:7b': [{ id: 'q1' }], 'b:7b': [{ id: 'q1' }] },
  ...over,
});

const at = (iso, winner = 'a:7b') => report({ completedAt: iso, winner, id: makeReportId(iso, winner) });

test('the newest run is first', () => {
  const list = addRunReport([at('2026-08-30T10:00:00.000Z')], at('2026-09-01T10:00:00.000Z'));
  assert.equal(list[0].completedAt, '2026-09-01T10:00:00.000Z');
});

test('re-saving one run replaces it rather than stacking', () => {
  // A rerender or a restored session must not turn one comparison into three
  // rows in the list.
  const once = addRunReport([], at('2026-09-01T10:00:00.000Z'));
  const twice = addRunReport(once, at('2026-09-01T10:00:00.000Z'));
  assert.equal(twice.length, 1);
});

test('two runs that finished at the same instant with different winners are both kept', () => {
  const a = addRunReport([], at('2026-09-01T10:00:00.000Z', 'a:7b'));
  const b = addRunReport(a, at('2026-09-01T10:00:00.000Z', 'b:7b'));
  assert.equal(b.length, 2);
});

test('the store is capped, oldest dropped', () => {
  let list = [];
  for (let i = 0; i < MAX_STORED_REPORTS + 3; i += 1) {
    list = addRunReport(list, at(`2026-09-0${(i % 9) + 1}T1${i}:00:00.000Z`, `m${i}:7b`));
  }
  assert.equal(list.length, MAX_STORED_REPORTS);
});

// --- fitting in the browser's storage ---------------------------------------

test('the ladder keeps the reports even when it cannot keep the answers', () => {
  // The list is what the reader came for. Every rung still returns every
  // report; only the transcripts go.
  const reports = [at('2026-09-01T10:00:00.000Z'), at('2026-08-31T10:00:00.000Z')];
  const rungs = reportStorageCandidates(reports).map((build) => build());
  for (const rung of rungs.slice(0, 3)) assert.equal(rung.length, 2);
});

test('the first thing sacrificed is the answers on older runs', () => {
  const reports = [at('2026-09-01T10:00:00.000Z'), at('2026-08-31T10:00:00.000Z')];
  const second = reportStorageCandidates(reports)[1]();
  assert.ok(hasTranscripts(second[0]), 'newest keeps its answers');
  assert.ok(!hasTranscripts(second[1]), 'older loses them first');
});

test('the last rung is a short list of bare scores', () => {
  const reports = [at('2026-09-03T10:00:00.000Z'), at('2026-09-02T10:00:00.000Z'), at('2026-09-01T10:00:00.000Z')];
  const last = reportStorageCandidates(reports).at(-1)();
  assert.equal(last.length, 2);
  assert.ok(last.every((entry) => !hasTranscripts(entry)));
});

test('dropping answers never drops a score', () => {
  const stripped = reportsWithoutTranscripts([at('2026-09-01T10:00:00.000Z')], 0);
  assert.deepEqual(stripped[0].results, report().results);
  assert.equal(stripped[0].winner, 'a:7b');
});

test('a report whose answers were dropped says so rather than looking empty', () => {
  assert.equal(hasTranscripts(report()), true);
  assert.equal(hasTranscripts({ ...report(), transcripts: undefined }), false);
  assert.equal(hasTranscripts({ ...report(), transcripts: {} }), false);
});

// --- reading back what was stored -------------------------------------------

test('corrupt storage reads as no reports, not as a crash', () => {
  assert.deepEqual(parseStoredReports(null), []);
  assert.deepEqual(parseStoredReports('nonsense'), []);
  assert.deepEqual(parseStoredReports({}), []);
  assert.deepEqual(parseStoredReports([null, 42, 'x']), []);
});

test('a half-written entry is dropped and its neighbours survive', () => {
  const good = at('2026-09-01T10:00:00.000Z');
  const parsed = parseStoredReports([good, { id: 'x' }, { completedAt: 'y', results: [] }]);
  assert.deepEqual(parsed.map((entry) => entry.id), [good.id]);
});

test('the row says what the run was in one line', () => {
  assert.equal(describeReport(report()), '2 models · a:7b won, 10 questions each');
});

test('a single-model run is not described in the plural', () => {
  const one = { ...report(), results: [{ model: 'a:7b', total: 90, grade: 'A' }], questionCount: 1 };
  assert.equal(describeReport(one), '1 model · a:7b won, 1 question each');
});
