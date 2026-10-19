// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summarizeMemory, cleanDeviceTreeModel, nvidiaDriverProblem, parseNvidiaSmiHeader, pickPrimaryGpu } = require('../electron/systemProfile.cjs');

const GB = 1024 * 1024 * 1024;

test('summarizeMemory derives "used" from available memory, not raw used', () => {
  // Reproduces the macOS false-alarm: si.mem().used counts reclaimable disk
  // cache, so a 16 GB machine with plenty of headroom still reports ~15.8 GB
  // "used". mem.available (5.3 GB free/reclaimable) reflects real pressure.
  const macMem = { total: 16 * GB, used: 15.8 * GB, available: 5.3 * GB };
  const summary = summarizeMemory(macMem);

  assert.equal(summary.totalGb, 16);
  assert.equal(summary.availableGb, 5.3);
  assert.equal(summary.usedGb, 10.7, 'used should be total - available, not the raw used field');
});

test('summarizeMemory falls back to the raw used field when available is missing', () => {
  const mem = { total: 8 * GB, used: 4 * GB, available: 0 };
  const summary = summarizeMemory(mem);

  assert.equal(summary.usedGb, 4);
});

test('summarizeMemory never returns a negative used value', () => {
  // available slightly exceeding total shouldn't happen, but guard anyway.
  const mem = { total: 8 * GB, used: 4 * GB, available: 8.5 * GB };
  const summary = summarizeMemory(mem);

  assert.equal(summary.usedGb, 0);
});

test('summarizeMemory handles missing/malformed input without throwing', () => {
  assert.deepEqual(summarizeMemory({}), { totalGb: 0, availableGb: 0, usedGb: 0 });
  assert.deepEqual(summarizeMemory(undefined), { totalGb: 0, availableGb: 0, usedGb: 0 });
});

// ── the board's own name for itself ─────────────────────────────────────────
// Captured from a Jetson Orin Nano running JetPack R39, where lspci lists no
// graphics device at all and si.graphics() returned zero controllers.

const JETSON = 'NVIDIA Jetson Orin Nano Engineering Reference Developer Kit Super';

test('the device-tree model loses its NUL terminator', () => {
  // The value is copied straight out of the device tree blob, terminator and
  // all. Left in, it travels into the UI and into every comparison made against
  // the string — including the one that decides whether this is unified memory.
  assert.equal(cleanDeviceTreeModel(`${JETSON}\u0000`), JETSON);
  assert.equal(cleanDeviceTreeModel(`${JETSON}\u0000\u0000`), JETSON);
  assert.equal(cleanDeviceTreeModel(`  ${JETSON}\u0000  `), JETSON);
});

test('a missing or unreadable device tree yields nothing, not "undefined"', () => {
  // An ordinary x86 desktop has no /proc/device-tree. The caller treats an empty
  // string as "no answer" and falls through; a literal "undefined" would be
  // reported to the user as the name of their graphics card.
  for (const empty of [undefined, null, '', '   ', '\u0000']) {
    assert.equal(cleanDeviceTreeModel(empty), '');
  }
});

test('the cleaned Jetson name is one the unified-memory check recognizes', () => {
  // The two halves of this fix are in different files and only matter together:
  // reading the name is pointless if the name does not then match, and the
  // shipped 0.7.0 matched /orin/ perfectly while never being handed a string.
  const { isUnifiedMemoryGpu } = require('../electron/gpuContention.cjs');
  assert.equal(isUnifiedMemoryGpu({ model: cleanDeviceTreeModel(`${JETSON}\u0000`) }), true);

  // And the vendor is readable from the same string, which is what stops the
  // CUDA check reporting "No NVIDIA GPU detected." on an NVIDIA board.
  assert.match(cleanDeviceTreeModel(`${JETSON}\u0000`), /nvidia/i);
});

