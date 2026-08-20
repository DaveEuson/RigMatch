// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * GPU contention detection: is something else already using the GPU hard enough
 * to distort a benchmark?
 *
 * Why this is not simply "list what is using the GPU":
 *
 * On Windows (WDDM), `nvidia-smi --query-compute-apps` reports ~39 processes on
 * a completely idle desktop — explorer.exe, SearchHost, StartMenuExperienceHost,
 * ShellExperienceHost, NVIDIA Overlay — and `used_memory` is `[N/A]` for every
 * one of them. `nvidia-smi pmon` returns `-` for per-process utilization too.
 * Naming processes from that list would tell users to close Windows Explorer to
 * improve a benchmark score.
 *
 * So this module separates two very different confidence levels:
 *
 *   1. AGGREGATE load (VRAM used, GPU utilization) — accurate and trustworthy.
 *      This decides whether to warn at all.
 *   2. NAMED apps — only ever drawn from an allowlist of programs genuinely
 *      worth closing. An allowlist of things worth mentioning, never a denylist
 *      of things to hide, so the shell can never be suggested.
 *
 * `unknown` is a first-class result. A probe that cannot answer must say so
 * rather than report `clear`, because "we could not check" and "the GPU is
 * quiet" lead to different, and differently honest, messages.
 *
 * Verification status: the NVIDIA path is written against real output captured
 * from an RTX 4070 on Windows. The AMD and Apple paths follow documented output
 * formats but are UNVERIFIED — no such hardware was available. They are built to
 * degrade to `unknown` on anything unexpected rather than produce a wrong
 * reading, and the parsers are unit-tested against the documented shapes.
 */

/**
 * Programs worth naming when the GPU is busy: heavyweight, user-closable, and
 * unambiguous. Deliberately excludes browsers, shells, and compositors — they
 * always touch the GPU, and "close your browser" is not advice a benchmark tool
 * should be giving.
 *
 * Matched case-insensitively against the executable's base name.
 */
const KNOWN_GPU_HEAVY_APPS = [
  // Other local-model runtimes — the most likely and most costly conflict.
  { match: 'lm studio', label: 'LM Studio' },
  { match: 'lmstudio', label: 'LM Studio' },
  { match: 'jan.exe', label: 'Jan' },
  { match: 'gpt4all', label: 'GPT4All' },
  { match: 'koboldcpp', label: 'KoboldCpp' },
  { match: 'text-generation-webui', label: 'Text Generation WebUI' },
  { match: 'llama-server', label: 'a llama.cpp server' },
  // Image generation — heavy, long-running VRAM consumers.
  { match: 'comfyui', label: 'ComfyUI' },
  { match: 'invokeai', label: 'InvokeAI' },
  { match: 'stable-diffusion', label: 'Stable Diffusion' },
  // Creative and streaming tools.
  { match: 'obs64', label: 'OBS Studio' },
  { match: 'obs.exe', label: 'OBS Studio' },
  { match: 'blender', label: 'Blender' },
  { match: 'resolve', label: 'DaVinci Resolve' },
  { match: 'premiere', label: 'Adobe Premiere' },
  { match: 'aftereffects', label: 'After Effects' },
  { match: 'handbrake', label: 'HandBrake' },
  // Game platforms: the running game is what matters, but these are a good
  // proxy that a game may be open, and they are unambiguous to name.
  { match: 'steamwebhelper', label: 'Steam' },
  { match: 'javaw', label: 'a Java game (e.g. Minecraft)' },
];

/**
 * GPUs that share one memory pool with the CPU rather than having their own.
 *
 * This matters for contention because on a unified system "GPU memory in use"
 * includes ordinary system RAM. A machine with 70 GB of its 128 GB committed to
 * normal work is not a busy GPU, but a VRAM-share threshold tuned on a discrete
 * card reads it as one. On unified hardware the memory criterion is skipped and
 * only utilization is used.
 *
 * Detection is by known part name plus Apple Silicon. It is a heuristic and
 * will not name every unified part; an unrecognised one simply keeps the
 * discrete behaviour, which is the pre-existing state rather than a regression.
 */
const UNIFIED_MEMORY_GPU_PATTERNS = [
  /apple\s+m\d/i,          // Apple M1/M2/M3/M4…
  /apple\s+silicon/i,
  /\bgb10\b/i,             // NVIDIA GB10 Grace-Blackwell — DGX Spark
  /\bgh200\b/i,            // Grace Hopper
  /\bgb200\b/i,            // Grace Blackwell
  /\bgrace\b/i,            // Grace superchips generally
  /\bthor\b/i,             // Jetson Thor
  /\borin\b/i,             // Jetson Orin
  /\bxavier\b/i,           // Jetson Xavier
  /\btegra\b/i,
];

