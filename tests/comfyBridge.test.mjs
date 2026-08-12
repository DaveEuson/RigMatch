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
