// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Reading the graphics card's load, on whatever card this is.
 *
 * The app (main.cjs) and the command line (cli/measure.ts) both ask here, so a
 * card is read the same way before a test, before a speed run and after it.
 * gpuContention.cjs holds the parsers and the thresholds; this file runs the
 * tools. Nothing here uses a shell: every program goes through `run`, the
 * (command, args, timeoutMs) => { output, error } helper both callers already
 * have (execFile with a timeout), and a program that is missing, refuses or
 * hangs is a normal "not checked" outcome, never a thrown error.
 *
 * Which tool, in order:
 *   1. nvidia-smi, any OS (an NVIDIA card, verified).
 *   2. Windows: the GPU performance counters through WMI, for any other card.
 *   3. Linux: the amdgpu driver's sysfs files (AMD).
 *   4. macOS on Apple Silicon: ioreg.
 *   5. `fallback`, a reading the caller already has, if it has one.
 * Anything else is not read, and the answer says why (describeUnreadable). It
 * is never "idle".
 */
const fs = require('node:fs');
const path = require('node:path');
const contention = require('./gpuContention.cjs');

const NVIDIA_QUERY = ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'];
/** The whole PowerShell script (one process, all the samples) gets this long. */
const WINDOWS_PROBE_TIMEOUT_MS = 20000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `run`, but a thrown error is an error result like any other. */
async function safeRun(run, command, args, timeoutMs) {
  try {
    const result = await run(command, args, timeoutMs);
    return { output: String(result?.output ?? ''), error: result?.error ?? null };
  } catch (error) {
    return { output: '', error: String(error?.message ?? error) };
  }
}

/**
 * The PowerShell that reads the adapters and the GPU counters. Windows
 * PowerShell 5.1, which every Windows 10 and 11 has. WMI rather than Get-Counter
 * for two reasons found on a real PC: Get-Counter takes the counter names in the
 * language of the Windows install (its documentation says so) and needed 5 s to
 * list the engine instances, where the WMI classes keep their English names and
 * answer in a third of a second.
 *
 * Output is one line of JSON:
 *   adapters: from HKLM\SOFTWARE\Microsoft\DirectX\<guid> (Description, VendorId,
 *     DedicatedVideoMemory, AdapterLuid), the only place the counters' adapter
 *     LUID is tied to a card name and its full memory
 *   samples[].mem: Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory
 *     (Name, DedicatedUsage in bytes)
 *   samples[].eng: ..._GPUEngine (Name, UtilizationPercentage), only the engines
 *     above zero, because there are about a thousand instances
 */
const WINDOWS_PROBE_BODY = String.raw`$ErrorActionPreference = 'Stop'
function ToU64($v) { [BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$v), 0) }
$adapters = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\DirectX\*' -ErrorAction SilentlyContinue | Where-Object { $_.AdapterLuid } | ForEach-Object {
  [ordered]@{ luid = ('{0:x}' -f (ToU64 $_.AdapterLuid)); vendor = ('{0:x4}' -f [int]$_.VendorId); name = [string]$_.Description; bytes = (ToU64 $_.DedicatedVideoMemory) }
})
$samples = @()
for ($i = 0; $i -lt $count; $i++) {
  $mem = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | ForEach-Object { [ordered]@{ n = [string]$_.Name; b = [uint64]$_.DedicatedUsage } })
  $eng = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.UtilizationPercentage -gt 0 } | ForEach-Object { [ordered]@{ n = [string]$_.Name; u = [int]$_.UtilizationPercentage } })
  $samples += , [ordered]@{ mem = $mem; eng = $eng }
  if ($i -lt $count - 1) { Start-Sleep -Milliseconds $gap }
}
ConvertTo-Json -InputObject ([ordered]@{ adapters = $adapters; samples = $samples }) -Depth 6 -Compress`;

const wholeNumber = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

function windowsProbeScript(samples, gapMs) {
  return `$count = ${wholeNumber(samples, 1, 30)}; $gap = ${wholeNumber(gapMs, 0, 5000)}\n${WINDOWS_PROBE_BODY}`;
}

/** Windows PowerShell by its full path, so a program called powershell.exe earlier on the PATH is not run instead. */
function windowsPowerShell(env = process.env) {
  const root = env.SystemRoot || env.windir;
  return root ? path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
}

/**
 * Every amdgpu card's load from sysfs; the one with the most memory wins, so an
 * integrated GPU's carve-out never outranks a discrete card (as systemProfile's
 * withSysfsVram does). `root` lets the tests point it at a fixture tree.
 */
