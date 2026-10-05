// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ComfyUI Desktop, the official one-click installer, serves on 8000; the
 * portable and hand-installed builds serve on 8188. RigMatch only looked on
 * 8188, so a newcomer who installed the easy one was told it was not found
 * while it sat there answering. These pin where RigMatch looks, in what
 * order, and that something else on 8000 is not mistaken for ComfyUI.
 */

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
};

const {
  COMFY_DEFAULT_BASE_URL, COMFY_DESKTOP_BASE_URL, COMFY_DOWNLOAD_URL, COMFY_URL_STORAGE_KEY,
  comfyAddressCandidates, readComfySettings, rememberFoundComfyUrl,
} = await import('../src/lib/comfySettings.ts');
const { findComfy, looksLikeComfy } = await import('../src/lib/comfyTransport.ts');

const comfyStats = { system: { comfyui_version: '0.3.60' }, devices: [{ name: 'cuda:0' }] };
const answers = (byAddress) => async (address) => byAddress[address] ?? { reachable: false, checkpoints: [] };

test('with no address set, RigMatch looks on 8188 and then 8000', () => {
  store.clear();
  assert.equal(COMFY_DESKTOP_BASE_URL, 'http://127.0.0.1:8000');
  assert.deepEqual(comfyAddressCandidates(), [COMFY_DEFAULT_BASE_URL, COMFY_DESKTOP_BASE_URL]);
  assert.equal(readComfySettings().baseUrl, COMFY_DEFAULT_BASE_URL);
});

test('where it was found is tried first, and is the address every run uses', () => {
  store.clear();
  rememberFoundComfyUrl(COMFY_DESKTOP_BASE_URL);
  assert.deepEqual(comfyAddressCandidates(), [COMFY_DESKTOP_BASE_URL, COMFY_DEFAULT_BASE_URL]);
  assert.equal(readComfySettings().baseUrl, COMFY_DESKTOP_BASE_URL);
});

test('an address set in Settings is the only place looked', () => {
  store.clear();
  store.set(COMFY_URL_STORAGE_KEY, 'http://127.0.0.1:9000');
  rememberFoundComfyUrl(COMFY_DESKTOP_BASE_URL);
  assert.deepEqual(comfyAddressCandidates(), ['http://127.0.0.1:9000']);
  assert.equal(readComfySettings().baseUrl, 'http://127.0.0.1:9000');
});

test('a stored 8188 counts as unset, so it cannot hide a Desktop copy on 8000', () => {
  // The Settings field saved whatever it held on blur, so many profiles carry
  // the default without anyone having chosen it.
  store.clear();
  store.set(COMFY_URL_STORAGE_KEY, COMFY_DEFAULT_BASE_URL);
  assert.deepEqual(comfyAddressCandidates(), [COMFY_DEFAULT_BASE_URL, COMFY_DESKTOP_BASE_URL]);
});

test('a Desktop copy on 8000 is found when nothing answers on 8188', async () => {
  const found = await findComfy([COMFY_DEFAULT_BASE_URL, COMFY_DESKTOP_BASE_URL], answers({
    [COMFY_DESKTOP_BASE_URL]: { reachable: true, stats: comfyStats, checkpoints: ['z.safetensors'] },
  }));
  assert.equal(found.address, COMFY_DESKTOP_BASE_URL);
  assert.deepEqual(found.status.checkpoints, ['z.safetensors']);
});

test('the first address that answers wins', async () => {
  const found = await findComfy([COMFY_DEFAULT_BASE_URL, COMFY_DESKTOP_BASE_URL], answers({
    [COMFY_DEFAULT_BASE_URL]: { reachable: true, stats: comfyStats, checkpoints: ['a'] },
    [COMFY_DESKTOP_BASE_URL]: { reachable: true, stats: comfyStats, checkpoints: ['b'] },
  }));
  assert.equal(found.address, COMFY_DEFAULT_BASE_URL);
});

test('something else answering on 8000 is not taken for ComfyUI', async () => {
  // 8000 is a common development-server port.
  const other = { reachable: true, stats: { ok: true }, checkpoints: [] };
  assert.equal(looksLikeComfy(other), false);
  const found = await findComfy([COMFY_DEFAULT_BASE_URL, COMFY_DESKTOP_BASE_URL], answers({ [COMFY_DESKTOP_BASE_URL]: other }));
  assert.equal(found.address, null);
  assert.equal(found.status.reachable, false);
});

test('the download link opens: the main process allows comfy.org', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const host = new URL(COMFY_DOWNLOAD_URL).hostname;
  assert.match(main, new RegExp(`'${host.replace(/\./g, '\\.')}'`), `${host} is not in ALLOWED_EXTERNAL_HOSTS, so the link would do nothing`);
});
