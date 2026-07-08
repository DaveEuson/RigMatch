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

module.exports = {
  bytesToGb,
  mbToGb,
  summarizeMemory,
};
