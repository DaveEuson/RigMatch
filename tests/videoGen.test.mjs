// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LTX_DEFAULTS,
  batchSeed,
  buildTxt2VideoWorkflow,
  comfyBusyCount,
  isTextEncoder,
  isVideoCheckpoint,
  middleFrameIndex,
} from '../src/lib/videoGen.ts';
import { videoReadiness } from '../src/lib/videoGenChallenge.ts';
import {
  COMFORTABLE_COST,
  realtimeCost,
  scoreVideoGeneration,
  scoreVideoSpeed,
} from '../src/lib/videoGenScoring.ts';

const REQ = { checkpoint: 'ltxv-2b-distilled.safetensors', textEncoder: 't5xxl_fp8_e4m3fn.safetensors', prompt: 'a lighthouse' };

test('the graph loads a separate text encoder, which LTX cannot run without', () => {
  const g = buildTxt2VideoWorkflow(REQ);
  assert.equal(g['38'].class_type, 'CLIPLoader');
  assert.equal(g['38'].inputs.clip_name, 't5xxl_fp8_e4m3fn.safetensors');
  assert.equal(g['38'].inputs.type, 'ltxv');
});

test('the sampler is wired to the scheduler, conditioning and latent', () => {
  const s = buildTxt2VideoWorkflow(REQ)['72'];
  assert.deepEqual(s.inputs.sigmas, ['71', 0]);
  assert.deepEqual(s.inputs.positive, ['69', 0]);
  assert.deepEqual(s.inputs.negative, ['69', 1]);
  assert.deepEqual(s.inputs.latent_image, ['70', 0]);
});

test('cfg defaults to 1.0, which is what the distilled model is trained for', () => {
  // Raising it both halves the speed and scorches the picture.
  assert.equal(buildTxt2VideoWorkflow(REQ)['72'].inputs.cfg, 1.0);
});

test('only one frame is saved, not the whole batch', () => {
  // Saving all of them wrote 97 PNGs per run and filled 1.5 GB during the
  // spike, and only one frame is ever judged.
  const g = buildTxt2VideoWorkflow({ ...REQ, frames: 97 });
  assert.equal(g['91'].class_type, 'ImageFromBatch');
  assert.equal(g['91'].inputs.length, 1);
  assert.deepEqual(g['90'].inputs.images, ['91', 0]);
});

test('the judged frame is the middle one, not the first', () => {
  assert.equal(middleFrameIndex(97), 48);
  assert.equal(middleFrameIndex(1), 0);
  assert.equal(middleFrameIndex(0), 0);
});

test('a video checkpoint is told apart from an image one', () => {
  // Handing an image checkpoint to a video graph fails deep in the sampler
  // with a shape error no user could act on.
  assert.ok(isVideoCheckpoint('ltxv-2b-distilled.safetensors'));
  assert.ok(isVideoCheckpoint('wan2.1_t2v_1.3B.safetensors'));
  assert.ok(isVideoCheckpoint('hunyuanvideo_720.safetensors'));
  assert.ok(!isVideoCheckpoint('sd15.safetensors'));
  assert.ok(!isVideoCheckpoint('sdxl_base_1.0.safetensors'));
});

test('a text encoder is recognised', () => {
  assert.ok(isTextEncoder('t5xxl_fp8_e4m3fn.safetensors'));
  assert.ok(isTextEncoder('umt5_xxl_fp8.safetensors'));
  assert.ok(!isTextEncoder('ltxv-2b-distilled.safetensors'));
});

test('realtime cost matches what was measured on the 4070', () => {
  // 4.0s of footage (97 frames at 24fps) took 12.1s -> 3.0x.
  assert.equal(realtimeCost(12100, 97, 24).toFixed(1), '3.0');
  // The same footage at 1920x1088 took 70.7s -> 17.5x.
  assert.equal(realtimeCost(70700, 97, 24).toFixed(1), '17.5');
});

test('speed is scored on cost per second of footage, not wall time', () => {
  // Eight seconds of video in twice the time is the same machine.
  assert.equal(scoreVideoSpeed(24000, 194, 24), scoreVideoSpeed(12000, 97, 24));
});

test('a 3x realtime run scores full speed marks', () => {
  assert.equal(scoreVideoSpeed(COMFORTABLE_COST * 1000 * (97 / 24), 97, 24), 1);
});

test('VRAM is deliberately not a component of the video score', () => {
  // Every resolution saturated a 12 GB card, so a fit check would return the
  // same answer for every run on every machine.
  const facts = { produced: true, elapsedMs: 12100, frames: 97, fps: 24, width: 768, height: 512, adherence: 1 };
  const scored = scoreVideoGeneration(facts);
  assert.ok(!scored.checks.some((c) => /vram|fits/i.test(c.label)),
    'a VRAM check would not discriminate between machines');
});

test('motion quality is reported as unmeasured rather than scored', () => {
  const scored = scoreVideoGeneration({ produced: true, elapsedMs: 12100, frames: 97, fps: 24, width: 768, height: 512, adherence: 1 });
  const motion = scored.checks.find((c) => c.label === 'Motion quality');
  assert.ok(motion, 'motion must be listed so nobody reads the total as covering it');
  assert.match(motion.detail, /not measured/i);
  // And a perfect fast run still reaches full marks despite that check failing,
  // because it is a statement rather than a penalty.
  assert.equal(scored.score, 100);
});

