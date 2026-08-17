#!/usr/bin/env node
/**
 * The generation-download gate, driven against the real downloader.
 *
 * This is the bug class that shipped in 0.6 development: a download that said
 * "Queued" for ever because the code returned early without writing a progress
 * entry. Nothing caught it, because the failure was a STATE — no ComfyUI folder
 * — rather than wrong logic.
 *
 * The real signature is downloadModel({ root, folder, filename, url,
 * expectedBytes }, onProgress, signal). An earlier version of this script
 * invented a different shape and got a PASS out of the resulting
 * "Unknown model folder" throw, which is exactly the sort of false green this
 * gate exists to prevent — so the argument shape is asserted first.
 *
 * Usage:  node scripts/gate-download.mjs [--comfy <path>]
 */

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const comfy = require('../electron/comfyModels.cjs');

/** Taken from src/lib/generationCatalog.ts so this tests a shipping URL. */
const CATALOGUE_URL = 'https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/resolve/main/v1-5-pruned-emaonly-fp16.safetensors';

const argIndex = process.argv.indexOf('--comfy');
const explicitRoot = argIndex !== -1 ? process.argv[argIndex + 1] : null;

const results = [];
const record = (name, ok, note) => {
  results.push({ name, ok, note });
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

console.log('Generation download gate\n');

// ── 0. The API is the shape this script thinks it is ───────────────────────
{
  const source = comfy.downloadModel.toString();
  const shaped = /\{\s*root,\s*folder,\s*filename,\s*url,\s*expectedBytes\s*\}/.test(source);
  record('downloadModel still takes ({root, folder, filename, url, expectedBytes}, onProgress, signal)', shaped,
    shaped ? '' : 'signature changed — every result below would be meaningless');
  if (!shaped) process.exit(1);
}

// ── 1. Security guards, which protect a path the user never sees ───────────
{
  const traversals = ['../evil.safetensors', '..\\evil.safetensors', '/etc/passwd', 'a/b.safetensors'];
  const blocked = traversals.filter((name) => {
    try { comfy.assertSafeFilename(name); return false; } catch { return true; }
  });
  record('filenames cannot escape the models folder', blocked.length === traversals.length,
    `${blocked.length}/${traversals.length} rejected`);
}
{
  const badUrls = [
    'http://huggingface.co/x/y.safetensors',        // not https
    'https://evil.example.com/x.safetensors',       // not an allowed host
    'file:///C:/Windows/System32/config/SAM',       // not a web URL
  ];
  const blocked = badUrls.filter((url) => {
    try { comfy.assertModelUrl(url); return false; } catch { return true; }
  });
  record('downloads stay on https and the host allowlist', blocked.length === badUrls.length,
    `${blocked.length}/${badUrls.length} rejected`);
}
{
  // downloadModel is async, so it REJECTS rather than throwing synchronously.
  // A try/catch around an un-awaited call sees nothing and the rejection takes
  // the process down instead of failing the check.
  let refused = false;
  try {
    await comfy.downloadModel(
      { root: 'C:/x', folder: 'not-a-real-folder', filename: 'a.safetensors', url: 'https://huggingface.co/a' },
      () => {},
    );
  } catch {
    refused = true;
  }
  record('an unknown model folder is refused', refused);
}

// ── 2. A folder that exists but is not ComfyUI ─────────────────────────────
const decoy = mkdtempSync(join(tmpdir(), 'not-comfy-'));
try {
  const verdict = await comfy.verifyComfyFolder(decoy);
  const rejected = !verdict || verdict.ok === false;
  record('a folder that is not ComfyUI is rejected', rejected,
    rejected ? '' : 'accepted, which would scatter multi-gigabyte files into a random folder');
} catch {
  record('a folder that is not ComfyUI is rejected', true, 'threw, which is a refusal');
} finally {
  rmSync(decoy, { recursive: true, force: true });
}

// ── 3. A real download: does it start, report, and abort cleanly? ──────────
const candidates = [explicitRoot, 'C:/AI/ComfyUI/ComfyUI_windows_portable/ComfyUI'].filter(Boolean);
const root = candidates.find((path) => existsSync(path));

if (!root) {
  record('a real download reports progress before it finishes', false,
    'no ComfyUI install found — pass one with --comfy <path>');
} else {
  const verdict = await comfy.verifyComfyFolder(root).catch(() => null);
  record('the real ComfyUI folder verifies', Boolean(verdict && verdict.ok !== false),
    `${root}`);

  const filename = 'rigmatch-gate-probe.safetensors';
  const controller = new AbortController();
  let sawBytes = 0;

  const outcome = await comfy.downloadModel(
    {
      root,
      folder: 'checkpoints',
      filename,
      // A URL straight out of the catalogue, so this exercises what the app
      // actually downloads. Aborted as soon as bytes move: the point is that
      // progress is reported, not that gigabytes land on this disk.
      url: CATALOGUE_URL,
    },
    (update) => {
      const received = update?.receivedBytes ?? update?.received ?? update?.bytes ?? 0;
      if (received > sawBytes) sawBytes = received;
      if (sawBytes > 0) controller.abort();
    },
    controller.signal,
  ).catch((error) => ({ aborted: true, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));

  record('a real download reports progress before it finishes', sawBytes > 0,
    sawBytes > 0 ? `${(sawBytes / 1024).toFixed(0)} KB received, then aborted` : `no progress; outcome ${JSON.stringify(outcome).slice(0, 70)}`);

  const dir = join(root, 'models', 'checkpoints');
  const leftovers = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.includes('rigmatch-gate-probe'))
    : [];
  record('an aborted download leaves no partial file behind', leftovers.length === 0,
    leftovers.length ? `left ${leftovers.join(', ')}` : 'models/checkpoints is clean');
  for (const name of leftovers) rmSync(join(dir, name), { force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0
  ? `\nGate closed: ${results.length} checks passed.`
  : `\nGate OPEN: ${failed.length} of ${results.length} failed.`);
// exitCode rather than process.exit(): forcing exit while the fake servers'
// handles are still closing makes libuv print an assertion failure AFTER the
// result, which reads like the gate itself crashed.
process.exitCode = failed.length === 0 ? 0 : 1;
