// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summarizeMemory, cleanDeviceTreeModel } = require('../electron/systemProfile.cjs');

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

// ── the board's own name for itself ─────────────────────────────────────────
// Captured from a Jetson Orin Nano running JetPack R39, where lspci lists no
// graphics device at all and si.graphics() returned zero controllers.

const JETSON = 'NVIDIA Jetson Orin Nano Engineering Reference Developer Kit Super';

test('the device-tree model loses its NUL terminator', () => {
  // The value is copied straight out of the device tree blob, terminator and
  // all. Left in, it travels into the UI and into every comparison made against
  // the string — including the one that decides whether this is unified memory.
  assert.equal(cleanDeviceTreeModel(`${JETSON}\u0000`), JETSON);
  assert.equal(cleanDeviceTreeModel(`${JETSON}\u0000\u0000`), JETSON);
  assert.equal(cleanDeviceTreeModel(`  ${JETSON}\u0000  `), JETSON);
});

test('a missing or unreadable device tree yields nothing, not "undefined"', () => {
  // An ordinary x86 desktop has no /proc/device-tree. The caller treats an empty
  // string as "no answer" and falls through; a literal "undefined" would be
  // reported to the user as the name of their graphics card.
  for (const empty of [undefined, null, '', '   ', '\u0000']) {
    assert.equal(cleanDeviceTreeModel(empty), '');
  }
});

test('the cleaned Jetson name is one the unified-memory check recognises', () => {
  // The two halves of this fix are in different files and only matter together:
  // reading the name is pointless if the name does not then match, and the
  // shipped 0.7.0 matched /orin/ perfectly while never being handed a string.
  const { isUnifiedMemoryGpu } = require('../electron/gpuContention.cjs');
  assert.equal(isUnifiedMemoryGpu({ model: cleanDeviceTreeModel(`${JETSON}\u0000`) }), true);

  // And the vendor is readable from the same string, which is what stops the
  // CUDA check reporting "No NVIDIA GPU detected." on an NVIDIA board.
  assert.match(cleanDeviceTreeModel(`${JETSON}\u0000`), /nvidia/i);
});