test('an unjudged video cannot reach full marks on speed alone', () => {
  const scored = scoreVideoGeneration({ produced: true, elapsedMs: 4000, frames: 97, fps: 24, width: 768, height: 512, adherence: null });
  assert.equal(scored.judged, false);
  assert.ok(scored.score <= 60, `unjudged run scored ${scored.score}`);
});

test('a slow Full HD run scores far below a fast small one', () => {
  const fast = scoreVideoGeneration({ produced: true, elapsedMs: 12100, frames: 97, fps: 24, width: 768, height: 512, adherence: 1 });
  const slow = scoreVideoGeneration({ produced: true, elapsedMs: 70700, frames: 97, fps: 24, width: 1920, height: 1088, adherence: 1 });
  assert.ok(fast.score > slow.score + 20, `${fast.score} vs ${slow.score}`);
});

test('producing nothing scores zero however fast it failed', () => {
  const none = scoreVideoGeneration({ produced: false, elapsedMs: 300, frames: 97, fps: 24, width: 768, height: 512, adherence: null });
  assert.equal(none.score, 0);
  assert.equal(none.grade, 'F');
});

test('the defaults are the measured-good LTX settings', () => {
  assert.equal(LTX_DEFAULTS.steps, 8);
  assert.equal(LTX_DEFAULTS.cfg, 1.0);
  assert.equal(LTX_DEFAULTS.frames, 97);
});

test('a batch seed is stable within a batch and different between batches', () => {
  // Same seed across models in one comparison keeps it fair; a different seed
  // next time keeps ComfyUI from replaying its cache, which returns the
  // previous video in 1.5s where a fresh seed takes 9-11s.
  assert.equal(batchSeed(1_700_000_000_000), batchSeed(1_700_000_000_400));
  assert.notEqual(batchSeed(1_700_000_000_000), batchSeed(1_700_000_060_000));
});

test('a batch seed stays inside the range ComfyUI accepts', () => {
  for (const t of [0, 1_700_000_000_000, 4_100_000_000_000]) {
    const seed = batchSeed(t);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2147483647, `seed ${seed} out of range`);
  }
});

test('a busy ComfyUI is detected before submitting alongside it', () => {
  // Submitting into a queue does not fail, it shares a GPU — and the time that
  // produces says nothing about the machine, which is worse than refusing.
  assert.equal(comfyBusyCount({ exec_info: { queue_remaining: 2 } }), 2);
  assert.equal(comfyBusyCount({ exec_info: { queue_remaining: 0 } }), 0);
});

test('an unreadable queue reply counts as idle rather than blocking a run', () => {
  assert.equal(comfyBusyCount(null), 0);
  assert.equal(comfyBusyCount({}), 0);
  assert.equal(comfyBusyCount({ exec_info: { queue_remaining: 'lots' } }), 0);
});

test('a ComfyUI holding only a video model is not ready for images', () => {
  // The Image Lab filters video checkpoints out of its picker. Judging
  // readiness on the unfiltered list rendered the ready branch with an empty
  // dropdown and a dead Run button, explaining nothing — found by walking the
  // live app after a checkpoint folder changed underneath it.
  const only = ['ltx-video-2b-v0.9.5.safetensors'];
  assert.deepEqual(only.filter((n) => !isVideoCheckpoint(n)), [],
    'nothing is left for the image picker to offer');
});

test('the same ComfyUI IS ready for video, given an encoder', () => {
  const ready = videoReadiness(['ltx-video-2b-v0.9.5.safetensors'], ['t5xxl_fp8_e4m3fn_scaled.safetensors']);
  assert.equal(ready.kind, 'ready');
  assert.deepEqual(ready.checkpoints, ['ltx-video-2b-v0.9.5.safetensors']);
});

test('a scaled fp8 encoder filename is still recognised as an encoder', () => {
  // The real folder held t5xxl_fp8_e4m3fn_scaled.safetensors, not the exact
  // name the docs use.
  assert.ok(isTextEncoder('t5xxl_fp8_e4m3fn_scaled.safetensors'));
});

test('the 0.9.5 point release is recognised as a video checkpoint', () => {
  assert.ok(isVideoCheckpoint('ltx-video-2b-v0.9.5.safetensors'));
});

test('a ComfyUI with only a video model is ready for video, whatever images think', () => {
  // The video card used to gate on the Image Lab's readiness, which excludes
  // video checkpoints — so the one setup video exists for (a video checkpoint
  // and nothing else) declared itself unavailable. Caught by clicking Run in
  // the live app and finding no button.
  const ready = videoReadiness(['ltx-video-2b-v0.9.5.safetensors'], ['t5xxl_fp8_e4m3fn_scaled.safetensors']);
  assert.equal(ready.kind, 'ready');
  const imagePickerOffers = ['ltx-video-2b-v0.9.5.safetensors'].filter((n) => !isVideoCheckpoint(n));
  assert.deepEqual(imagePickerOffers, [], 'images have nothing, and that must not stop video');
});

test('a umt5 encoder is recognised, as WAN models need one', () => {
  assert.ok(isTextEncoder('umt5_xxl_fp8_e4m3fn_scaled.safetensors'));
});
