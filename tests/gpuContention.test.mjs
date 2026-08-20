// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseNvidiaGpuQuery,
  parseRocmSmiQuery,
  parseIoregGpuStats,
  matchKnownGpuApps,
  assessGpuContention,
  describeGpuContention,
  medianOf,
  medianReading,
  isUnifiedMemoryGpu,
} = require(path.join(process.cwd(), 'electron', 'gpuContention.cjs'));

// ── nvidia-smi parsing ───────────────────────────────────────────────────────

test('parses real nvidia-smi output captured from an RTX 4070', () => {
  // Verbatim from `nvidia-smi --query-gpu=index,name,memory.used,memory.total,
  // utilization.gpu --format=csv,noheader,nounits` on Windows.
  const reading = parseNvidiaGpuQuery('0, NVIDIA GeForce RTX 4070, 2521, 12282, 31');
  assert.equal(reading.vramUsedMb, 2521);
  assert.equal(reading.vramTotalMb, 12282);
  assert.equal(reading.utilizationPercent, 31);
  assert.equal(reading.source, 'nvidia-smi');
});

test('parses the unit-bearing form, since nounits is not always honoured', () => {
  const reading = parseNvidiaGpuQuery('2521 MiB, 12282 MiB, 31 %');
  assert.equal(reading.vramUsedMb, 2521);
  assert.equal(reading.vramTotalMb, 12282);
  assert.equal(reading.utilizationPercent, 31);
});

test('GiB values are normalised to MiB', () => {
  const reading = parseNvidiaGpuQuery('2 GiB, 12 GiB, 40 %');
  assert.equal(reading.vramUsedMb, 2048);
  assert.equal(reading.vramTotalMb, 12288);
});

