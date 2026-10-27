// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sampleGpuLoad, listProcessNames, readAmdSysfs, windowsPowerShell, windowsProbeScript, WINDOWS_PROBE_BODY } = require('../electron/gpuProbe.cjs');
const { assessGpuContention, describeGpuContention } = require('../electron/gpuContention.cjs');

/**
 * electron/gpuProbe.cjs: which tool reads the card on each platform, in what
 * order, and that a card nothing can read is "not checked" with a reason, never
 * idle. The commands are a stand-in (the app's and the command line's `run` take
 * the same shape), the Windows output is a real capture and the Linux files are
 * a fixture tree.
 */

const WINDOWS_IDLE = readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'gpu-windows-probe-idle.json'), 'utf8');
// Verbatim from `ioreg -r -d 1 -w 0 -c AGXAccelerator` on an idle Apple M4.
const M4_IDLE = '      "PerformanceStatistics" = {"In use system memory (driver)"=0,"Alloc system memory"=2629632000,"Tiler Utilization %"=0,"recoveryCount"=0,"lastRecoveryTime"=0,"Renderer Utilization %"=0,"TiledSceneBytes"=0,"Device Utilization %"=0,"SplitSceneCount"=0,"Allocated PB Size"=75628544,"In use system memory"=763723776}';
const NOT_FOUND = { output: '', error: 'spawn ENOENT' };

