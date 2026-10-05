// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PULL_ENDED_LINGER_MS, isDockWorthyPullProgress, nextDockExpiry } from '../src/lib/modelCatalog.ts';

/**
 * Advanced Mode's floating download box kept "Download complete, 100%" on
 * screen until the app restarted: it showed whenever any download had a
 * status other than queued, and a finished one keeps its status so the Models
 * rows can say "Downloaded". It now shows an ended download for a few seconds.
 */

const T = Date.parse('2026-10-05T12:00:00Z');
const at = (phase, msAgo = 0) => ({ id: 'x', model: 'yi:9b', phase, status: '', updatedAt: new Date(T - msAgo).toISOString() });

test('a running or paused download keeps the box up', () => {
  for (const phase of ['started', 'pulling', 'paused']) assert.equal(isDockWorthyPullProgress(at(phase, 60_000), T), true, phase);
  assert.equal(isDockWorthyPullProgress(at('queued'), T), false);
});

test('a finished download shows for a few seconds, then the box goes', () => {
  assert.equal(isDockWorthyPullProgress(at('complete', 1_000), T), true);
  assert.equal(isDockWorthyPullProgress(at('complete', PULL_ENDED_LINGER_MS.complete + 1), T), false);
});

test('a failure stays longer than a success, and then goes too', () => {
  assert.ok(PULL_ENDED_LINGER_MS.failed > PULL_ENDED_LINGER_MS.complete);
  assert.equal(isDockWorthyPullProgress(at('failed', PULL_ENDED_LINGER_MS.complete + 1), T), true);
  assert.equal(isDockWorthyPullProgress(at('failed', PULL_ENDED_LINGER_MS.failed + 1), T), false);
});

test('the box is told when to look again, and not at all once nothing lingers', () => {
  assert.equal(nextDockExpiry([at('complete', 1_000), at('pulling')], T), T - 1_000 + PULL_ENDED_LINGER_MS.complete);
  assert.equal(nextDockExpiry([at('complete', 60_000), at('pulling')], T), null);
});

test('the app shows the box by the new rule', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  assert.match(app, /some\(\(progress\) => isDockWorthyPullProgress\(progress, dockClock\)\)\) && \(\s*<div className="download-dock-float">/);
});
