// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeImageTest,
  endImageTest,
  imageTestOutcomeSnapshot,
  imageTestSnapshot,
  lastRenderOutcome,
  renderActivityFrom,
  renderChannel,
  renderLabel,
  startImageTest,
  subscribeImageTest,
} from '../src/lib/renderActivity.ts';

/**
 * A render keeps going after the panel that started it closes. Mochi was
 * started from its row, the panel closed, and no screen said it was still
 * rendering. These lock what every screen is told: which model, since when,
 * where it is in a race, and how to stop it.
 */

const IDLE = {
  video: { running: false, current: null, message: '', solo: null },
  image: { running: false, current: null, message: '', run: null },
  audio: { running: false, current: null, message: '', run: null, solo: null },
  imageTest: null,
};
const STOPS = { video: () => 'video', image: () => 'image', audio: () => 'audio' };

test('nothing rendering is nothing to show', () => {
  assert.equal(renderActivityFrom(IDLE, STOPS), null);
});

test('a video tested on its own shows its model, its clock and its stop, with its panel closed', () => {
  const activity = renderActivityFrom({
    ...IDLE,
    video: {
      running: true,
      message: 'Rendering Mochi 1 10B on its own.',
      solo: { key: 'mochi-1', name: 'Mochi 1 10B' },
      current: { key: 'mochi-1', name: 'Mochi 1 10B', index: 0, total: 1, startedAt: 1000 },
    },
  }, STOPS);
  assert.equal(activity.kind, 'video');
  assert.equal(activity.model, 'Mochi 1 10B');
  assert.equal(activity.key, 'mochi-1', 'so its row can say it is testing');
  assert.equal(activity.startedAt, 1000);
  assert.equal(activity.solo, true);
  assert.equal(activity.step, null, 'one model is not "1 of 1"');
  assert.equal(renderLabel(activity), 'Rendering');
  assert.equal(activity.stop(), 'video');
});

test('a race says which model is rendering and where it is in the race', () => {
  const activity = renderActivityFrom({
    ...IDLE,
    video: {
      running: true,
      message: 'Rendering 2 of 3: Wan 2.1 1.3B.',
      solo: null,
      current: { key: 'wan-2.1-1.3b', name: 'Wan 2.1 1.3B', index: 1, total: 3, startedAt: 5 },
    },
  }, STOPS);
  assert.deepEqual(activity.step, { index: 1, total: 3 });
  assert.equal(activity.solo, false);
});

test('while the judge or the listener works, it says checking, with no render clock', () => {
  const activity = renderActivityFrom({
    ...IDLE,
    audio: {
      running: true,
      current: null,
      message: 'Every model has made its clip. Listening to ACE-Step 1.5 Turbo’s with gemma4:e4b.',
      run: { planned: [{ key: 'ace-step-1.5-turbo', name: 'ACE-Step 1.5 Turbo' }] },
      solo: null,
    },
  }, STOPS);
  assert.equal(activity.phase, 'checking');
  assert.equal(renderLabel(activity), 'Checking');
  assert.equal(activity.startedAt, null);
  assert.equal(activity.stop(), 'audio');
});

test('an audio comparison counts its models, and a clip made from a row is that row’s', () => {
  const planned = [{ key: 'ace-step-1.5-turbo', name: 'ACE-Step 1.5 Turbo' }, { key: 'stable-audio-open-1.0', name: 'Stable Audio Open 1.0' }];
  const racing = renderActivityFrom({
    ...IDLE,
    audio: { running: true, message: '', run: { planned }, solo: null, current: { ...planned[1], startedAt: 7 } },
  }, STOPS);
  assert.deepEqual(racing.step, { index: 1, total: 2 });
  assert.equal(renderLabel(racing), 'Making audio');
  const alone = renderActivityFrom({
    ...IDLE,
    audio: { running: true, message: '', run: { planned: [planned[0]] }, solo: planned[0], current: { ...planned[0], startedAt: 7 } },
  }, STOPS);
  assert.equal(alone.solo, true);
  assert.equal(alone.key, 'ace-step-1.5-turbo');
  assert.equal(alone.step, null);
});

test('a picture comparison is shown, but is no one row’s test', () => {
  const planned = [
    { checkpoint: 'sdxl-turbo.safetensors', name: 'SDXL Turbo' },
    { checkpoint: 'sd15.safetensors', name: 'Stable Diffusion 1.5' },
  ];
  const activity = renderActivityFrom({
    ...IDLE,
    image: { running: true, message: 'Drawing 1 of 2: SDXL Turbo.', run: { planned }, current: { ...planned[0], startedAt: 9 } },
  }, STOPS);
  assert.equal(activity.key, null);
  assert.deepEqual(activity.step, { index: 0, total: 2 });
  assert.equal(renderLabel(activity), 'Drawing');
  assert.equal(renderChannel(activity.kind), 'images');
});

