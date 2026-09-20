// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
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

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { finished } = require('node:stream/promises');
const { Readable } = require('node:stream');

/**
 * Subfolders a download is ever allowed to target.
 *
 * The video lineup needs three more than the image and LTX tests did: modern
 * video models ship as a bare diffusion model (UNETLoader reads
 * diffusion_models), with their VAE and any speed-up LoRA as separate files.
 * Each name here is a folder ComfyUI itself reads; nothing else is writable.
 */
const ALLOWED_FOLDERS = new Set(['checkpoints', 'text_encoders', 'diffusion_models', 'vae', 'loras']);

/**
 * Where model bytes may come from. huggingface.co answers the request, but the
 * file itself is served from its CDN, which lives under hf.co — a different
 * domain, so it has to be named rather than assumed.
 */
const MODEL_HOSTS = ['huggingface.co', 'hf.co'];

function isModelHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return MODEL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

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
 * The catalog is ours, but this writes multi-gigabyte files to a path the
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

// ── Downloading ─────────────────────────────────────────────────────────────
//
// The video lineup's files run to 43 GB each and 56 GB a model. At that size a
// dropped connection is not an edge case, it is the expected afternoon — and
// the downloader used to answer one by deleting everything and starting over.
// So a download now resumes from its .part file with a Range request, picks
// itself back up a few times without being asked, and is checked against the
// catalog's size and SHA-256 before ComfyUI can see it.

/** Automatic resumes after a dropped connection, and the wait before each. */
const RESUME_DELAYS_MS = [2_000, 10_000, 30_000];
/** fetch has no inactivity timeout; a stream this quiet has stopped. */
const STALL_TIMEOUT_MS = 90_000;
const MAX_REDIRECTS = 5;

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A failure a later attempt can continue from, because the bytes so far are good. */
function resumable(error) {
  const wrapped = error instanceof Error ? error : new Error(String(error));
  wrapped.resumable = true;
  return wrapped;
}

async function sizeOf(file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

/** Feed what is already on disk into the hash, so a resumed file is checked whole. */
async function hashFile(hash, file) {
  for await (const chunk of createReadStream(file)) hash.update(chunk);
}

function repoOf(url) {
  return new URL(url).pathname.split('/').slice(1, 3).join('/');
}

/**
 * A refusal in words someone can act on.
 *
 * A gated repository answers 401 without a token and 403 with one that has not
 * been granted access. "Download failed: 401" is true of both and useful for
 * neither.
 */
function describeRefusal(response, url) {
  const repo = repoOf(url);
  const gated = response.headers.get('x-error-code') === 'GatedRepo';
  if (gated && response.status === 401) {
    return `${repo} is gated on Hugging Face, so downloading it needs your own access token. `
      + `Add one in Settings, accept the model's terms at https://huggingface.co/${repo}, then try again.`;
  }
  if (gated && response.status === 403) {
    return `Your Hugging Face token cannot open ${repo} yet. `
      + `Accept the model's terms at https://huggingface.co/${repo}, then try again.`;
  }
  return `Download failed: ${response.status} ${response.statusText || ''}`.trim();
}

/**
 * Open the file, following Hugging Face's redirects by hand.
 *
 * By hand for two reasons. Every hop has to stay on Hugging Face: a followed
 * redirect was trusted wherever it pointed, so the host allowlist only ever
 * checked the address the download started from. And a token goes only to
 * huggingface.co, which is what it opens; the CDN is handed a signed URL that
 * needs no token, so it is never sent one.
 */
async function openModelStream(url, { rangeStart, token, signal, fetchImpl }) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:' || !isModelHost(parsed.hostname)) {
      throw new Error(`The download was redirected to ${parsed.hostname}, which is not Hugging Face, so RigMatch refused it.`);
    }
    const headers = {};
    if (rangeStart > 0) headers.Range = `bytes=${rangeStart}-`;
    if (token && (parsed.hostname === 'huggingface.co' || parsed.hostname.endsWith('.huggingface.co'))) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetchImpl(current, { signal, redirect: 'manual', headers });
    } catch (error) {
      // Nothing has arrived yet, so nothing is lost by trying again.
      throw signal?.aborted ? error : resumable(error);
    }
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get('location');
    await response.body?.cancel?.().catch(() => {});
    if (!location) throw new Error(`Download failed: ${response.status} with no address to follow.`);
    current = new URL(location, current).toString();
  }
  throw new Error('The download was redirected too many times.');
}

