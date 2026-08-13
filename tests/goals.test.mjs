import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOALS,
  MIN_QUESTIONS_PER_GOAL,
  MODEL_ATTRIBUTES,
  SCORED_QUALITIES,
  goalById,
  goalCoverage,
  goalHardwareExpectation,
  questionScoredGoals,
} from '../src/lib/goals.ts';
import { TASK_GROUPS } from '../src/lib/taskScores.ts';

test('the eight desires are exactly the ones Dave specified', () => {
  // The list is a product decision, phrased in the user's voice. A drive-by
  // "improvement" to it should fail a test, not slip through review.
  assert.deepEqual(GOALS.map((g) => g.desire), [
    'Talk to a model and ask it questions',
    'Use a model to help me code',
    'Listen to an audio file and transcribe what it says',
    'Listen to audio in real time and transcribe as it happens',
    'Look at a picture and describe what it sees',
    'Create an image from a prompt',
    'Create a video from an image',
    'Create a video from a prompt',
  ]);
});

test('every goal is phrased as something a person wants to do', () => {
  for (const goal of GOALS) {
    assert.ok(goal.desire && goal.label && goal.matchLabel, `${goal.id} is missing a label`);
    assert.match(goal.matchLabel, /^Best for /, `${goal.id} match label should read "Best for ..."`);
  }
});

test('live transcription is honest about not existing locally yet', () => {
  // Ollama takes whole files per request; nothing local streams audio. The
  // goal is shown as future with a reason, never with a Run button that must
  // fail — the stale "Create a video" row was tonight's lesson in the
  // alternative.
  const live = goalById('transcribe-live');
  assert.equal(live.runtime, 'none');
  assert.equal(live.grading, 'none');
  assert.match(live.unsupportedReason, /whole files|stream/i);
});

test('animating an image is supportable but honestly ungraded', () => {
  // The LTX family has a local image-to-video template, so the models are
  // real — but the Video Lab only drives text-to-video. Borrowing the t2v
  // grade for i2v would be a fabricated measurement.
  const animate = goalById('animate-image');
  assert.equal(animate.runtime, 'comfyui');
  assert.equal(animate.grading, 'none');
  assert.match(animate.unsupportedReason, /cannot grade|text-to-video/i);
});

test('a goal graded by questions actually has question types behind it', () => {
  for (const goal of GOALS) {
    assert.equal(goal.grading === 'questions', goal.questionTypes.length > 0,
      `${goal.id}: grading=${goal.grading} with ${goal.questionTypes.length} question types`);
  }
});

test('no question type is claimed twice across goals and qualities', () => {
  const seen = new Map();
  for (const owner of [...GOALS, ...SCORED_QUALITIES]) {
    for (const type of owner.questionTypes) {
      assert.ok(!seen.has(type), `${type} claimed by both ${seen.get(type)} and ${owner.id}`);
      seen.set(type, owner.id);
    }
  }
});

test('every question type the suite asks is accounted for', () => {
  const claimed = new Set([
    ...GOALS.flatMap((g) => g.questionTypes),
    ...SCORED_QUALITIES.flatMap((q) => q.questionTypes),
  ]);
  for (const type of ['json', 'truth', 'format', 'assistant', 'coding']) {
    assert.ok(claimed.has(type), `question type "${type}" belongs to nothing`);
  }
});

test('attributes and qualities are kept out of the goal list', () => {
  const goalIds = new Set(GOALS.map((g) => g.id));
  for (const entry of [...MODEL_ATTRIBUTES, ...SCORED_QUALITIES]) {
    assert.ok(!goalIds.has(entry.id), `${entry.id} is not a goal`);
  }
});

test('the goal mapping preserves what the old task groups measured', () => {
  const oldChat = TASK_GROUPS.find((g) => g.id === 'chat');
  const oldCoding = TASK_GROUPS.find((g) => g.id === 'coding');
  assert.deepEqual([...goalById('talk').questionTypes], [...oldChat.questionTypes]);
  assert.deepEqual([...goalById('code').questionTypes], [...oldCoding.questionTypes]);
});

test('a ten-question run is reported as too thin to rank goals', () => {
  const short = goalCoverage(10);
  assert.equal(short.enough, false);
  assert.ok(short.perGoal < MIN_QUESTIONS_PER_GOAL);
  assert.ok(short.suggestion >= 20);
});

test('a twenty-question run clears the bar', () => {
  assert.equal(goalCoverage(20).enough, true);
});

test('hardware expectations declare their source, measured or heuristic', () => {
  // Dave's rule: suggest from hardware, but the test is the determination.
  // A note presented as fact must trace to a real run; everything else says
  // rule of thumb.
  for (const goal of GOALS) {
    for (const vram of [4, 8, 12, 24]) {
      const expectation = goalHardwareExpectation(goal, vram);
      assert.ok(['measured', 'heuristic'].includes(expectation.source));
      assert.ok(expectation.note.length > 20, `${goal.id}@${vram}GB has a throwaway note`);
    }
  }
});

test('video expectations are measured, tiered, and blunt below the floor', () => {
  const video = goalById('make-video');
  assert.equal(goalHardwareExpectation(video, 12).tone, 'ready');
  assert.equal(goalHardwareExpectation(video, 12).source, 'measured');
  assert.equal(goalHardwareExpectation(video, 8).tone, 'tight');
  assert.equal(goalHardwareExpectation(video, 4).tone, 'unlikely');
});

test('an unsupported goal never gets an optimistic expectation', () => {
  const live = goalById('transcribe-live');
  for (const vram of [4, 12, 48]) {
    assert.equal(goalHardwareExpectation(live, vram).tone, 'unlikely',
      'no amount of VRAM makes an unsupported goal ready');
  }
});

test('ids are unique, since the UI keys off them', () => {
  const ids = GOALS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});
