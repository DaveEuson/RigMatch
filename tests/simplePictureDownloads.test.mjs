// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GENERATION_MODELS, downloadPlan } from '../src/lib/generationCatalog.ts';

/**
 * Simple Mode's picture card listed only the makers already in ComfyUI: one,
 * on a 12 GB PC that fits four, with the rest a trip to Advanced Mode away.
 * It now offers the missing ones, sized by what is actually missing, through
 * the same consent dialog and downloader the Video Lab uses.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const byId = (id) => GENERATION_MODELS.find((m) => m.id === id);

test('Simple Mode hands the picture card what to download and how', () => {
  const app = read('../src/App.tsx');
  const simple = app.slice(app.indexOf('makerRun={{'), app.indexOf('onChatWithWinner={openChatWithWinner}'));
  assert.match(simple, /toDownload: pictureMakersToGet/);
  // The Video Lab's path: one at a time, behind the consent dialog.
  assert.match(simple, /onDownloadModel: requestLabDownload/);
  assert.match(simple, /onStopDownload: stopLabDownload/);
  assert.match(simple, /pullProgressByModel,/);
});

test('the card offers them only for pictures, and only while ComfyUI answers', () => {
  const card = read('../src/components/ComparisonRunCard.tsx');
  assert.match(card, /const canGetMore = channel === 'images' && context\.comfyReachable/);
  assert.match(card, /\{canGetMore && !running && <PictureMakersToGet context=\{context\} \/>\}/);
});

test('a shared encoder is counted once: the second maker costs less', () => {
  const zImage = byId('z-image-turbo');
  const klein = byId('flux2-klein-4b');
  const encoder = byId('qwen3-4b-encoder');
  const fresh = downloadPlan(klein, {});
  const afterZImage = downloadPlan(klein, {
    diffusion_models: [zImage.filename], text_encoders: [encoder.filename], vae: [byId('flux-ae').filename],
  });
  assert.equal(fresh.totalBytes - afterZImage.totalBytes, encoder.bytes);
});