/** Where a 206 body starts, and how big the whole file is, from Content-Range. */
function readContentRange(response) {
  const match = /^bytes (\d+)-\d+\/(\d+|\*)$/.exec(response.headers.get('content-range') ?? '');
  if (!match) return null;
  return { start: Number(match[1]), total: match[2] === '*' ? null : Number(match[2]) };
}

/**
 * Bring the .part file up to date with the server, resuming it if there is one.
 * Returns how big the part now is, and the SHA-256 of all of it.
 */
async function fetchIntoPart({ url, partPath, wantBytes, token, signal, onProgress, fetchImpl, stallTimeoutMs }) {
  let have = await sizeOf(partPath);
  // Bigger than the file can be: whatever this is, it is not a prefix of it.
  if (wantBytes && have > wantBytes) {
    await fs.rm(partPath, { force: true });
    have = 0;
  }

  let hash = crypto.createHash('sha256');
  if (have > 0) {
    onProgress?.({
      received: have,
      total: wantBytes,
      percent: wantBytes ? Math.floor((have / wantBytes) * 100) : null,
      bytesPerSecond: 0,
      phase: 'checking',
    });
    await hashFile(hash, partPath);
  }
  // A download that finished and was never renamed needs no network at all.
  if (wantBytes && have === wantBytes) return { bytes: have, hash: hash.digest('hex') };

  const response = await openModelStream(url, { rangeStart: have, token, signal, fetchImpl });

  // Asked for bytes past the end: either the part already holds the whole
  // file, or it is not what the server has. The checks after this decide.
  if (response.status === 416 && have > 0) {
    await response.body?.cancel?.().catch(() => {});
    return { bytes: have, hash: hash.digest('hex') };
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error(describeRefusal(response, url));
  }

  let append = false;
  let total = wantBytes;
  if (response.status === 206) {
    const range = readContentRange(response);
    if (!range || range.start !== have) {
      // A range that does not start where the part ends cannot be stitched on.
      await response.body.cancel().catch(() => {});
      await fs.rm(partPath, { force: true });
      throw resumable(new Error('The server resumed from the wrong place, so the partial file was discarded.'));
    }
    append = true;
    total = total ?? range.total;
  } else {
    // 200: the whole file again, the Range ignored. Appending would write a
    // file that starts twice, so this starts over from its first byte.
    have = 0;
    hash = crypto.createHash('sha256');
    total = total ?? (Number(response.headers.get('content-length')) || null);
  }

  const startedAt = Date.now();
  let received = 0;
  let lastReport = 0;
  let lastReceived = 0;
  let lastByteAt = Date.now();

  const source = Readable.fromWeb(response.body);
  const out = createWriteStream(partPath, { flags: append ? 'a' : 'w' });
  let writeError = null;
  out.on('error', (error) => { writeError = writeError ?? error; });

  /**
   * Give up on a connection that has stopped delivering.
   *
   * fetch has no inactivity timeout, so a stream that goes quiet — a dropped
   * connection, a wifi handover, a CDN hiccup — leaves this awaiting bytes
   * that never come. The whole download queue is sequential, so one silent
   * stall froze every remaining model behind it with no error, no progress and
   * nothing on screen to explain it. Dave hit exactly that: two models stuck,
   * nothing else downloading. A stall is now resumable like any other drop.
   */
  const watchdog = setInterval(() => {
    if (Date.now() - lastByteAt < stallTimeoutMs) return;
    clearInterval(watchdog);
    source.destroy(new Error(`The download stopped receiving data for ${Math.round(stallTimeoutMs / 1000)} seconds.`));
  }, Math.min(5_000, stallTimeoutMs));

  let failure = null;
  try {
    for await (const chunk of source) {
      if (signal?.aborted) throw signal.reason ?? new Error('The download was stopped.');
      if (writeError) throw writeError;
      hash.update(chunk);
      received += chunk.length;
      lastByteAt = Date.now();
      // Throttled: a multi-gigabyte download fires this thousands of times a
      // second and every event crosses an IPC boundary.
      const now = Date.now();
      if (now - lastReport >= 400) {
        // The rate is measured here because only this side has the timing. The
        // first report averages since the start; later ones use the window
        // since the previous report, so stalls show up as a real 0.
        const windowMs = lastReport ? now - lastReport : now - startedAt;
        const windowBytes = lastReport ? received - lastReceived : received;
        const bytesPerSecond = windowMs > 0 ? Math.round((windowBytes / windowMs) * 1000) : null;
        lastReport = now;
        lastReceived = received;
        onProgress?.({
          received: have + received,
          total,
          percent: total ? Math.round(((have + received) / total) * 100) : null,
          bytesPerSecond,
        });
      }
      // Honor backpressure: a file arriving faster than the disk takes it
      // would otherwise pile up in memory, and at 40 GB that is not a buffer.
      if (!out.write(chunk)) await once(out, 'drain');
    }
  } catch (error) {
    failure = error;
  } finally {
    // Always, on every path: a surviving interval keeps the process awake and
    // can destroy a stream belonging to the next download.
    clearInterval(watchdog);
    source.destroy();
  }

  // Flush what arrived, however the stream ended. Tearing the file down along
  // with the connection threw away whatever was still buffered, so a resume
  // began a few hundred kilobytes short of where the drop happened. Ending it
  // cleanly makes "what has arrived is kept" true to the byte.
  out.end();
  try {
    await finished(out);
  } catch (error) {
    writeError = writeError ?? error;
  }

  // A disk that cannot take the file is not a dropped connection, and
  // retrying would only fail the same way.
  if (writeError) throw writeError;
  if (failure) {
    if (signal?.aborted) throw failure;
    // Everything written so far is good; the next attempt continues from it.
    throw resumable(failure);
  }

  const bytes = have + received;
  if (total && bytes < total) {
    throw resumable(new Error(`The download ended early: ${bytes} of ${total} bytes arrived.`));
  }
  return { bytes, hash: hash.digest('hex') };
}

