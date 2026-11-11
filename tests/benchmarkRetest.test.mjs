// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transientFailure, canRetest, mergeRetest } = require('../electron/benchmarkRetest.cjs');
const { totalsFromPrompts, gradeFor } = require('../electron/benchmarkTotals.cjs');

const answer = (id, fields = {}) => ({
  id,
  label: id,
  type: 'assistant',
  prompt: `Question ${id}`,
  elapsedMs: 2000,
  tokensPerSecond: 40,
  sobrietyScore: 80,
  scoredBy: 'heuristic',
  response: 'An answer.',
  doneReason: 'stop',
  status: 'ok',
  diagnostic: '',
  countedRuns: 3,
  stableRuns: 3,
  ...fields,
});

const timedOutDrawing = answer('drawing_1', {
  type: 'drawing', tokensPerSecond: 0, sobrietyScore: 0, scoredBy: 'unjudged', response: '',
  doneReason: 'timeout', status: 'no-response', diagnostic: 'ran out of time', countedRuns: 0, stableRuns: 0, timedOut: true,
});

test('an answer only the PC broke can be asked again', () => {
  assert.equal(canRetest(timedOutDrawing), true, 'a drawing that ran out of time');
  // Cut off at the token limit: at temperature 0 it would come back the same.
  assert.equal(canRetest(answer('a', { doneReason: 'length', status: 'truncated', stableRuns: 0 })), false);
  assert.equal(canRetest(answer('a')), false, 'a clean answer');
  // Saved before answers carried their reliability counts: no exact re-score, so no retest.
  const { countedRuns, stableRuns, ...old } = timedOutDrawing;
  assert.equal(canRetest(old), false);
  assert.equal(canRetest(null), false);
});

test('an answer saved without its question, when storage ran low, cannot be asked again', async () => {
  // The history save's storage-full rung keeps timedOut and countedRuns and empties the text.
  const { dropTranscripts } = await import('../src/lib/safeStorage.ts');
  const [trimmed] = dropTranscripts({ benchmarkByModel: { 'qwen3:8b': { prompts: [timedOutDrawing] } } }).benchmarkByModel['qwen3:8b'].prompts;
  assert.equal(trimmed.timedOut, true);
  assert.equal(trimmed.countedRuns, 0);
  assert.equal(canRetest(trimmed), false, 'an empty question would be asked as the whole default test');
  assert.equal(canRetest({ ...timedOutDrawing, prompt: '   ' }), false);
  assert.equal(canRetest(timedOutDrawing), true);
});

test('the main process refuses a retest with no question text, and never asks the default set in its place', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
  const between = (from, to) => main.slice(main.indexOf(from), main.indexOf(to, main.indexOf(from)));
  const retest = between('async function retestBenchmarkPrompt(', '\n}\n');
  const refused = retest.indexOf("if (!String(firstTry.prompt ?? '').trim()) {");
  assert.ok(refused > 0, 'the saved question is checked');
  assert.ok(refused < retest.indexOf('await runBenchmark('), 'before anything runs');
  assert.match(retest.slice(refused), /^[^\n]*\n\s*throw new Error\('[^']*storage was nearly full/);
  // And the run itself, which a retest request can reach without going through the check above.
  const inner = between('async function runBenchmarkInner(', 'const progressId = ');
  const guard = inner.indexOf("if (request.retestPrompt && !String(request.retestPrompt.prompt ?? '').trim()) {");
  assert.ok(guard > 0 && guard < inner.indexOf('normalizeBenchmarkQuestions([request.retestPrompt])'), 'refused before the question is turned into a plan');
  assert.match(inner.slice(guard), /^[^\n]*\n\s*throw new Error\(/);
});

