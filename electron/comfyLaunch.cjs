// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Start ComfyUI, when we can honestly say we know how.
 *
 * The existing locator traces a *running* ComfyUI back to its folder, which is
 * exactly no help here: the whole point is that it is not running. What we have
 * instead is the models root the user already verified — the folder RigMatch
 * needed anyway to put downloads in the right place — and on a portable install
 * the launcher sits one directory above it:
 *
 *   C:\AI\ComfyUI\ComfyUI_windows_portable\run_nvidia_gpu.bat   <- launcher
 *   C:\AI\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\...   <- verified root
 *
 * Only real files are ever offered. A "Start ComfyUI" button that cannot start
 * ComfyUI is the same empty promise as an image offer with no checkpoint behind
 * it, so when nothing here matches, the answer is that we do not know how to
 * start this install — not a button that fails when pressed.
 *
 * A source checkout launched through a virtualenv is deliberately not guessed
 * at. Picking the wrong interpreter is worse than saying nothing: it produces a
 * process that dies with an import error the user never sees.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

/**
 * Known launchers, most-preferred first.
 *
 * GPU before CPU because anyone benchmarking with RigMatch has a graphics card
 * they care about, and the fp16 variant last because it is a tuning choice the
 * user made for their own reasons — if it is the only one present it is clearly
 * intended, but it should not be picked over the plain one.
 */
const WINDOWS_LAUNCHERS = [
  { file: 'run_nvidia_gpu.bat', label: 'NVIDIA GPU' },
  { file: 'run_nvidia_gpu_fast_fp16_accumulation.bat', label: 'NVIDIA GPU (fast fp16)' },
  { file: 'run_cpu.bat', label: 'CPU only' },
];

const UNIX_LAUNCHERS = [
  { file: 'run_nvidia_gpu.sh', label: 'NVIDIA GPU' },
  { file: 'run_cpu.sh', label: 'CPU only' },
];

/**
 * Where a launcher could be, given the verified models root.
 *
 * The parent first: that is where the portable build puts them. The root
 * itself is checked too, because a user who pointed RigMatch at the portable
 * directory rather than the inner ComfyUI one would otherwise be told we
 * cannot start an install we can plainly see.
 */
function launcherDirsFrom(modelsRoot) {
  if (!modelsRoot) return [];
  const root = path.resolve(modelsRoot);
  const parent = path.dirname(root);
  return parent && parent !== root ? [parent, root] : [root];
}

/**
 * Every launcher that actually exists on disk, in preference order.
 *
 * Pure apart from the stat calls, so the ordering and the shape can be tested
 * against a temporary directory rather than against whatever this machine
 * happens to have installed.
 */
function findComfyLaunchers(modelsRoot, platform = process.platform) {
  const known = platform === 'win32' ? WINDOWS_LAUNCHERS : UNIX_LAUNCHERS;
  const found = [];
  for (const dir of launcherDirsFrom(modelsRoot)) {
    for (const { file, label } of known) {
      const full = path.join(dir, file);
      try {
        if (fs.statSync(full).isFile()) found.push({ path: full, label, file });
      } catch {
        // Absent is the ordinary case, not an error.
      }
    }
  }
  return found;
}

/**
 * Start one of them, and claim nothing about the result.
 *
 * ComfyUI takes tens of seconds to load torch and its models, so "started"
 * here means the process was spawned — never that ComfyUI is ready. The
 * renderer already polls its status every fifteen seconds and will say Ready
 * when it genuinely is; announcing success from this end would put a true
 * sentence and a false one on the same screen.
 *
 * Detached and unref'd on purpose: ComfyUI is the user's program, and closing
 * RigMatch should not take it down with it.
 *
 * `cmd /c <bat>` rather than `cmd /c start "" <bat>`, which is the more obvious
 * spelling and does not work. Routed through `start`, the batch file was
 * reached — a cmd process appeared — and Python never launched; measured
 * against the real install, ComfyUI came up in twelve seconds this way and not
 * at all the other. The cost is that ComfyUI's own console is not shown, so a
 * CUDA error is invisible here; anyone debugging one should run the .bat
 * themselves, which is what they were doing before this button existed.
 */
function launchComfy(launcherPath) {
  const resolved = path.resolve(launcherPath);
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  const cwd = path.dirname(resolved);

  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', resolved], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    : spawn(resolved, [], { cwd, detached: true, stdio: 'ignore' });

  child.unref();
  return { started: true, launcher: resolved };
}

module.exports = { findComfyLaunchers, launchComfy, launcherDirsFrom, WINDOWS_LAUNCHERS, UNIX_LAUNCHERS };
