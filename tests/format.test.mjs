// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeRunError, getErrorMessage } from '../src/lib/format.ts';

/**
 * Every rule here exists because a user saw the raw version: a disk-full pull
 * showed Ollama's own "no space left on device" with a blob path attached, and
 * a ComfyUI that died between the status probe and the run put the Electron IPC
 * wrapper in the failure card's headline.
 */

test('a full disk says so, and says where to look', () => {
  const raw = 'write /home/u/.ollama/models/blobs/sha256-abc: no space left on device';
  const out = describeRunError(raw);
  assert.match(out, /ran out of space/i);
  assert.match(out, /closet/i, 'point at the screen that frees space');
  assert.doesNotMatch(out, /sha256/, 'the blob path helps nobody');
});

test('a dead provider is explained as a dead provider', () => {
  for (const raw of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1:8188', 'socket hang up']) {
    assert.match(describeRunError(raw), /not running/i, raw);
  }
});

test('a bad model tag is not reported as a mystery 404', () => {
  assert.match(describeRunError('pull model manifest: file does not exist'), /not found in the library/i);
});

test('a permission error names the likely cause', () => {
  assert.match(describeRunError('EPERM: operation not permitted, open C:\\Temp\\x'), /permission/i);
});

test('the IPC wrapper never reaches the user', () => {
  const wrapped = new Error("Error invoking remote method 'comfy:submit': TypeError: fetch failed");
  const out = getErrorMessage(wrapped);
  assert.doesNotMatch(out, /invoking remote method/i);
  assert.match(out, /not running/i, 'and it is humanized on the way out');
});

test('the macOS/MLX rule still fires', () => {
  assert.match(describeRunError('llama runner failed: mlx not supported'), /Apple Silicon/i);
});

test('an unrecognised error is passed through rather than mangled', () => {
  assert.equal(describeRunError('Something specific and unusual happened'), 'Something specific and unusual happened');
});
