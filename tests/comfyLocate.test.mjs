// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { candidatesFrom, looksLikeComfyRoot } = require('../electron/comfyLocate.cjs');

/**
 * Finding ComfyUI from the running process turns "go and find a folder"
 * into one button. What must not happen is a confident wrong answer: the
 * guess is always handed to verifyComfyFolder afterwards, and a directory
 * that is not a ComfyUI root must never be offered in the first place.
 */

/** Compare paths without arguing about separators. */
const slash = (p) => p.split('\\').join('/');

test('a directory without models/checkpoints is never a candidate', () => {
  // The guess is the input to verification, never a substitute for it.
  assert.equal(looksLikeComfyRoot('C:/definitely/not/comfy'), false);
  assert.equal(looksLikeComfyRoot(''), false);
  assert.deepEqual(candidatesFrom('C:/definitely/not/comfy', ''), []);
});

test('walking up stops rather than running away to the drive root', () => {
  // Five levels covers any real layout; unbounded, this would stat its way
  // to C:\ on every call and offer whatever it stumbled into.
  assert.deepEqual(candidatesFrom('C:/a/b/c/d/e/f/g/h', 'python main.py'), []);
});

test('the real portable layout resolves, when one is installed', (t) => {
  // Asserts against the disk, so it skips rather than fails on a machine
  // that has no ComfyUI.
  const portable = 'C:/AI/ComfyUI/ComfyUI_windows_portable';
  if (!looksLikeComfyRoot(`${portable}/ComfyUI`)) {
    t.skip('no ComfyUI portable install on this machine');
    return;
  }
  const commandLine = '.\\python_embeded\\python.exe -s ComfyUI\\main.py --windows-standalone-build';
  const roots = candidatesFrom(`${portable}/python_embeded`, commandLine);
  assert.ok(roots.map(slash).includes(`${portable}/ComfyUI`),
    `expected the ComfyUI root among ${JSON.stringify(roots)}`);
  assert.equal(roots.length, 1, 'one confident candidate beats a list of maybes');
});

test('ComfyUI Desktop is found from --base-directory, wherever its python runs', async () => {
  // Desktop runs main.py from inside its own app folder and keeps models in
  // the folder chosen at install. Walking up from python never reaches it.
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const base = mkdtempSync(join(tmpdir(), 'Comfy Desktop '));
  try {
    mkdirSync(join(base, 'models', 'checkpoints'), { recursive: true });
    const appDir = join(tmpdir(), 'not-comfy-app', 'resources', 'ComfyUI');
    const quoted = `"${join(appDir, 'main.py')}" --user-directory "${join(base, 'user')}" --base-directory "${base}" --port 8000`;
    assert.deepEqual(candidatesFrom(join(base, 'missing-venv', 'Scripts'), quoted).map(slash).slice(0, 1), [slash(base)]);
    // The = form, unquoted, from a launcher that writes it that way.
    const bare = `main.py --base-directory=${base.replace(/ /g, '_')}`;
    mkdirSync(join(base.replace(/ /g, '_'), 'models', 'checkpoints'), { recursive: true });
    assert.ok(candidatesFrom(appDir, bare).map(slash).includes(slash(base.replace(/ /g, '_'))));
    rmSync(base.replace(/ /g, '_'), { recursive: true, force: true });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a Linux venv install is found from the folder it was started in', async () => {
  // python in a venv resolves to /usr/bin/python3 and "python main.py" names
  // no folder, so the working directory is all that points at ComfyUI.
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(`${tmpdir()}/comfy-venv-`);
  try {
    mkdirSync(`${root}/ComfyUI/models/checkpoints`, { recursive: true });
    assert.deepEqual(candidatesFrom('/usr/bin', 'python main.py'), []);
    const roots = candidatesFrom('/usr/bin', 'python main.py', [`${root}/ComfyUI`]);
    // A Set: Windows spells the same folder with forward and back slashes, once per way it was reached.
    assert.deepEqual([...new Set(roots.map(slash))], [slash(`${root}/ComfyUI`)]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
