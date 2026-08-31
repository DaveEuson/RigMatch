// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { getPlatformFit } = await import('../src/lib/modelCatalog.ts');

/**
 * A model that cannot run here is not a choice, it is noise.
 *
 * The -mlx builds need macOS on Apple Silicon. They used to be listed anyway,
 * badged "MACOS ONLY" — which did not help: the row still took its place, still
 * counted toward every facet, and still had to be read and dismissed. A 4070
 * reporting "147 models that fit 12 GB VRAM" was counting builds it can never
 * load, two of them in every Gemma 4 family.
 *
 * This is now what decides whether a row exists at all rather than what badge
 * it wears, so it is worth locking.
 */

test('an mlx build is filtered off Windows', () => {
  assert.equal(getPlatformFit('gemma4:e2b-mlx', 'win32').compatible, false);
});

test('and off Linux, which is not Apple Silicon either', () => {
  assert.equal(getPlatformFit('gemma4:e2b-mlx', 'linux').compatible, false);
});

test('but stays on macOS, where it is the point', () => {
  assert.equal(getPlatformFit('gemma4:e2b-mlx', 'darwin').compatible, true);
});

test('the ordinary build is untouched everywhere', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    assert.equal(getPlatformFit('gemma4:e2b', platform).compatible, true, platform);
  }
});

test('both spellings of the tag are caught', () => {
  // Ollama ships some as a suffix and some as the whole tag.
  assert.equal(getPlatformFit('gemma4:12b-mlx', 'win32').compatible, false);
  assert.equal(getPlatformFit('gemma4:mlx', 'win32').compatible, false);
});

test('a filtered model says why, so the reason survives the row', () => {
  const fit = getPlatformFit('gemma4:e2b-mlx', 'win32');
  assert.match(fit.reason, /macOS/);
  assert.ok(fit.reason.length > 0);
});

test('a compatible model claims no reason it does not have', () => {
  assert.equal(getPlatformFit('gemma4:e2b', 'win32').reason, '');
});