test('an NVIDIA card is the one sized for, even when its driver reports nothing', () => {
  // Pop!_OS 24.04, RTX 4070 beside a Ryzen's integrated graphics, as
  // systeminformation reports them (2026-10-07). With the driver broken the
  // NVIDIA card reads 0 and the integrated chip's 512 MB won: "VRAM 0.5 GB".
  const nvidia = { vendor: 'NVIDIA Corporation', model: 'AD104 [GeForce RTX 4070]', vram: 12282, bus: 'Onboard' };
  const amd = { vendor: 'Advanced Micro Devices, Inc. [AMD/ATI]', model: 'Device 13c0', vram: 512, bus: 'Onboard' };
  assert.equal(pickPrimaryGpu([amd, nvidia]), nvidia);
  const broken = { ...nvidia, vram: 0 };
  assert.equal(pickPrimaryGpu([amd, broken]), broken);
  // Without an NVIDIA card, the largest still wins.
  assert.equal(pickPrimaryGpu([amd, { vendor: 'Intel', model: 'UHD 770', vram: 128 }]), amd);
  assert.equal(pickPrimaryGpu([]), undefined);
});

test('nvidia-smi failures say whether to restart or to fix the driver', () => {
  assert.equal(nvidiaDriverProblem({ output: '12282', error: null }), null);
  // A driver updated under a running kernel module.
  assert.equal(nvidiaDriverProblem({
    output: 'Failed to initialize NVML: Driver/library version mismatch\nNVML library version: 595.104',
    error: 'Command failed: nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits',
  }), 'reboot-required');
  assert.equal(nvidiaDriverProblem({
    output: "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver. Make sure that the latest NVIDIA driver is installed and running.",
    error: 'Command failed: nvidia-smi',
  }), 'driver-missing');
  assert.equal(nvidiaDriverProblem({ output: '', error: 'spawn nvidia-smi ENOENT' }), 'driver-missing');
});

test('nvidia-smi headers before and after driver 610 both give the driver and CUDA versions', () => {
  // Driver 610 renamed the fields; My PC showed CUDA "Unknown" on 610.88.
  assert.deepEqual(
    parseNvidiaSmiHeader('| NVIDIA-SMI 610.88                 KMD Version: 610.88        CUDA UMD Version: 13.3     |'),
    { driverVersion: '610.88', driverCudaVersion: '13.3' },
  );
  assert.deepEqual(
    parseNvidiaSmiHeader('| NVIDIA-SMI 581.57                 Driver Version: 581.57         CUDA Version: 13.0     |'),
    { driverVersion: '581.57', driverCudaVersion: '13.0' },
  );
  assert.deepEqual(parseNvidiaSmiHeader(''), { driverVersion: null, driverCudaVersion: null });
});

