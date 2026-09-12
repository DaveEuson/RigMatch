// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { createComfyStarter } = await import('../src/lib/comfyAutoStart.ts');

/**
 * ComfyUI used to be started by hand, outside RigMatch, before every image or
 * video session. These lock the rules that make starting it on someone's
 * behalf safe: one copy at a time, ready only once it answers, never started
 * again on its own after the person closed it, and never retried unasked after
 * a start that failed.
 */

const LAUNCHER = {
  path: 'C:\\AI\\ComfyUI_windows_portable\\run_nvidia_gpu.bat',
  label: 'NVIDIA GPU',
  file: 'run_nvidia_gpu.bat',
};

/** A fake ComfyUI that answers a few looks after it is launched, on a fake clock. */
function rig({
  running = false,
  answersAfter = 3,
  folder = 'C:\\AI\\ComfyUI_windows_portable\\ComfyUI',
  allowed = true,
  launchers = [LAUNCHER],
  launchError = null,
  bridge = true,
} = {}) {
  let clock = 0;
  let up = running;
  // Looks left before a launched ComfyUI answers; null until something launches.
  let pending = null;
  const launches = [];
  const starter = createComfyStarter({
    isRunning: async () => {
      if (!up && pending !== null) {
        pending -= 1;
        if (pending <= 0) {
          up = true;
          pending = null;
        }
      }
      return up;
    },
    address: () => 'http://127.0.0.1:8188',
    folder: () => folder,
    allowed: () => allowed,
    findLaunchers: bridge ? async () => launchers : null,
    launch: bridge
      ? async (dir, path) => {
        if (launchError) throw new Error(launchError);
        launches.push({ dir, path });
        pending = answersAfter ?? Infinity;
      }
      : null,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  }, { timeoutMs: 60_000, pollMs: 2_000 });
  return {
    starter,
    launches,
    clock: () => clock,
    closeComfy: () => { up = false; },
    startByHand: () => { up = true; },
  };
}

test('a ComfyUI that already answers is left alone', async () => {
  const { starter, launches } = rig({ running: true });
  assert.deepEqual(await starter.ensure('auto'), { outcome: 'running' });
  assert.equal(launches.length, 0);
});

test('a start runs the preferred launcher, then waits for ComfyUI to answer', async () => {
  const r = rig({ answersAfter: 3 });
  const phases = [];
  r.starter.subscribe(() => phases.push(r.starter.snapshot().phase));
  let heard = 0;
  r.starter.onStarted(() => { heard += 1; });

  assert.deepEqual(await r.starter.ensure('auto'), { outcome: 'running' });
  assert.deepEqual(r.launches, [{ dir: 'C:\\AI\\ComfyUI_windows_portable\\ComfyUI', path: LAUNCHER.path }]);
  // Launched is not ready: it said "starting" through three looks, then stopped.
  assert.deepEqual(phases, ['starting', 'idle']);
  assert.equal(r.clock(), 6_000);
  assert.equal(heard, 1);
});

test('screens asking at the same time share one start', async () => {
  const r = rig();
  const [first, second] = await Promise.all([r.starter.ensure('auto'), r.starter.ensure('test')]);
  assert.equal(r.launches.length, 1);
  assert.equal(first, second);
});

test('on its own it starts ComfyUI once a session; a Test or Start click can again', async () => {
  const r = rig();
  await r.starter.ensure('auto');
  // The person closes it. Switching channels again must not fight them.
  r.closeComfy();
  assert.deepEqual(await r.starter.ensure('auto'), { outcome: 'skipped', reason: 'already-started' });
  assert.equal(r.launches.length, 1);
  assert.deepEqual(await r.starter.ensure('test'), { outcome: 'running' });
  assert.equal(r.launches.length, 2);
});

test('with the setting off only the Start button starts it', async () => {
  const r = rig({ allowed: false });
  assert.deepEqual(await r.starter.ensure('auto'), { outcome: 'skipped', reason: 'setting-off' });
  assert.deepEqual(await r.starter.ensure('test'), { outcome: 'skipped', reason: 'setting-off' });
  assert.equal(r.launches.length, 0);
  assert.deepEqual(await r.starter.ensure('button'), { outcome: 'running' });
  assert.equal(r.launches.length, 1);
});

test('nothing is guessed without a folder, a launcher or the bridge', async () => {
  assert.deepEqual(await rig({ folder: '' }).starter.ensure('button'), { outcome: 'skipped', reason: 'no-folder' });
  assert.deepEqual(await rig({ launchers: [] }).starter.ensure('button'), { outcome: 'skipped', reason: 'no-launcher' });
  assert.deepEqual(await rig({ bridge: false }).starter.ensure('button'), { outcome: 'skipped', reason: 'no-bridge' });
  // Finding nothing to run is not a start, so it does not use up the automatic one.
  const r = rig({ launchers: [] });
  await r.starter.ensure('auto');
  assert.equal(r.starter.snapshot().phase, 'idle');
});

test('a start that never answers says where, and is not retried unasked', async () => {
  const r = rig({ answersAfter: null });
  const result = await r.starter.ensure('auto');
  assert.equal(result.outcome, 'failed');
  assert.match(result.message, /run_nvidia_gpu\.bat/);
  assert.match(result.message, /127\.0\.0\.1:8188/);
  assert.equal(r.starter.snapshot().phase, 'failed');
  assert.equal(r.clock(), 60_000);
  // A broken install relaunched on every Test click is a window that keeps flashing up.
  assert.deepEqual(await r.starter.ensure('test'), { outcome: 'skipped', reason: 'failed-before' });
  assert.equal(r.launches.length, 1);
  // Start is someone asking, so it tries again.
  await r.starter.ensure('button');
  assert.equal(r.launches.length, 2);
});

test('a launcher that cannot run is reported, not thrown', async () => {
  const r = rig({ launchError: 'No ComfyUI launcher was found next to that folder.' });
  assert.deepEqual(await r.starter.ensure('button'), {
    outcome: 'failed',
    message: 'No ComfyUI launcher was found next to that folder.',
  });
  assert.equal(r.starter.snapshot().phase, 'failed');
});

test('a failure is forgotten once ComfyUI is found answering', async () => {
  const r = rig({ answersAfter: null });
  await r.starter.ensure('auto');
  r.startByHand();
  assert.deepEqual(await r.starter.ensure('test'), { outcome: 'running' });
  assert.equal(r.starter.snapshot().phase, 'idle');
  r.closeComfy();
  // Not blocked by the failure any more: a Test click may start it again.
  assert.notDeepEqual(await r.starter.ensure('test'), { outcome: 'skipped', reason: 'failed-before' });
});
