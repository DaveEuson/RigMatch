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
