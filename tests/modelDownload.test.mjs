// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { downloadModel, isModelHost } = require('../electron/comfyModels.cjs');

/**
 * The video lineup's files run to 43 GB. At that size a dropped connection is
 * the expected afternoon, and the downloader used to answer one by deleting
 * everything and starting over. These drive it against a fake Hugging Face —
 * a 302 from huggingface.co to its CDN on hf.co, Range requests, a gated repo —
 * so every path runs in milliseconds instead of over a real 50 GB file.
 */

const URL_ = 'https://huggingface.co/Org/Repo/resolve/main/model.safetensors';
const CDN = 'https://us.aws.cdn.hf.co/signed/model';
const PAYLOAD = crypto.randomBytes(1_048_583);
const SHA256 = crypto.createHash('sha256').update(PAYLOAD).digest('hex');
const INSTANT = { resumeDelaysMs: [0, 0, 0], sleep: async () => {} };

function corrupted(buffer) {
  const copy = Buffer.from(buffer);
  copy[copy.length >> 1] ^= 0xff;
  return copy;
}

/** A body that delivers in chunks and, optionally, drops the connection partway. */
function bodyOf(buffer, dropAt) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (dropAt !== undefined && offset >= dropAt) {
        controller.error(new TypeError('terminated'));
        return;
      }
      if (offset >= buffer.length) {
        controller.close();
        return;
      }
      const end = Math.min(buffer.length, offset + 64 * 1024, dropAt ?? Infinity);
      controller.enqueue(buffer.subarray(offset, end));
      offset = end;
    },
  });
}

/**
 * Hugging Face, as far as the downloader can tell. `cdnHits` counts requests
 * to the CDN, 1-based, so a behaviour can differ between the first attempt
 * and a retry.
 */
