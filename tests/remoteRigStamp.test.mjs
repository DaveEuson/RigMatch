// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreDrift, scoreDriftLabel } from '../src/lib/scoring.ts';
import { matchCardLines } from '../src/lib/matchCard.ts';

// A benchmark can run on an Ollama on another computer, and the score used to
// come back stamped with *this* machine's card, VRAM and driver. That is a
// false statement produced by the mechanism built to stop scores being
// attributed to hardware that did not earn them — worse than an ordinary wrong
// number, because the whole point of the stamp is that a score is only ever
// true of a rig.

const localScore = (rig) => ({
  model: 'llama3.2:3b',
  total: 88,
  grade: 'B+',
  completedAt: '2026-08-21T12:00:00.000Z',
  rig,
});

const HERE = { gpuModel: 'NVIDIA GeForce RTX 4070', vramGb: 12, modelDigest: 'abc123' };

test('a score measured elsewhere is flagged, not silently accepted', () => {
  const score = localScore({ host: 'studio-box', appVersion: '0.7.0', modelDigest: 'abc123' });
  assert.equal(scoreDrift(score, HERE), 'measured-elsewhere');
  assert.match(scoreDriftLabel('measured-elsewhere'), /another computer/i);
});

test('a remote score is flagged even when the model is identical', () => {
  // Same weights, same everything the stamp can see — and still not this rig.
  const score = localScore({ host: 'studio-box', appVersion: '0.7.0', modelDigest: HERE.modelDigest });
  assert.equal(scoreDrift(score, HERE), 'measured-elsewhere');
});

test('a local score on the same rig still drifts not at all', () => {
  const score = localScore({
    gpu: HERE.gpuModel, vramGb: 12, appVersion: '0.7.0', modelDigest: 'abc123',
  });
  assert.equal(scoreDrift(score, HERE), null);
});

test('local hardware and model changes are still caught', () => {
  const movedCard = localScore({ gpu: 'NVIDIA GeForce RTX 3060', vramGb: 12, appVersion: '0.7.0' });
  assert.equal(scoreDrift(movedCard, HERE), 'hardware-changed');

  const newWeights = localScore({
    gpu: HERE.gpuModel, vramGb: 12, appVersion: '0.7.0', modelDigest: 'different',
  });
  assert.equal(scoreDrift(newWeights, HERE), 'model-changed');
});

test('a stamp with no hardware does not compare equal to this machine', () => {
  // The bug in miniature: absent VRAM must not read as "same VRAM".
  const score = localScore({ appVersion: '0.7.0', host: 'studio-box' });
  assert.notEqual(scoreDrift(score, HERE), null);
});

test('an unstamped score still predates stamping and claims nothing', () => {
  assert.equal(scoreDrift(localScore(undefined), HERE), null);
});

test('the shared card names the host, never a card it did not run on', () => {
  const card = matchCardLines({
    score: localScore({ host: 'studio-box', appVersion: '0.7.0' }),
    appVersion: '0.7.0',
  });
  assert.match(card.rigLine, /studio-box/);
  assert.match(card.rigLine, /hardware unknown/i);
  assert.doesNotMatch(card.rigLine, /RTX/);
});

test('a local card still names the card that earned the score', () => {
  const card = matchCardLines({
    score: localScore({ gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, appVersion: '0.7.0' }),
    appVersion: '0.7.0',
  });
  assert.match(card.rigLine, /RTX 4070/);
  assert.match(card.rigLine, /12 GB/);
});

test('a score from another computer does not crown a winner here', () => {
  // The guarantee the whole change exists for. Crowning already excludes any
  // drifted score, so this asserts the wiring rather than re-testing drift:
  // a remote score must reach that exclusion, not slip past it.
  const remote = localScore({ host: 'studio-box', appVersion: '0.7.0' });
  const isDrifted = (score) => scoreDrift(score, HERE) !== null;
  assert.equal(isDrifted(remote), true, 'a remote score must count as drifted');

  const local = localScore({ gpu: HERE.gpuModel, vramGb: 12, appVersion: '0.7.0', modelDigest: 'abc123' });
  assert.equal(isDrifted(local), false, 'a score earned on this rig must still crown');
});
