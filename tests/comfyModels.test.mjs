import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { assertModelUrl, assertSafeFilename, resolveComfyRoot, verifyComfyFolder } =
  require('../electron/comfyModels.cjs');

/** A throwaway ComfyUI-shaped folder tree. */
async function makeTree({ nested = false, checkpoints = [] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comfy-test-'));
  const base = nested ? path.join(root, 'ComfyUI') : root;
  const dir = path.join(base, 'models', 'checkpoints');
  await fs.mkdir(dir, { recursive: true });
  for (const name of checkpoints) await fs.writeFile(path.join(dir, name), 'x');
  return { picked: root, expectedRoot: base };
}

test('only huggingface over https is accepted', () => {
  assert.ok(assertModelUrl('https://huggingface.co/org/repo/resolve/main/x.safetensors'));
  assert.throws(() => assertModelUrl('http://huggingface.co/x'), /https/);
  assert.throws(() => assertModelUrl('https://evil.example/x.safetensors'), /huggingface/);
  assert.throws(() => assertModelUrl('file:///etc/passwd'), /https/);
});

test('a filename cannot escape the folder it was meant for', () => {
  // This writes gigabytes to a path the user chose; "../.." would put one
  // anywhere on the disk.
  assert.equal(assertSafeFilename('sd15.safetensors'), 'sd15.safetensors');
  assert.throws(() => assertSafeFilename('../../evil.safetensors'), /Refusing/);
  assert.throws(() => assertSafeFilename('sub/dir.safetensors'), /Refusing/);
  assert.throws(() => assertSafeFilename('.hidden.safetensors'), /Refusing/);
  assert.throws(() => assertSafeFilename('payload.exe'), /safetensors/);
});

test('both ComfyUI layouts are found', async () => {
  // The portable build nests ComfyUI/models; a git clone has models at root.
  const flat = await makeTree();
  assert.equal(await resolveComfyRoot(flat.picked), flat.expectedRoot);
  const nested = await makeTree({ nested: true });
  assert.equal(await resolveComfyRoot(nested.picked), nested.expectedRoot);
});

test('a folder with no models/checkpoints is rejected with an actionable reason', async () => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'notcomfy-'));
  const result = await verifyComfyFolder(empty, []);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no models.checkpoints/i);
});

test('the folder of a DIFFERENT ComfyUI is refused', async () => {
  // The real hazard: two installs, and the user picks the one that is not
  // running. Six gigabytes would land where the live server never looks, and
  // the app would report success.
  const tree = await makeTree({ checkpoints: ['sd15.safetensors'] });
  const result = await verifyComfyFolder(tree.picked, ['ltx-video-2b-v0.9.5.safetensors']);
  assert.equal(result.ok, false);
  assert.match(result.reason, /different checkpoints|more than one ComfyUI/i);
});

test('the folder the running server reads is accepted', async () => {
  const tree = await makeTree({ checkpoints: ['ltx-video-2b-v0.9.5.safetensors'] });
  const result = await verifyComfyFolder(tree.picked, ['ltx-video-2b-v0.9.5.safetensors']);
  assert.equal(result.ok, true);
  assert.equal(result.root, tree.expectedRoot);
  assert.equal(result.warning, null);
});

test('a server listing extra checkpoints warns rather than refuses', async () => {
  // A second configured models folder is a real setup, and refusing it would
  // block someone whose choice was fine.
  const tree = await makeTree({ checkpoints: ['sd15.safetensors'] });
  const result = await verifyComfyFolder(tree.picked, ['sd15.safetensors', 'elsewhere.safetensors']);
  assert.equal(result.ok, true);
  assert.match(result.warning, /second models folder/i);
});

test('an empty server listing is consistent with an empty folder', async () => {
  const tree = await makeTree();
  const result = await verifyComfyFolder(tree.picked, []);
  assert.equal(result.ok, true);
});

test('case differences do not read as a different install', async () => {
  // ComfyUI lists what the filesystem gives it, and Windows does not care.
  const tree = await makeTree({ checkpoints: ['SD15.safetensors'] });
  const result = await verifyComfyFolder(tree.picked, ['sd15.safetensors']);
  assert.equal(result.ok, true);
});
