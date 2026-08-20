// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runVideoGeneration } from '../src/lib/videoGenRun.ts';
import { IMAGE_BENCHMARK_PROMPTS } from '../src/lib/imageGenScoring.ts';

const PROMPT = IMAGE_BENCHMARK_PROMPTS[0];
const FRAME = { filename: 'RigMatchFrame_00001_.png', subfolder: '', type: 'output' };
const VIDEO = { filename: 'RigMatch_00001_.mp4', subfolder: 'video', type: 'output' };

function fakeComfy({ readyAfter = 1, outputs, status } = {}) {
  let polls = 0;
  const calls = { freed: 0, submitted: 0, interrupts: [], graphs: [] };
  return {
    calls,
    transport: {
      free: async () => { calls.freed += 1; },
      submit: async (g) => { calls.submitted += 1; calls.graphs.push(g); return { promptId: 'v1' }; },
      history: async () => {
        polls += 1;
        if (polls < readyAfter) return {};
        return { v1: {
          outputs: outputs ?? { 90: { images: [FRAME] }, 79: { images: [VIDEO] } },
          status: status ?? { completed: true, status_str: 'success' },
        } };
      },
      image: async () => 'data:image/png;base64,AAAA',
      interrupt: async (id) => { calls.interrupts.push(id); },
    },
  };
}

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } };
}

const yes = async () => 'Yes';
const BASE = { checkpoint: 'ltxv-2b-distilled.safetensors', textEncoder: 't5xxl_fp8_e4m3fn.safetensors', imagePrompt: PROMPT };

test('a shared ComfyUI is never freed', async () => {
  // /free unloads every resident model. The people most likely to already have
  // ComfyUI are using it for their own work, and silently evicting their
  // working set before each benchmark run is not acceptable.
  const { transport, calls } = fakeComfy();
  await runVideoGeneration({ transport, ...BASE, ...fakeClock() });
  assert.equal(calls.freed, 0, 'the default must leave a shared instance alone');
});

test('an instance RigMatch owns is freed, for a clean VRAM reading', async () => {
  const { transport, calls } = fakeComfy();
  await runVideoGeneration({ transport, ...BASE, dedicated: true, ...fakeClock() });
  assert.equal(calls.freed, 1);
});

test('freeing is not counted as generation time', async () => {
  const clock = fakeClock();
  const { transport } = fakeComfy();
  const slowFree = { ...transport, free: async () => { clock.advance(30000); } };
  const r = await runVideoGeneration({ transport: slowFree, ...BASE, dedicated: true, ...clock });
  assert.ok(r.elapsedMs < 5000, `free leaked into the measurement: ${r.elapsedMs}ms`);
});

test('a clean run returns the frame, the video reference and a judged score', async () => {
  const { transport } = fakeComfy();
  const r = await runVideoGeneration({ transport, judge: yes, ...BASE, ...fakeClock() });
  assert.equal(r.frameDataUrl, 'data:image/png;base64,AAAA');
  assert.deepEqual(r.videoRef, VIDEO);
  assert.equal(r.judged, true);
  assert.ok(r.score > 0);
});

test('the video is referenced, not inlined as a data URL', async () => {
  // A few seconds of footage is megabytes; carrying it through IPC as base64
  // would be far worse than pointing at where ComfyUI already wrote it.
  const { transport } = fakeComfy();
  const r = await runVideoGeneration({ transport, ...BASE, ...fakeClock() });
  assert.ok(!('videoDataUrl' in r));
  assert.equal(r.videoRef.filename, 'RigMatch_00001_.mp4');
});

test('the judge is not counted against render speed', async () => {
  const clock = fakeClock();
  const { transport } = fakeComfy();
  const slowJudge = async () => { clock.advance(45000); return 'Yes'; };
  const r = await runVideoGeneration({ transport, judge: slowJudge, ...BASE, ...clock });
  assert.ok(r.elapsedMs < 5000, `elapsed included the judge: ${r.elapsedMs}ms`);
});

test('a failure mid-graph reports the ComfyUI error', async () => {
  const { transport } = fakeComfy({
    outputs: {},
    status: { completed: false, status_str: 'error', messages: [['execution_error', { node_type: 'CLIPLoader', exception_message: 't5 not found' }]] },
  });
  const r = await runVideoGeneration({ transport, ...BASE, ...fakeClock() });
  assert.equal(r.score, 0);
  assert.match(r.error, /CLIPLoader: t5 not found/);
});

test('a finished run with no outputs is a failure, not a scored blank', async () => {
  const { transport } = fakeComfy({ outputs: {} });
  const r = await runVideoGeneration({ transport, ...BASE, ...fakeClock() });
  assert.equal(r.score, 0);
  assert.match(r.error, /produced no video/);
});

test('stopping interrupts ComfyUI rather than abandoning the GPU', async () => {
  const { transport, calls } = fakeComfy({ readyAfter: 999 });
  const c = new AbortController();
  c.abort();
  const r = await runVideoGeneration({ transport, ...BASE, signal: c.signal, ...fakeClock() });
  assert.deepEqual(calls.interrupts, ['v1']);
  assert.match(r.error, /stopped/i);
});

test('a run that never finishes times out and interrupts', async () => {
  const { transport, calls } = fakeComfy({ readyAfter: Number.MAX_SAFE_INTEGER });
  const r = await runVideoGeneration({ transport, ...BASE, timeoutMs: 60000, ...fakeClock() });
  assert.match(r.error, /did not finish/);
  assert.deepEqual(calls.interrupts, ['v1']);
});

test('the settings reach the graph', async () => {
  const { transport, calls } = fakeComfy();
  await runVideoGeneration({
    transport, ...BASE, settings: { width: 1280, height: 768, frames: 193, steps: 12, seed: 7 }, ...fakeClock(),
  });
  const g = calls.graphs[0];
  assert.equal(g['70'].inputs.width, 1280);
  assert.equal(g['70'].inputs.length, 193);
  assert.equal(g['71'].inputs.steps, 12);
  assert.equal(g['72'].inputs.noise_seed, 7);
});

test('realtime cost is reported, since it is the headline number', async () => {
  const clock = fakeClock();
  const { transport } = fakeComfy({ readyAfter: 9 });  // 8 sleeps of 1500ms = 12s
  const r = await runVideoGeneration({ transport, ...BASE, ...clock });
  // 97 frames at 24fps is 4.04s of footage; 12s of compute is about 3x.
  assert.ok(r.realtimeCost > 2.5 && r.realtimeCost < 3.5, `cost was ${r.realtimeCost}`);
});