/**
 * Stream a model to disk, checking it before ComfyUI can see it.
 *
 * Written to a .part file and renamed only once it is whole and checked. A
 * truncated or corrupted .safetensors is worse than no file: ComfyUI lists it,
 * offers it, and then fails deep in the loader with an error that looks like a
 * broken model. So the size must equal the catalog's, and the SHA-256 must
 * equal the one Hugging Face publishes, where it publishes one.
 *
 * A dropped connection keeps the .part and resumes it, a few times on its own
 * and then whenever the download is started again. Stop discards it: a 40 GB
 * fragment nobody asked to keep is not left on the disk.
 */
async function downloadModel({ root, folder, filename, url, expectedBytes, sha256, token }, onProgress, signal, options = {}) {
  const {
    fetchImpl = fetch,
    resumeDelaysMs = RESUME_DELAYS_MS,
    sleep = sleepFor,
    stallTimeoutMs = STALL_TIMEOUT_MS,
  } = options;
  const safeName = assertSafeFilename(filename);
  const safeUrl = assertModelUrl(url);
  const wantBytes = Number.isFinite(expectedBytes) && expectedBytes > 0 ? expectedBytes : null;
  const wantHash = typeof sha256 === 'string' && /^[0-9a-f]{64}$/i.test(sha256) ? sha256.toLowerCase() : null;
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
  let resumes = 0;
  let refetched = false;

  for (;;) {
    let part;
    try {
      part = await fetchIntoPart({ url: safeUrl, partPath, wantBytes, token, signal, onProgress, fetchImpl, stallTimeoutMs });
    } catch (error) {
      if (signal?.aborted) {
        await fs.rm(partPath, { force: true }).catch(() => {});
        throw error;
      }
      if (error?.resumable && resumes < resumeDelaysMs.length) {
        await sleep(resumeDelaysMs[resumes]);
        resumes += 1;
        continue;
      }
      if (error?.resumable) {
        throw new Error(`${error.message} RigMatch tried to pick it up ${resumes} time${resumes === 1 ? '' : 's'}. `
          + 'What has arrived is kept, and starting the download again continues from there.');
      }
      throw error;
    }

    const problem = wantBytes && part.bytes !== wantBytes
      ? `The file came to ${part.bytes} bytes, but should be ${wantBytes}.`
      : wantHash && part.hash !== wantHash
        ? 'The file does not match the checksum Hugging Face publishes for it.'
        : null;

    if (!problem) {
      await fs.rename(partPath, finalPath);
      onProgress?.({ received: part.bytes, total: part.bytes, percent: 100 });
      return { path: finalPath, alreadyPresent: false, bytes: part.bytes };
    }

    // One fresh attempt, from nothing. A corrupted resume is the failure that
    // starting over can fix; a second mismatch means the source disagrees with
    // the catalog, and a third fetch would only repeat it.
    await fs.rm(partPath, { force: true });
    if (refetched) {
      throw new Error(`${problem} It was downloaded twice and failed the check both times, so it was not kept.`);
    }
    refetched = true;
  }
}

module.exports = {
  assertModelUrl,
  assertSafeFilename,
  downloadModel,
  isModelHost,
  resolveComfyRoot,
  verifyComfyFolder,
};
