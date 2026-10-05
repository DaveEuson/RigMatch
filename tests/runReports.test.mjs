// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  addRunReport, makeReportId, hasTranscripts, reportsWithoutTranscripts,
  reportStorageCandidates, parseStoredReports, describeReport, MAX_STORED_REPORTS, REPORTS_WITH_ANSWERS,
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

// Fifteen reports, newest first, a minute apart.
const many = (count) => Array.from({ length: count }, (_, i) => at(new Date(Date.parse('2026-09-30T10:00:00.000Z') - i * 60_000).toISOString()));

test('the first thing sacrificed is the answers on older runs', () => {
  const first = reportStorageCandidates(many(15))[0]();
  assert.equal(first.length, 15, 'every test stays in the list');
  assert.ok(first.slice(0, REPORTS_WITH_ANSWERS).every(hasTranscripts), 'the newest keep their answers');
  assert.ok(!first.slice(REPORTS_WITH_ANSWERS).some(hasTranscripts), 'older ones keep only their scores');
  const tighter = reportStorageCandidates(many(15))[1]();
  assert.equal(tighter.filter(hasTranscripts).length, 3);
});

test('the last rung is a short list of bare scores', () => {
  const last = reportStorageCandidates(many(15)).at(-1)();
  assert.equal(last.length, 10);
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

test('a half-written entry is dropped and its neighbors survive', () => {
  const good = at('2026-09-01T10:00:00.000Z');
  const parsed = parseStoredReports([good, { id: 'x' }, { completedAt: 'y', results: [] }]);
  assert.deepEqual(parsed.map((entry) => entry.id), [good.id]);
});

test('the row says what the run was in one line', () => {
  assert.equal(describeReport(report()), '2 models · a:7b won, 10 questions each');
});

test('a test of one model is described as that model and its score', () => {
  const one = { ...report(), results: [{ model: 'a:7b', total: 90, preciseTotal: 90.4, grade: 'A' }], questionCount: 1 };
  assert.equal(describeReport(one), 'a:7b · 90.4 A · 1 question');
});
