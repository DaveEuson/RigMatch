// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENT_SCORE_SCHEMA_VERSION,
  compareTestedModelScores,
  formatMatchScore,
} from '../src/lib/scoring.ts';

/**
 * The Winner screen's lineup board prints a one-decimal Match value and ranks
 * the models beside it. Those two numbers have to be the same number.
 *
 * The first version of the board sorted on the rounded integer total while
 * printing the precise value, and rendered "3. 87.5 / 4. 87.6" — a ranked list
 * contradicting its own figures, on the screen the whole app builds toward.
 */

const score = (model, precise) => ({
  model,
  total: Math.round(precise),
  preciseTotal: precise,
  grade: 'A',
  speed: 80,
  sobriety: 80,
  stability: 80,
  fit: 80,
  completedAt: '2026-08-01T00:00:00Z',
  scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
  taskScores: {},
});

const shown = (entry) => formatMatchScore(entry);

test('a tie on the rounded total is broken by the value actually shown', () => {
  // 87.5 and 87.6 both round to 88, so an integer sort leaves these two in
  // whatever order the lineup happened to be in.
  const board = [score('gemma3:4b', 87.5), score('phi3:mini', 87.6)].sort(compareTestedModelScores);
  assert.deepEqual(board.map((entry) => entry.model), ['phi3:mini', 'gemma3:4b']);
  assert.deepEqual(board.map(shown), ['87.6', '87.5']);
});

test('no row ever shows a higher score than the row above it', () => {
  // The invariant the board has to hold, whatever the tie-breaks do.
  const board = [87.5, 93.1, 87.6, 91.7, 87.6, 62.4]
    .map((value, index) => score(`model-${index}`, value))
    .sort(compareTestedModelScores);

  const values = board.map((entry) => Number(shown(entry)));
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(
      values[i] <= values[i - 1],
      `row ${i + 1} shows ${values[i]} beneath ${values[i - 1]}`,
    );
  }
});

test('the ranking does not depend on the order the lineup was picked in', () => {
  // An intransitive comparator sorts differently depending on input order,
  // which would rank the same five models differently run to run.
  const values = [91.7, 87.6, 93.1, 87.5];
  const forwards = values.map((v, i) => score(`m${i}`, v)).sort(compareTestedModelScores);
  const backwards = [...values].reverse()
    .map((v, i) => score(`m${values.length - 1 - i}`, v))
    .sort(compareTestedModelScores);
  assert.deepEqual(forwards.map(shown), backwards.map(shown));
});

test('the winner of the board is the winner the screen announces', () => {
  // The headline picks the top score; the board sorts independently. If those
  // ever disagree the screen crowns one model and ranks another first.
  const board = [score('a:7b', 88.2), score('b:7b', 91.4), score('c:7b', 88.2)]
    .sort(compareTestedModelScores);
  const best = board.reduce((top, entry) => (entry.preciseTotal > top.preciseTotal ? entry : top));
  assert.equal(board[0].model, best.model);
});
