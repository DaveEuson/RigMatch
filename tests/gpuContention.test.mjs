// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseNvidiaGpuQuery,
  parseIoregGpuStats,
  parseWindowsGpuProbe,
  pickWindowsAdapter,
  parseAmdSysfs,
  describeUnreadable,
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

test('parses the unit-bearing form, since nounits is not always honored', () => {
  const reading = parseNvidiaGpuQuery('2521 MiB, 12282 MiB, 31 %');
  assert.equal(reading.vramUsedMb, 2521);
  assert.equal(reading.vramTotalMb, 12282);
  assert.equal(reading.utilizationPercent, 31);
});

test('GiB values are normalized to MiB', () => {
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

// rocm-smi is not read: its CSV columns and whether "GPU memory use (%)" is
// memory in use or memory activity could not be confirmed from AMD's sources, and
// it reads the same amdgpu files that are read directly below (see parseAmdSysfs).

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
  assert.deepEqual(matchKnownGpuApps(['C:\\Users\\x\\AppData\\Local\\Programs\\jan\\jan.exe']), ['Jan']);
  assert.deepEqual(matchKnownGpuApps(['/usr/bin/blender']), ['Blender']);
  assert.deepEqual(matchKnownGpuApps(['D:\\obs\\bin\\64bit\\obs64.exe']), ['OBS Studio']);
});

test('RigMatch and the model runners it tests through are never named — they are supposed to be running', () => {
  const own = [
    'C:\\Users\\x\\AppData\\Local\\Programs\\RigMatch.AI\\RigMatch.AI.exe',
    'C:\\Users\\x\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
    'ollama_llama_server.exe',
    'C:\\Program Files\\LM Studio\\LM Studio.exe',
    'LM Studio Helper.exe',
    'C:\\x\\lmstudio.exe',
  ];
  assert.deepEqual(matchKnownGpuApps(own), []);
});