test('a picture drawn from a row outlives its panel, and only that test can end it', () => {
  const seen = [];
  const unsubscribe = subscribeImageTest(() => seen.push(imageTestSnapshot()?.message ?? null));
  let stopped = false;
  startImageTest({ key: 'sdxl-turbo', name: 'SDXL Turbo', message: 'Checking…', stop: () => { stopped = true; } }, 1);
  describeImageTest('sdxl-turbo', 'Drawing 512×512 with SDXL Turbo…');
  describeImageTest('sd15', 'not this test');
  const activity = renderActivityFrom({ ...IDLE, imageTest: imageTestSnapshot() }, STOPS);
  assert.equal(activity.model, 'SDXL Turbo');
  assert.equal(activity.startedAt, 1);
  assert.equal(activity.solo, true);
  assert.equal(activity.message, 'Drawing 512×512 with SDXL Turbo…');
  activity.stop();
  assert.ok(stopped, 'Stop reaches the drawing, wherever its panel went');
  endImageTest('sd15');
  assert.ok(imageTestSnapshot(), 'another test cannot end this one');
  endImageTest('sdxl-turbo');
  assert.equal(imageTestSnapshot(), null);
  unsubscribe();
  assert.deepEqual(seen, ['Checking…', 'Drawing 512×512 with SDXL Turbo…', null]);
});

const ended = (message, endedAt, failed = false) => ({ running: false, message, failed, endedAt });
const NOTHING_ENDED = { video: ended('', null), image: ended('', null), audio: ended('', null), imageTestOutcome: null };

test('the last render’s verdict is kept until a newer one ends, whichever path it took', () => {
  assert.equal(lastRenderOutcome(NOTHING_ENDED), null);
  const mochi = lastRenderOutcome({
    ...NOTHING_ENDED,
    video: ended('Mochi 1 10B failed: VAEDecodeTiled: Allocation on device 0 would exceed allowed memory.', 2000, true),
  });
  assert.equal(mochi.kind, 'video');
  assert.equal(mochi.failed, true);
  assert.match(mochi.message, /Mochi 1 10B failed/);
  const newer = lastRenderOutcome({
    ...NOTHING_ENDED,
    video: ended('Mochi 1 10B failed: out of memory', 2000, true),
    audio: ended('ACE-Step 1.5 Turbo made 30 s of audio in 12 s.', 3000),
  });
  assert.equal(newer.kind, 'audio', 'the newer verdict wins');
  assert.equal(newer.failed, false);
});

test('a run in progress has no verdict yet, even with an old one on record', () => {
  const outcome = lastRenderOutcome({
    ...NOTHING_ENDED,
    video: { running: true, message: 'Rendering Mochi 1 10B on its own.', failed: false, endedAt: 2000 },
  });
  assert.equal(outcome, null);
});

test('a picture drawn from a row leaves its verdict behind, even with its panel gone', () => {
  startImageTest({ key: 'sd15', name: 'Stable Diffusion 1.5', message: 'Drawing…', stop: () => {} }, 10);
  endImageTest('sd15', { message: 'Stable Diffusion 1.5 drew it in 4.2 s.', failed: false }, 20);
  const outcome = lastRenderOutcome({ ...NOTHING_ENDED, imageTestOutcome: imageTestOutcomeSnapshot() });
  assert.equal(outcome.kind, 'image');
  assert.equal(outcome.message, 'Stable Diffusion 1.5 drew it in 4.2 s.');
  assert.equal(outcome.endedAt, 20);
});

test('a clip made for RigMatch Chat shows as a video on every screen, with a Stop that reaches it', () => {
  let stopped = false;
  startImageTest({
    key: 'chat:gen-1', kind: 'video', name: 'Wan 2.2 5B',
    message: 'Making a clip for RigMatch Chat: “a lighthouse”', stop: () => { stopped = true; },
  }, 100);
  const activity = renderActivityFrom({ ...IDLE, imageTest: imageTestSnapshot() }, STOPS);
  assert.equal(activity.kind, 'video');
  assert.equal(renderLabel(activity), 'Rendering');
  assert.equal(renderChannel(activity.kind), 'video');
  activity.stop();
  assert.equal(stopped, true);
  endImageTest('chat:gen-1', { message: 'Wan 2.2 5B made a clip for RigMatch Chat.', failed: false }, 200);
  assert.equal(imageTestOutcomeSnapshot().kind, 'video', 'its verdict is a video’s, not a picture’s');
});
