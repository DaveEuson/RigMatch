// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summarizeMemory } = require('../electron/systemProfile.cjs');

const GB = 1024 * 1024 * 1024;

test('summarizeMemory derives "used" from available memory, not raw used', () => {
  // Reproduces the macOS false-alarm: si.mem().used counts reclaimable disk
  // cache, so a 16 GB machine with plenty of headroom still reports ~15.8 GB
  // "used". mem.available (5.3 GB free/reclaimable) reflects real pressure.
  const macMem = { total: 16 * GB, used: 15.8 * GB, available: 5.3 * GB };
  const summary = summarizeMemory(macMem);

  assert.equal(summary.totalGb, 16);
  assert.equal(summary.availableGb, 5.3);
  assert.equal(summary.usedGb, 10.7, 'used should be total - available, not the raw used field');
});

test('summarizeMemory falls back to the raw used field when available is missing', () => {
  const mem = { total: 8 * GB, used: 4 * GB, available: 0 };
  const summary = summarizeMemory(mem);

  assert.equal(summary.usedGb, 4);
});

test('summarizeMemory never returns a negative used value', () => {
  // available slightly exceeding total shouldn't happen, but guard anyway.
  const mem = { total: 8 * GB, used: 4 * GB, available: 8.5 * GB };
  const summary = summarizeMemory(mem);

  assert.equal(summary.usedGb, 0);
});

test('summarizeMemory handles missing/malformed input without throwing', () => {
  assert.deepEqual(summarizeMemory({}), { totalGb: 0, availableGb: 0, usedGb: 0 });
  assert.deepEqual(summarizeMemory(undefined), { totalGb: 0, availableGb: 0, usedGb: 0 });
});
