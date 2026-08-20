// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { gpuBusyNote } from '../src/lib/gpuBusyNote.ts';

const at = (level) => ({
  level,
  reasons: [],
  apps: [],
  utilizationPercent: null,
  vramUsedPercent: null,
  message: '',
});

test('a busy card is said out loud during the run', () => {
  // The panel note arrives three to five seconds after the lab opens, so a run
  // started inside that window had nothing to explain a four-minute wait.
  assert.match(gpuBusyNote(at('heavy')), /busy/i);
  assert.match(gpuBusyNote(at('heavy')), /much longer/i);
  assert.match(gpuBusyNote(at('busy')), /slower/i);
});

test('a clear card adds nothing', () => {
  assert.equal(gpuBusyNote(at('clear')), '');
});

test('an unreadable card adds nothing either', () => {
  // "We could not read your graphics card" mid-run is noise nobody can act on.
  assert.equal(gpuBusyNote(at('unknown')), '');
  assert.equal(gpuBusyNote(null), '');
});

test('the note is a suffix, ready to append to a status line', () => {
  // It follows "Playing the audio to X..." rather than standing alone.
  const note = gpuBusyNote(at('heavy'));
  assert.ok(note.startsWith(' '), 'needs its own leading space');
  assert.ok(!note.endsWith(' '), 'and no trailing one');
});
