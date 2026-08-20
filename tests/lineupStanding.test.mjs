// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { lineupStanding, standingLine } from '../src/lib/lineupStanding.ts';

/**
 * The Comparison screen announced "Tonight's lineup: five contestants, one rig,
 * same questions — qwen2.5:7b is leading with 93 Match" while the five
 * contestants on screen did not include qwen2.5:7b.
 *
 * The cause is that listTestResult is persisted across sessions, so it holds
 * the winner of the LAST show. Swapping a single contestant is enough to make
 * the banner describe a lineup that no longer exists, and the stage podium
 * highlight a model that is not on it.
 */

const LINEUP = ['llama3.2:3b', 'mistral:7b', 'gemma3:4b', 'phi3:mini', 'deepseek-r1:7b'];

test('a winner still in the lineup is leading', () => {
  assert.deepEqual(lineupStanding('gemma3:4b', LINEUP), { kind: 'leading', model: 'gemma3:4b' });
});

test('a winner from a previous lineup is not presented as leading this one', () => {
  // The exact case seen on screen.
  const standing = lineupStanding('qwen2.5:7b', LINEUP);
  assert.equal(standing.kind, 'previous');
  assert.match(standingLine(standing, 93), /not in tonight's lineup/);
  assert.doesNotMatch(standingLine(standing, 93), /is leading/);
});

test('a stale winner never carries a score into the banner', () => {
  // Quoting 93 next to a model that is not in the lineup invites the reader to
  // compare it against the ones that are.
  assert.doesNotMatch(standingLine(lineupStanding('qwen2.5:7b', LINEUP), 93), /93/);
});

test('no saved winner asks for a run instead of claiming one', () => {
  for (const empty of [undefined, null, '']) {
    assert.deepEqual(lineupStanding(empty, LINEUP), { kind: 'none' });
    assert.match(standingLine(lineupStanding(empty, LINEUP), undefined), /Run the show/);
  }
});

test('an empty lineup cannot have a leader', () => {
  assert.equal(lineupStanding('gemma3:4b', []).kind, 'previous');
});

test('the live line still reports the score when there is one', () => {
  assert.match(standingLine(lineupStanding('gemma3:4b', LINEUP), 87.5), /87\.5 Match/);
  // And degrades to a claim it can support when the score is missing.
  assert.doesNotMatch(standingLine(lineupStanding('gemma3:4b', LINEUP), undefined), /Match/);
});

test('names are shortened through the caller’s own formatter', () => {
  const short = (model) => model.split(':')[0];
  assert.match(standingLine(lineupStanding('gemma3:4b', LINEUP), 90, short), /^gemma3 is leading/);
  assert.match(standingLine(lineupStanding('qwen2.5:7b', LINEUP), 90, short), /^qwen2\.5 won/);
});
