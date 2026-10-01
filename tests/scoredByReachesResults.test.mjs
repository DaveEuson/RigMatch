// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summarizeScoredBy } = require('../electron/benchmarkScoring.cjs');

/**
 * From 0.6 to 0.9.3 every timing run knew how its score was reached (a judge,
 * a rule, or nothing that could grade it), and the saved per-question result
 * never carried it. Everything downstream that relies on it read every answer
 * as graded: the headline answer quality averaged in prose scored by length,
 * and "Best for" crowns could rest on answers nothing measured. The tests that
 * covered those consumers built scoredBy by hand, so none could see it was
 * missing. Found running the tool-use test through the real app.
 */

test('the saved result carries how each answer was scored', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const push = main.slice(main.indexOf('promptResults.push({'), main.indexOf('const completedPrompt = promptResults[promptResults.length - 1];'));
  assert.ok(push.length > 0, 'could not find where per-question results are saved');
  assert.match(push, /scoredBy: summarizeScoredBy\(runs\),/, 'per-question results no longer carry scoredBy');
  // The headline answer quality is the consumer this exists for.
  assert.match(main, /const markedResults = promptResults\.filter\(\(result\) => result\.scoredBy !== 'unjudged'\);/);
});

test('a question is judged when every run used the judge’s mark', () => {
  assert.equal(summarizeScoredBy([{ scoredBy: 'judge' }, { scoredBy: 'judge' }, { scoredBy: 'judge' }]), 'judge');
});

test('any run nothing could grade makes the question unjudged', () => {
  // A difficult-subject answer: refused on one run (a rule can see that),
  // engaged on the others (only a judge can grade those).
  assert.equal(summarizeScoredBy([{ scoredBy: 'heuristic' }, { scoredBy: 'unjudged' }, { scoredBy: 'unjudged' }]), 'unjudged');
  assert.equal(summarizeScoredBy([{ scoredBy: 'judge' }, { scoredBy: 'unjudged' }]), 'unjudged');
  assert.equal(summarizeScoredBy([]), 'unjudged');
});

test('rule-graded runs stay rule-graded', () => {
  assert.equal(summarizeScoredBy([{ scoredBy: 'heuristic' }, { scoredBy: 'heuristic' }, { scoredBy: 'heuristic' }]), 'heuristic');
  assert.equal(summarizeScoredBy([{ scoredBy: 'judge' }, { scoredBy: 'heuristic' }]), 'heuristic');
});