test('unparseable nvidia-smi output yields null, never a fabricated reading', () => {
  for (const bad of [
    '',
    null,
    undefined,
    'nvidia-smi: command not found',
    'Failed to initialize NVML: Driver/library version mismatch',
    '[N/A], [N/A], [N/A]',
    '0, NVIDIA GeForce RTX 4070',           // truncated: too few numbers
    '0, GPU, 2521, 0, 31',                   // zero total would divide by zero
    '0, GPU, 2521, 12282, 900',              // impossible utilization
    '0, GPU, -5, 12282, 31',                 // negative memory
  ]) {
    assert.equal(parseNvidiaGpuQuery(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
});

test('blank lines and comment headers are skipped', () => {
  const reading = parseNvidiaGpuQuery('\n# gpu   pid\n\n0, GPU, 100, 1000, 5\n');
  assert.equal(reading.vramUsedMb, 100);
});

// ── rocm-smi parsing (AMD — unverified against real hardware) ────────────────

test('parses the documented rocm-smi CSV shape', () => {
  const out = 'device,GPU memory use (%),GPU use (%)\ncard0,42,17';
  const reading = parseRocmSmiQuery(out, 16384);
  assert.equal(reading.vramUsedPercent, 42);
  assert.equal(reading.utilizationPercent, 17);
  assert.equal(reading.vramUsedMb, Math.round(0.42 * 16384));
  assert.equal(reading.source, 'rocm-smi');
});

test('rocm-smi without a known VRAM total still reports percentages', () => {
  const reading = parseRocmSmiQuery('card0,42,17');
  assert.equal(reading.vramUsedPercent, 42);
  assert.equal(reading.vramUsedMb, null, 'must not invent an absolute figure');
  assert.equal(reading.vramTotalMb, null);
});

test('unexpected rocm-smi output yields null rather than a guess', () => {
  for (const bad of ['', null, 'rocm-smi: not found', 'device,GPU use (%)\n', 'card0,150,17']) {
    assert.equal(parseRocmSmiQuery(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
});

// ── known-app matching ───────────────────────────────────────────────────────

test("Windows' 39 idle GPU processes never produce advice", () => {
  // The real list from an idle desktop. Suggesting any of these would be worse
  // than saying nothing at all.
  const idleWindows = [
    '[Insufficient Permissions]',
    'C:\\Windows\\System32\\ShellHost.exe',
    'C:\\Windows\\explorer.exe',
    'C:\\Windows\\SystemApps\\Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy\\StartMenuExperienceHost.exe',
    'C:\\Windows\\SystemApps\\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\\SearchHost.exe',
    'C:\\Windows\\SystemApps\\ShellExperienceHost_cw5n1h2txyewy\\ShellExperienceHost.exe',
    'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application\\151.0.4129.59\\msedgewebview2.exe',
    'C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA Overlay.exe',
    'C:\\Windows\\SystemApps\\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\\CrossDeviceResume.exe',
  ];
  assert.deepEqual(matchKnownGpuApps(idleWindows), [], 'the desktop shell must never be named');
});

test('genuinely heavy programs are named', () => {
  assert.deepEqual(matchKnownGpuApps(['C:\\Program Files\\LM Studio\\LM Studio.exe']), ['LM Studio']);
  assert.deepEqual(matchKnownGpuApps(['/usr/bin/blender']), ['Blender']);
  assert.deepEqual(matchKnownGpuApps(['D:\\obs\\bin\\64bit\\obs64.exe']), ['OBS Studio']);
});

test('RigMatch and Ollama are never named — they are supposed to be running', () => {
  const own = [
    'C:\\Users\\x\\AppData\\Local\\Programs\\RigMatch.AI\\RigMatch.AI.exe',
    'C:\\Users\\x\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
    'ollama_llama_server.exe',
  ];
  assert.deepEqual(matchKnownGpuApps(own), []);
});

test('each app is named once however many processes it spawns', () => {
  const many = ['lm studio.exe', 'LM Studio Helper.exe', 'C:\\x\\lmstudio.exe'];
  assert.deepEqual(matchKnownGpuApps(many), ['LM Studio']);
});

test('malformed process entries are skipped without throwing', () => {
  assert.doesNotThrow(() => matchKnownGpuApps([null, undefined, '', '   ', 42, {}]));
  assert.deepEqual(matchKnownGpuApps([null, 'blender.exe', undefined]), ['Blender']);
  assert.deepEqual(matchKnownGpuApps(null), []);
});

// ── assessment ───────────────────────────────────────────────────────────────

const rtx = (usedMb, util) => ({ vramUsedMb: usedMb, vramTotalMb: 12282, utilizationPercent: util });

test('a quiet desktop baseline does not trigger a warning', () => {
  // The measured idle state of the reporting machine: ~2.5GB of 12GB, ~20%.
  // If this fired, the warning would show constantly and be ignored.
  const assessment = assessGpuContention(rtx(2521, 20));
  assert.equal(assessment.level, 'clear');
  assert.equal(describeGpuContention(assessment), '', 'a clear GPU produces no message');
});

test('a busy GPU warns, and a hammered one warns harder', () => {
  // Thresholds are 45% busy / 70% heavy, set above the measured desktop ceiling
  // of 44% so ordinary use never fires the warning.
  assert.equal(assessGpuContention(rtx(2521, 44)).level, 'clear', 'the top of normal desktop noise');
  assert.equal(assessGpuContention(rtx(2521, 50)).level, 'busy');
  assert.equal(assessGpuContention(rtx(2521, 85)).level, 'heavy');
  assert.equal(assessGpuContention(rtx(7500, 10)).level, 'heavy', 'VRAM alone can indicate heavy use');
});

test('no reading at all is unknown, never clear', () => {
  // These mean different things: "we checked and it is quiet" versus "we could
  // not check". Collapsing them would state a fact we do not have.
  for (const nothing of [null, undefined, {}, { vramUsedMb: null, utilizationPercent: null }]) {
    assert.equal(assessGpuContention(nothing).level, 'unknown');
  }
  assert.match(describeGpuContention({ level: 'unknown' }), /could not check/i);
});

test('a known-heavy app warns even when the instant sample looks quiet', () => {
  // A game between frames can sample low; the app being open is the better signal.
  const assessment = assessGpuContention(rtx(2000, 5), ['Blender']);
  assert.equal(assessment.level, 'busy');
  assert.deepEqual(assessment.apps, ['Blender']);
  assert.match(describeGpuContention(assessment), /Blender is running/);
});

test('the message never tells the user to close something unnamed', () => {
  const message = describeGpuContention(assessGpuContention(rtx(2521, 70)));
  assert.match(message, /70% busy/);
  assert.match(message, /graphics-heavy programs/, 'generic advice when we cannot name the culprit');
  assert.ok(!/explorer|shell|search/i.test(message));
});

test('percentages in the message are whole numbers', () => {
  const message = describeGpuContention(assessGpuContention(rtx(2521, 51.4)));
  assert.match(message, /51% busy/);
  assert.ok(!/51\.4/.test(message), 'a fractional percent reads as false precision');
});

test('AMD percentage-only readings assess the same as NVIDIA absolute ones', () => {
  const amd = assessGpuContention({ vramUsedPercent: 60, utilizationPercent: 10, source: 'rocm-smi' });
  assert.equal(amd.level, 'heavy');
  assert.equal(amd.vramUsedPercent, 60);
});

// ── thresholds vs. a real measured desktop ───────────────────────────────────

// Ten consecutive samples of an ordinary Windows desktop with a browser and
// editor open, captured from the reporting machine. Nothing heavy was running.
const IDLE_DESKTOP = [
  { util: 37, usedMb: 2661 }, { util: 34, usedMb: 2689 }, { util: 44, usedMb: 2684 },
  { util: 37, usedMb: 2663 }, { util: 13, usedMb: 2633 }, { util: 12, usedMb: 2672 },
  { util: 18, usedMb: 2716 }, { util: 28, usedMb: 2717 }, { util: 26, usedMb: 2715 },
  { util: 30, usedMb: 2730 },
];
const asReading = (s) => ({ vramUsedMb: s.usedMb, vramTotalMb: 12282, utilizationPercent: s.util });

test('an ordinary desktop never warns — not on any sample, nor their median', () => {
  // A warning that fires during normal use is one users learn to dismiss.
  for (const sample of IDLE_DESKTOP) {
    assert.equal(
      assessGpuContention(asReading(sample)).level, 'clear',
      `${sample.util}% util / ${sample.usedMb}MB should not warn`,
    );
  }
  const median = medianReading(IDLE_DESKTOP.map(asReading));
  assert.equal(assessGpuContention(median).level, 'clear');
});

test('a real workload does warn', () => {
  // A game or diffusion run sustains far above desktop noise.
  assert.equal(assessGpuContention(asReading({ util: 95, usedMb: 9000 })).level, 'heavy');
  assert.equal(assessGpuContention(asReading({ util: 50, usedMb: 2700 })).level, 'busy');
  // Another model already loaded shows as VRAM pressure even at low utilization.
  assert.equal(assessGpuContention(asReading({ util: 5, usedMb: 8000 })).level, 'heavy');
});

test('the median ignores a single spike', () => {
  // One 99% frame among quiet samples must not trigger a warning.
  const spiky = [30, 28, 99, 31, 27].map((util) => asReading({ util, usedMb: 2700 }));
  const median = medianReading(spiky);
  assert.equal(median.utilizationPercent, 30);
  assert.equal(assessGpuContention(median).level, 'clear');
});

test('the median reports how many samples backed it', () => {
  const median = medianReading([asReading({ util: 10, usedMb: 100 }), asReading({ util: 20, usedMb: 200 })]);
  assert.equal(median.samples, 2);
  assert.equal(median.utilizationPercent, 15, 'even counts average the middle pair');
});

test('medians survive failed samples and empty input', () => {
  assert.equal(medianReading([]), null);
  assert.equal(medianReading(null), null);
  assert.equal(medianReading([null, undefined]), null);
  const partial = medianReading([null, asReading({ util: 40, usedMb: 2700 }), undefined]);
  assert.equal(partial.utilizationPercent, 40, 'one good sample is still a median');
  assert.equal(partial.samples, 1);
});

test('medianOf handles the basics', () => {
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 3, 2]), 2.5);
  assert.equal(medianOf([]), null);
  // Number(null) and Number('') are both 0 — a failed sample counted as 0% would
  // drag the median down and under-report a busy GPU.
  assert.equal(medianOf([null, 'x', 5]), 5, 'non-numbers are dropped, not coerced to zero');
  assert.equal(medianOf([null, undefined, '', 80]), 80);
});

// ── unified memory (Apple Silicon, NVIDIA Grace / DGX Spark, Jetson) ─────────

test('unified-memory hardware is recognised', () => {
  // Apple Silicon often reports no GPU model string at all, so platform+arch
  // carries it there.
  assert.equal(isUnifiedMemoryGpu({ platform: 'darwin', arch: 'arm64' }), true);
  assert.equal(isUnifiedMemoryGpu({ model: 'Apple M3 Max' }), true);

  // NVIDIA Grace-based parts run Linux on aarch64 and were previously treated
  // as having discrete VRAM.
  assert.equal(isUnifiedMemoryGpu({ model: 'NVIDIA GB10' }), true, 'DGX Spark');
  assert.equal(isUnifiedMemoryGpu({ model: 'NVIDIA GH200 120GB' }), true);
  assert.equal(isUnifiedMemoryGpu({ model: 'NVIDIA Grace Hopper Superchip' }), true);
  assert.equal(isUnifiedMemoryGpu({ model: 'Orin' }), true, 'Jetson');
});

test('discrete cards are not mistaken for unified', () => {
  for (const model of [
    'NVIDIA GeForce RTX 4070',
    'NVIDIA RTX A6000',
    'NVIDIA H100 PCIe',
    'AMD Radeon RX 7900 XTX',
    'Intel Arc A770',
  ]) {
    assert.equal(isUnifiedMemoryGpu({ model }), false, `${model} has its own VRAM`);
  }
  assert.equal(isUnifiedMemoryGpu({ platform: 'win32', arch: 'x64' }), false);
  assert.equal(isUnifiedMemoryGpu({}), false, 'no information means assume discrete');
  assert.equal(isUnifiedMemoryGpu(), false);
});

test('an Intel Mac is not unified', () => {
  // Only Apple Silicon shares memory; Intel Macs had discrete or Intel GPUs.
  assert.equal(isUnifiedMemoryGpu({ platform: 'darwin', arch: 'x64' }), false);
});

test('memory pressure alone never flags contention on unified hardware', () => {
  // A DGX Spark with 90GB of its 128GB committed, or an M-series Mac deep into
  // its RAM, is not a busy GPU — on unified hardware that figure includes
  // ordinary system memory. Thresholds tuned on a discrete 12GB card would call
  // this "heavy" and warn on every run.
  const loadedPool = { vramUsedMb: 92000, vramTotalMb: 131072, utilizationPercent: 8 };

  assert.equal(assessGpuContention(loadedPool, [], { unifiedMemory: true }).level, 'clear');
  // The same numbers on a discrete card genuinely are heavy contention.
  assert.equal(assessGpuContention(loadedPool).level, 'heavy');
});

test('utilization still counts on unified hardware', () => {
  // Only the memory criterion is unreliable there; busy is still busy.
  const busy = { vramUsedMb: 20000, vramTotalMb: 131072, utilizationPercent: 90 };
  const assessment = assessGpuContention(busy, [], { unifiedMemory: true });
  assert.equal(assessment.level, 'heavy');
  assert.match(describeGpuContention(assessment), /90% busy/);
  // And the message must not cite memory, which was not used to decide.
  assert.ok(!/memory/i.test(describeGpuContention(assessment)));
});

test('a named app still warns on unified hardware', () => {
  const quiet = { vramUsedMb: 90000, vramTotalMb: 131072, utilizationPercent: 5 };
  const assessment = assessGpuContention(quiet, ['ComfyUI'], { unifiedMemory: true });
  assert.equal(assessment.level, 'busy');
  assert.deepEqual(assessment.apps, ['ComfyUI']);
});

// ── Apple Silicon via IOKit ─────────────────────────────────────────────────

// Verbatim from `ioreg -r -d 1 -w 0 -c AGXAccelerator` on an idle Apple M4.
// systeminformation reports utilizationGpu: null and vram: null on this machine,
// so without IOKit every Mac would answer "could not check" forever.
const M4_IDLE = '      "PerformanceStatistics" = {"In use system memory (driver)"=0,"Alloc system memory"=2629632000,"Tiler Utilization %"=0,"recoveryCount"=0,"lastRecoveryTime"=0,"Renderer Utilization %"=0,"TiledSceneBytes"=0,"Device Utilization %"=0,"SplitSceneCount"=0,"Allocated PB Size"=75628544,"In use system memory"=763723776}';

test('real idle M4 output parses to a genuine zero, not to null', () => {
  const reading = parseIoregGpuStats(M4_IDLE);
  assert.equal(reading.utilizationPercent, 0, 'an idle Mac is 0% busy, which is a real answer');
  assert.equal(reading.source, 'ioreg');
  // 763723776 bytes = 728 MB of GPU memory in use.
  assert.equal(reading.vramUsedMb, 728);
  assert.equal(reading.vramTotalMb, null, 'the pool is system RAM; IOKit reports no total');
});

test('an idle Mac reads clear rather than unknown', () => {
  // This is the whole point: "checked, and it is quiet" instead of "could not
  // check", which would otherwise show a note before every run on every Mac.
  const assessment = assessGpuContention(parseIoregGpuStats(M4_IDLE), [], { unifiedMemory: true });
  assert.equal(assessment.level, 'clear');
  assert.equal(describeGpuContention(assessment), '');
});

test('the driver memory key is not mistaken for the real one', () => {
  // "In use system memory (driver)"=0 sits immediately before
  // "In use system memory"=763723776 in the same dict.
  assert.equal(parseIoregGpuStats(M4_IDLE).vramUsedMb, 728, 'must not read the (driver) zero');
});

test('a busy Apple GPU is detected', () => {
  const busy = M4_IDLE.replace('"Device Utilization %"=0', '"Device Utilization %"=88');
  const reading = parseIoregGpuStats(busy);
  assert.equal(reading.utilizationPercent, 88);
  assert.equal(assessGpuContention(reading, [], { unifiedMemory: true }).level, 'heavy');
});

test('the sub-unit figures are used only when the overall one is absent', () => {
  // A busy tiler with an idle renderer is still a busy GPU, so take the max.
  const noDevice = '"PerformanceStatistics" = {"Tiler Utilization %"=64,"Renderer Utilization %"=3}';
  assert.equal(parseIoregGpuStats(noDevice).utilizationPercent, 64);

  // But when the overall figure exists it wins, even if a sub-unit reads higher.
  const both = '"PerformanceStatistics" = {"Device Utilization %"=12,"Tiler Utilization %"=90}';
  assert.equal(parseIoregGpuStats(both).utilizationPercent, 12);
});

test('non-Apple or unexpected ioreg output yields null', () => {
  for (const bad of ['', null, undefined, 'ioreg: command not found', '+-o AGXAccelerator  <class AGXAccelerator>', '"PerformanceStatistics" = {"recoveryCount"=0}']) {
    assert.equal(parseIoregGpuStats(bad), null, `${JSON.stringify(bad)?.slice(0, 40)} must not parse`);
  }
  // Out-of-range values are rejected rather than clamped silently.
  assert.equal(parseIoregGpuStats('"PerformanceStatistics" = {"Device Utilization %"=400}'), null);
});
