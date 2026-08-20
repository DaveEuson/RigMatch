// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runImageGeneration } from '../src/lib/imageGenRun.ts';
import { IMAGE_BENCHMARK_PROMPTS } from '../src/lib/imageGenScoring.ts';

const PROMPT = IMAGE_BENCHMARK_PROMPTS[0];
const IMAGE_REF = { filename: 'out.png', subfolder: '', type: 'output' };

/** A ComfyUI that becomes ready after `readyAfter` polls. */
function fakeComfy({ readyAfter = 1, images = [IMAGE_REF], status, onInterrupt } = {}) {
  let polls = 0;
  const calls = { submitted: 0, interrupts: [], freed: 0, graphs: [] };
  return {
    calls,
    transport: {
      free: async () => { calls.freed += 1; },
      submit: async (g) => { calls.submitted += 1; calls.graphs.push(g); return { promptId: 'p1' }; },
      history: async () => {
        polls += 1;
        if (polls < readyAfter) return {};
        const outputs = {};
        if (images.length) outputs['9'] = { images };
        return { p1: { outputs, status: status ?? { completed: true, status_str: 'success' } } };
      },
      image: async () => 'data:image/png;base64,AAAA',
      interrupt: async (id) => { calls.interrupts.push(id); onInterrupt?.(id); },
    },
  };
}

/** Clock that advances only when the run sleeps, so tests do not wait. */
function fakeClock(startAt = 0) {
  let t = startAt;
  return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } };
}

const alwaysYes = async () => 'Yes';

test('a clean run returns the image and a judged score', async () => {
  const { transport } = fakeComfy();
  const clock = fakeClock();
  const result = await runImageGeneration({
    transport, judge: alwaysYes, checkpoint: 'sd15.safetensors', imagePrompt: PROMPT, ...clock,
  });

  assert.equal(result.imageDataUrl, 'data:image/png;base64,AAAA');
  assert.equal(result.judged, true);
  assert.ok(result.score > 0);
  // The prompt has a proposition expected false, so a yes-machine cannot be 1.
  assert.ok(result.adherence < 1);
});

test('a run that fails mid-graph reports the ComfyUI error, not a silent zero', async () => {
  const { transport } = fakeComfy({
    images: [],
    status: {
      completed: false,
      status_str: 'error',
      messages: [['execution_error', { node_type: 'CheckpointLoaderSimple', exception_message: 'not found' }]],
    },
  });
  const result = await runImageGeneration({
    transport, checkpoint: 'missing.safetensors', imagePrompt: PROMPT, ...fakeClock(),
  });

  assert.equal(result.score, 0);
  assert.match(result.error, /CheckpointLoaderSimple: not found/);
});

test('a finished run with no image is a failure, not a scored blank', async () => {
  const { transport } = fakeComfy({ images: [] });
  const result = await runImageGeneration({
    transport, checkpoint: 'x', imagePrompt: PROMPT, ...fakeClock(),
  });
  assert.equal(result.score, 0);
  assert.match(result.error, /produced no image/);
});

test('the judge is not counted against generation speed', async () => {
  // A slow judge must not make the model look slow, or the speed score would
  // depend on which vision model happens to be installed.
  const clock = fakeClock();
  const { transport } = fakeComfy();
  const slowJudge = async () => { clock.advance(60000); return 'Yes'; };

  const result = await runImageGeneration({
    transport, judge: slowJudge, checkpoint: 'x', imagePrompt: PROMPT, ...clock,
  });
  assert.ok(result.elapsedMs < 5000, `elapsed included the judge: ${result.elapsedMs}ms`);
});

test('a run with no judge is scored but flagged unjudged', async () => {
  const { transport } = fakeComfy();
  const result = await runImageGeneration({
    transport, checkpoint: 'x', imagePrompt: PROMPT, ...fakeClock(),
  });
  assert.equal(result.judged, false);
  assert.equal(result.adherence, null);
  assert.ok(result.score <= 50);
});

test('a judge that throws does not sink the run, it just goes unjudged', async () => {
  const { transport } = fakeComfy();
  const result = await runImageGeneration({
    transport, judge: async () => { throw new Error('vision model died'); },
    checkpoint: 'x', imagePrompt: PROMPT, ...fakeClock(),
  });
  assert.equal(result.judged, false);
  assert.ok(result.imageDataUrl, 'the image should still be returned');
});

test('stopping a run interrupts ComfyUI rather than abandoning the GPU', async () => {
  // Abandoning it leaves the card pinned generating an image nobody will see.
  const { transport, calls } = fakeComfy({ readyAfter: 99 });
  const controller = new AbortController();
  controller.abort();

  const result = await runImageGeneration({
    transport, checkpoint: 'x', imagePrompt: PROMPT, signal: controller.signal, ...fakeClock(),
  });
  assert.deepEqual(calls.interrupts, ['p1']);
  assert.match(result.error, /stopped/i);
});

test('a run that never finishes times out and interrupts', async () => {
  const { transport, calls } = fakeComfy({ readyAfter: Number.MAX_SAFE_INTEGER });
  const result = await runImageGeneration({
    transport, checkpoint: 'x', imagePrompt: PROMPT, timeoutMs: 5000, ...fakeClock(),
  });
  assert.match(result.error, /did not finish within 5s/);
  assert.deepEqual(calls.interrupts, ['p1']);
});

test('polling waits for the image rather than giving up on the first empty history', async () => {
  const { transport } = fakeComfy({ readyAfter: 4 });
  const result = await runImageGeneration({
    transport, checkpoint: 'x', imagePrompt: PROMPT, ...fakeClock(),
  });
  assert.ok(result.imageDataUrl, 'should have waited for the image');
});

test('a shared ComfyUI is never freed by an image run either', () => {
  // Same contract as video: /free unloads every resident model, which is not
  // ours to do on an instance someone else is working in.
  const { transport, calls } = fakeComfy();
  return runImageGeneration({ transport, checkpoint: 'x', imagePrompt: PROMPT, ...fakeClock() })
    .then(() => assert.equal(calls.freed, 0));
});

test('an instance RigMatch owns is freed, and the unload is not timed', async () => {
  const clock = fakeClock();
  const { transport, calls } = fakeComfy();
  const slowFree = { ...transport, free: async () => { calls.freed += 1; clock.advance(30000); } };
  const r = await runImageGeneration({
    transport: slowFree, checkpoint: 'x', imagePrompt: PROMPT, dedicated: true, ...clock,
  });
  assert.equal(calls.freed, 1);
  assert.ok(r.elapsedMs < 5000, `unloading was counted as render time: ${r.elapsedMs}ms`);
});

test('the caller supplies the seed, so it can vary between batches', async () => {
  // A fixed seed made a rerun identical to ComfyUI, which answers from cache
  // in ~1.5s — and the run reported that as the render time.
  const { transport, calls } = fakeComfy();
  await runImageGeneration({
    transport, checkpoint: 'x', imagePrompt: PROMPT, settings: { seed: 4242 }, ...fakeClock(),
  });
  assert.equal(calls.graphs[0]['3'].inputs.seed, 4242);
});