function readAmdSysfs(root = '/') {
  const drm = path.join(root, 'sys', 'class', 'drm');
  let cards = [];
  try {
    cards = fs.readdirSync(drm).filter((name) => /^card\d+$/.test(name));
  } catch {
    return null;
  }
  const readings = [];
  for (const card of cards) {
    const read = (file) => {
      try {
        return fs.readFileSync(path.join(drm, card, 'device', file), 'utf8');
      } catch {
        return null; // not an amdgpu card: only that driver writes these files
      }
    };
    const reading = contention.parseAmdSysfs({
      vramUsed: read('mem_info_vram_used'),
      vramTotal: read('mem_info_vram_total'),
      busyPercent: read('gpu_busy_percent'),
    });
    if (reading) readings.push(reading);
  }
  return readings.sort((a, b) => b.vramTotalMb - a.vramTotalMb)[0] ?? null;
}

/** One nvidia-smi reading (about 60 ms), or null. */
async function readNvidiaOnce(run) {
  const { output } = await safeRun(run, 'nvidia-smi', NVIDIA_QUERY, 4000);
  return output ? contention.parseNvidiaGpuQuery(output) : null;
}

async function collect(readOnce, samples, gapMs) {
  const readings = [];
  for (let index = 0; index < samples; index += 1) {
    const reading = await readOnce();
    if (reading) readings.push(reading);
    // No pause after the last sample: this gates a button press.
    if (index < samples - 1 && gapMs > 0) await sleep(gapMs);
  }
  return readings;
}

/**
 * Read the card `samples` times and take the median (a single reading of an
 * ordinary desktop lands anywhere from 12% to 44%).
 *
 * ctx: { run, platform, arch, gpuName, sysfsRoot, fallback, env }
 *   gpuName names the card to read when a PC has several (Windows)
 *   fallback is a reading the caller already has, used only when nothing reads
 * Resolves { reading, source, unreadable }: `reading` is null when the card
 * could not be read, and `unreadable` then says why, in a sentence.
 */
async function sampleGpuLoad(ctx, { samples = 5, gapMs = 220 } = {}) {
  const { run, platform = process.platform, arch = process.arch, gpuName = '', sysfsRoot = '/', fallback = null, env = process.env } = ctx;
  const done = (readings) => {
    const reading = contention.medianReading(readings);
    return reading ? { reading, source: reading.source, unreadable: null } : null;
  };

  const readNvidia = () => readNvidiaOnce(run);
  const first = await readNvidia();
  if (first) {
    // The first sample found the tool out and counts; the gap follows it.
    if (samples > 1 && gapMs > 0) await sleep(gapMs);
    return done([first, ...await collect(readNvidia, samples - 1, gapMs)]);
  }

  if (platform === 'win32') {
    const script = windowsProbeScript(samples, gapMs);
    const { output } = await safeRun(run, windowsPowerShell(env), ['-NoProfile', '-NonInteractive', '-Command', script], WINDOWS_PROBE_TIMEOUT_MS);
    const found = output ? done(contention.parseWindowsGpuProbe(output, { gpuName })) : null;
    if (found) return found;
  } else if (platform === 'linux') {
    const found = done(await collect(async () => readAmdSysfs(sysfsRoot), samples, gapMs));
    if (found) return found;
  } else if (platform === 'darwin') {
    const readIoreg = async () => {
      const { output } = await safeRun(run, 'ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'AGXAccelerator'], 5000);
      return output ? contention.parseIoregGpuStats(output) : null;
    };
    const found = done(await collect(readIoreg, samples, gapMs));
    if (found) return found;
  }

  if (fallback) return done([fallback]);
  return { reading: null, source: null, unreadable: contention.describeUnreadable({ platform, arch, gpuName }) };
}

/** Process names, for the known graphics-heavy programs: tasklist's CSV on Windows, ps elsewhere. */
async function listProcessNames(run, platform = process.platform) {
  const lines = (text) => String(text ?? '').split(/\r?\n/);
  if (platform === 'win32') {
    // The image name is the first quoted field of each row.
    const { output } = await safeRun(run, 'tasklist', ['/FO', 'CSV', '/NH'], 4000);
    return lines(output).map((line) => line.match(/^"([^"]+)"/)?.[1]).filter(Boolean);
  }
  const { output } = await safeRun(run, 'ps', ['-eo', 'comm='], 4000);
  return lines(output).map((line) => line.trim()).filter(Boolean);
}

/**
 * How long to let the card go quiet after the last request before reading its
 * utilization. nvidia-smi's utilization is "the past sample period", between
 * 1/6 s and 1 s, so a reading taken sooner would still contain the model's own
 * work and read as another program's.
 */
const WATCH_SETTLE_MS = 1100;

/**
 * Ollama's own model runner is named llama-server.exe on current versions
 * (seen on 0.40.5: it starts when a model loads and ends when it unloads), which
 * is also the name the allowlist gives "a llama.cpp server". A runner that
 * appears while a test loads its model is the test's own, so that label is not
 * counted as a program that joined.
 */
const OWN_RUNNER_APP_LABELS = ['a llama.cpp server'];

const pause = (ms, signal) => new Promise((resolve) => {
  if (ms <= 0 || signal?.aborted) { resolve(); return; }
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal?.removeEventListener?.('abort', done); resolve(); }
  signal?.addEventListener?.('abort', done, { once: true });
});