test('a retested answer is scored back in exactly as a clean run would be', () => {
  const fit = 100;
  const others = [answer('q1'), answer('q2', { tokensPerSecond: 60, sobrietyScore: 90 }), answer('q3', { stableRuns: 2 })];
  const first = totalsFromPrompts([...others, timedOutDrawing], fit);
  const previous = { model: 'qwen3:8b', baseUrl: 'http://127.0.0.1:11434', completedAt: 'x', prompts: [...others, timedOutDrawing], scores: first.scores };

  const drawn = answer('drawing_1', { type: 'drawing', tokensPerSecond: 50, sobrietyScore: 70, scoredBy: 'judge', response: '<svg/>', countedRuns: 1, stableRuns: 1 });
  const merged = mergeRetest(previous, drawn, { at: '2026-11-03T20:00:00.000Z' });
  const clean = totalsFromPrompts([...others, drawn], fit);

  assert.deepEqual(merged.scores, clean.scores, 'the same scores as a run where the drawing never timed out');
  assert.equal(merged.avgTokensPerSecond, clean.avgTokensPerSecond);
  assert.equal(merged.prompts.length, 4);
  assert.equal(merged.prompts[3].response, '<svg/>');
  // The first try is kept beside the new answer.
  assert.deepEqual(merged.prompts[3].retest, {
    at: '2026-11-03T20:00:00.000Z',
    firstTry: { status: 'no-response', doneReason: 'timeout', diagnostic: 'ran out of time', timedOut: true },
  });
  // The run's own Fit stays, and nothing else moved.
  assert.equal(merged.scores.fit, 100);
  assert.deepEqual(merged.prompts.slice(0, 3), others);
  assert.equal(merged.model, 'qwen3:8b');
  assert.throws(() => mergeRetest(previous, answer('nope')), /not in this run/);
});

test('totals read reliability from each answer\'s own counts', () => {
  // 3 + 3 + 2 stable of 9 counted runs; the timed-out drawing counts in neither.
  const totals = totalsFromPrompts([answer('q1'), answer('q2'), answer('q3', { stableRuns: 2 }), timedOutDrawing], 100);
  assert.equal(totals.scores.stability, Math.round((8 / 9) * 100));
  // Answers nothing could mark stay out of the quality average.
  assert.equal(totals.scores.sobriety, 80);
  assert.equal(totals.unmarkedCount, 1);
  // An empty drawing stays out of speed: 40 tok/s, not dragged toward 0.
  assert.equal(totals.avgTokensPerSecond, 40);
  assert.equal(totals.scores.grade, gradeFor(totals.scores.total));
});

test('only a failure on the PC\'s side is asked again on its own', () => {
  assert.equal(transientFailure(new Error('http://127.0.0.1:11434 accepted the request but did not finish within 120s. The service is reachable')), 'timed out');
  assert.equal(transientFailure(new Error('Cannot reach local AI service at http://127.0.0.1:11434. Make sure Ollama')), 'connection lost');
  assert.equal(transientFailure(new Error('500 Internal Server Error from Ollama: llama runner process has terminated')), 'connection lost');
  assert.equal(transientFailure(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })), 'connection lost');
  // Never these: Stop, a refusal, a model too big for the PC.
  assert.equal(transientFailure(Object.assign(new Error('Request stopped'), { name: 'AbortError' })), null);
  assert.equal(transientFailure(new Error('Benchmark stopped by user')), null);
  assert.equal(transientFailure(new Error('404 Not Found from Ollama: model "x" not found')), null);
  assert.equal(transientFailure(new Error('500 Internal Server Error from Ollama: model requires more system memory (12 GiB) than is available')), null);
  assert.equal(transientFailure(undefined), null);
});

test('asked a third time, the first try is still the run\'s own', () => {
  const first = answer('draw', { type: 'drawing', status: 'no-response', doneReason: 'timeout', timedOut: true, diagnostic: 'the run' });
  const previous = { model: 'm', completedAt: 'x', prompts: [first], scores: { fit: 100 } };
  const again = answer('draw', { type: 'drawing', status: 'no-response', doneReason: 'timeout', timedOut: true, diagnostic: 'second' });
  const twice = mergeRetest(previous, again, { at: '2026-11-03T20:00:00.000Z' });
  const third = mergeRetest(twice, answer('draw', { type: 'drawing' }), { at: '2026-11-03T21:00:00.000Z' });
  assert.equal(third.prompts[0].retest.firstTry.diagnostic, 'the run');
  assert.equal(third.prompts[0].retest.at, '2026-11-03T21:00:00.000Z');
});
