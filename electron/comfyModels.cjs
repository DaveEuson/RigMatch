/**
 * Putting generation models where ComfyUI will find them.
 *
 * ComfyUI does not say where it lives. /system_stats reports its version, its
 * Python and its devices, and its argv is the relative "ComfyUI\main.py" — so
 * the running server can be asked what checkpoints it has, but not where they
 * are. Everything here follows from that: the folder is chosen by the user,
 * and then *verified* rather than trusted.
 *
 * Verification matters more than it sounds. Someone with two ComfyUI installs
 * — which is not unusual, and was the case on the machine this was written on
 * — can easily pick the folder of the one that is not running. Writing six
 * gigabytes into a folder the live server never reads, then reporting success,
 * is the worst outcome available. So a folder is only accepted when the
 * checkpoints on disk match the checkpoints the server reports over HTTP.
 */

const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

/** Subfolders a download is ever allowed to target. */
const ALLOWED_FOLDERS = new Set(['checkpoints', 'text_encoders']);

/** Only Hugging Face, and only over TLS. */
function assertModelUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error('That is not a valid download URL.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Model downloads must use https.');
  if (parsed.hostname !== 'huggingface.co' && !parsed.hostname.endsWith('.huggingface.co')) {
    throw new Error('Model downloads are restricted to huggingface.co.');
  }
  return parsed.toString();
}

/**
 * A filename that cannot escape the folder it was meant for.
 *
 * The catalogue is ours, but this writes multi-gigabyte files to a path the
 * user chose, and "../../" in a filename would put one anywhere on the disk.
 */
function assertSafeFilename(filename) {
  const name = String(filename || '');
  if (!name || name !== path.basename(name) || name.startsWith('.')) {
    throw new Error(`Refusing to write a file named "${name}".`);
  }
  if (!/^[\w.-]+\.safetensors$/i.test(name)) {
    throw new Error('Only .safetensors files can be downloaded.');
  }
  return name;
}

function modelsDir(comfyRoot, folder) {
  if (!ALLOWED_FOLDERS.has(folder)) throw new Error(`Unknown model folder "${folder}".`);
  // Both layouts exist: the portable build nests ComfyUI/models, a git clone
  // has models at the root. Callers pass whichever verify() accepted.
  return path.join(comfyRoot, 'models', folder);
}

/**
 * Find the models directory under a folder the user picked.
 *
 * Accepts either the portable layout (<root>/ComfyUI/models) or a plain
 * checkout (<root>/models), so someone can pick the folder that looks like
 * "the ComfyUI one" either way.
 */
async function resolveComfyRoot(picked) {
  const candidates = [picked, path.join(picked, 'ComfyUI')];
  for (const root of candidates) {
    try {
      const stat = await fs.stat(path.join(root, 'models', 'checkpoints'));
      if (stat.isDirectory()) return root;
    } catch {
      // Try the next layout.
    }
  }
  return null;
}

/**
 * Is this folder the one the running server reads?
 *
 * Compares the checkpoints on disk with those the server lists. Equal sets is
 * proof; a disjoint pair means two different installs and the folder is
 * rejected. A subset is accepted with a warning rather than refused — a server
 * started before a file was added lists fewer than the disk holds, and that is
 * a stale listing rather than a wrong folder.
 */
async function verifyComfyFolder(picked, serverCheckpoints) {
  const root = await resolveComfyRoot(String(picked || ''));
  if (!root) {
    return { ok: false, reason: 'That folder has no models/checkpoints inside it. Pick the ComfyUI folder itself.' };
  }

  let onDisk = [];
  try {
    onDisk = (await fs.readdir(modelsDir(root, 'checkpoints')))
      .filter((name) => name.toLowerCase().endsWith('.safetensors'));
  } catch {
    return { ok: false, reason: 'That folder could not be read.' };
  }

  const listed = (serverCheckpoints ?? []).map((n) => String(n).toLowerCase());
  const have = new Set(onDisk.map((n) => n.toLowerCase()));

  if (listed.length === 0) {
    // Nothing to compare against; the folder is structurally right and the
    // server has no checkpoints, which is consistent.
    return { ok: true, root, onDisk, warning: null };
  }

  const overlap = listed.filter((n) => have.has(n));
  if (overlap.length === 0) {
    return {
      ok: false,
      reason: 'That folder holds different checkpoints from the ComfyUI that is running, '
        + 'so a download would land somewhere it never reads. If you have more than one '
        + 'ComfyUI, pick the one serving the address above.',
    };
  }

  const missing = listed.filter((n) => !have.has(n));
  return {
    ok: true,
    root,
    onDisk,
    warning: missing.length
      ? `The running ComfyUI also lists ${missing.length} checkpoint(s) this folder does not hold. `
        + 'That usually means a second models folder is configured; downloads will go to this one.'
      : null,
  };
}

/**
 * Stream a model to disk, reporting progress.
 *
 * Written to a .part file and renamed only once complete. A truncated
 * .safetensors is worse than no file: ComfyUI lists it, offers it, and then
 * fails deep in the loader with an error that looks like a broken model.
 */
async function downloadModel({ root, folder, filename, url, expectedBytes }, onProgress, signal) {
  const safeName = assertSafeFilename(filename);
  const safeUrl = assertModelUrl(url);
  const dir = modelsDir(root, folder);
  await fs.mkdir(dir, { recursive: true });

  const finalPath = path.join(dir, safeName);
  try {
    await fs.access(finalPath);
    return { path: finalPath, alreadyPresent: true, bytes: (await fs.stat(finalPath)).size };
  } catch {
    // Not there yet, which is the normal case.
  }

  const partPath = `${finalPath}.part`;
  const response = await fetch(safeUrl, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get('content-length')) || expectedBytes || 0;
  const startedAt = Date.now();
  let received = 0;
  let lastReport = 0;
  let lastReceived = 0;

  const source = Readable.fromWeb(response.body);
  source.on('data', (chunk) => {
    received += chunk.length;
    // Throttled: a multi-gigabyte download fires this thousands of times a
    // second and every event crosses an IPC boundary.
    const now = Date.now();
    if (now - lastReport >= 400) {
      // The rate is measured here because only this side has the timing. The
      // renderer's status line reads speedBps, and without it a download that
      // was visibly moving said "-- MB/s · waiting for bytes" beside its own
      // advancing bar. First report averages since the start; later ones use
      // the window since the previous report, so stalls show up as a real 0.
      const windowMs = lastReport ? now - lastReport : now - startedAt;
      const windowBytes = lastReport ? received - lastReceived : received;
      const bytesPerSecond = windowMs > 0 ? Math.round((windowBytes / windowMs) * 1000) : null;
      lastReport = now;
      lastReceived = received;
      onProgress?.({
        received,
        total,
        percent: total ? Math.round((received / total) * 100) : null,
        bytesPerSecond,
      });
    }
  });

  try {
    await pipeline(source, createWriteStream(partPath));
  } catch (error) {
    await fs.rm(partPath, { force: true }).catch(() => {});
    throw error;
  }

  if (total && received < total) {
    await fs.rm(partPath, { force: true }).catch(() => {});
    throw new Error(`Download ended early: got ${received} of ${total} bytes.`);
  }

  await fs.rename(partPath, finalPath);
  onProgress?.({ received, total, percent: 100 });
  return { path: finalPath, alreadyPresent: false, bytes: received };
}

module.exports = {
  assertModelUrl,
  assertSafeFilename,
  downloadModel,
  resolveComfyRoot,
  verifyComfyFolder,
};
