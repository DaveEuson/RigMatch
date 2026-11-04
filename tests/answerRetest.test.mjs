// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { answerNote } from '../src/lib/answerRetest.ts';
import { replaceRunInReports } from '../src/lib/runReports.ts';

const answer = (fields = {}) => ({
  id: 'q1', label: 'Q1', type: 'assistant', prompt: 'Ask', elapsedMs: 1000, tokensPerSecond: 40,
  sobrietyScore: 80, scoredBy: 'heuristic', response: 'Answer', doneReason: 'stop', status: 'ok',
  countedRuns: 3, stableRuns: 3, ...fields,
});

test('a clean answer has nothing to explain', () => {
  assert.equal(answerNote(answer()), null);
});

test('only an answer the PC broke offers "Test this question again"', () => {
  const timedOut = answerNote(answer({ type: 'drawing', doneReason: 'timeout', status: 'no-response', timedOut: true, countedRuns: 0, stableRuns: 0 }));
  assert.equal(timedOut.retestable, true);
  assert.match(timedOut.text, /Ran out of time/);
  assert.match(timedOut.text, /graphics card/);

  // Cut off at the token limit: explained, and no button, because with a
  // fixed seed asking again gives the same answer. Not "temperature 0": a run
  // with each model's own settings is asked at the model's temperature.
  const cutOff = answerNote(answer({ doneReason: 'length', status: 'truncated', stableRuns: 0 }));
  assert.equal(cutOff.retestable, false);
  assert.match(cutOff.text, /token limit/);
  assert.match(cutOff.text, /fixed seed/);
  assert.doesNotMatch(cutOff.text, /temperature 0/);
});

test('a test saved before 0.11.0 says why it cannot be asked again', () => {
  const old = answerNote({ ...answer({ doneReason: 'timeout', status: 'no-response', timedOut: true }), countedRuns: undefined });
  assert.equal(old.retestable, false);
  assert.match(old.text, /saved before/);
});

test('an answer asked twice during the run, or again afterwards, says so', () => {
  assert.match(answerNote(answer({ retriedAfter: 'connection lost' })).text, /first try lost the connection/);
  assert.match(answerNote(answer({ retriedAfter: 'timed out' })).text, /first try timed out/);
  const retested = answerNote(answer({ retest: { at: '2026-11-03T20:00:00.000Z', firstTry: { status: 'no-response', doneReason: 'timeout', timedOut: true } } }));
  assert.equal(retested.retestable, false);
  assert.match(retested.text, /Asked again on .+\. The first try ran out of time\./);
});

test('a retested run replaces only that run in the saved reports, and the ranking follows', () => {
  const run = (model, total, completedAt = '2026-11-03T10:00:00.000Z') => ({ model, completedAt, scores: { total }, prompts: [] });
  const score = (model, total) => ({ model, total, completedAt: '2026-11-03T10:00:00.000Z' });
  const reports = [
    { id: 'show', completedAt: 'x', winner: 'a:1b', questionCount: 10, results: [score('a:1b', 90), score('b:8b', 80)], transcripts: { 'a:1b': run('a:1b', 90), 'b:8b': run('b:8b', 80) } },
    // The same model's later run, in another report: not the run that was retested.
    { id: 'later', completedAt: 'y', winner: 'b:8b', questionCount: 10, results: [score('b:8b', 70)], transcripts: { 'b:8b': run('b:8b', 70, '2026-11-03T12:00:00.000Z') } },
    { id: 'old', completedAt: 'z', winner: 'b:8b', questionCount: 10, results: [score('b:8b', 60)] },
  ];
  const retested = run('b:8b', 95);
  const rank = (results) => [...results].sort((x, y) => y.total - x.total);
  const next = replaceRunInReports(reports, retested, (result, entry) => ({ ...entry, total: result.scores.total }), rank);

  assert.equal(next[0].transcripts['b:8b'], retested);
  assert.deepEqual(next[0].results.map((entry) => [entry.model, entry.total]), [['b:8b', 95], ['a:1b', 90]]);
  assert.equal(next[0].winner, 'b:8b', 'the retest changed who won, and the report says so');
  assert.equal(next[1], reports[1], 'a later run of the same model is left alone');
  assert.equal(next[2], reports[2], 'a report without answers is left alone');
});
