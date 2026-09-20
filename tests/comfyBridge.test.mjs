// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createComfyBridge } = require('../electron/comfy.cjs');

/** Records what the bridge asked for, and answers with whatever is queued. */
function harness(responses = {}) {
  const calls = [];
  const guarded = [];
  const bridge = createComfyBridge({
    assertLocalhostUrl: (url) => {
      guarded.push(url);
      if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url)) {
        throw new Error('Ollama URL must point to localhost');
      }
    },
    fetchJson: async (url, options = {}) => {
      calls.push({ url, method: options.method ?? 'GET', body: options.body });
      for (const [pattern, value] of Object.entries(responses)) {
        if (url.includes(pattern)) {
          if (value instanceof Error) throw value;
          return typeof value === 'function' ? value() : value;
        }
      }
      return {};
    },
  });
  return { bridge, calls, guarded };
}

const LOCAL = 'http://127.0.0.1:8188';

test('a missing checkpoint is surfaced, not swallowed as a successful submit', () => {
  // ComfyUI answers 200 with node_errors populated, so an ok-status check
  // alone would queue a job that never produces anything and then time out.
  const { bridge } = harness({
    '/prompt': {
      prompt_id: 'abc',
      node_errors: { 4: { errors: [{ message: 'value not in list: ckpt_name' }] } },
    },
  });
  return assert.rejects(
    () => bridge.submit(LOCAL, { 4: {} }),
    /rejected the workflow.*node 4.*value not in list/s,
  );
});

test('a submit with no prompt id is an error rather than an undefined job', async () => {
  const { bridge } = harness({ '/prompt': { node_errors: {} } });
  await assert.rejects(() => bridge.submit(LOCAL, { 4: {} }), /returned no prompt id/);
});

test('a clean submit returns the prompt id and posts the graph', async () => {
  const { bridge, calls } = harness({ '/prompt': { prompt_id: 'xyz', node_errors: {} } });
  const result = await bridge.submit(LOCAL, { 4: { class_type: 'CheckpointLoaderSimple' } });

  assert.deepEqual(result, { promptId: 'xyz' });
  assert.equal(calls[0].method, 'POST');
  assert.match(JSON.parse(calls[0].body).prompt['4'].class_type, /CheckpointLoaderSimple/);
});

test('a server with no listable checkpoints still reports as reachable', async () => {
  // Older builds have no /models/{folder}. Treating that as "down" would tell
  // the user ComfyUI is not running while it sits there answering.
  const { bridge } = harness({
    '/system_stats': { devices: [{ name: 'cuda:0' }] },
    '/models/checkpoints': new Error('404'),
  });
  const status = await bridge.getStatus(LOCAL);
  assert.equal(status.reachable, true);
  assert.deepEqual(status.checkpoints, []);
});

/** What the shared fetch helper raises when nothing answers on the port. */
const REFUSED = new Error('Cannot reach local AI service at http://127.0.0.1:8188. '
  + 'Make sure Ollama or LM Studio is installed, running, and serving a local API.');

test('a ComfyUI that is not running is an answer, not a failure', async () => {
  // It is a separate program the user starts themselves, and the status poll
  // runs every fifteen seconds. Throwing made the IPC handler log an error with
  // a stack on every miss — 240 an hour, in the log testers are asked to send.
  const { bridge } = harness({ '/system_stats': REFUSED });
  const status = await bridge.getStatus(LOCAL);
  assert.equal(status.reachable, false);
  assert.deepEqual(status.checkpoints, []);
});

test('a server that answers badly is still a failure', async () => {
  // Reachable and broken is a fault worth surfacing; only "nothing answered"
  // is the ordinary case.
  const { bridge } = harness({ '/system_stats': new Error('500 Internal Server Error') });
  await assert.rejects(() => bridge.getStatus(LOCAL), /500/);
});

test('an unreachable ComfyUI names ComfyUI, not Ollama', async () => {
  // The shared helper's message is written for the model provider, so a render
  // against a stopped ComfyUI on 8188 sent the reader to check Ollama.
  const { bridge } = harness({ '/prompt': REFUSED });
  await assert.rejects(
    () => bridge.submit(LOCAL, { 1: { class_type: 'X' } }),
    (error) => /Cannot reach ComfyUI at http:\/\/127\.0\.0\.1:8188/.test(error.message)
      && !/Ollama|LM Studio/.test(error.message),
  );
});

test('checkpoints are listed when the server offers them', async () => {
  const { bridge } = harness({
    '/system_stats': { devices: [] },
    '/models/checkpoints': ['sd15.safetensors', 'sdxl.safetensors', 7],
  });
  const status = await bridge.getStatus(LOCAL);
  assert.deepEqual(status.checkpoints, ['sd15.safetensors', 'sdxl.safetensors']);
});

test('Stop names the prompt it is stopping', async () => {
  // A bare interrupt kills whatever is running, which could be a job the user
  // started from ComfyUI's own interface.
  const { bridge, calls } = harness({ '/interrupt': {} });
  await bridge.interrupt(LOCAL, 'abc');
  assert.deepEqual(JSON.parse(calls[0].body), { prompt_id: 'abc' });
});

test('a non-local ComfyUI URL is refused', async () => {
  const { bridge } = harness();
  await assert.rejects(() => bridge.getStatus('http://192.168.1.50:8188'), /localhost/);
  await assert.rejects(() => bridge.submit('http://evil.example/', {}), /localhost/);
});

test('a trailing slash does not produce a doubled path', async () => {
  const { bridge, calls } = harness({ '/prompt': { prompt_id: 'a', node_errors: {} } });
  await bridge.submit('http://127.0.0.1:8188/', { 4: {} });
  assert.equal(calls[0].url, 'http://127.0.0.1:8188/prompt');
});

test('history is looked up by the prompt id, url-escaped', async () => {
  const { bridge, calls } = harness({ '/history/': { abc: { outputs: {} } } });
  await bridge.getHistory(LOCAL, 'a b/c');
  assert.equal(calls[0].url, 'http://127.0.0.1:8188/history/a%20b%2Fc');
});

test('every folder a lineup model loads from is listed, by ComfyUI\'s own name', async () => {
  // The video lineup keeps models in diffusion_models with separate VAEs and
  // LoRAs. Listing only checkpoints and text encoders made every one of them
  // read as missing, and offered to download files already on disk.
  const { bridge } = harness({
    '/system_stats': { system: {} },
    '/models/checkpoints': ['ltx-2.3-22b-dev-fp8.safetensors'],
    '/models/text_encoders': ['umt5_xxl_fp8_e4m3fn_scaled.safetensors'],
    '/models/diffusion_models': ['wan2.1_t2v_1.3B_fp16.safetensors'],
    '/models/vae': ['wan_2.1_vae.safetensors'],
    '/models/loras': [],
  });
  const status = await bridge.getStatus(LOCAL);
  assert.deepEqual(status.folders, {
    checkpoints: ['ltx-2.3-22b-dev-fp8.safetensors'],
    text_encoders: ['umt5_xxl_fp8_e4m3fn_scaled.safetensors'],
    diffusion_models: ['wan2.1_t2v_1.3B_fp16.safetensors'],
    vae: ['wan_2.1_vae.safetensors'],
    loras: [],
  });
  // The Image Lab and the LTX path still read these two by name.
  assert.deepEqual(status.checkpoints, ['ltx-2.3-22b-dev-fp8.safetensors']);
  assert.deepEqual(status.textEncoders, ['umt5_xxl_fp8_e4m3fn_scaled.safetensors']);
});
