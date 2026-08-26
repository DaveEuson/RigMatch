// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

// comfyTransport reaches the preload bridge through api.ts, which reads
// `window` on import. Same stub the other transport tests use.
globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };

const { locateComfyFolder } = await import('../src/lib/comfyTransport.ts');

/**
 * Finding ComfyUI, which two very different surfaces now depend on.
 *
 * Settings has always had this. Simple Mode had nothing: a beginner who picked
 * "making images" was refused at the download and told to open Settings →
 * Generation, a panel Simple Mode does not have. The search is shared rather
 * than copied, so this is the one place the branching is checked.
 *
 * What matters is the reason, not the message. "Not running" and "running but
 * unrecognisable" lead to opposite advice — start the program, versus pick the
 * folder yourself — and each caller words it for the controls it can offer.
 */

const deps = ({ reachable = true, checkpoints = [], found = null, locate, noBridge = false } = {}) => {
  const remembered = [];
  return {
    remembered,
    deps: {
      status: async () => ({ reachable, checkpoints }),
      // noBridge is explicit rather than `locate: undefined`, which would be
      // indistinguishable from "not overridden" and silently take the default.
      locate: noBridge
        ? undefined
        : (locate ?? (async () => (found ? { found: true, folder: found } : { found: false }))),
      remember: (folder) => remembered.push(folder),
    },
  };
};

test('a folder that is found is returned and remembered', async () => {
  const { deps: d, remembered } = deps({ found: 'C:/ComfyUI/models' });
  const outcome = await locateComfyFolder('http://127.0.0.1:8188', d);

  assert.deepEqual(outcome, { found: true, folder: 'C:/ComfyUI/models' });
  // Saved by the search itself. One caller is a notice with a single button,
  // where a forgotten follow-up write would look like success and then send a
  // multi-gigabyte download nowhere.
  assert.deepEqual(remembered, ['C:/ComfyUI/models']);
});

test('nothing is remembered when the search comes back empty', async () => {
  const { deps: d, remembered } = deps({ found: null });
  const outcome = await locateComfyFolder('http://127.0.0.1:8188', d);

  assert.equal(outcome.found, false);
  assert.deepEqual(remembered, [], 'a failed search must not leave a folder behind');
});

test('not running and unrecognisable are told apart', async () => {
  // The whole point of returning a reason. Telling someone to pick the folder
  // when ComfyUI simply is not started sends them looking for a directory that
  // the search would have found on its own a moment later.
  const stopped = await locateComfyFolder('http://127.0.0.1:8188', deps({ reachable: false }).deps);
  assert.deepEqual(stopped, { found: false, reason: 'not-running' });

  const running = await locateComfyFolder('http://127.0.0.1:8188', deps({ reachable: true }).deps);
  assert.deepEqual(running, { found: false, reason: 'cannot-tell' });
});

test('a build with no bridge says so instead of reporting nothing found', async () => {
  // A browser preview and an older preload both lack the call. "Could not work
  // it out" would be a lie there — nothing was ever asked.
  const outcome = await locateComfyFolder('http://127.0.0.1:8188', deps({ noBridge: true }).deps);
  assert.deepEqual(outcome, { found: false, reason: 'no-bridge' });
});

test('the checkpoints the running server lists are what the folder is checked against', async () => {
  // Two ComfyUI installs on one machine is ordinary, and the listing is the
  // only thing that distinguishes the live one. Passing an empty list would
  // make any folder verifiable.
  let sawCheckpoints = null;
  const { deps: d } = deps({
    checkpoints: ['sdxl-turbo.safetensors', 'sd15.safetensors'],
    locate: async (_url, checkpoints) => {
      sawCheckpoints = checkpoints;
      return { found: true, folder: '/opt/ComfyUI/models' };
    },
  });
  await locateComfyFolder('http://127.0.0.1:8188', d);

  assert.deepEqual(sawCheckpoints, ['sdxl-turbo.safetensors', 'sd15.safetensors']);
});