test('a driver problem shows in the strip and is explained once', async () => {
  const { gpuDriverMessage, gpuDriverReading } = await import('../src/lib/gpuDriver.ts');
  assert.match(gpuDriverMessage('reboot-required'), /^Your NVIDIA driver was updated, but the old one is still running\. Restart your computer/);
  assert.match(gpuDriverMessage('driver-missing'), /Install or repair the NVIDIA driver, then restart your computer\.$/);
  assert.equal(gpuDriverReading('reboot-required'), 'Restart to use it');
  assert.equal(gpuDriverReading('driver-missing'), 'Driver not working');
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  assert.match(main, /const primaryGpu = pickPrimaryGpu\(graphics\.controllers\) \|\| await getBoardGpu\(\);/);
  assert.match(main, /\.\.\.\(driverProblem \? \{ driverProblem \} : \{\}\),/);
  const strip = readFileSync(new URL('../src/components/LoadStrip.tsx', import.meta.url), 'utf-8');
  assert.match(strip, /if \(system\.gpu\.driverProblem\) \{/);
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  assert.match(app, /if \(gpuDriverProblem\) tellUser\(gpuDriverMessage\(gpuDriverProblem\)\);/);
});

test('free space is read from the drive the models are on', async () => {
  const { createRequire } = await import('node:module');
  const { pickModelsFilesystem, ollamaModelsDir } = createRequire(import.meta.url)('../electron/systemProfile.cjs');
  const linux = [
    { mount: '/', size: 100, available: 5 },
    { mount: '/mnt/data', size: 900, available: 800 },
    { mount: '/mnt', size: 10, available: 1 },
  ];
  assert.equal(pickModelsFilesystem(linux, '/usr/share/ollama/.ollama/models').mount, '/');
  assert.equal(pickModelsFilesystem(linux, '/mnt/data/models').mount, '/mnt/data');
  assert.equal(pickModelsFilesystem(linux, '/mnt/database/models').mount, '/mnt', 'a longer name is not inside the shorter mount');
  assert.equal(pickModelsFilesystem(linux, '').mount, '/mnt/data', 'unknown folder falls back to the largest');
  const windows = [{ mount: 'C:', size: 500, available: 10 }, { mount: 'H:', size: 2000, available: 900 }];
  assert.equal(pickModelsFilesystem(windows, 'h:\\ollama-models').mount, 'H:');
  assert.equal(pickModelsFilesystem(windows, 'C:\\Users\\Dave\\.ollama\\models').mount, 'C:');
  assert.equal(pickModelsFilesystem([], '/x'), undefined);

  assert.equal(ollamaModelsDir({ env: { OLLAMA_MODELS: '/data/m' }, platform: 'linux', home: '/home/d' }), '/data/m');
  assert.equal(ollamaModelsDir({ env: {}, platform: 'linux', home: '/home/d', exists: () => true }), '/usr/share/ollama/.ollama/models');
  assert.equal(ollamaModelsDir({ env: {}, platform: 'linux', home: '/home/d' }), '/home/d/.ollama/models');
  assert.equal(ollamaModelsDir({ env: {}, platform: 'win32', home: 'C:\\Users\\d' }), 'C:\\Users\\d\\.ollama\\models');
});

test('AMD cards on Linux take their VRAM from sysfs, matched by PCI address', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { readSysfsVram, withSysfsVram, mbToGb } = require('../electron/systemProfile.cjs');
  const root = mkdtempSync(join(tmpdir(), 'rigmatch-sysfs-'));
  const device = (name, files) => {
    const dir = join(root, 'sys', 'class', 'drm', name, 'device');
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  };
  try {
    // The machine from issue #145: RX 7900 XTX at 03:00.0, Radeon 610M at 12:00.0.
    device('card0', { mem_info_vram_total: '25753026560\n', uevent: 'DRIVER=amdgpu\nPCI_ID=1002:744C\nPCI_SLOT_NAME=0000:03:00.0\n' });
    device('card1', { mem_info_vram_total: '536870912\n', uevent: 'DRIVER=amdgpu\nPCI_ID=1002:164E\nPCI_SLOT_NAME=0000:12:00.0\n' });
    device('card2', { uevent: 'DRIVER=nvidia\nPCI_SLOT_NAME=0000:01:00.0\n' });
    device('card0-DP-1', { mem_info_vram_total: '1\n', uevent: 'PCI_SLOT_NAME=0000:99:00.0\n' });
    assert.deepEqual(readSysfsVram(root), { '0000:03:00.0': 25753026560, '0000:12:00.0': 536870912 },
      'only amdgpu cards, and connector folders are not cards');
    assert.deepEqual(readSysfsVram(join(root, 'nowhere')), {}, 'no /sys/class/drm, nothing found');

    const issue = [
      { vendor: 'Advanced Micro Devices, Inc. [AMD/ATI]', model: 'Navi 31 [Radeon RX 7900 XT/7900 XTX/7900 GRE/7900M]', busAddress: '03:00.0', vram: 1 },
      { vendor: 'Advanced Micro Devices, Inc. [AMD/ATI]', model: 'Raphael [Radeon 610M]', busAddress: '12:00.0', vram: 512 },
    ];
    assert.match(pickPrimaryGpu(issue).model, /610M/, 'the bug as reported');
    const fixed = withSysfsVram(issue, readSysfsVram(root));
    assert.match(pickPrimaryGpu(fixed).model, /7900 XTX/);
    assert.equal(pickPrimaryGpu(fixed).vram, 24560);
    assert.equal(mbToGb(pickPrimaryGpu(fixed).vram), 24);
    assert.equal(fixed[1].vram, 512, "the APU's carve-out is what sysfs reports for it too");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sysfs VRAM only ever raises a figure, and only on Linux', async () => {
  const { readFileSync } = await import('node:fs');
  const { withSysfsVram } = require('../electron/systemProfile.cjs');
  const rtx = { vendor: 'NVIDIA', model: 'GeForce RTX 4070', busAddress: '01:00.0', vram: 12282 };
  assert.deepEqual(withSysfsVram([rtx], {}), [rtx]);
  assert.equal(withSysfsVram([{ model: 'x', busAddress: '03:00.0', vram: 16384 }], { '0000:03:00.0': 8 * GB })[0].vram, 16384,
    "a larger systeminformation figure stands");
  assert.equal(withSysfsVram([{ model: 'x', vram: 0 }], { '0000:03:00.0': 8 * GB })[0].vram, 0, 'no address, no match');
  assert.equal(withSysfsVram([{ model: 'x', busAddress: '0001:0A:00.0' }], { '0001:0a:00.0': 8 * GB })[0].vram, 8192,
    'an address that carries its own PCI domain');
  assert.deepEqual(withSysfsVram(undefined, {}), []);

  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const wiring = main.indexOf("if (process.platform === 'linux') graphics.controllers = withSysfsVram(graphics.controllers, readSysfsVram());");
  assert.ok(wiring > 0, 'getSystemProfile reads sysfs on Linux only');
  assert.ok(wiring < main.indexOf('const primaryGpu = pickPrimaryGpu(graphics.controllers)'), 'before the card is picked');
});

test('the models folder is resolved through symlinks before its drive is picked', () => {
  const { pickModelsFilesystem, resolveModelsDir } = require('../electron/systemProfile.cjs');
  // fsSize on the Bazzite machine from issue #146.
  const bazzite = [
    { fs: 'composefs', type: 'overlay', mount: '/', size: 0, available: 0 },
    { fs: '/dev/nvme0n1p3', type: 'btrfs', mount: '/var/home', size: 2500000000000, available: 2302227152896 },
  ];
  assert.equal(pickModelsFilesystem(bazzite, '/var/home/u/.ollama/models').mount, '/var/home', 'a specific mount beats root');
  assert.equal(pickModelsFilesystem(bazzite, '/usr/share/ollama/.ollama/models').mount, '/', 'root is still a mount');
  assert.equal(pickModelsFilesystem(bazzite, '/home/u/.ollama/models').mount, '/', 'the bug as reported');

  // /home is a symlink to /var/home; anything not in `real` does not exist.
  const fakeRealpath = (real) => (target) => {
    const resolved = target.replace(/^\/home(?=\/|$)/, '/var/home');
    if (!real.includes(resolved)) throw Object.assign(new Error(`ENOENT: ${target}`), { code: 'ENOENT' });
    return resolved;
  };
  const existing = fakeRealpath(['/', '/var', '/var/home', '/var/home/u', '/var/home/u/.ollama', '/var/home/u/.ollama/models']);
  const dir = resolveModelsDir('/home/u/.ollama/models', existing);
  assert.equal(dir, '/var/home/u/.ollama/models');
  assert.equal(pickModelsFilesystem(bazzite, dir).available, 2302227152896);

  const notPulledYet = fakeRealpath(['/', '/var', '/var/home', '/var/home/u']);
  assert.equal(resolveModelsDir('/home/u/.ollama/models', notPulledYet), '/var/home/u/.ollama/models',
    'a folder Ollama has not made yet resolves through its nearest parent');
  assert.equal(resolveModelsDir('/home/u/.ollama/models', fakeRealpath([])), '/home/u/.ollama/models', 'nothing resolves, nothing changes');
  assert.equal(resolveModelsDir(''), '');
});

test('the models folder resolves through a real link on this machine', async () => {
  const { mkdtempSync, mkdirSync, symlinkSync, realpathSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { resolveModelsDir } = require('../electron/systemProfile.cjs');
  const base = mkdtempSync(join(tmpdir(), 'rigmatch-home-'));
  try {
    mkdirSync(join(base, 'var', 'home', 'u', '.ollama'), { recursive: true });
    // A junction on Windows (no admin needed), a directory symlink elsewhere.
    symlinkSync(join(base, 'var', 'home'), join(base, 'home'), 'junction');
    assert.equal(resolveModelsDir(join(base, 'home', 'u', '.ollama', 'models')),
      join(realpathSync(join(base, 'var', 'home')), 'u', '.ollama', 'models'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
