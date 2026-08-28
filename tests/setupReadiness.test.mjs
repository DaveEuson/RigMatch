// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { GOALS, goalById } = await import('../src/lib/goals.ts');

/**
 * Which goals make "You're all set!" a false statement.
 *
 * Setup checked Ollama, the graphics card and disk space and then declared the
 * computer ready. For the goals that run through ComfyUI that was untrue: the
 * program doing the work was never looked for, never mentioned, and the refusal
 * did not arrive until the download three steps later.
 *
 * The check is driven off `runtime`, not a hand-written list of goal ids, so a
 * goal added later is covered the day it is added. This pins the set anyway —
 * if it changes, someone should look at the setup copy, which says "pictures or
 * video" and would start being wrong if, say, an audio goal joined.
 */

test('exactly the generation goals need a second program', () => {
  const needsComfy = GOALS.filter((goal) => goal.runtime === 'comfyui').map((goal) => goal.id).sort();
  assert.deepEqual(needsComfy, ['animate-image', 'make-audio', 'make-images', 'make-video']);
});

test('the ordinary goals need nothing beyond Ollama', () => {
  // The control that matters. Someone who picked "everyday chat" must not be
  // told about a program they will never install — a warning that fires when it
  // need not is how people learn to ignore warnings.
  for (const id of ['talk', 'write', 'code', 'describe-image', 'transcribe-file', 'use-tools']) {
    const goal = goalById(id);
    assert.ok(goal, `${id} is no longer a goal`);
    assert.notEqual(goal.runtime, 'comfyui', `${id} would now trigger the ComfyUI setup check`);
  }
});

test('the predicate the setup card uses matches on any chosen goal, not just the first', () => {
  // Goals are multi-select and the first pick leads, but a ComfyUI goal chosen
  // second still needs the program. Reading only selectedGoals[0] would tell
  // someone they were all set and then refuse their download.
  const needed = (ids) => ids.some((id) => goalById(id)?.runtime === 'comfyui');

  assert.equal(needed(['talk']), false);
  assert.equal(needed(['make-images']), true);
  assert.equal(needed(['talk', 'make-images']), true, 'a second-place image goal still needs ComfyUI');
  assert.equal(needed(['talk', 'code']), false);
  assert.equal(needed([]), false, 'skipping the goal question asks for nothing');
  assert.equal(needed(['not-a-goal']), false, 'an unknown id must not throw');
});