function fakeHub(behaviour = {}) {
  const calls = [];
  let cdnHits = 0;
  const fetchImpl = async (url, init = {}) => {
    const headers = init.headers ?? {};
    calls.push({ host: new URL(url).hostname, range: headers.Range ?? null, auth: headers.Authorization ?? null });

    if (new URL(url).hostname === 'huggingface.co') {
      if (behaviour.gatedToken && !headers.Authorization) {
        return new Response('gated', { status: 401, headers: { 'x-error-code': 'GatedRepo' } });
      }
      if (behaviour.gatedToken && headers.Authorization !== `Bearer ${behaviour.gatedToken}`) {
        return new Response('no access', { status: 403, headers: { 'x-error-code': 'GatedRepo' } });
      }
      return new Response(null, { status: 302, headers: { location: behaviour.redirectTo ?? CDN } });
    }

    cdnHits += 1;
    const file = behaviour.corruptOn?.(cdnHits) ? corrupted(PAYLOAD) : PAYLOAD;
    const match = /^bytes=(\d+)-$/.exec(headers.Range ?? '');
    let start = 0;
    const responseHeaders = {};
    let status = 200;
    if (match && !behaviour.ignoreRange) {
      start = Number(match[1]);
      if (start >= file.length) {
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.length}` } });
      }
      status = 206;
      responseHeaders['content-range'] = `bytes ${start}-${file.length - 1}/${file.length}`;
    }
    const slice = file.subarray(start);
    responseHeaders['content-length'] = String(slice.length);
    return new Response(bodyOf(slice, behaviour.dropOn?.(cdnHits)), { status, headers: responseHeaders });
  };
  return { fetchImpl, calls, cdnCalls: () => calls.filter((c) => c.host !== 'huggingface.co') };
}

async function comfyRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'rigmatch-download-'));
}

const target = (root) => path.join(root, 'models', 'diffusion_models', 'model.safetensors');
const request = (root, over = {}) => ({
  root, folder: 'diffusion_models', filename: 'model.safetensors', url: URL_,
  expectedBytes: PAYLOAD.length, sha256: SHA256, ...over,
});

async function exists(file) {
  return fs.access(file).then(() => true, () => false);
}

/** The byte a Range request resumed from, or null for a request from the start. */
const resumedFrom = (call) => (call.range ? Number(/^bytes=(\d+)-$/.exec(call.range)[1]) : null);

test('a clean download arrives whole, checked, and only then renamed into place', async () => {
  const root = await comfyRoot();
  const hub = fakeHub();
  const result = await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  assert.equal(result.bytes, PAYLOAD.length);
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
  assert.equal(await exists(`${target(root)}.part`), false);
});

test('a dropped connection resumes from the .part with a Range request, without being asked', async () => {
  // Resumed, not restarted. It resumes from where the file on disk ends, which
  // can be a little short of where the connection dropped: when a stream
  // errors, the streams spec clears whatever it had queued and not yet
  // delivered, so those last bytes never reached the file to be kept.
  const root = await comfyRoot();
  const dropAt = 400_000;
  const hub = fakeHub({ dropOn: (hit) => (hit === 1 ? dropAt : undefined) });
  await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  const cdn = hub.cdnCalls();
  assert.equal(cdn.length, 2);
  assert.equal(cdn[0].range, null);
  const from = resumedFrom(cdn[1]);
  assert.ok(from > 0 && from <= dropAt, `resumed from ${from}, which is not a resume of a ${dropAt}-byte start`);
  // Checked whole: the hash covered the bytes from before the drop as well.
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
});

test('a download that runs out of automatic resumes keeps its .part, and the next start continues it exactly', async () => {
  const root = await comfyRoot();
  const dropAt = 300_000;
  const flaky = fakeHub({ dropOn: () => dropAt });
  await assert.rejects(
    downloadModel(request(root), () => {}, undefined, { resumeDelaysMs: [], sleep: async () => {}, fetchImpl: flaky.fetchImpl }),
    /What has arrived is kept/,
  );
  const kept = (await fs.stat(`${target(root)}.part`)).size;
  assert.ok(kept > 0 && kept <= dropAt, `kept ${kept} bytes of a ${dropAt}-byte start`);

  const steady = fakeHub();
  await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: steady.fetchImpl });
  assert.equal(resumedFrom(steady.cdnCalls()[0]), kept, 'the next start asks for exactly what the disk lacks');
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
});

test('a corrupted file is discarded and fetched again from nothing', async () => {
  const root = await comfyRoot();
  const hub = fakeHub({ corruptOn: (hit) => hit === 1 });
  await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  const cdn = hub.cdnCalls();
  assert.equal(cdn.length, 2);
  assert.equal(cdn[1].range, null, 'the second fetch starts over rather than resuming a bad file');
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
});

test('a source that is wrong twice is refused, and nothing is left for ComfyUI to list', async () => {
  const root = await comfyRoot();
  const hub = fakeHub({ corruptOn: () => true });
  await assert.rejects(
    downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl }),
    /checksum.*failed the check both times/s,
  );
  assert.equal(await exists(target(root)), false);
  assert.equal(await exists(`${target(root)}.part`), false);
});

test('a file whose size disagrees with the catalogue is refused', async () => {
  const root = await comfyRoot();
  const hub = fakeHub();
  await assert.rejects(
    downloadModel(request(root, { expectedBytes: PAYLOAD.length + 10, sha256: undefined }), () => {}, undefined,
      { ...INSTANT, fetchImpl: hub.fetchImpl }),
    /should be/,
  );
  assert.equal(await exists(target(root)), false);
});

test('a server that ignores Range starts the file over rather than appending to it', async () => {
  const root = await comfyRoot();
  await fs.mkdir(path.dirname(target(root)), { recursive: true });
  await fs.writeFile(`${target(root)}.part`, PAYLOAD.subarray(0, 1000));
  const hub = fakeHub({ ignoreRange: true });
  await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD, 'a file that starts twice would be 1000 bytes too long');
});

test('a finished .part that was never renamed is checked and kept, without the network', async () => {
  const root = await comfyRoot();
  await fs.mkdir(path.dirname(target(root)), { recursive: true });
  await fs.writeFile(`${target(root)}.part`, PAYLOAD);
  const hub = fakeHub();
  await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  assert.equal(hub.calls.length, 0);
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
});

test('a .part bigger than the file can be is thrown away, not resumed', async () => {
  const root = await comfyRoot();
  await fs.mkdir(path.dirname(target(root)), { recursive: true });
  await fs.writeFile(`${target(root)}.part`, Buffer.concat([PAYLOAD, Buffer.from('extra')]));
  const hub = fakeHub();
  await downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  assert.equal(hub.cdnCalls()[0].range, null);
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
});

test('Stop discards the .part rather than leaving a fragment nobody asked to keep', async () => {
  const root = await comfyRoot();
  const controller = new AbortController();
  const hub = fakeHub();
  await assert.rejects(
    downloadModel(request(root), (progress) => { if (progress.received > 0) controller.abort(); },
      controller.signal, { ...INSTANT, fetchImpl: hub.fetchImpl }),
  );
  assert.equal(await exists(`${target(root)}.part`), false);
  assert.equal(await exists(target(root)), false);
});

test('a gated file without a token says what to do, and downloads nothing', async () => {
  const root = await comfyRoot();
  const hub = fakeHub({ gatedToken: 'hf_right' });
  await assert.rejects(
    downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl }),
    (error) => /gated on Hugging Face/.test(error.message) && /huggingface\.co\/Org\/Repo/.test(error.message),
  );
  assert.equal(hub.cdnCalls().length, 0);
  assert.equal(await exists(`${target(root)}.part`), false);
});

test('a token without access is told to accept the model\'s terms', async () => {
  const root = await comfyRoot();
  const hub = fakeHub({ gatedToken: 'hf_right' });
  await assert.rejects(
    downloadModel(request(root, { token: 'hf_wrong' }), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl }),
    /cannot open Org\/Repo yet/,
  );
});

test('the token goes to huggingface.co, and never to the CDN it redirects to', async () => {
  const root = await comfyRoot();
  const hub = fakeHub({ gatedToken: 'hf_right' });
  await downloadModel(request(root, { token: 'hf_right' }), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl });
  assert.equal(hub.calls.find((c) => c.host === 'huggingface.co').auth, 'Bearer hf_right');
  assert.ok(hub.cdnCalls().every((c) => c.auth === null), 'the signed CDN URL needs no token and gets none');
  assert.deepEqual(await fs.readFile(target(root)), PAYLOAD);
});

test('a redirect off Hugging Face is refused before a byte is written', async () => {
  // The allowlist used to check only the address a download started from; a
  // followed redirect was trusted wherever it pointed.
  const root = await comfyRoot();
  const hub = fakeHub({ redirectTo: 'https://evil.example/model.safetensors' });
  await assert.rejects(
    downloadModel(request(root), () => {}, undefined, { ...INSTANT, fetchImpl: hub.fetchImpl }),
    /evil\.example, which is not Hugging Face/,
  );
  assert.equal(await exists(`${target(root)}.part`), false);
});

test('Hugging Face and its CDN are the only hosts bytes may come from', () => {
  assert.ok(isModelHost('huggingface.co'));
  assert.ok(isModelHost('cdn-lfs.huggingface.co'));
  assert.ok(isModelHost('us.aws.cdn.hf.co'));
  assert.ok(isModelHost('cas-bridge.xethub.hf.co'));
  assert.ok(!isModelHost('hf.co.evil.example'));
  assert.ok(!isModelHost('nothuggingface.co'));
});