test('each app is named once however many processes it spawns', () => {
  const many = ['koboldcpp.exe', 'koboldcpp_cu12.exe', 'C:\\x\\koboldcpp.exe'];
  assert.deepEqual(matchKnownGpuApps(many), ['KoboldCpp']);
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

test('percentage-only readings assess the same as absolute ones', () => {
  const amd = assessGpuContention({ vramUsedPercent: 60, utilizationPercent: 10, source: 'test' });
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

test('unified-memory hardware is recognized', () => {
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

// ── Windows: the GPU performance counters, any vendor ───────────────────────

// Real output of the PowerShell script in electron/gpuProbe.cjs, run on Windows
// 11 with three adapters: an NVIDIA RTX 4070 (luid 17162), an AMD Radeon
// integrated GPU (18823) and the Basic Render Driver (187f0). Three samples; the
// engines at zero are left out by the script. Microsoft documents no counter
// names or instance format for these counters (the DirectX blog post on Task
// Manager, devblogs.microsoft.com/directx/gpus-in-the-task-manager, says only
// that the GPU figure is "the percentage utilization of the busiest engine"), so
// the shape is pinned to what a real PC printed, and the nvidia-smi figures taken
// beside it agreed (4135 MiB used, 36%). A discrete AMD or Intel card has not
// been run.
const WINDOWS_IDLE = readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'gpu-windows-probe-idle.json'), 'utf8');

test('real Windows counter output reads the named card: its memory, and its busiest engine', () => {
  const readings = parseWindowsGpuProbe(WINDOWS_IDLE, { gpuName: 'NVIDIA GeForce RTX 4070' });
  assert.equal(readings.length, 3, 'one reading per sample');
  const [first] = readings;
  assert.equal(first.source, 'windows-counters');
  assert.equal(first.vramTotalMb, 12010, 'the registry holds the full 64-bit size: 12593397760 bytes');
  assert.equal(Math.round(first.vramUsedMb), 4154, 'Dedicated Usage 4356247552 bytes');
  // pid 11828 on the 3D engine at 17% and pid 4 on a copy engine at 1%: the busiest engine, not their sum.
  assert.equal(first.utilizationPercent, 17);
  assert.equal(first.memoryShared, false);
});

test('the AMD integrated GPU is read when it is the card, and its small memory slice is not judged', () => {
  const readings = parseWindowsGpuProbe(WINDOWS_IDLE, { gpuName: 'AMD Radeon(TM) Graphics' });
  assert.equal(readings.length, 3);
  assert.equal(Math.round(readings[0].vramTotalMb), 2022, 'a 2 GB carve-out of system RAM, not a card');
  assert.equal(readings[0].memoryShared, true);
  assert.equal(readings[0].utilizationPercent, 0, 'no engine of this adapter was above zero, which is a real answer');
  // 95% of a carve-out in use is how a desktop looks; it must not be called a busy card.
  const full = { ...readings[0], vramUsedMb: 1920, utilizationPercent: 4 };
  assert.equal(assessGpuContention(full).level, 'clear');
  assert.equal(assessGpuContention({ ...full, utilizationPercent: 80 }).level, 'heavy', 'its utilization still counts');
});

test('with no name to go by, the adapter with the most dedicated memory is read; the software renderer never is', () => {
  assert.equal(parseWindowsGpuProbe(WINDOWS_IDLE)[0].vramTotalMb, 12010);
  assert.equal(parseWindowsGpuProbe(WINDOWS_IDLE, { gpuName: 'No graphics card found' })[0].vramTotalMb, 12010);
  const onlySoftware = JSON.stringify({ adapters: [{ luid: '187f0', vendor: '1414', name: 'Microsoft Basic Render Driver', bytes: 0 }], samples: [{ mem: [{ n: 'luid_0x00000000_0x000187F0_phys_0', b: 0 }], eng: [] }] });
  assert.deepEqual(parseWindowsGpuProbe(onlySoftware), [], 'software rendering is not a card: not checked');
  assert.equal(pickWindowsAdapter([{ luid: '1', vendor: '1414', name: 'Microsoft Basic Render Driver', bytes: 99 }, { luid: '2', vendor: '1002', name: 'AMD Radeon RX 7800 XT', bytes: 5 }]).luid, '2');
});

test('processes sharing an engine add up, and the busiest engine of the card is the figure', () => {
  const sample = (engines) => JSON.stringify({
    adapters: [{ luid: '17162', vendor: '10de', name: 'NVIDIA GeForce RTX 4070', bytes: 12593397760 }, { luid: '100018823', vendor: '1002', name: 'AMD Radeon RX 7800 XT', bytes: 17163091968 }],
    samples: [{ mem: [{ n: 'luid_0x00000000_0x00017162_phys_0', b: 1e9 }, { n: 'luid_0x00000001_0x00018823_phys_0', b: 2e9 }], eng: engines }],
  });
  const engines = [
    { n: 'pid_100_luid_0x00000000_0x00017162_phys_0_eng_0_engtype_3D', u: 20 },
    { n: 'pid_200_luid_0x00000000_0x00017162_phys_0_eng_0_engtype_3D', u: 25 },
    { n: 'pid_100_luid_0x00000000_0x00017162_phys_0_eng_4_engtype_Compute_0', u: 30 },
    { n: 'pid_300_luid_0x00000001_0x00018823_phys_0_eng_0_engtype_3D', u: 90 },
  ];
  assert.equal(parseWindowsGpuProbe(sample(engines), { gpuName: 'RTX 4070' })[0].utilizationPercent, 45, 'two processes on engine 0 (20 + 25) beat the compute engine (30)');
  // A high LUID part is matched across the registry's single number and the counters' two.
  assert.equal(parseWindowsGpuProbe(sample(engines), { gpuName: 'Radeon RX 7800 XT' })[0].utilizationPercent, 90, 'luid 0x1_00018823 is 100018823');
  const over = [{ n: 'pid_1_luid_0x00000000_0x00017162_phys_0_eng_0_engtype_3D', u: 80 }, { n: 'pid_2_luid_0x00000000_0x00017162_phys_0_eng_0_engtype_3D', u: 70 }];
  assert.equal(parseWindowsGpuProbe(sample(over), { gpuName: 'RTX 4070' })[0].utilizationPercent, 100, 'capped at 100');
});

test('a sample with no memory row for the card is skipped, so unreadable counters never read as idle', () => {
  const data = JSON.parse(WINDOWS_IDLE);
  data.samples[0].mem = data.samples[0].mem.filter((row) => !/00017162/.test(row.n));
  const readings = parseWindowsGpuProbe(JSON.stringify(data), { gpuName: 'RTX 4070' });
  assert.equal(readings.length, 2, 'the sample the counters did not answer for is dropped');
  data.samples.forEach((s) => { s.mem = []; });
  assert.deepEqual(parseWindowsGpuProbe(JSON.stringify(data), { gpuName: 'RTX 4070' }), []);
  assert.equal(assessGpuContention(medianReading([])).level, 'unknown');
});

test('Windows probe output that is not the probe\'s yields nothing, and noise around the JSON is tolerated', () => {
  for (const bad of ['', null, undefined, 'Get-CimInstance : Invalid class', '{', '{"adapters":[]}', '{"adapters":[{"luid":"zz","vendor":"10de","name":"x","bytes":1}],"samples":[{}]}', '[1,2]']) {
    assert.deepEqual(parseWindowsGpuProbe(bad), [], `${JSON.stringify(bad)} must not parse`);
  }
  assert.equal(parseWindowsGpuProbe(`WARNING: something\n${WINDOWS_IDLE}\nmore noise`, { gpuName: 'RTX 4070' }).length, 3);
});

// ── Linux: AMD, from the amdgpu driver's sysfs files ────────────────────────

// docs.kernel.org/gpu/amdgpu/driver-misc.html ("GPU Memory Usage Information"):
//   mem_info_vram_total  "returns the total amount of VRAM in bytes"
//   mem_info_vram_used   "returns the total amount of currently used VRAM in bytes"
// docs.kernel.org/gpu/amdgpu/thermal.html (the "*_busy_percent" section):
//   gpu_busy_percent     "reading how busy the GPU is as a percentage"
// Each file holds one decimal number and a newline. The values are an RX 7900
// XTX (24560 MiB) from the machine in issue #145, in the shape the docs describe.
test('amdgpu sysfs values parse to a reading', () => {
  const reading = parseAmdSysfs({ vramUsed: '3221225472\n', vramTotal: '25753026560\n', busyPercent: '17\n' });
  assert.equal(reading.vramUsedMb, 3072);
  assert.equal(reading.vramTotalMb, 24560);
  assert.equal(reading.utilizationPercent, 17);
  assert.equal(reading.memoryShared, false);
  assert.equal(reading.source, 'amdgpu-sysfs');
  assert.equal(parseAmdSysfs({ vramUsed: '0\n', vramTotal: '536870912\n', busyPercent: '0\n' }).memoryShared, true, 'a Radeon 610M\'s 512 MB carve-out');
});

test('half-readable or impossible sysfs values are not checked, never idle', () => {
  const ok = { vramUsed: '1\n', vramTotal: '1073741824\n', busyPercent: '5\n' };
  assert.ok(parseAmdSysfs(ok));
  for (const bad of [
    {}, { ...ok, busyPercent: null }, { ...ok, vramUsed: null }, { ...ok, vramTotal: '' }, { ...ok, vramTotal: '0\n' },
    { ...ok, busyPercent: 'N/A\n' }, { ...ok, busyPercent: '101\n' }, { ...ok, vramUsed: '2147483648\n' }, { ...ok, busyPercent: '-3\n' },
  ]) {
    assert.equal(parseAmdSysfs(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
});

// ── Not checked: always says so, and why ────────────────────────────────────

test('a card that cannot be read is unknown with the reason said, on every platform', () => {
  for (const [platform, arch, gpuName, reason] of [
    ['linux', 'x64', 'Intel(R) Arc(TM) A770 Graphics', /no way to read an Intel graphics card's load on Linux/],
    ['linux', 'x64', 'AMD Radeon RX 7800 XT', /AMD driver did not report/],
    ['linux', 'x64', 'NVIDIA GeForce RTX 4070', /nvidia-smi did not report/],
    ['linux', 'x64', '', /cannot read this graphics card's load on Linux/],
    ['win32', 'x64', 'AMD Radeon RX 7800 XT', /Windows did not report/],
    ['darwin', 'arm64', 'Apple M4', /macOS did not report/],
    ['darwin', 'x64', 'AMD Radeon Pro 5500M', /unless it is Apple Silicon/],
    ['freebsd', 'x64', '', /no way to read this graphics card/],
  ]) {
    const why = describeUnreadable({ platform, arch, gpuName });
    assert.match(why, reason, `${platform} ${gpuName}`);
    const assessment = assessGpuContention(null, [], { reason: why });
    assert.equal(assessment.level, 'unknown');
    assert.equal(assessment.reason, why);
    assert.ok(describeGpuContention(assessment).includes(`graphics card. ${why} If something heavy is open`), 'the reason sits between the two sentences');
    assert.match(describeGpuContention(assessment), /If something heavy is open, close it for the most accurate scores\.$/);
  }
  // Without a reason the sentence is the one it always was.
  assert.equal(describeGpuContention({ level: 'unknown' }), 'RigMatch could not check whether other programs are using your graphics card. If something heavy is open, close it for the most accurate scores.');
  assert.deepEqual(Object.keys(assessGpuContention(null)), ['level', 'reasons', 'apps', 'utilizationPercent', 'vramUsedPercent'], 'no reason key unless there is one');
});

test('a shared pool with nothing but memory in the reading is not checked, rather than clear', () => {
  assert.equal(assessGpuContention({ vramUsedMb: 90000, vramTotalMb: 131072 }, [], { unifiedMemory: true }).level, 'unknown');
  assert.equal(assessGpuContention({ vramUsedMb: 400, vramTotalMb: 2048, memoryShared: true }).level, 'unknown');
  assert.equal(assessGpuContention({ vramUsedMb: 400, vramTotalMb: 2048, memoryShared: true, utilizationPercent: 3 }).level, 'clear');
});

test('the median keeps a reading marked as a shared pool', () => {
  const shared = { vramUsedMb: 40, vramTotalMb: 2022, utilizationPercent: 4, memoryShared: true, source: 'windows-counters' };
  assert.equal(medianReading([shared, { ...shared, utilizationPercent: 6 }]).memoryShared, true);
  assert.equal('memoryShared' in medianReading([rtx(2521, 20)]), false);
});

test('systemd-resolved is not DaVinci Resolve, but Resolve is', () => {
  assert.deepEqual(matchKnownGpuApps(['systemd-resolve', 'systemd-resolved']), []);
  assert.deepEqual(matchKnownGpuApps(['resolve']), ['DaVinci Resolve']);
  assert.deepEqual(matchKnownGpuApps(['C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe']), ['DaVinci Resolve']);
});
