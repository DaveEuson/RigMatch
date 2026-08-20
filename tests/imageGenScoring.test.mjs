// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_BENCHMARK_PROMPTS,
  readJudgeVerdict,
  scoreAdherence,
  scoreImageGeneration,
  scoreSpeed,
} from '../src/lib/imageGenScoring.ts';

test('every benchmark prompt has a proposition that should be false', () => {
  // Without one, a judge that answers yes to everything scores 100 and the
  // adherence measure means nothing at all.
  for (const prompt of IMAGE_BENCHMARK_PROMPTS) {
    assert.ok(
      prompt.propositions.some((p) => p.expected === false),
      `${prompt.id} has no falsifying proposition`,
    );
  }
});

test('a yes-to-everything judge cannot score full marks', () => {
  const prompt = IMAGE_BENCHMARK_PROMPTS[0];
  const allYes = prompt.propositions.map(() => true);
  const { adherence } = scoreAdherence(prompt.propositions, allYes);
  assert.ok(adherence < 1, `a yes-machine scored ${adherence}`);
});

test('the judge verdict is read out of a sentence, not just a bare word', () => {
  assert.equal(readJudgeVerdict('Yes, there is a lighthouse in the image.'), true);
  assert.equal(readJudgeVerdict('No.'), false);
  assert.equal(readJudgeVerdict('**Yes**'), true);
  assert.equal(readJudgeVerdict('There is no horse in this picture.'), false);
  assert.equal(readJudgeVerdict('The image does not contain any buildings.'), false);
});

test('a judge that cannot tell returns null, which is not a no', () => {
  // Folding "don't know" into "no" marks the model down for its judge's
  // weakness rather than for the picture.
  assert.equal(readJudgeVerdict("I cannot determine that from this image."), null);
  assert.equal(readJudgeVerdict("It's unclear."), null);
  assert.equal(readJudgeVerdict(''), null);
});

test("a hedge containing 'no' is not read as a no", () => {
  assert.equal(readJudgeVerdict('I am not sure, it is hard to tell.'), null);
});

test('adherence is unavailable when the judge answered too few questions', () => {
  const props = IMAGE_BENCHMARK_PROMPTS[0].propositions;
  const mostlyBlank = [true, null, null, null, null];
  const { adherence, answered } = scoreAdherence(props, mostlyBlank);
  assert.equal(adherence, null);
  assert.equal(answered, 1);
});

test('speed is scored per step, so a longer run is not punished for doing more', () => {
  // 40 steps in 20s and 20 steps in 10s are the same machine.
  assert.equal(scoreSpeed(20000, 40), scoreSpeed(10000, 20));
});

test('a fast, accurate, in-VRAM run scores well; a spilling slow one does not', () => {
  const good = scoreImageGeneration({ produced: true, elapsedMs: 8000, steps: 20, adherence: 1 });
  const bad = scoreImageGeneration({
    produced: true, elapsedMs: 160000, steps: 20, adherence: 0.4, spilledVram: true,
  });
  assert.ok(good.score >= 92, `good run scored ${good.score}`);
  assert.ok(bad.score <= 25, `bad run scored ${bad.score}`);
});

test('an unjudged run cannot reach full marks on speed alone', () => {
  // Otherwise a fast machine scores 100 for an image nobody ever checked.
  const unjudged = scoreImageGeneration({
    produced: true, elapsedMs: 4000, steps: 20, adherence: null,
  });
  assert.equal(unjudged.judged, false);
  assert.ok(unjudged.score <= 50, `unjudged run scored ${unjudged.score}`);
});

test('producing no image scores zero however fast it failed', () => {
  const nothing = scoreImageGeneration({
    produced: false, elapsedMs: 200, steps: 20, adherence: null,
  });
  assert.equal(nothing.score, 0);
  assert.equal(nothing.grade, 'F');
});
