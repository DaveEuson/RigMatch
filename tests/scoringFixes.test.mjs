// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const app = read('../src/App.tsx');
/** Whether App.tsx carries a line; a failing match must not print the whole file. */
const has = (pattern) => pattern.test(app);

const { labWinner, rankMatchResults } = await import('../src/lib/channelWinners.ts');
const { labJudgeFor } = await import('../src/lib/labJudge.ts');
const { BALANCED } = await import('../src/lib/balance.ts');
const { compareBenchmarkResults, toTestedModelScore } = await import('../src/lib/scoring.ts');

/**
 * Three scoring findings from the 0.9.7 bug scan: the show's winner ignored
 * the Balance fader, an automatically picked judge could mark its own answers
 * in the question round, and the per-channel Top Match ranked results that
 * were never given the same prompt or picture.
 */

const benchmarkResult = (model, scores) => ({
  model,
  completedAt: '2026-10-12T10:00:00.000Z',
  questionCount: 2,
  avgTokensPerSecond: scores.speed,
  prompts: [],
  scores: { total: 50, grade: 'D', stability: 80, fit: 80, ...scores },
});

test('the show is crowned at the fader it ran at, not at Balanced', () => {
  // The careful model wins at Balanced; the quick one wins once speed counts.
  const results = [
    benchmarkResult('careful:7b', { sobriety: 95, speed: 60 }),
    benchmarkResult('quick:1b', { sobriety: 60, speed: 95 }),
  ];
  const balancedWinner = results.reduce((best, result) => (compareBenchmarkResults(result, best) < 0 ? result : best));
  assert.equal(balancedWinner.model, 'careful:7b');
  const atSpeed = rankMatchResults(results.map((result) => toTestedModelScore(result)), 0);
  assert.equal(atSpeed[0].model, 'quick:1b', 'the Top Match at a speed fader names the quick one');
  assert.equal(rankMatchResults(results.map((result) => toTestedModelScore(result)), BALANCED)[0].model, 'careful:7b');

  // So the finish ranks at the run's fader instead of reducing at Balanced.
  assert.equal(has(/const winner = results\.reduce\(\(best, result\) =>\s*compareBenchmarkResults\(result, best\) < 0 \? result : best,?\s*\);/), false,
    'the show still crowns whoever leads at Balanced');
  assert.equal(has(/const ranked = rankMatchResults\(results\.map\(\(r\) => toTestedModelScore\(r, currentSuiteName\)\), runBalance\);/), true);
  assert.equal(has(/const winner = results\.find\(\(result\) => result\.model === ranked\[0\]\.model\) \?\? results\[0\];/), true);
  // The report, the report bar and History's "last show" rank at the fader too.
  assert.equal(has(/: rankMatchResults\(listTestResult\.results, balances\[runChannel\]\)/), true);
  assert.equal(has(/saveTestReport\(results, winner\.model, runBalance\)/), true);
  assert.equal(has(/listTestResult=\{shownShowResult\}/), true);
});

test('an automatically picked judge steps aside for its own answers in the question round', () => {
  // The Labs rounds already do this through labJudgeFor; the show's question
  // round sent the one automatic judge with every contestant's run.
  const auto = { provider: 'local', model: 'gemma4:e2b' };
  const options = { chosen: false, candidates: ['gemma4:e2b', 'granite4:3b'], baseUrlOf: () => undefined };
  assert.equal(labJudgeFor('gemma4:e2b', auto, options)?.model, 'granite4:3b', 'the judge is a contestant, so the next one marks it');
  assert.equal(labJudgeFor('llama3.2:3b', auto, options)?.model, 'gemma4:e2b');
  assert.equal(labJudgeFor('gemma4:e2b', auto, { ...options, candidates: ['gemma4:e2b'] }), null, 'nobody else can mark it');
  assert.equal(labJudgeFor('gemma4:e2b', auto, { ...options, chosen: true })?.model, 'gemma4:e2b', 'a judge the person chose stays');

  // Both runs — a single model and a show — ask for the contestant's own judge.
  assert.equal(has(/judgeModel: effectiveJudge\?\.model/), false, 'the one automatic judge is still sent with every run');
  assert.equal(has(/qualityMode: effectiveJudge && !quick \? 'judge' : 'heuristic'/), false);
  const perContestant = app.match(/const judge = quick \? null : skillJudgeFor\((modelToTest|row\.displayName)\);/g) ?? [];
  assert.deepEqual(perContestant.map((line) => line.includes('modelToTest') ? 'single' : 'show').sort(), ['show', 'single']);
  assert.equal((app.match(/qualityMode: judge \? 'judge' : 'heuristic',\n\s*\.\.\.\(judge \? \{ judgeModel: judge\.model, judgeProvider: judge\.provider, judgeApiKey: judge\.apiKey \} : \{\}\),/g) ?? []).length, 2);
});

const lab = (challenge, model, seconds, over = {}) => ({
  model, challenge, score: 80, grade: 'B', elapsedMs: seconds * 1000,
  response: '', checks: [], completedAt: '2026-09-11T00:00:00.000Z', ...over,
});

test('the picture Top Match is decided by the newest comparison, as the Comparison screen is', () => {
  const results = {
    // A quick cat from an older prompt, and two lighthouses from the newest.
    'image:cat': lab('image-generation', 'quick-cat', 2, { response: 'a cat', adherence: 1, completedAt: '2026-09-09T10:00:00.000Z' }),
    'image:steady': lab('image-generation', 'steady', 5, { response: 'a lighthouse', adherence: 1, completedAt: '2026-09-11T10:00:00.000Z' }),
    'image:slow': lab('image-generation', 'slow', 9, { response: 'a lighthouse', adherence: 1, completedAt: '2026-09-11T11:00:00.000Z' }),
  };
  assert.equal(labWinner(results, 'images', 0)?.model, 'steady', 'the cat was never asked for a lighthouse');
  assert.equal(labWinner(results, 'images', 100)?.model, 'steady');
});

test('the reading Top Match compares only descriptions of the same picture', () => {
  const results = {
    'vision:old': lab('image-recognition', 'quick-eyes', 2, { adherence: 1, picture: 'kitchen', completedAt: '2026-09-09T10:00:00.000Z' }),
    'vision:a': lab('image-recognition', 'careful-eyes', 7, { adherence: 1, picture: 'lineup', completedAt: '2026-09-11T10:00:00.000Z' }),
    'vision:b': lab('image-recognition', 'other-eyes', 9, { adherence: 0.9, picture: 'lineup', completedAt: '2026-09-11T11:00:00.000Z' }),
  };
  assert.equal(labWinner(results, 'reading', 0)?.model, 'careful-eyes');
  // A single result with nothing to compare against still has a winner.
  assert.equal(labWinner({ 'vision:a': results['vision:a'] }, 'reading', 50)?.model, 'careful-eyes');
  assert.equal(labWinner({}, 'reading', 50), null);
});

test('listening keeps no record of what it heard, so every result still competes', () => {
  const results = {
    'listening:a': lab('listening', 'gemma4:e2b', 20, { score: 96, completedAt: '2026-09-09T10:00:00.000Z' }),
    'listening:b': lab('listening', 'gemma4:e4b', 8, { score: 70, completedAt: '2026-09-11T10:00:00.000Z' }),
  };
  assert.equal(labWinner(results, 'listening', 100)?.model, 'gemma4:e2b');
  assert.equal(labWinner(results, 'listening', 0)?.model, 'gemma4:e4b');
});
