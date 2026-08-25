// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Pure helpers for turning raw systeminformation output into the numbers
 * RigMatch displays. Extracted so the memory-pressure fix below is unit
 * testable without booting Electron.
 */

function bytesToGb(bytes) {
  if (!Number.isFinite(bytes)) return 0;
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

function mbToGb(mb) {
  if (!Number.isFinite(mb)) return 0;
  return Math.round((mb / 1024) * 10) / 10;
}

/**
 * `mem.used` (from systeminformation's si.mem()) is a raw total-minus-free
 * figure that counts reclaimable disk cache as "used". On macOS in
 * particular this makes RAM look nearly full even on a healthy system —
 * Activity Monitor's actual memory-pressure graph looks nothing like it.
 * `mem.available` already accounts for reclaimable memory, so derive
 * "used" from it instead whenever it's a sane value.
 */
function summarizeMemory(mem) {
  const total = Number(mem?.total) || 0;
  const available = Number(mem?.available) || 0;
  const used = available > 0 ? Math.max(0, total - available) : Number(mem?.used) || 0;

  return {
    totalGb: bytesToGb(total),
    availableGb: bytesToGb(available),
    usedGb: bytesToGb(used),
  };
}

/**
 * The board's name for itself, from /proc/device-tree/model.
 *
 * On a Jetson the graphics is not a PCI device, so lspci lists no VGA or 3D
 * controller and systeminformation — which builds its Linux GPU list from lspci
 * — returns an empty array. Verified on an Orin Nano running JetPack R39:
 * si.graphics() reports zero controllers, so RigMatch had no model string, could
 * not recognise the part as unified-memory, and fell all the way through to 0 GB
 * on a machine with 7.4 GB to work with.
 *
 * The device tree answers where lspci cannot: "NVIDIA Jetson Orin Nano
 * Engineering Reference Developer Kit Super" — vendor and part in one string,
 * present with no vendor tooling installed at all.
 *
 * The value is a NUL-terminated string copied straight out of the device tree
 * blob. Read without stripping that, the terminator survives into the UI and
 * into every comparison made against it.
 */
function cleanDeviceTreeModel(raw) {
  return String(raw ?? '').replace(/\0/g, '').trim();
}

module.exports = {
  bytesToGb,
  cleanDeviceTreeModel,
  mbToGb,
  summarizeMemory,
};