/**
 * Whether this GPU shares memory with the CPU.
 *
 * `platform`/`arch` cover Apple Silicon, where the GPU model string is often
 * empty; the patterns cover NVIDIA's Grace-based and Jetson parts, which run
 * Linux on aarch64 and were previously treated as having discrete VRAM.
 */
function isUnifiedMemoryGpu({ model = '', platform = '', arch = '' } = {}) {
  if (platform === 'darwin' && arch === 'arm64') return true;
  const name = String(model || '');
  return UNIFIED_MEMORY_GPU_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Utilization thresholds, set from measurement rather than intuition.
 *
 * Ten samples of an ordinary Windows desktop (browser and editor open, nothing
 * heavy) ranged 12–44% with a median near 30%. A threshold of 25% would fire on
 * most runs, and a warning that always fires is one users learn to dismiss — the
 * same trap as a status badge that contradicts its own panel.
 *
 * 45% therefore sits above normal desktop noise, and a real workload — a game,
 * a diffusion run, another model loaded — sustains far higher than that.
 * Callers should pass a MEDIAN of several samples: a single reading catches
 * spikes that no benchmark would actually notice.
 */
const HEAVY_UTILIZATION_PERCENT = 70;
const BUSY_UTILIZATION_PERCENT = 45;
/**
 * VRAM already committed before the model loads, as a share of total. A desktop
 * baseline on Windows is ~2.5GB of 12GB (~20%), so this sits well above that.
 */
const BUSY_VRAM_SHARE = 0.35;
const HEAVY_VRAM_SHARE = 0.55;

/**
 * Parse `nvidia-smi --query-gpu=... --format=csv,noheader,nounits`.
 *
 * Real captured output (RTX 4070, Windows):
 *   "0, NVIDIA GeForce RTX 4070, 2521, 12282, 31"
 *
 * Also tolerates the unit-bearing form, since `nounits` is not honoured by every
 * driver version:
 *   "2521 MiB, 12282 MiB, 31 %"
 */
function parseNvidiaGpuQuery(output) {
  const line = String(output ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (!line) return null;

  const cells = line.split(',').map((c) => c.trim());
  // Each cell becomes a number or null, keeping its POSITION. Filtering the bad
  // ones out instead would let a malformed value shift the columns — "-5" for
  // used memory would drop out and the GPU index would slide into its place,
  // silently reporting 0 MB in use.
  const parsed = cells.map((c) => {
    const m = c.match(/^(\d+(?:\.\d+)?)\s*(MiB|MB|GiB|%)?$/i);
    if (!m) return null;
    const value = Number(m[1]);
    return /GiB/i.test(m[2] ?? '') ? value * 1024 : value;
  });

  // The name column is non-numeric, so the three values we want are always the
  // last three cells — with or without the leading index column.
  if (parsed.length < 3) return null;
  const [vramUsedMb, vramTotalMb, utilizationPercent] = parsed.slice(-3);
  if (vramUsedMb === null || vramTotalMb === null || utilizationPercent === null) return null;
  if (!Number.isFinite(vramTotalMb) || vramTotalMb <= 0) return null;
  if (!Number.isFinite(vramUsedMb) || vramUsedMb < 0) return null;
  if (!Number.isFinite(utilizationPercent) || utilizationPercent < 0 || utilizationPercent > 100) return null;

  return { vramUsedMb, vramTotalMb, utilizationPercent, source: 'nvidia-smi' };
}

/**
 * Parse `rocm-smi --showmemuse --showuse --csv` (AMD).
 *
 * UNVERIFIED — written from documented output, no AMD hardware available:
 *   device,GPU memory use (%),GPU use (%)
 *   card0,42,17
 *
 * Returns null on anything unexpected so an unparsed format reads as "unknown"
 * rather than a fabricated reading.
 */
function parseRocmSmiQuery(output, vramTotalMb = null) {
  const lines = String(output ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const dataLine = lines.find((l) => /^card\d/i.test(l));
  if (!dataLine) return null;

  const cells = dataLine.split(',').map((c) => c.trim());
  const numbers = cells.map((c) => Number(c.replace('%', ''))).filter((n) => Number.isFinite(n));
  if (numbers.length < 2) return null;

  const [memoryUsePercent, utilizationPercent] = numbers.slice(-2);
  if (memoryUsePercent < 0 || memoryUsePercent > 100) return null;
  if (utilizationPercent < 0 || utilizationPercent > 100) return null;

  // rocm-smi reports memory as a percentage; convert only if a total is known.
  const total = Number.isFinite(vramTotalMb) && vramTotalMb > 0 ? vramTotalMb : null;
  return {
    vramUsedMb: total ? Math.round((memoryUsePercent / 100) * total) : null,
    vramTotalMb: total,
    vramUsedPercent: memoryUsePercent,
    utilizationPercent,
    source: 'rocm-smi',
  };
}

/**
 * Parse `ioreg -r -d 1 -w 0 -c AGXAccelerator` (Apple Silicon).
 *
 * systeminformation reports no GPU utilization at all on Apple Silicon — model
 * and vendor come through, but `utilizationGpu` and `vram` are both null — so
 * without this RigMatch would answer "could not check" on every Mac forever.
 * IOKit exposes the real figures and, unlike `powermetrics`, needs no sudo.
 *
 * Real captured output (M4, idle):
 *   "PerformanceStatistics" = {"In use system memory (driver)"=0,
 *   "Alloc system memory"=2629632000,"Tiler Utilization %"=0,"recoveryCount"=0,
 *   "lastRecoveryTime"=0,"Renderer Utilization %"=0,"TiledSceneBytes"=0,
 *   "Device Utilization %"=0,"SplitSceneCount"=0,"Allocated PB Size"=75628544,
 *   "In use system memory"=763723776}
 *
 * No total is reported — the pool is system RAM — so vramTotalMb stays null.
 * That is fine: Apple Silicon is unified memory, where the memory criterion is
 * skipped and utilization decides alone.
 */
function parseIoregGpuStats(output) {
  const text = String(output ?? '');
  if (!text.includes('PerformanceStatistics')) return null;

  const num = (pattern) => {
    const match = text.match(pattern);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  // "Device Utilization %" is the overall figure. Renderer and Tiler are the
  // sub-units; take the highest of those only if the overall one is missing,
  // since a busy tiler with an idle renderer is still a busy GPU.
  const device = num(/"Device Utilization %"\s*=\s*(\d+)/);
  const renderer = num(/"Renderer Utilization %"\s*=\s*(\d+)/);
  const tiler = num(/"Tiler Utilization %"\s*=\s*(\d+)/);
  const utilizationPercent = device ?? (renderer === null && tiler === null
    ? null
    : Math.max(renderer ?? 0, tiler ?? 0));
  if (utilizationPercent === null || utilizationPercent < 0 || utilizationPercent > 100) return null;

  // The trailing quote before "=" is what separates this from the neighbouring
  // "In use system memory (driver)" key, which is a different (and usually zero)
  // figure.
  const inUseBytes = num(/"In use system memory"\s*=\s*(\d+)/);

  return {
    vramUsedMb: inUseBytes === null ? null : Math.round(inUseBytes / (1024 * 1024)),
    vramTotalMb: null,
    utilizationPercent,
    source: 'ioreg',
  };
}

/**
 * Match running process names against the known-heavy allowlist.
 *
 * Accepts a list of process names or full paths from any source (tasklist, ps,
 * nvidia-smi). Only allowlisted programs are ever returned, so a caller cannot
 * accidentally surface explorer.exe from nvidia-smi's process list.
 */
function matchKnownGpuApps(processNames, ownProcessNames = []) {
  const ignore = new Set(
    ['rigmatch', 'rigmatch.ai', 'ollama', 'ollama app', 'ollama_llama_server', ...ownProcessNames]
      .map((n) => n.toLowerCase()),
  );
  const found = new Map();

  for (const raw of processNames ?? []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    // Base name, lowercased, from either a path or a bare name.
    const base = raw.trim().replace(/\\/g, '/').split('/').pop().toLowerCase();
    if (!base || base.startsWith('[')) continue; // "[Insufficient Permissions]"
    if (ignore.has(base) || ignore.has(base.replace(/\.exe$/, ''))) continue;

    for (const app of KNOWN_GPU_HEAVY_APPS) {
      if (base.includes(app.match)) {
        found.set(app.label, true);
        break;
      }
    }
  }

  return [...found.keys()];
}

/**
 * Turn a reading into a contention level plus a plain-English reason.
 *
 * Returns `unknown` when there is no usable reading — never `clear`. The two
 * mean different things to a user deciding whether to trust a score.
 */
function assessGpuContention(reading, knownApps = [], options = {}) {
  if (!reading || typeof reading !== 'object') {
    return { level: 'unknown', reasons: [], apps: [], utilizationPercent: null, vramUsedPercent: null };
  }

  const utilization = Number.isFinite(reading.utilizationPercent) ? reading.utilizationPercent : null;
  const vramShare = Number.isFinite(reading.vramUsedPercent)
    ? reading.vramUsedPercent / 100
    : (Number.isFinite(reading.vramUsedMb) && Number.isFinite(reading.vramTotalMb) && reading.vramTotalMb > 0
      ? reading.vramUsedMb / reading.vramTotalMb
      : null);

  if (utilization === null && vramShare === null) {
    return { level: 'unknown', reasons: [], apps: [], utilizationPercent: null, vramUsedPercent: null };
  }

  const reasons = [];
  let level = 'clear';
  const raise = (next) => {
    const rank = { clear: 0, busy: 1, heavy: 2 };
    if (rank[next] > rank[level]) level = next;
  };

  if (utilization !== null) {
    if (utilization >= HEAVY_UTILIZATION_PERCENT) {
      raise('heavy');
      reasons.push(`the graphics card is already ${Math.round(utilization)}% busy`);
    } else if (utilization >= BUSY_UTILIZATION_PERCENT) {
      raise('busy');
      reasons.push(`the graphics card is ${Math.round(utilization)}% busy`);
    }
  }

  // On unified-memory hardware — Apple Silicon, NVIDIA Grace/GB10, Jetson — the
  // "GPU memory" figure is the pool the CPU also uses, so ordinary RAM pressure
  // would read as GPU contention. Utilization still means what it says, so that
  // criterion stands alone there.
  if (vramShare !== null && !options.unifiedMemory) {
    const percent = Math.round(vramShare * 100);
    if (vramShare >= HEAVY_VRAM_SHARE) {
      raise('heavy');
      reasons.push(`${percent}% of its memory is already in use`);
    } else if (vramShare >= BUSY_VRAM_SHARE) {
      raise('busy');
      reasons.push(`${percent}% of its memory is in use`);
    }
  }

  // A known-heavy app running is itself a reason to warn, even if this instant's
  // sample looks quiet — a game between frames can read low.
  const apps = Array.isArray(knownApps) ? knownApps.filter(Boolean) : [];
  if (apps.length) raise('busy');

  return {
    level,
    reasons,
    apps,
    utilizationPercent: utilization,
    vramUsedPercent: vramShare === null ? null : Math.round(vramShare * 100),
  };
}

/**
 * The one sentence shown to the user. Never instructs closing anything we are
 * not confident about, and says plainly when we could not check.
 */
function describeGpuContention(assessment) {
  if (!assessment || assessment.level === 'unknown') {
    return 'RigMatch could not check whether other programs are using your graphics card. If something heavy is open, close it for the most accurate scores.';
  }
  if (assessment.level === 'clear') return '';

  const reasons = assessment.reasons.length
    ? assessment.reasons.join(' and ')
    : 'your graphics card looks busy';
  const named = assessment.apps.length
    ? ` ${assessment.apps.join(' and ')} ${assessment.apps.length === 1 ? 'is' : 'are'} running.`
    : '';
  const severity = assessment.level === 'heavy'
    ? 'Scores from this run will be noticeably lower than this computer can really do.'
    : 'Scores may come out a little lower than this computer can really do.';

  return `Before starting: ${reasons}.${named} ${severity} Closing other graphics-heavy programs gives the most accurate result.`;
}

/**
 * Median of a sample set, so one transient spike cannot trigger a warning. The
 * measured desktop baseline swings 12–44% second to second; the median of five
 * readings is stable where any single one is not.
 */
function medianOf(values) {
  const usable = (values ?? [])
    // Number(null) is 0 and Number('') is 0, so a failed sample would be counted
    // as 0% busy and drag the median down — under-reporting contention exactly
    // when a probe is misbehaving. Reject non-numbers before coercing.
    .filter((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!usable.length) return null;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

/** Collapse several readings into one by taking the median of each figure. */
function medianReading(readings) {
  const usable = (readings ?? []).filter(Boolean);
  if (!usable.length) return null;
  const pick = (key) => medianOf(usable.map((r) => r[key]));
  return {
    vramUsedMb: pick('vramUsedMb'),
    vramTotalMb: pick('vramTotalMb'),
    vramUsedPercent: pick('vramUsedPercent'),
    utilizationPercent: pick('utilizationPercent'),
    samples: usable.length,
    source: usable[0].source,
  };
}

module.exports = {
  KNOWN_GPU_HEAVY_APPS,
  UNIFIED_MEMORY_GPU_PATTERNS,
  isUnifiedMemoryGpu,
  medianOf,
  medianReading,
  BUSY_UTILIZATION_PERCENT,
  HEAVY_UTILIZATION_PERCENT,
  BUSY_VRAM_SHARE,
  HEAVY_VRAM_SHARE,
  parseNvidiaGpuQuery,
  parseRocmSmiQuery,
  parseIoregGpuStats,
  matchKnownGpuApps,
  assessGpuContention,
  describeGpuContention,
};
