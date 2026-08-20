// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { firstRunStep } from '../src/lib/goalSettings.ts';
import { summarizeTaskScores, isVerdictWorthy } from '../src/lib/taskScores.ts';
import { isLegacyScore, scoreDrift, CURRENT_SCORE_SCHEMA_VERSION } from '../src/lib/scoring.ts';
import { getGoalMatches } from '../src/lib/goalMatches.ts';
import { getTaskTopPicks } from '../src/lib/modelCatalog.ts';

/**
 * What happens to someone who already had RigMatch.
 *
 * Every state in here belongs to a real person upgrading from 0.5 — the one
 * starting state that is guaranteed to exist in the wild and had never been
 * tested. It is also where the worst bug of the release was hiding: the goals
 * splash was gated on "has a mode been chosen?", which every existing user had
 * already answered, so all of them would have upgraded into 0.6 with its
 * headline feature switched off.
 */

/** localStorage as a 0.5 install left it: a mode chosen, no concept of goals. */
const upgraded = { modeChosen: true, goalsOffered: false };
const freshInstall = { modeChosen: false, goalsOffered: false };
const settledUser = { modeChosen: true, goalsOffered: true };

test('an upgrading user is still asked what they want to do', () => {
  assert.equal(firstRunStep(upgraded), 'goals-only',
    'they answered the mode question in 0.5, which must not be read as having answered the goal question');
});

test('a fresh install gets both questions, in order', () => {
  assert.equal(firstRunStep(freshInstall), 'goals-and-mode');
});

test('someone who skipped the goal question is not asked again', () => {
  // "Asked and declined" and "never asked" are different states; conflating
  // them either nags people forever or skips them silently.
  assert.equal(firstRunStep(settledUser), 'none');
  assert.equal(firstRunStep({ modeChosen: true, goalsOffered: true }), 'none');
});

/** A score as 0.5 wrote it: schema v4, json pooled into instructions, no rig. */
const v4Score = (model, total) => ({
  model, total, grade: 'A', speed: total, sobriety: total, stability: total, fit: total,
  preciseTotal: total, completedAt: '2026-07-01T00:00:00Z',
  scoreSchemaVersion: 4,
  taskScores: {
    coding: { score: 88, questions: 6 },
    chat: { score: 80, questions: 6 },
    facts: { score: 90, questions: 4 },
    instructions: { score: 85, questions: 8 },
  },
});

test('old scores are marked for retest rather than silently reused', () => {
  const score = v4Score('llama3.1:8b', 88);
  assert.equal(isLegacyScore(score), true);
  assert.equal(isLegacyScore({ ...score, scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION }), false);
});

test('old scores cannot crown anything, in either board', () => {
  // v4 pooled json into instructions; v5 counts json on its own. Ranking the
  // two against each other would compare different measurements.
  const scores = { 'llama3.1:8b': v4Score('llama3.1:8b', 88) };
  assert.deepEqual(getTaskTopPicks(scores), []);
  for (const match of getGoalMatches(['talk', 'code', 'use-tools'], scores)) {
    assert.equal(match.pick, undefined, `${match.goal.id} was crowned by a v4 score`);
  }
});

test('an old score with no rig stamp claims no drift either way', () => {
  // Nothing before 0.6 recorded hardware, so those scores can neither prove
  // nor deny that the machine changed. They must not be badged for it.
  assert.equal(scoreDrift(v4Score('a', 80), { gpuModel: 'Some New GPU', vramGb: 24 }), null);
});

test('an upgrading user with no goals still gets the old category picks', () => {
  // With no goals chosen the Matches board is empty, so the pre-0.6 picks have
  // to keep working — otherwise upgrading looks like losing a feature.
  const current = {
    'a:7b': { ...v4Score('a:7b', 90), scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION },
  };
  assert.deepEqual(getGoalMatches([], current), [], 'no goals means no goal board');
  assert.ok(getTaskTopPicks(current).length > 0, 'the category picks must survive the upgrade');
});

test('a v4 taskScores shape does not break the v5 groups', () => {
  // v4 has no 'tools' and no 'writing' key at all. Reading a missing group
  // must be an absent verdict, not a crash or a zero presented as a score.
  const score = v4Score('a', 80);
  assert.equal(score.taskScores.tools, undefined);
  assert.equal(isVerdictWorthy(score.taskScores.tools), false);
  assert.equal(isVerdictWorthy(score.taskScores.writing), false);
  // And a fresh run produces the new groups without inheriting the old pooling.
  const fresh = summarizeTaskScores([
    { id: 'j', label: 'j', type: 'json', prompt: 'p', elapsedMs: 1, tokensPerSecond: 1,
      sobrietyScore: 90, response: 'a', doneReason: 'stop', status: 'ok', scoredBy: 'heuristic' },
  ]);
  assert.ok(fresh.tools, 'json now stands alone as the tools group');
  assert.equal(fresh.instructions, undefined, 'and no longer pools into instructions');
});
