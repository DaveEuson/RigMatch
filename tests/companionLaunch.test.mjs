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
  // A source checkout builds it.
  const fromSource = companionLaunchMessage({ ok: false, reason: 'not-found' }, true);
  assert.match(fromSource, /not found/i);
  assert.match(fromSource, /tauri build/);
  // An installed RigMatch has no source to build: it reinstalls.
  const installed = companionLaunchMessage({ ok: false, reason: 'not-found' });
  assert.match(installed, /not found/i);
  assert.match(installed, /installing RigMatch again/);
  assert.doesNotMatch(installed, /tauri build/);
});

test('the top bar\'s Chat falls back to the in-app chat when RigMatch Chat does not open', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  assert.match(app, /const problem = companionLaunchMessage\(result, import\.meta\.env\.DEV\);\s*if \(problem\) \{[\s\S]{0,200}?setChatOpen\(true\);/);
});

test('a taken bridge does not send you looking for a missing file', () => {
  const message = companionLaunchMessage({ ok: false, reason: 'bridge-taken' });
  assert.match(message, /already running/i);
  assert.match(message, /close the other/i);
  // The old copy-pasted string was the failure this reason exists to escape.
  assert.doesNotMatch(message, /not found/i);
  assert.doesNotMatch(message, /tauri build/);
});

test('an unrecognized failure falls back to the install advice', () => {
  // Better to point at the common cause than to say nothing at all.
  for (const result of [{ ok: false }, { ok: false, reason: 'weird' }, null, undefined]) {
    assert.match(companionLaunchMessage(result), /not found/i);
  }
});
