// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Pure helpers for turning raw systeminformation output into the numbers
 * RigMatch displays. Extracted so the memory-pressure fix below is unit
 * testable without booting Electron.
 */

const fs = require('node:fs');
const path = require('node:path');

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
 * Each amdgpu card's VRAM in bytes, keyed by PCI address ("0000:03:00.0"), as
 * the kernel driver reports it under /sys/class/drm. The one helper here that
 * reads files; `root` lets the tests point it at a fixture tree.
 *
 * systeminformation sizes Linux cards from lspci, and on Bazzite it gave an
 * RX 7900 XTX 1 MB beside a Radeon 610M's 512 MB, so the integrated part was
 * picked and every model was sized for half a gigabyte (issue #145). The
 * address is read from the device's uevent rather than from where the cardN
 * symlink points, which gives the same answer and keeps the fixture a plain
 * folder tree: Windows cannot name a folder "0000:03:00.0".
 */
function readSysfsVram(root = '/') {
  const drm = path.join(root, 'sys', 'class', 'drm');
  const vram = {};
  let cards = [];
  try {
    cards = fs.readdirSync(drm).filter((name) => /^card\d+$/.test(name));
  } catch {
    return vram;
  }
  for (const card of cards) {
    const device = path.join(drm, card, 'device');
    try {
      const bytes = Number(fs.readFileSync(path.join(device, 'mem_info_vram_total'), 'utf8'));
      const address = fs.readFileSync(path.join(device, 'uevent'), 'utf8').match(/^PCI_SLOT_NAME=(.+)$/m)?.[1];
      if (bytes > 0 && address) vram[address.trim().toLowerCase()] = bytes;
    } catch {
      // Not an amdgpu card: only that driver writes mem_info_vram_total.
    }
  }
  return vram;
}

/**
 * The controllers with sysfs VRAM (from readSysfsVram) wherever
 * systeminformation's figure is missing or smaller. systeminformation leaves
 * the PCI domain off ("03:00.0"); sysfs includes it. An APU's sysfs figure is
 * only its carve-out, so a discrete card still outranks it.
 */
function withSysfsVram(controllers, vramByAddress = {}) {
  return (controllers || []).map((gpu) => {
    const address = String(gpu?.busAddress || '').toLowerCase();
    const bytes = vramByAddress[address.split(':').length === 2 ? `0000:${address}` : address];
    const mb = Math.round((bytes || 0) / 1024 / 1024);
    return mb > (gpu?.vram || 0) ? { ...gpu, vram: mb } : gpu;
  });
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
 * The driver and CUDA versions from nvidia-smi's header. Driver 610 renamed
 * "Driver Version" to "KMD Version" and "CUDA Version" to "CUDA UMD Version";
 * both spellings are read so My PC keeps showing CUDA on either side.
 */
function parseNvidiaSmiHeader(output) {
  const text = String(output || '');
  const first = (pattern) => text.match(pattern)?.[1] ?? null;
  return {
    driverVersion: first(/(?:Driver|KMD) Version:\s*([\d.]+)/i),
    driverCudaVersion: first(/CUDA (?:UMD )?Version:\s*([\d.]+)/i),
  };
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

/**
 * The models folder with its symlinks resolved, for pickModelsFilesystem to
 * match against the mounts. On Bazzite /home links to /var/home, so
 * ~/.ollama/models matched only "/", an overlay with 0 bytes free, while the
 * models sat on a btrfs mount with 2.1 TB (issue #146). A folder that does not
 * exist yet resolves through its nearest existing parent.
 */
function resolveModelsDir(dir, realpath = fs.realpathSync) {
  if (!dir) return dir;
  const p = /^[a-z]:|\\/i.test(dir) ? path.win32 : path.posix;
  const missing = [];
  for (let head = dir; ; head = p.dirname(head)) {
    try {
      return p.join(realpath(head), ...missing);
    } catch {
      if (p.dirname(head) === head) return dir;
      missing.unshift(p.basename(head));
    }
  }
}

module.exports = {
  bytesToGb,
  cleanDeviceTreeModel,
  mbToGb,
  nvidiaDriverProblem,
  ollamaModelsDir,
  parseNvidiaSmiHeader,
  pickModelsFilesystem,
  pickPrimaryGpu,
  readSysfsVram,
  resolveModelsDir,
  summarizeMemory,
  withSysfsVram,
};
