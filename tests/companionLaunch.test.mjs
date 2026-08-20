// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { companionLaunchMessage } from '../src/lib/companionLaunch.ts';

// Two RigMatch windows race for the loopback bridge on 11435. The loser binds
// nothing, so RigMatch Chat keeps talking to the winner — listing its models and
// saving its pictures. This cost real debugging time: a probe read capabilities
// from one process and stdout from another, and the readings disagreed while
// both were correct.

test('a successful launch says nothing', () => {
  assert.equal(companionLaunchMessage({ ok: true }), null);
});

test('a missing companion tells you how to get one', () => {
  const message = companionLaunchMessage({ ok: false, reason: 'not-found' });
  assert.match(message, /not found/i);
  assert.match(message, /tauri build/);
});

test('a taken bridge does not send you looking for a missing file', () => {
  const message = companionLaunchMessage({ ok: false, reason: 'bridge-taken' });
  assert.match(message, /already running/i);
  assert.match(message, /close the other/i);
  // The old copy-pasted string was the failure this reason exists to escape.
  assert.doesNotMatch(message, /not found/i);
  assert.doesNotMatch(message, /tauri build/);
});

test('an unrecognised failure falls back to the install advice', () => {
  // Better to point at the common cause than to say nothing at all.
  for (const result of [{ ok: false }, { ok: false, reason: 'weird' }, null, undefined]) {
    assert.match(companionLaunchMessage(result), /not found/i);
  }
});
