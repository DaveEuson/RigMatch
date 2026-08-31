// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { compareModels, summariseComparison, orderComparisonCandidates } =
  await import('../src/lib/modelComparison.ts');
const { getFriendlyModelName } = await import('../src/lib/modelCatalog.ts');

/**
 * "Why is gemma4:e2b better than gemma4:e4b" was unanswerable: getModelProfile
 * matches on the family name, so both returned the same archetype and colour.
 *
 * Most of what follows is about restraint. Laying two numbers side by side is
 * easy; the work is knowing which differences are a verdict and which are a
 * trade the reader came here to weigh for themselves.
 */

const gb = (n) => `${n.toFixed(1)} GB`;

const side = (displayName, over = {}) => ({
  row: { displayName, sizeGb: 4, ...(over.row ?? {}) },
  score: over.score,
  fits: over.fits ?? true,
  fitLabel: over.fitLabel ?? 'Sweet spot',
  installed: over.installed ?? false,
  maker: over.maker ?? 'Google',
});
const scored = (total, sobriety = total, speed = total) => ({ total, sobriety, speed });
const rowsOf = (a, b) => compareModels(a, b, gb);
const find = (rows, label) => rows.find((r) => r.label === label);

test('the effective-size difference is stated, and picks no winner', () => {
  // The whole reason someone opens this: e2b against e4b. Neither is "better";
  // that is the trade they are here to weigh.
  const rows = rowsOf(side('gemma4:e2b'), side('gemma4:e4b'));
  const row = find(rows, 'Effective size');
  assert.deepEqual([row.left, row.right], ['Effective 2B', 'Effective 4B']);
  assert.equal(row.advantage, null);
});

test('a bigger download is not called better', () => {
  const rows = rowsOf(side('a:2b', { row: { sizeGb: 1.6 } }), side('b:7b', { row: { sizeGb: 8.1 } }));
  assert.equal(find(rows, 'Download').advantage, null);
});

test('the model that runs here beats the one that does not', () => {
  const rows = rowsOf(
    side('a:7b', { fits: true, fitLabel: 'Sweet spot' }),
    side('b:70b', { fits: false, fitLabel: 'Too big' }),
  );
  assert.equal(find(rows, 'Fit on this computer').advantage, 'left');
});

test('two models that both fit make no fit claim', () => {
  const rows = rowsOf(side('a:7b'), side('b:7b'));
  assert.equal(find(rows, 'Fit on this computer'), undefined);
});

test('a higher measured score wins, because it was measured here', () => {
  const rows = rowsOf(side('a:7b', { score: scored(92) }), side('b:7b', { score: scored(81) }));
  assert.equal(find(rows, 'Match score').advantage, 'left');
});

test('an untested model is unmeasured, not losing', () => {
  // The bug worth guarding: marking the tested one as the winner turns "nobody
  // has run this yet" into a verdict against the other.
  const rows = rowsOf(side('a:7b', { score: scored(92) }), side('b:7b'));
  const row = find(rows, 'Match score');
  assert.equal(row.right, 'Not tested');
  assert.equal(row.advantage, null);
});

test('equal scores are a tie, not a win', () => {
  const rows = rowsOf(side('a:7b', { score: scored(90) }), side('b:7b', { score: scored(90) }));
  assert.equal(find(rows, 'Match score').advantage, null);
});

test('already installed beats needing a download', () => {
  const rows = rowsOf(side('a:7b', { installed: true }), side('b:7b', { installed: false }));
  assert.equal(find(rows, 'On this computer').advantage, 'left');
});

test('rows both sides agree on are left out entirely', () => {
  // A list where most lines are identical is one nobody reads to the end.
  const rows = rowsOf(side('a:7b', { maker: 'Google' }), side('b:7b', { maker: 'Google' }));
  assert.equal(find(rows, 'Made by'), undefined);
  assert.equal(find(rows, 'On this computer'), undefined);
});

// --- the sentence at the top -------------------------------------------------

test('with nothing tested it asks for a test rather than shrugging', () => {
  const line = summariseComparison(side('a:7b'), side('b:7b'));
  assert.match(line, /Neither has been tested/);
  assert.match(line, /Test both/);
});

test('with one tested it names the one that is missing', () => {
  const line = summariseComparison(side('a:7b', { score: scored(92) }), side('b:7b'));
  assert.match(line, /Only a:7b has been tested/);
  assert.match(line, /Test b:7b/);
});

test('a clear win is stated with both numbers', () => {
  const line = summariseComparison(side('a:7b', { score: scored(92) }), side('b:7b', { score: scored(80) }));
  assert.match(line, /a:7b scored 92 against 80/);
});

test('a one-point gap is called what it is, not a win', () => {
  // Inside the noise of a re-run. Calling it a win invites someone to choose on
  // a difference that will not survive running the test again.
  const line = summariseComparison(side('a:7b', { score: scored(91) }), side('b:7b', { score: scored(90) }));
  assert.match(line, /could swap them/);
});

test('a dead heat says so', () => {
  const line = summariseComparison(side('a:7b', { score: scored(88) }), side('b:7b', { score: scored(88) }));
  assert.match(line, /Dead heat/);
});

// --- who to offer comparing against -----------------------------------------

const named = (displayName) => ({ displayName });
const order = (list, subject) => orderComparisonCandidates(
  list, subject, (r) => getFriendlyModelName(r.displayName), (r) => r.displayName,
);

test('siblings come first — that is the question the tag raises', () => {
  const out = order(
    [named('mistral:7b'), named('gemma4:e4b'), named('llama3.2:3b'), named('gemma4:12b')],
    named('gemma4:e2b'),
  );
  assert.deepEqual(out.slice(0, 2).map((r) => r.displayName), ['gemma4:e4b', 'gemma4:12b']);
});

test('everything else stays reachable, just further down', () => {
  const out = order([named('mistral:7b'), named('gemma4:e4b')], named('gemma4:e2b'));
  assert.equal(out.length, 2);
  assert.ok(out.some((r) => r.displayName === 'mistral:7b'));
});

test('a model is never offered against itself', () => {
  const out = order([named('gemma4:e2b'), named('mistral:7b')], named('gemma4:e2b'));
  assert.deepEqual(out.map((r) => r.displayName), ['mistral:7b']);
});

test('two identical downloads are not listed as a difference', () => {
  const rows = rowsOf(side('a:7b', { row: { sizeGb: 4.7 } }), side('b:7b', { row: { sizeGb: 4.7 } }));
  assert.equal(find(rows, 'Download'), undefined);
});

test('a real size difference is still listed', () => {
  const rows = rowsOf(side('a:2b', { row: { sizeGb: 1.6 } }), side('b:7b', { row: { sizeGb: 4.7 } }));
  assert.ok(find(rows, 'Download'));
});

test('when neither is tested the score rows are dropped, not filled with dashes', () => {
  // The sentence above the table already says nobody has run these. Three rows
  // of "Not tested / Not tested" push the rows that do differ off the bottom.
  const rows = rowsOf(side('a:7b'), side('b:7b'));
  assert.equal(find(rows, 'Match score'), undefined);
  assert.equal(find(rows, 'Answer quality'), undefined);
  assert.equal(find(rows, 'Speed'), undefined);
});

test('one tested side still shows the row, so the gap is visible', () => {
  const rows = rowsOf(side('a:7b', { score: scored(92) }), side('b:7b'));
  const row = find(rows, 'Match score');
  assert.equal(row.left, '92');
  assert.equal(row.right, 'Not tested');
});
