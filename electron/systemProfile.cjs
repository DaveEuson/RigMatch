// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Pure helpers for turning raw systeminformation output into the numbers
 * RigMatch displays. Extracted so the memory-pressure fix below is unit
 * testable without booting Electron.
 */

const fs = require('node:fs');
const path = require('node:path');
const { isUnifiedMemoryGpu } = require('./gpuContention.cjs');

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
 * The GPU of a machine that has one but does not advertise it on the PCI bus.
 *
 * Only reached when systeminformation found no controller at all, which on an
 * ordinary desktop means there is genuinely nothing to find. Returns {} in that
 * case, leaving the existing "Unknown GPU" behavior exactly as it was.
 *
 * The device tree is tried first because it needs no vendor tooling and names
 * the vendor as well as the part. nvidia-smi is second: it exists on newer
 * JetPack and answers "Orin (nvgpu)", but is absent from older images, and
 * answers [N/A] to every memory question on Tegra — which is why it cannot be
 * the only source and why the unified-memory path, not nvidia-smi, is what
 * ultimately supplies the memory figure.
 */
async function getBoardGpu({ platform, run, readFile }) {
  if (platform !== 'linux') return {};

  try {
    const model = cleanDeviceTreeModel(readFile('/proc/device-tree/model'));
    if (model) return { model, vendor: /nvidia/i.test(model) ? 'NVIDIA' : '' };
  } catch {
    // No device tree: an ordinary x86 machine, or a kernel without it.
  }

  const { output, error } = await run(
    'nvidia-smi',
    ['--query-gpu=name', '--format=csv,noheader'],
    3500,
  );
  if (error) return {};
  const name = output.split('\n').map((line) => line.trim()).find(Boolean);
  return name ? { model: name, vendor: 'NVIDIA' } : {};
}

// systeminformation frequently reports 0 VRAM for NVIDIA GPUs on Linux (and some
// Windows laptop/hybrid setups). Ask nvidia-smi directly so a 16 GB 4090 isn't
// mistaken for a VRAM-less rig — which otherwise collapses model picks to tiny
// models. Returns VRAM in MB (MiB), 0 if nvidia-smi is absent or unparseable,
// and why it failed (nvidiaDriverProblem).
async function getNvidiaVram(run) {
  const result = await run(
    'nvidia-smi',
    ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
    3500,
  );
  if (result.error) return { vramMb: 0, problem: nvidiaDriverProblem(result) };
  const values = result.output
    .split('\n')
    .map((line) => parseInt(line.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { vramMb: values.length ? Math.max(...values) : 0, problem: null };
}

/**
 * The graphics card RigMatch sizes models for, and the memory pool they have
 * to fit into, resolved in order of reliability.
 *
 * Shared by the app (getSystemProfile in main.cjs) and the command-line fit
 * check (cli/), so both size every model against the same number. `run` is
 * main.cjs's runCommand shape — (command, args, timeoutMs) resolving to
 * { output, error } — and `readFile` reads one file as text; both are passed
 * in so this runs without Electron, a real nvidia-smi or a real /proc.
 */
async function resolveGpuPool({
  controllers,
  memTotal,
  platform,
  arch,
  run,
  readFile = (file) => fs.readFileSync(file, 'utf-8'),
  sysfsRoot = '/',
}) {
  // systeminformation sizes Linux cards from lspci, which put an RX 7900 XTX
  // at 1 MB; the amdgpu driver's own figure in sysfs replaces it.
  const cards = platform === 'linux' ? withSysfsVram(controllers, readSysfsVram(sysfsRoot)) : controllers;

  // A board whose graphics is not on the PCI bus leaves systeminformation with
  // nothing to report, and everything downstream then fails together: no model
  // string means isUnifiedMemoryGpu cannot match, so the unified-memory rescue
  // below never fires and VRAM resolves to 0; and getCudaStatus, which decides
  // by looking for "nvidia" in the label, reports "No NVIDIA GPU detected" on an
  // NVIDIA board. Measured on a Jetson Orin Nano, not predicted.
  const primaryGpu = pickPrimaryGpu(cards) || await getBoardGpu({ platform, run, readFile });

  // Apple Silicon is not the only unified-memory hardware: NVIDIA's Grace-based
  // parts (GB10 in the DGX Spark, GH200) and the Jetson line share one pool with
  // the CPU while running Linux on aarch64, and were being treated as if they
  // had discrete VRAM.
  const hasUnifiedMemory = isUnifiedMemoryGpu({ model: primaryGpu.model, platform, arch });

  let vramGb = primaryGpu.vram ? mbToGb(primaryGpu.vram) : 0;

  // nvidia-smi where systeminformation came up empty. Without this an NVIDIA GPU
  // reporting 0 VRAM makes RigMatch recommend only tiny models (phi3:mini on a
  // 4090). Grace-based parts report their shared pool here, which is the right
  // number for "how big a model can this run" even though it is not discrete VRAM.
  // An NVIDIA card nvidia-smi cannot read has a driver problem, and saying so
  // beats sizing models for whatever else is in the machine.
  let driverProblem = null;
  if (vramGb <= 0 && platform !== 'darwin') {
    const nvidia = await getNvidiaVram(run);
    if (nvidia.vramMb > 0) vramGb = mbToGb(nvidia.vramMb);
    else if (/nvidia/i.test(`${primaryGpu.vendor || ''} ${primaryGpu.model || ''}`)) driverProblem = nvidia.problem;
  }

  // Unified memory: the pool IS system RAM, by definition. This was gated on
  // Apple Silicon alone, so a unified part whose vendor tool is missing — a
  // Jetson exposing tegrastats but not nvidia-smi, say — fell through to 0 and
  // RigMatch would have recommended only the smallest models on a machine with
  // plenty of memory. Apple Silicon reaches this the same way it always did:
  // systeminformation reports no vram there, and nvidia-smi does not exist.
  if (vramGb <= 0 && hasUnifiedMemory) {
    vramGb = bytesToGb(memTotal);
  }

  return { primaryGpu, vramGb, hasUnifiedMemory, driverProblem };
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
  resolveGpuPool,
  resolveModelsDir,
  summarizeMemory,
  withSysfsVram,
};