/**
 * A watch for a speed test (rigScoreRunner.cjs takes it as `watch`): did
 * something join the graphics card while the test ran? start() is called once
 * before the model loads and records what the card and the open programs were
 * doing then; check() is called after each of the test's requests, never during
 * one, and says whether anything has joined since (gpuContention.judgeMidRun).
 *
 * What it may do between two requests is bounded by a measurement, not by taste.
 * On the RTX 4070 here, an idle gap of 2 s before a request cut the next
 * request's prompt-reading speed from about 8,400 to about 5,500 tok/s (one run
 * 1,700), because the card clocks down while it waits; a gap of 0.4 s changed
 * nothing. The score counts that speed, so a between-requests check that waits
 * would change what is timed. So:
 *   - between requests it takes at most one instant memory reading (nvidia-smi,
 *     about 60 ms, or the amdgpu files), and only from a source that answers that
 *     fast; no waiting, no listing programs (tasklist took 0.7 s), no PowerShell;
 *   - after the LAST request, when nothing timed follows, it waits for the card
 *     to go quiet and reads everything: utilization, memory and the programs.
 * A program that joined and left between two requests is not seen; one that is
 * still there at the end, or that took memory, is.
 *
 * It reads and lists, and nothing else: no request to Ollama, no model loaded
 * or unloaded. A card it cannot read is watched for known programs only. Any
 * failure is "no verdict", never an error in the run.
 *
 * `context` is what sampleGpuLoad takes, or a function from the machine reading
 * the runner has ({ gpu, isUnifiedMemory, ... }) to it; it may also say
 * `unifiedMemory`, to leave the memory check out on a shared pool.
 */
function createGpuWatch(context, { settleMs = WATCH_SETTLE_MS, samples = 2, gapMs = 150 } = {}) {
  let ctx = null;
  let baseline = null;
  let baselineApps = [];
  let reference = null;
  let instant = null;

  const apps = async () => contention.matchKnownGpuApps(await listProcessNames(ctx.run, ctx.platform ?? process.platform));
  // The first reading after the model has loaded is what memory is compared with
  // from then on, lowered if the card frees some: the model's own weights are in
  // it, and so is anything that was already there.
  const remember = (reading) => {
    if (!reading || !Number.isFinite(reading.vramUsedMb)) return;
    reference = reference ? { ...reference, vramUsedMb: Math.min(reference.vramUsedMb, reading.vramUsedMb) } : reading;
  };

  return {
    async start({ machine } = {}) {
      ctx = typeof context === 'function' ? await context(machine ?? {}) : context;
      const load = await sampleGpuLoad(ctx, { samples: 3, gapMs: 150 });
      baseline = load.reading;
      baselineApps = await apps();
      reference = null;
      // Only a source that answers in milliseconds may be read between requests.
      instant = load.source === 'nvidia-smi' ? () => readNvidiaOnce(ctx.run)
        : load.source === 'amdgpu-sysfs' ? async () => readAmdSysfs(ctx.sysfsRoot ?? '/')
          : null;
    },

    async check({ signal, last = true } = {}) {
      if (!ctx) return null;
      try {
        if (!last) {
          const reading = instant ? await instant() : null;
          if (!reading) return null;
          // Memory only: utilization right after a request is the model's own.
          const verdict = contention.judgeMidRun({
            reference,
            current: { vramUsedMb: reading.vramUsedMb, vramTotalMb: reading.vramTotalMb, memoryShared: reading.memoryShared },
            unifiedMemory: Boolean(ctx.unifiedMemory),
          });
          remember(reading);
          return verdict;
        }
        await pause(settleMs, signal);
        if (signal?.aborted) return null;
        const [{ reading }, currentApps] = await Promise.all([sampleGpuLoad(ctx, { samples, gapMs }), apps()]);
        const verdict = contention.judgeMidRun({
          baseline,
          reference,
          current: reading,
          baselineApps,
          currentApps,
          ignoreApps: OWN_RUNNER_APP_LABELS,
          unifiedMemory: Boolean(ctx.unifiedMemory),
        });
        remember(reading);
        return verdict;
      } catch {
        return null;
      }
    },
  };
}

module.exports = {
  OWN_RUNNER_APP_LABELS,
  WATCH_SETTLE_MS,
  WINDOWS_PROBE_BODY,
  createGpuWatch,
  listProcessNames,
  readAmdSysfs,
  readNvidiaOnce,
  sampleGpuLoad,
  windowsPowerShell,
  windowsProbeScript,
};