/** A `run` that answers by command name and writes down what it was asked. */
function fakeRun(answers) {
  const calls = [];
  const run = async (command, args, timeoutMs) => {
    calls.push({ command, args, timeoutMs });
    const answer = answers[path.basename(command).replace(/\.exe$/i, '')] ?? NOT_FOUND;
    if (typeof answer === 'function') return answer(args);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { run, calls };
}

const quick = { samples: 3, gapMs: 0 };

test('NVIDIA is read first, once per sample, and nothing else is run', async () => {
  const { run, calls } = fakeRun({ 'nvidia-smi': { output: '2300, 12282, 30', error: null } });
  const load = await sampleGpuLoad({ run, platform: 'win32', arch: 'x64', gpuName: 'NVIDIA GeForce RTX 4070' }, { samples: 5, gapMs: 0 });
  assert.deepEqual(calls.map((call) => call.command), Array(5).fill('nvidia-smi'));
  assert.deepEqual([load.source, load.unreadable, load.reading.samples], ['nvidia-smi', null, 5]);
  assert.deepEqual(calls[0].args, ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits']);
});

test('on Windows without nvidia-smi, one PowerShell run reads every sample, by its full path and with no shell', async () => {
  const { run, calls } = fakeRun({ powershell: { output: WINDOWS_IDLE, error: null } });
  const env = { SystemRoot: 'C:\\Windows' };
  const load = await sampleGpuLoad({ run, platform: 'win32', arch: 'x64', gpuName: 'NVIDIA GeForce RTX 4070', env }, { samples: 5, gapMs: 220 });
  const shell = calls.filter((call) => call.command !== 'nvidia-smi');
  assert.equal(shell.length, 1, 'all samples in one process: starting PowerShell is the slow part');
  assert.equal(shell[0].command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(shell[0].args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.equal(shell[0].args.length, 4, 'a command and no more');
  assert.ok(shell[0].timeoutMs >= 10000 && shell[0].timeoutMs <= 30000, 'guarded by a timeout');
  assert.match(shell[0].args[3], /^\$count = 5; \$gap = 220\n/);
  assert.deepEqual([load.source, load.unreadable], ['windows-counters', null]);
  assert.equal(load.reading.samples, 3, 'the capture holds three samples');
  assert.equal(load.reading.vramTotalMb, 12010);
  assert.equal(load.reading.utilizationPercent, 17);
});

test('the PowerShell script reads two WMI classes and a registry key, takes no input, and has nothing a command line could mangle', () => {
  assert.match(WINDOWS_PROBE_BODY, /Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory/);
  assert.match(WINDOWS_PROBE_BODY, /Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine/);
  assert.match(WINDOWS_PROBE_BODY, /HKLM:\\SOFTWARE\\Microsoft\\DirectX\\\*/);
  assert.match(WINDOWS_PROBE_BODY, /\$ErrorActionPreference = 'Stop'/, 'a missing class is an error, so the run reads as not checked');
  const script = windowsProbeScript(5, 220);
  assert.ok(!/["`]/.test(script), 'no double quote or backtick to be re-escaped on the way to powershell.exe');
  assert.ok(!/Invoke-Expression|iex |Start-Process|Set-|Remove-|New-|Add-Type|\bdownload|Invoke-WebRequest/i.test(script), 'reads only');
  assert.match(windowsProbeScript(1000, -5), /^\$count = 30; \$gap = 0\n/, 'the numbers are clamped');
  assert.match(windowsProbeScript(Number.NaN, 'x'), /^\$count = 1; \$gap = 0\n/);
});

test('PowerShell by its system path when Windows says where it is, else by name', () => {
  assert.equal(windowsPowerShell({ SystemRoot: 'D:\\Win' }), 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(windowsPowerShell({ windir: 'C:\\Windows' }), 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(windowsPowerShell({}), 'powershell.exe');
});

test('a PowerShell that is missing, fails, hangs, throws or prints nonsense is "not checked", with the reason', async () => {
  const cases = {
    missing: NOT_FOUND,
    'timed out': { output: '', error: 'Command failed: powershell.exe ETIMEDOUT' },
    'class missing': { output: 'Get-CimInstance : Invalid class', error: 'Command failed' },
    'throws': new Error('spawn blocked by policy'),
    'not json': { output: 'Windows PowerShell\nCopyright (C) Microsoft Corporation', error: null },
    'no counters answered': { output: '{"adapters":[],"samples":[]}', error: null },
  };
  for (const [label, answer] of Object.entries(cases)) {
    const { run } = fakeRun({ powershell: answer });
    const load = await sampleGpuLoad({ run, platform: 'win32', arch: 'x64', gpuName: 'AMD Radeon RX 7800 XT', env: {} }, quick);
    assert.equal(load.reading, null, label);
    assert.match(load.unreadable, /Windows did not report the graphics card's load/, label);
    const assessment = assessGpuContention(load.reading, [], { reason: load.unreadable });
    assert.equal(assessment.level, 'unknown', `${label}: never clear`);
    assert.match(describeGpuContention(assessment), /could not check/);
  }
});

test('with another card named, the AMD adapter is the one read on a PC that also has an NVIDIA card', async () => {
  const { run } = fakeRun({ powershell: { output: WINDOWS_IDLE, error: null } });
  const load = await sampleGpuLoad({ run, platform: 'win32', arch: 'x64', gpuName: 'AMD Radeon(TM) Graphics', env: {} }, quick);
  assert.equal(load.reading.memoryShared, true);
  assert.equal(Math.round(load.reading.vramTotalMb), 2022);
  assert.equal(assessGpuContention(load.reading).level, 'clear', 'checked, and quiet');
});

// ---- Linux: the amdgpu driver's files ---------------------------------------

function sysfsTree(cards) {
  const root = mkdtempSync(path.join(tmpdir(), 'rigmatch-probe-'));
  for (const [name, files] of Object.entries(cards)) {
    const dir = path.join(root, 'sys', 'class', 'drm', name, 'device');
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text);
  }
  return root;
}

test('on Linux an AMD card is read from sysfs, the discrete one beating the integrated one', async () => {
  // The machine from issue #145: an RX 7900 XTX (24560 MiB) and a Radeon 610M (512 MiB), plus a card with no amdgpu files and a connector folder.
  const root = sysfsTree({
    card0: { mem_info_vram_total: '25753026560\n', mem_info_vram_used: '3221225472\n', gpu_busy_percent: '17\n' },
    card1: { mem_info_vram_total: '536870912\n', mem_info_vram_used: '100663296\n', gpu_busy_percent: '2\n' },
    card2: { uevent: 'DRIVER=nvidia\n' },
    'card0-DP-1': { mem_info_vram_total: '1\n', mem_info_vram_used: '0\n', gpu_busy_percent: '99\n' },
  });
  try {
    const { run, calls } = fakeRun({});
    const load = await sampleGpuLoad({ run, platform: 'linux', arch: 'x64', gpuName: 'AMD Radeon RX 7900 XTX', sysfsRoot: root }, quick);
    assert.deepEqual([load.source, load.unreadable], ['amdgpu-sysfs', null]);
    assert.deepEqual([load.reading.vramUsedMb, load.reading.vramTotalMb, load.reading.utilizationPercent, load.reading.samples], [3072, 24560, 17, 3]);
    assert.equal(calls.length, 1, 'only nvidia-smi was asked, and it is not there');
    assert.equal(calls[0].command, 'nvidia-smi');
    assert.equal(readAmdSysfs(root).vramTotalMb, 24560);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('on Linux a half-readable AMD card, an NVIDIA card with no nvidia-smi and an Intel card are not checked, never idle', async () => {
  const half = sysfsTree({ card0: { mem_info_vram_total: '8589934592\n', mem_info_vram_used: '0\n' } });
  const none = sysfsTree({ card0: { uevent: 'DRIVER=i915\n' } });
  try {
    for (const [root, gpuName, reason] of [
      [half, 'AMD Radeon RX 7600', /AMD driver did not report/],
      [none, 'Intel(R) Arc(TM) A750 Graphics', /no way to read an Intel graphics card's load on Linux/],
      [none, 'NVIDIA GeForce RTX 3060', /nvidia-smi did not report/],
      [path.join(tmpdir(), 'rigmatch-no-sys-here'), '', /cannot read this graphics card's load on Linux/],
    ]) {
      const load = await sampleGpuLoad({ run: fakeRun({}).run, platform: 'linux', arch: 'x64', gpuName, sysfsRoot: root }, quick);
      assert.equal(load.reading, null);
      assert.match(load.unreadable, reason);
      assert.equal(assessGpuContention(load.reading, [], { reason: load.unreadable }).level, 'unknown');
    }
    assert.equal(readAmdSysfs(half), null, 'a card missing gpu_busy_percent is skipped as a whole');
  } finally {
    rmSync(half, { recursive: true, force: true });
    rmSync(none, { recursive: true, force: true });
  }
});

// ---- macOS ----------------------------------------------------------------------

test('on Apple Silicon the card is read with ioreg; on an Intel Mac, which has no such counters, it is not checked', async () => {
  const { run, calls } = fakeRun({ ioreg: { output: M4_IDLE, error: null } });
  const load = await sampleGpuLoad({ run, platform: 'darwin', arch: 'arm64', gpuName: 'Apple M4' }, quick);
  assert.deepEqual([load.source, load.reading.utilizationPercent, load.reading.samples], ['ioreg', 0, 3]);
  assert.deepEqual(calls.find((call) => call.command === 'ioreg').args, ['-r', '-d', '1', '-w', '0', '-c', 'AGXAccelerator']);
  // Memory is the Mac's whole pool, so only utilization is judged there (the caller says unifiedMemory).
  assert.equal(assessGpuContention(load.reading, [], { unifiedMemory: true }).level, 'clear');

  const intelMac = await sampleGpuLoad({ run: fakeRun({}).run, platform: 'darwin', arch: 'x64', gpuName: 'AMD Radeon Pro 5500M' }, quick);
  assert.equal(intelMac.reading, null);
  assert.match(intelMac.unreadable, /unless it is Apple Silicon/);
});

// ---- The rest -------------------------------------------------------------------

test('a reading the caller already has is used last, and only when nothing else read the card', async () => {
  const fallback = { vramUsedMb: 900, vramTotalMb: 8192, utilizationPercent: 12, source: 'systeminformation' };
  const none = await sampleGpuLoad({ run: fakeRun({}).run, platform: 'linux', arch: 'x64', sysfsRoot: path.join(tmpdir(), 'rigmatch-no-sys-here'), fallback }, quick);
  assert.deepEqual([none.source, none.reading.utilizationPercent], ['systeminformation', 12]);
  const smi = await sampleGpuLoad({ run: fakeRun({ 'nvidia-smi': { output: '2300, 12282, 30', error: null } }).run, platform: 'linux', fallback }, quick);
  assert.equal(smi.source, 'nvidia-smi', 'a tool beats the caller\'s reading');
});

test('a command that throws instead of answering is an unreadable card, not a crash', async () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const { run } = fakeRun({ 'nvidia-smi': new Error('boom'), powershell: new Error('boom'), ioreg: new Error('boom') });
    const load = await sampleGpuLoad({ run, platform, arch: 'arm64', sysfsRoot: path.join(tmpdir(), 'rigmatch-no-sys-here'), env: {} }, quick);
    assert.equal(load.reading, null, platform);
    assert.equal(typeof load.unreadable, 'string');
  }
});

test('process names come from tasklist on Windows and ps elsewhere, and none from a failing command', async () => {
  const csv = '"System Idle Process","0","Services","0","8 K"\r\n"obs64.exe","4242","Console","1","90,000 K"\r\n';
  assert.deepEqual(await listProcessNames(fakeRun({ tasklist: { output: csv, error: null } }).run, 'win32'), ['System Idle Process', 'obs64.exe']);
  assert.deepEqual(await listProcessNames(fakeRun({ ps: { output: 'bash\nblender\n', error: null } }).run, 'linux'), ['bash', 'blender']);
  assert.deepEqual(await listProcessNames(fakeRun({ ps: new Error('no ps') }).run, 'linux'), []);
});

// The one test that runs the real script. It needs Windows, and passes on a PC
// with no graphics counters too (a CI runner): what it pins is that the script
// parses, runs and prints something the parser accepts, or that the run is
// "not checked" with a reason. It hides nvidia-smi so the Windows path is the one run.
test('the real PowerShell script runs on Windows and is read, or reported as not checked', { skip: process.platform !== 'win32' }, async () => {
  const run = (command, args, timeoutMs) => (command === 'nvidia-smi'
    ? Promise.resolve(NOT_FOUND)
    : new Promise((resolve) => {
      execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({ output: `${stdout || ''}\n${stderr || ''}`.trim(), error: error ? error.message : null });
      });
    }));
  const load = await sampleGpuLoad({ run, platform: 'win32', arch: process.arch, gpuName: '' }, { samples: 2, gapMs: 100 });
  if (load.reading) {
    assert.equal(load.source, 'windows-counters');
    assert.ok(load.reading.utilizationPercent >= 0 && load.reading.utilizationPercent <= 100);
    assert.ok(load.reading.vramUsedMb >= 0);
  } else {
    assert.match(load.unreadable, /Windows did not report/);
  }
});
