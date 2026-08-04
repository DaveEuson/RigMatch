import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  describeLabFailure,
  scoreAdvancedImageResponse,
  scoreAdvancedVisionResponse,
} from '../src/lib/labScoring.ts';

const GOOD = 'A man in a white shirt and dark tie sits by a window on the left, holding a small cup near his face. The background is a bright room.';

test('an empty answer scores zero, not a passing-looking 50', () => {
  // Reported from a real run: deepseek-ocr:3b returned nothing and was shown as
  // "50 · D". Two checks tested for the ABSENCE of a bad signal — no refusal
  // wording, no truncation stop — which an empty string satisfies trivially.
  const scored = scoreAdvancedVisionResponse('', 'stop');
  assert.equal(scored.score, 0, 'a blank response must not earn points');
  assert.equal(scored.grade, 'F');
  assert.ok(scored.checks.every((check) => !check.passed), 'no check may pass on an empty answer');
});

test('whitespace-only answers are treated as empty', () => {
  for (const blank of ['   ', '\n\n', '\t', ' \r\n ']) {
    const scored = scoreAdvancedVisionResponse(blank, 'stop');
    assert.equal(scored.score, 0, `${JSON.stringify(blank)} should score 0`);
  }
});

test('the empty case explains itself and names the stop reason', () => {
  const scored = scoreAdvancedVisionResponse('', 'load');
  const first = scored.checks[0];
  assert.equal(first.label, 'Returned an answer');
  assert.equal(first.passed, false);
  assert.match(first.detail, /no text at all/i);
  assert.match(first.detail, /load/, 'the stop reason is the main clue for a silent failure');
  assert.match(first.detail, /vision API/i, 'point at the likely cause');
});

test('a real description still scores well', () => {
  const scored = scoreAdvancedVisionResponse(GOOD, 'stop');
  assert.equal(scored.score, 100);
  assert.equal(scored.grade, 'S');
});

test('a refusal is graded below a genuine description', () => {
  const refusal = scoreAdvancedVisionResponse("I'm sorry, I cannot see any image in this conversation at all.", 'stop');
  const good = scoreAdvancedVisionResponse(GOOD, 'stop');
  assert.ok(refusal.score < good.score, 'declining must not score like describing');
  assert.equal(refusal.checks.find((c) => c.label === 'Engaged with the picture').passed, false);
  // But it still beats returning nothing — it at least answered.
  assert.ok(refusal.score > scoreAdvancedVisionResponse('', 'stop').score);
});

test('a truncated answer loses the clean-completion check', () => {
  const scored = scoreAdvancedVisionResponse(GOOD, 'length');
  assert.equal(scored.checks.find((c) => c.label === 'Completed cleanly').passed, false);
  assert.ok(scored.score < 100);
});

test('a one-liner fails the substance check but still answered', () => {
  const scored = scoreAdvancedVisionResponse('A man.', 'stop');
  assert.equal(scored.checks.find((c) => c.label === 'Returned an answer').passed, true);
  assert.equal(scored.checks.find((c) => c.label === 'Described the image').passed, false);
});

test('null and undefined responses do not throw', () => {
  assert.doesNotThrow(() => scoreAdvancedVisionResponse(null, 'stop'));
  assert.doesNotThrow(() => scoreAdvancedVisionResponse(undefined, ''));
  assert.equal(scoreAdvancedVisionResponse(null, 'stop').score, 0);
});

test('describeLabFailure prefers a real error, then the first failed check', () => {
  assert.equal(
    describeLabFailure({ error: 'Connection refused', checks: [{ label: 'x', passed: false, detail: 'other' }] }),
    'Connection refused',
  );
  assert.equal(
    describeLabFailure({ checks: [{ label: 'a', passed: true, detail: 'fine' }, { label: 'b', passed: false, detail: 'the reason' }] }),
    'the reason',
  );
  assert.equal(describeLabFailure({ checks: [{ label: 'a', passed: true, detail: 'fine' }] }), undefined);
  assert.equal(describeLabFailure({}), undefined, 'a result with no checks must not throw');
});

test('a failed vision run carries a usable explanation end to end', () => {
  const scored = scoreAdvancedVisionResponse('', 'stop');
  const note = describeLabFailure({ ...scored, error: undefined });
  assert.ok(note, 'the viewer must have something to show instead of a blank panel');
  assert.match(note, /no text at all/i);
});

test('an image run that returned nothing scores zero', () => {
  // "Small beta size" used to assert ADVANCED_IMAGE_WIDTH <= 512 — a constant in
  // this repo, always true — so it measured our own config, not the model, and
  // gave every result a free quarter of its score. A model that produced no
  // image collected that plus "Completed cleanly" for 50.
  const scored = scoreAdvancedImageResponse('', 'stop');
  assert.equal(scored.score, 0);
  assert.equal(scored.grade, 'F');
  assert.ok(scored.checks.every((c) => !c.passed));
  assert.ok(!scored.checks.some((c) => /beta size/i.test(c.label)), 'a constant must not be scored as a model capability');
});

test('a real image payload scores full marks', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const scored = scoreAdvancedImageResponse(png, 'stop');
  assert.equal(scored.score, 100);
  assert.equal(scored.grade, 'S');
});

test('a text-only reply to an image request scores zero', () => {
  const scored = scoreAdvancedImageResponse('I cannot generate images.', 'stop');
  assert.equal(scored.score, 0);
  assert.match(scored.checks[0].detail, /no image payload/i);
});
