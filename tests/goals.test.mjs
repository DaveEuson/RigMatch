import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOALS,
  MIN_QUESTIONS_PER_GOAL,
  MODEL_ATTRIBUTES,
  SCORED_QUALITIES,
  goalById,
  goalCoverage,
  scoreableGoals,
} from '../src/lib/goals.ts';
import { TASK_GROUPS } from '../src/lib/taskScores.ts';

test('every goal is phrased as something a person wants to do', () => {
  // The wizard asks "who's your dream model?" and the filters ask "what for?".
  // Both read these labels, so a goal that names a property rather than an
  // ambition would read as nonsense in one of them.
  for (const goal of GOALS) {
    assert.ok(goal.label && goal.wizardLabel && goal.matchLabel, `${goal.id} is missing a label`);
    assert.match(goal.matchLabel, /^Best for /, `${goal.id} match label should read "Best for ..."`);
  }
});

test('attributes are kept out of the goal list', () => {
  // "Tiny" and "Uncensored" describe a model, not an ambition — the old chip
  // row mixed them in, so the wizard would have offered "Tiny" as a dream.
  const goalIds = new Set(GOALS.map((g) => g.id));
  for (const attribute of MODEL_ATTRIBUTES) {
    assert.ok(!goalIds.has(attribute.id), `${attribute.id} is an attribute, not a goal`);
  }
});

test('scored qualities are kept out of the goal list too', () => {
  // Nobody sets out to "do a sticking-to-facts"; it is how well a model holds
  // up while chatting.
  const goalIds = new Set(GOALS.map((g) => g.id));
  for (const quality of SCORED_QUALITIES) {
    assert.ok(!goalIds.has(quality.id), `${quality.id} is a quality, not a goal`);
  }
});

test('no question type is claimed by two different things', () => {
  // A type counted under both a goal and a quality would score the same answer
  // twice under different names.
  const seen = new Map();
  for (const goal of GOALS) {
    for (const type of goal.questionTypes) {
      assert.ok(!seen.has(type), `${type} claimed by both ${seen.get(type)} and ${goal.id}`);
      seen.set(type, goal.id);
    }
  }
  for (const quality of SCORED_QUALITIES) {
    for (const type of quality.questionTypes) {
      assert.ok(!seen.has(type), `${type} claimed by both ${seen.get(type)} and ${quality.id}`);
      seen.set(type, quality.id);
    }
  }
});

test('every question type the suite asks is accounted for', () => {
  // An unclaimed type is a question whose answer is graded but never rolls up
  // into anything a user can see.
  const claimed = new Set([
    ...GOALS.flatMap((g) => g.questionTypes),
    ...SCORED_QUALITIES.flatMap((q) => q.questionTypes),
  ]);
  for (const type of ['json', 'truth', 'format', 'assistant', 'coding']) {
    assert.ok(claimed.has(type), `question type "${type}" belongs to nothing`);
  }
});

test('writing is honest about not being measurable yet', () => {
  // There is no writing question in the suite. `format` measures whether a
  // model follows a formatting instruction, which is not writing well —
  // scoring writing on it would be a fabricated measurement.
  const write = goalById('write');
  assert.equal(write.scoreable, false);
  assert.deepEqual([...write.questionTypes], []);
});

test('a goal claiming to be scoreable actually has questions behind it', () => {
  for (const goal of GOALS) {
    assert.equal(goal.scoreable, goal.questionTypes.length > 0,
      `${goal.id} claims scoreable=${goal.scoreable} with ${goal.questionTypes.length} question types`);
  }
});

test('generation goals are marked as needing ComfyUI', () => {
  // The UI must warn before someone picks a goal that needs a program they
  // have not installed.
  for (const id of ['make-images', 'make-video', 'make-audio']) {
    assert.equal(goalById(id).runtime, 'comfyui', `${id} should need ComfyUI`);
  }
  assert.equal(goalById('talk').runtime, 'ollama');
});

test('the goal mapping preserves what the old task groups measured', () => {
  // Chat and coding were already scored this way; the rename must not quietly
  // change which questions feed which score.
  const oldChat = TASK_GROUPS.find((g) => g.id === 'chat');
  const oldCoding = TASK_GROUPS.find((g) => g.id === 'coding');
  assert.deepEqual([...goalById('talk').questionTypes], [...oldChat.questionTypes]);
  assert.deepEqual([...goalById('code').questionTypes], [...oldCoding.questionTypes]);
});

test('a ten-question run is reported as too thin to rank goals', () => {
  // Spread over the scoreable goals it leaves fewer than three questions each,
  // and a winner named on one answer is noise wearing a rosette.
  const short = goalCoverage(10);
  assert.equal(short.enough, false);
  assert.ok(short.perGoal < MIN_QUESTIONS_PER_GOAL);
  assert.ok(short.suggestion >= 20, 'should suggest a longer run');
});

test('a longer run clears the bar', () => {
  assert.equal(goalCoverage(20).enough, true);
});

test('ids are unique, since the UI keys off them', () => {
  const ids = GOALS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});
