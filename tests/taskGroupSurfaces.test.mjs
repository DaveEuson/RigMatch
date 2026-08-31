// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { TASK_GROUPS, isVerdictWorthy, needsJudge, MIN_QUESTIONS_FOR_VERDICT } = await import('../src/lib/taskScores.ts');
const { strongestSkill } = await import('../src/lib/shareCopy.ts');

/**
 * A group that is measured and then has nowhere to appear.
 *
 * Difficult Subjects was exactly that: seven questions asked, every answer
 * scored, the result stored under taskScores.candour — and the one group
 * missing from the share card's purpose list, so a judged run could never name
 * it. Nothing errored; the measurement was simply invisible.
 */

const scoreWith = (groupId, task) => ({
  model: 'test:7b',
  total: 90,
  speed: 90,
  sobriety: 90,
  grade: 'A',
  taskScores: { [groupId]: task },
});

test('every task group can reach a share card', () => {
  // The guard for the bug above: adding a group to TASK_GROUPS and forgetting
  // to give it a purpose makes it measurable and unshowable.
  for (const group of TASK_GROUPS) {
    const graded = { score: 90, questions: MIN_QUESTIONS_FOR_VERDICT, graded: MIN_QUESTIONS_FOR_VERDICT };
    const skill = strongestSkill(scoreWith(group.id, graded));
    assert.ok(skill, `${group.id} is measured but can never be named on a card`);
    assert.equal(skill.id, group.id);
  }
});

test('Difficult Subjects can be named once a judge has graded it', () => {
  const skill = strongestSkill(scoreWith('candour', { score: 94, questions: 7, graded: 7 }));
  assert.equal(skill.id, 'candour');
  assert.equal(skill.purpose, 'difficult subjects');
});

test('without a judge it stays off the card entirely', () => {
  // Engaged answers report unjudged, so graded falls to 0 and nothing is
  // claimed — which is the whole reason it is safe to list a purpose for it.
  const ungraded = { score: 72, questions: 7, graded: 0 };
  assert.equal(strongestSkill(scoreWith('candour', ungraded)), null);
  assert.equal(isVerdictWorthy(ungraded), false);
  assert.equal(needsJudge(ungraded), true);
});

test('a run too short to mean anything is not a verdict either', () => {
  const thin = { score: 94, questions: 1, graded: 1 };
  assert.equal(isVerdictWorthy(thin), false);
  // One question is not "the judge is missing", so do not send anyone to
  // Settings to fix something that is not broken.
  assert.equal(needsJudge(thin), false);
});

test('the strongest graded group wins, not the highest ungraded one', () => {
  const score = {
    model: 'test:7b',
    total: 90,
    speed: 90,
    sobriety: 90,
    grade: 'A',
    taskScores: {
      candour: { score: 99, questions: 7, graded: 0 },
      coding: { score: 80, questions: 4, graded: 4 },
    },
  };
  assert.equal(strongestSkill(score).id, 'coding');
});
