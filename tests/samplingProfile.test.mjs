// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STANDARD_PROFILE,
  isDistilledCheckpoint,
  samplingProfileFor,
} from '../src/lib/samplingProfile.ts';

// RigMatch asked every checkpoint for 20 steps at CFG 7. On sdxl-turbo — which
// is distilled to finish in one to four steps with guidance off — that returns
// a posterised, oversaturated picture, and the app was then scoring that
// picture for how well it matched the prompt. The model was fine; the request
// was not.

test('a turbo checkpoint is run the way it was distilled to be run', () => {
  const profile = samplingProfileFor('sdxl-turbo.safetensors');
  assert.equal(profile.steps, 4);
  assert.equal(profile.cfg, 1);
  assert.match(profile.reason, /distilled/i);
});

test('the other distilled families are recognised too', () => {
  for (const name of ['sdxl_lightning_4step.safetensors', 'Hyper-SDXL-1step.safetensors', 'dreamshaper-lcm.ckpt']) {
    assert.equal(isDistilledCheckpoint(name), true, name);
    const profile = samplingProfileFor(name);
    assert.ok(profile.steps <= 6, `${name} should want few steps, got ${profile.steps}`);
    assert.ok(profile.cfg <= 2, `${name} should want low guidance, got ${profile.cfg}`);
  }
});

test('an ordinary checkpoint keeps the settings it always had', () => {
  // The fallback must not change behaviour for models that were never broken.
  for (const name of ['v1-5-pruned-emaonly.safetensors', 'sd_xl_base_1.0.safetensors', 'realisticVision.ckpt']) {
    assert.deepEqual(samplingProfileFor(name), STANDARD_PROFILE, name);
    assert.equal(isDistilledCheckpoint(name), false, name);
  }
});

test('an unknown checkpoint falls back rather than guessing', () => {
  // Failing safe matters more than cleverness: a new distilled model rendered
  // at 20 steps looks poor, but a standard model forced to 1 step looks broken.
  for (const name of ['', 'something-nobody-has-heard-of.safetensors', 'model.bin']) {
    assert.deepEqual(samplingProfileFor(name), STANDARD_PROFILE, JSON.stringify(name));
  }
});

test('the family is read from the filename, not the path around it', () => {
  // A folder called turbo-models must not decide this for everything inside it.
  assert.deepEqual(
    samplingProfileFor('C:/AI/turbo-models/v1-5-pruned-emaonly.safetensors'),
    STANDARD_PROFILE,
  );
  // And a real turbo checkpoint is still caught when it arrives with a path.
  assert.equal(samplingProfileFor('C:/AI/checkpoints/sdxl-turbo.safetensors').steps, 4);
});

test('a name carrying two family words picks the more specific one', () => {
  // "lightning" is longer than "turbo", so a hybrid name resolves to it rather
  // than to whichever happened to be listed first.
  const profile = samplingProfileFor('sdxl-turbo-lightning-merge.safetensors');
  assert.match(profile.reason, /Lightning/);
});

test('every extension a checkpoint arrives with is stripped', () => {
  for (const ext of ['safetensors', 'ckpt', 'sft', 'pt', 'bin']) {
    assert.equal(samplingProfileFor(`sdxl-turbo.${ext}`).steps, 4, ext);
  }
});
