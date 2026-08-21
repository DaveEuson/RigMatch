// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findComfyLaunchers, launcherDirsFrom } = require('../electron/comfyLaunch.cjs');

// ComfyUI is a separate program the user starts themselves, which until now
// meant leaving RigMatch to go and find a .bat file — even though RigMatch
// already knew where the install was. The rule that matters: only offer to
// start something that genuinely exists, because a Start button that cannot
// start anything is the same empty promise as an image offer with no
// checkpoint behind it.

function portableInstall(files) {
  const root = mkdtempSync(join(tmpdir(), 'comfy-launch-'));
  const models = join(root, 'ComfyUI');
  mkdirSync(join(models, 'models', 'checkpoints'), { recursive: true });
  for (const file of files) writeFileSync(join(root, file), '@echo off\n');
  return { root, models };
}

test('the launchers beside a portable install are found, GPU first', () => {
  const { root, models } = portableInstall(['run_cpu.bat', 'run_nvidia_gpu.bat']);
  try {
    const found = findComfyLaunchers(models, 'win32');
    assert.equal(found.length, 2);
    // Anyone benchmarking with RigMatch has a graphics card they care about.
    assert.equal(found[0].file, 'run_nvidia_gpu.bat');
    assert.equal(found[0].path, join(root, 'run_nvidia_gpu.bat'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the fp16 variant ranks below the plain one but is still offered', () => {
  const { root, models } = portableInstall([
    'run_nvidia_gpu_fast_fp16_accumulation.bat',
    'run_nvidia_gpu.bat',
  ]);
  try {
    const found = findComfyLaunchers(models, 'win32');
    assert.equal(found[0].file, 'run_nvidia_gpu.bat');
    assert.equal(found[1].file, 'run_nvidia_gpu_fast_fp16_accumulation.bat');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a folder pointed at the portable root still finds them', () => {
  // Someone who picked the outer directory rather than the inner ComfyUI one
  // should not be told we cannot start an install we can plainly see.
  const { root } = portableInstall(['run_nvidia_gpu.bat']);
  try {
    assert.equal(findComfyLaunchers(root, 'win32').length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an install with no launcher offers nothing rather than guessing', () => {
  // A source checkout run through a virtualenv. Picking an interpreter would
  // produce a process that dies with an import error the user never sees.
  const { root, models } = portableInstall([]);
  try {
    assert.deepEqual(findComfyLaunchers(models, 'win32'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('no folder means no offer, not a crash', () => {
  for (const value of ['', null, undefined]) {
    assert.deepEqual(findComfyLaunchers(value, 'win32'), []);
    assert.deepEqual(launcherDirsFrom(value), []);
  }
});

test('the search looks beside the folder and in it, and nowhere else', () => {
  const { root, models } = portableInstall([]);
  try {
    assert.deepEqual(launcherDirsFrom(models), [root, models]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
