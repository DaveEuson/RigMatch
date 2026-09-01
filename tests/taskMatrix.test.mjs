// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildTaskMatrix, isEmptyMatrix, summariseMatrix } = await import('../src/lib/taskMatrix.ts');
const { MIN_QUESTIONS_FOR_VERDICT } = await import('../src/lib/taskScores.ts');

/**
 * Every run has computed per-task scores since task groups landed, and no
 * component ever rendered them — so "which of these three is best at coding"
 * was measured on every comparison and invisible everywhere, on the screen
 * whose whole job is comparing.
 *
 * The restraint below is the point. A single Match score answers "which is
 * best overall"; this answers "best at what", and it has to stay quiet
 * wherever the run did not actually measure enough to say.
 */

const N = MIN_QUESTIONS_FOR_VERDICT;
const graded = (score, questions = N) => ({ score, questions, graded: questions });
const ungraded = (score, questions = N) => ({ score, questions, graded: 0 });
const scoreFor = (taskScores) => ({ model: 'x', total: 80, grade: 'B', speed: 80, sobriety: 80, fit: 80, taskScores });

const build = (models) => buildTaskMatrix(Object.keys(models), Object.fromEntries(
  Object.entries(models).map(([model, tasks]) => [model, scoreFor(tasks)]),
));

test('a measured group shows its number', () => {
  const m = build({ 'a:7b': { coding: graded(90) } });
  assert.equal(m.rows[0].cells[0].state, 'measured');
  assert.equal(m.rows[0].cells[0].score, 90);
});

test('a group nothing could grade says so instead of showing a number', () => {
  const m = build({ 'a:7b': { candour: ungraded(72) } });
  const cell = m.rows[0].cells[0];
  assert.equal(cell.state, 'needs-judge');
  assert.equal(cell.score, null);
});

test('too few questions is its own answer, not a low score', () => {
  const m = build({ 'a:7b': { coding: graded(90, 1) } });
  assert.equal(m.rows[0].cells[0].state, 'too-few');
  assert.equal(m.rows[0].cells[0].score, null);
});

test('a group nobody was asked about is dropped, not shown as a column of dashes', () => {
  const m = build({ 'a:7b': { coding: graded(90) }, 'b:7b': { coding: graded(80) } });
  assert.deepEqual(m.groups.map((g) => g.id), ['coding']);
});

test('the best model in a column is marked', () => {
  const m = build({ 'a:7b': { coding: graded(90) }, 'b:7b': { coding: graded(70) } });
  assert.equal(m.winners.coding, 'a:7b');
});

test('one measured model wins nothing — that is not a comparison', () => {
  // The bug worth guarding: crowning the only model that ran reads as a
  // contest that never happened.
  const m = build({ 'a:7b': { coding: graded(90) }, 'b:7b': { coding: ungraded(72) } });
  assert.equal(m.winners.coding, undefined);
});

test('a tie at the top crowns nobody', () => {
  const m = build({ 'a:7b': { coding: graded(88) }, 'b:7b': { coding: graded(88) } });
  assert.equal(m.winners.coding, undefined);
});

test('an unjudged model cannot lose to a judged one', () => {
  // Same rule as the two-model compare: unmeasured is not losing.
  const m = build({ 'a:7b': { coding: graded(50) }, 'b:7b': { coding: ungraded(99) } });
  assert.equal(m.winners.coding, undefined);
});

test('different models can lead different columns', () => {
  const m = build({
    'a:7b': { coding: graded(90), writing: graded(60) },
    'b:7b': { coding: graded(70), writing: graded(95) },
  });
  assert.equal(m.winners.coding, 'a:7b');
  assert.equal(m.winners.writing, 'b:7b');
});

test('a model with no saved scores at all is left out of the table', () => {
  const m = buildTaskMatrix(['a:7b', 'never-tested:3b'], { 'a:7b': scoreFor({ coding: graded(90) }) });
  assert.deepEqual(m.rows.map((r) => r.model), ['a:7b']);
});

test('nothing measured anywhere is an empty matrix, not a blank table', () => {
  assert.ok(isEmptyMatrix(buildTaskMatrix([], {})));
  assert.ok(isEmptyMatrix(build({ 'a:7b': {} })));
});

test('every row has a cell for every column, so the grid never misaligns', () => {
  const m = build({
    'a:7b': { coding: graded(90), writing: graded(80) },
    'b:7b': { coding: graded(70) },
  });
  for (const row of m.rows) assert.equal(row.cells.length, m.groups.length);
  assert.equal(m.rows[1].cells[1].state, 'none');
});

// --- the sentence above the table --------------------------------------------

test('the summary names who leads what', () => {
  const m = build({
    'a:7b': { coding: graded(90), writing: graded(60) },
    'b:7b': { coding: graded(70), writing: graded(95) },
  });
  const line = summariseMatrix(m);
  assert.match(line, /a:7b leads on coding/);
  assert.match(line, /b:7b leads on writing/);
});

test('one model leading several is said once, not repeated', () => {
  const m = build({
    'a:7b': { coding: graded(90), writing: graded(90) },
    'b:7b': { coding: graded(70), writing: graded(70) },
  });
  assert.equal(summariseMatrix(m), 'a:7b leads on coding, writing.');
});

test('with no winners there is no summary rather than an invented one', () => {
  const m = build({ 'a:7b': { coding: graded(90) } });
  assert.equal(summariseMatrix(m), null);
});
