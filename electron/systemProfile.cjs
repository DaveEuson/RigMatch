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
 * not recognize the part as unified-memory, and fell all the way through to 0 GB
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

/**
 * The graphics card RigMatch sizes models for.
 *
 * The largest reported VRAM used to win, which is right until the NVIDIA
 * driver stops answering: then the NVIDIA card reports 0 and a Ryzen's
 * integrated graphics wins with its 512 MB carve-out. Measured on an RTX 4070
 * beside AMD "Device 13c0": the top bar read "VRAM 0.5 GB" and every pick was
 * sized for it. An NVIDIA card is the one Ollama runs on, so it comes first
 * whatever it reports.
 */
function pickPrimaryGpu(controllers) {
  const gpus = (controllers || [])
    .filter((gpu) => gpu && gpu.model && !/microsoft basic/i.test(gpu.model))
    .sort((a, b) => (b.vram || 0) - (a.vram || 0));
  return gpus.find((gpu) => /nvidia/i.test(`${gpu.vendor || ''} ${gpu.model}`)) || gpus[0];
}

/**
 * Why nvidia-smi could not report an NVIDIA card, from what it printed.
 *
 * "Driver/library version mismatch" means the driver package was updated
 * while the old kernel module is still loaded, which a restart fixes. Any
 * other failure (not installed, not loaded, no answer) means the driver
 * needs installing or repairing. Returns null when nvidia-smi answered.
 */
function nvidiaDriverProblem({ output, error }) {
  if (!error) return null;
  if (/version mismatch/i.test(`${output || ''} ${error}`)) return 'reboot-required';
  return 'driver-missing';
}

/**
 * Where Ollama keeps its models, as far as this process can tell: the
 * OLLAMA_MODELS it inherited, else the folder the Linux service installs to,
 * else the per-user default. Used only to pick which drive's free space to show.
 */
function ollamaModelsDir({ env = process.env, platform = process.platform, home = '', exists = () => false } = {}) {
  if (env.OLLAMA_MODELS) return env.OLLAMA_MODELS;
  const service = '/usr/share/ollama/.ollama/models';
  if (platform === 'linux' && exists(service)) return service;
  return home ? `${home}${platform === 'win32' ? '\\' : '/'}.ollama${platform === 'win32' ? '\\' : '/'}models` : '';
}

/**
 * The drive the models folder is on: the mount with the longest path that
 * prefixes it. The largest drive used to win, which names the data disk when
 * the models are on the system one. Falls back to the largest.
 */
function pickModelsFilesystem(fsSize, modelsDir) {
  const drives = (fsSize || []).filter((fs) => fs && fs.mount);
  const largest = [...drives].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
  if (!modelsDir) return largest;
  const windows = /^[a-z]:/i.test(modelsDir);
  const norm = (value) => {
    const text = String(value).replace(/\\/g, '/').replace(/\/+$/, '');
    return windows ? text.toLowerCase() : text;
  };
  const target = norm(modelsDir);
  const onDrive = drives
    .filter((fs) => {
      const mount = norm(fs.mount);
      return mount === '' || target === mount || target.startsWith(`${mount}/`);
    })
    .sort((a, b) => norm(b.mount).length - norm(a.mount).length)[0];
  return onDrive || largest;
}

module.exports = {
  bytesToGb,
  cleanDeviceTreeModel,
  mbToGb,
  nvidiaDriverProblem,
  ollamaModelsDir,
  pickModelsFilesystem,
  pickPrimaryGpu,
  summarizeMemory,
};
