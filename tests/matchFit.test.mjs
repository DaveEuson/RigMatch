// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { FULL_SPEED_TPS, speedScoreFor, fitFromPc, fitFromName, loadedFootprint } = createRequire(import.meta.url)('../electron/matchFit.cjs');

const GB = 1024 ** 3;

test('Speed is full at 50 tokens a second, the line rigmatch-fit calls Excellent', () => {
  assert.equal(FULL_SPEED_TPS, 50);
  assert.equal(speedScoreFor(5), 0);
  assert.equal(speedScoreFor(3), 0, 'never below 0');
  assert.equal(speedScoreFor(27.5), 50, 'half way along the line');
  assert.equal(speedScoreFor(50), 100);
  // A small model at 200 tok/s and a 9B at 64 now tie on speed: both are
  // faster than anyone reads. Through v6 the 9B lost 38 of the 100.
  assert.equal(speedScoreFor(64), 100);
  assert.equal(speedScoreFor(200), 100);
  assert.equal(speedScoreFor(Number.NaN), 0);
  assert.equal(speedScoreFor(undefined), 0);
});

test('a model all on the card with room to spare fits fully, whatever its size', () => {
  // qwen3:0.6b and qwen3:14b on a 12 GB card: both all on it, both with room.
  const card = 12 * GB;
  for (const sizeGb of [0.9, 2.4, 6.2, 9.9]) {
    const footprint = { sizeBytes: sizeGb * GB, vramBytes: sizeGb * GB, share: 1 };
    assert.deepEqual(fitFromPc({ model: 'any', footprint, graphicsBytes: card }), { fit: 100, basis: 'measured', gpuShare: 1 }, `${sizeGb} GB`);
  }
});

test('a model that fills the card fits, with less room left', () => {
  const card = 12 * GB;
  const at = (usedGb) => fitFromPc({ model: 'm', footprint: { sizeBytes: usedGb * GB, vramBytes: usedGb * GB, share: 1 }, graphicsBytes: card }).fit;
  assert.equal(at(12 * 0.85), 100, '15% left is comfortable');
  assert.equal(at(12 * 0.925), 85, 'half way: 7.5% left');
  assert.equal(at(12), 70, 'nothing left over');
  // Ollama reports a few bytes short of the whole for a model that is all on the card.
  assert.equal(fitFromPc({ model: 'm', footprint: { sizeBytes: 100, vramBytes: 99.5, share: 0.995 }, graphicsBytes: 1000 }).gpuShare, 1);
});

test('a model partly in system memory scores 60 times its share on the card', () => {
  const footprint = (share) => ({ sizeBytes: 20 * GB, vramBytes: 20 * GB * share, share });
  assert.deepEqual(fitFromPc({ model: 'gemma3:27b', footprint: footprint(0.9), graphicsBytes: 12 * GB }), { fit: 54, basis: 'measured', gpuShare: 0.9 });
  assert.equal(fitFromPc({ model: 'm', footprint: footprint(0.5), graphicsBytes: 12 * GB }).fit, 30);
  // Lower than any model that fits, at any room.
  assert.ok(fitFromPc({ model: 'm', footprint: footprint(0.98), graphicsBytes: 12 * GB }).fit < 70);
});

test('with no usable card, Fit is judged against system memory instead of 0 for every model', () => {
  const ram = 16 * GB;
  const cpu = (sizeGb) => fitFromPc({ model: 'm', footprint: { sizeBytes: sizeGb * GB, vramBytes: 0, share: 0 }, graphicsBytes: 0.5 * GB, systemBytes: ram });
  assert.deepEqual(cpu(2), { fit: 100, basis: 'measured', gpuShare: 0 });
  assert.equal(cpu(16).fit, 70, 'all of memory taken');
  // Nothing known about system memory: fall through to the name.
  assert.equal(fitFromPc({ model: 'qwen3:8b', footprint: { sizeBytes: GB, vramBytes: 0, share: 0 } }).basis, 'name');
});

test('without Ollama\'s report (LM Studio), Fit is estimated from the file size', () => {
  const card = 12 * GB;
  // 5 GB file, about 5.5 GB once loaded: room to spare.
  assert.deepEqual(fitFromPc({ model: 'qwen3-8b', fileBytes: 5 * GB, graphicsBytes: card }), { fit: 100, basis: 'estimated' });
  // 17 GB file on a 12 GB card: about 64% fits on the card.
  const big = fitFromPc({ model: 'gemma-3-27b', fileBytes: 17 * GB, graphicsBytes: card });
  assert.equal(big.basis, 'estimated');
  assert.equal(big.fit, Math.round(60 * (12 / (17 * 1.1))));
  // No card known: against system memory.
  assert.equal(fitFromPc({ model: 'm', fileBytes: 4 * GB, systemBytes: 32 * GB }).fit, 100);
});

test('only when nothing is known does Fit fall back to the size in the name', () => {
  assert.deepEqual(fitFromPc({ model: 'qwen3:14b' }), { fit: fitFromName('qwen3:14b'), basis: 'name' });
  assert.equal(fitFromName('qwen3:14b'), 74);
});

test('the footprint is read from Ollama\'s /api/ps listing, for this model only', () => {
  const listing = {
    models: [
      { name: 'llama3.2:3b', size: 3_000_000_000, size_vram: 3_000_000_000 },
      { name: 'qwen3:14b', model: 'qwen3:14b', size: 10_000_000_000, size_vram: 7_500_000_000 },
      { name: 'gemma3:latest', size: 4_000_000_000, size_vram: 4_000_000_000 },
    ],
  };
  assert.deepEqual(loadedFootprint(listing, 'qwen3:14b'), { sizeBytes: 10_000_000_000, vramBytes: 7_500_000_000, share: 0.75 });
  assert.equal(loadedFootprint(listing, 'gemma3').share, 1, 'a bare name means :latest');
  assert.equal(loadedFootprint(listing, 'mistral:7b'), null, 'not loaded');
  assert.equal(loadedFootprint({ models: [{ name: 'x:1b', size: 0, size_vram: 0 }] }, 'x:1b'), null, 'no size, no reading');
  assert.equal(loadedFootprint(null, 'x'), null);
  assert.equal(loadedFootprint({ models: [{ name: 'x:1b', size: 100 }] }, 'x:1b').share, 0, 'no size_vram: nothing on the card');
});

test('a model spread over two cards is not scored as one card overfilled', () => {
  // Two 12 GB cards: RigMatch reads one, Ollama puts 20 GB across both.
  const footprint = { sizeBytes: 20 * GB, vramBytes: 20 * GB, share: 1 };
  assert.deepEqual(fitFromPc({ model: 'qwen3:32b', footprint, graphicsBytes: 12 * GB }), { fit: 100, basis: 'measured', gpuShare: 1 });
  // One card, filled to the top, still scores as full.
  assert.equal(fitFromPc({ model: 'm', footprint: { sizeBytes: 12 * GB, vramBytes: 12 * GB, share: 1 }, graphicsBytes: 12 * GB }).fit, 70);
});
