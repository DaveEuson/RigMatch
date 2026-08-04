#!/usr/bin/env node

/**
 * Capture everything RigMatch needs to know about an unfamiliar GPU host, and
 * check its own detection against it — without installing or launching the app.
 *
 *   node scripts/probe-gpu-host.mjs            # human-readable report
 *   node scripts/probe-gpu-host.mjs --json     # machine-readable, for pasting
 *
 * Written for hardware we cannot test locally: NVIDIA Grace parts (GB10 in the
 * DGX Spark, GH200), Jetson, AMD via rocm-smi, Apple Silicon. It needs only
 * Node and a shell, so it runs on a headless rented box in about ten seconds —
 * no display, no Electron, no build.
 *
 * The point is to answer three questions:
 *   1. Does nvidia-smi/rocm-smi output on this machine parse at all?
 *   2. Is the memory pool detected as unified, and is that correct?
 *   3. Would the contention thresholds behave sensibly here, or fire constantly?
 *
 * Paste the --json output into an issue and the answers are all in it.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const gpu = require(path.join(process.cwd(), 'electron', 'gpuContention.cjs'));

const json = process.argv.includes('--json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryRun(cmd, args, timeout = 6000) {
  try {
    const { stdout } = await run(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, output: String(stdout || '').trim() };
  } catch (error) {
    return { ok: false, output: '', error: String(error?.message || error).slice(0, 160) };
  }
}

const report = {
  host: {
    platform: process.platform,
    arch: os.arch(),
    cpus: os.cpus()?.length ?? null,
    cpuModel: os.cpus()?.[0]?.model ?? null,
    totalMemGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    release: os.release(),
  },
  tools: {},
  parsed: {},
  detection: {},
  samples: [],
  assessment: {},
  verdict: [],
};

// ── what tooling exists ──────────────────────────────────────────────────────
const nvidiaName = await tryRun('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
const nvidiaQuery = await tryRun('nvidia-smi',
  ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits']);
const rocm = await tryRun('rocm-smi', ['--showmemuse', '--showuse', '--csv']);
// Apple Silicon: IOKit is the only sudo-free source of GPU load, and the only
// one that works at all — systeminformation returns null utilization there.
const ioreg = process.platform === 'darwin'
  ? await tryRun('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'AGXAccelerator'])
  : { ok: false, output: '' };

report.tools['nvidia-smi'] = nvidiaName.ok;
report.tools['rocm-smi'] = rocm.ok;
report.tools.ioreg = ioreg.ok;
report.tools.gpuName = nvidiaName.ok ? nvidiaName.output.split('\n')[0] : null;

// Raw output is kept verbatim: if a parser fails, this is what is needed to fix it.
report.tools.rawNvidiaQuery = nvidiaQuery.output || null;
report.tools.rawRocm = rocm.ok ? rocm.output.slice(0, 400) : null;

// ── do our parsers handle it ─────────────────────────────────────────────────
const nvidiaReading = gpu.parseNvidiaGpuQuery(nvidiaQuery.output);
report.parsed.nvidia = nvidiaReading;
report.parsed.rocm = rocm.ok ? gpu.parseRocmSmiQuery(rocm.output) : null;
report.parsed.ioreg = ioreg.ok ? gpu.parseIoregGpuStats(ioreg.output) : null;
if (ioreg.ok && !report.parsed.ioreg) {
  report.verdict.push('FAIL: ioreg answered but RigMatch could not parse it. Capture the PerformanceStatistics line.');
}

// systeminformation is the app's only source on macOS, where neither vendor CLI
// exists. If it reports no GPU utilization there, RigMatch can never assess
// contention on a Mac and will say "could not check" on every run — worth
// knowing explicitly rather than discovering from a user.
try {
  const si = require('systeminformation');
  const graphics = await si.graphics();
  const controller = graphics?.controllers?.[0] ?? null;
  report.parsed.systeminformation = controller
    ? {
      model: controller.model ?? null,
      vendor: controller.vendor ?? null,
      vramMb: controller.vram ?? null,
      vramUsedMb: controller.memoryUsed ?? null,
      utilizationPercent: controller.utilizationGpu ?? null,
      usableForContention: Number.isFinite(controller.utilizationGpu),
    }
    : null;

  if (!report.tools['nvidia-smi'] && !report.tools['rocm-smi'] && !report.parsed.ioreg) {
    if (report.parsed.systeminformation?.usableForContention) {
      report.verdict.push('OK: no vendor CLI here, but systeminformation reports GPU utilization, so contention can still be assessed.');
    } else {
      report.verdict.push(
        'LIMITATION: no vendor CLI and systeminformation reports no GPU utilization on this host, so ' +
        'RigMatch will report "could not check" for every run. That is the honest answer, but it means ' +
        'the contention warning never fires here.',
      );
    }
  }
} catch (error) {
  // Almost always "not installed" — the probe is designed to run before or
  // without `npm install`. Say that, rather than letting an absent dependency
  // masquerade as a finding about the hardware.
  report.parsed.systeminformation = { error: String(error?.message || error).slice(0, 120), notInstalled: true };
  report.verdict.push(
    'INCOMPLETE: systeminformation is not installed, so the macOS/fallback reading path was not tested. ' +
    'Everything else below is still valid. Run `npm install` and re-run to check that path.',
  );
}

if (nvidiaQuery.ok && !nvidiaReading) {
  report.verdict.push('FAIL: nvidia-smi answered but RigMatch could not parse it. Raw output is in tools.rawNvidiaQuery.');
}
if (rocm.ok && !report.parsed.rocm) {
  report.verdict.push('FAIL: rocm-smi answered but RigMatch could not parse it. Raw output is in tools.rawRocm.');
}

// ── unified memory ───────────────────────────────────────────────────────────
const gpuModel = report.tools.gpuName ?? '';
const unified = gpu.isUnifiedMemoryGpu({ model: gpuModel, platform: process.platform, arch: os.arch() });
report.detection.gpuModel = gpuModel;
report.detection.isUnifiedMemory = unified;

// A shared pool usually shows GPU "total memory" close to system RAM.
if (nvidiaReading) {
  const poolGb = nvidiaReading.vramTotalMb / 1024;
  const ratio = poolGb / report.host.totalMemGb;
  report.detection.gpuPoolGb = Math.round(poolGb * 10) / 10;
  report.detection.poolVsSystemRamRatio = Math.round(ratio * 100) / 100;
  if (ratio > 0.8 && !unified) {
    report.verdict.push(
      `SUSPECT: GPU pool (${report.detection.gpuPoolGb}GB) is ${Math.round(ratio * 100)}% of system RAM ` +
      `(${report.host.totalMemGb}GB), which looks unified — but "${gpuModel}" is not recognised as ` +
      'unified hardware. Add a pattern to UNIFIED_MEMORY_GPU_PATTERNS.',
    );
  }
}

// ── how would the thresholds behave here ─────────────────────────────────────
if (nvidiaReading || report.parsed.rocm || report.parsed.ioreg) {
  const readings = [];
  for (let i = 0; i < 5; i += 1) {
    const q = await tryRun('nvidia-smi',
      ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits']);
    const r = gpu.parseNvidiaGpuQuery(q.output)
      ?? (rocm.ok ? gpu.parseRocmSmiQuery((await tryRun('rocm-smi', ['--showmemuse', '--showuse', '--csv'])).output) : null)
      ?? (ioreg.ok ? gpu.parseIoregGpuStats((await tryRun('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'AGXAccelerator'])).output) : null);
    if (r) { readings.push(r); report.samples.push({ util: r.utilizationPercent, usedMb: r.vramUsedMb }); }
    if (i < 4) await sleep(250);
  }

  const median = gpu.medianReading(readings);
  const assessment = gpu.assessGpuContention(median, [], { unifiedMemory: unified });
  report.assessment = {
    median: median ? { util: median.utilizationPercent, usedMb: median.vramUsedMb, samples: median.samples } : null,
    level: assessment.level,
    message: gpu.describeGpuContention(assessment) || '(clear — no warning shown)',
  };

  // An idle rented box should read clear. If it does not, the thresholds are
  // wrong for this hardware and would warn on every run.
  if (assessment.level !== 'clear' && assessment.level !== 'unknown') {
    report.verdict.push(
      `SUSPECT: an otherwise idle machine assessed as "${assessment.level}". If nothing else is ` +
      'running, the thresholds are mistuned for this hardware and the warning would fire constantly.',
    );
  }
} else {
  report.assessment = { level: 'unknown', message: 'No GPU tool answered; RigMatch would report "could not check".' };
}

if (!report.verdict.length) report.verdict.push('OK: parsing, unified-memory detection, and thresholds all look correct on this host.');

// ── output ───────────────────────────────────────────────────────────────────
if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (k, v) => console.log(`  ${String(k).padEnd(26)} ${v}`);
  console.log('\nRigMatch GPU host probe\n');
  console.log('Host');
  line('platform / arch', `${report.host.platform} / ${report.host.arch}`);
  line('cpu', `${report.host.cpuModel} (${report.host.cpus} cores)`);
  line('system memory', `${report.host.totalMemGb} GB`);
  console.log('\nGPU tooling');
  line('nvidia-smi', report.tools['nvidia-smi'] ? 'present' : 'absent');
  line('rocm-smi', report.tools['rocm-smi'] ? 'present' : 'absent');
  if (process.platform === 'darwin') line('ioreg (Apple GPU)', report.tools.ioreg ? (report.parsed.ioreg ? 'present, parsed' : 'present, PARSE FAILED') : 'absent');
  line('gpu name', report.tools.gpuName ?? '(none reported)');
  console.log('\nRigMatch detection');
  line('parsed a reading', report.parsed.nvidia || report.parsed.rocm ? 'yes' : 'no vendor CLI');
  if (report.parsed.systeminformation) {
    const si = report.parsed.systeminformation;
    if (si.notInstalled) {
      line('systeminformation', 'not installed — run npm install to test this path');
    } else {
      line('systeminformation gpu', si.model ?? si.error ?? '(none)');
      line('  reports utilization', si.usableForContention ? `yes (${si.utilizationPercent}%)` : 'NO — contention cannot be assessed');
      line('  reports vram', si.vramMb ? `${si.vramMb} MB` : 'no (expected on unified memory)');
    }
  }
  line('unified memory', report.detection.isUnifiedMemory);
  if (report.detection.gpuPoolGb) line('gpu pool', `${report.detection.gpuPoolGb} GB (${Math.round((report.detection.poolVsSystemRamRatio ?? 0) * 100)}% of system RAM)`);
  console.log('\nContention assessment (machine should be idle for this to mean anything)');
  line('samples', report.samples.map((s) => `${s.util}%`).join(' ') || '(none)');
  line('level', report.assessment.level);
  line('message', report.assessment.message);
  console.log('\nVerdict');
  for (const v of report.verdict) console.log(`  ${v}`);
  console.log('\nRe-run with --json to capture the full report for an issue.\n');
}
