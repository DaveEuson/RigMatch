// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { deletableRows, rowsExceptTopPick, topPickToKeep } from '../src/lib/modelCleanup.ts';
import { CURRENT_SCORE_SCHEMA_VERSION } from '../src/lib/scoring.ts';
import { getRigPick } from '../src/lib/modelCatalog.ts';
import { readFileSync } from 'node:fs';

/**
 * This decides what is erased from someone's disk, from a dialog that only
 * appears while the app is closing. Every case here is one where getting it
 * wrong deletes something the user meant to keep.
 */

const row = (displayName, extra = {}) => ({
  id: displayName, name: displayName, displayName, tag: 'latest', params: '7B',
  sizeGb: 4, pack: 'x', source: 'ollama', live: true,
  installed: true, ready: true, installLabel: 'Installed', ...extra,
});

const score = (model, total) => ({
  model, total, grade: 'A', speed: total, sobriety: total, stability: total, fit: total,
  preciseTotal: total, completedAt: '2026-08-15T00:00:00Z',
  scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
});

test('only Ollama models are ever swept', () => {
  const rows = [
    row('llama3.2:3b'),
    row('lmstudio/qwen', { localProvider: 'lm-studio' }),
    row('sd15.safetensors', { runtime: 'comfyui', generationKind: 'image' }),
    row('ltxv.safetensors', { runtime: 'comfyui', generationKind: 'video' }),
    row('not-installed:7b', { installed: false }),
  ];
  assert.deepEqual(deletableRows(rows).map((r) => r.displayName), ['llama3.2:3b'],
    'LM Studio owns its own library, and Ollama cannot delete a ComfyUI checkpoint');
});

test('a ComfyUI checkpoint is never swept as "not scored"', () => {
  // The sharpest version of the bug: a checkpoint can never be scored by the
  // question suite, so it always landed in the unscored set and every sweep
  // tried — and failed — to delete multi-gigabyte files through Ollama.
  const rows = [row('sd15.safetensors', { runtime: 'comfyui', generationKind: 'image' })];
  assert.deepEqual(deletableRows(rows), []);
  assert.deepEqual(rowsExceptTopPick(rows, undefined), []);
});

const VRAM = 8;
const keep = (rows, scores, cleared) => topPickToKeep(rows, scores, VRAM, cleared);

test('the Top Pick is spared', () => {
  const rows = [row('a:7b'), row('b:7b'), row('c:7b')];
  const scores = { 'a:7b': score('a:7b', 70), 'b:7b': score('b:7b', 92) };
  assert.equal(keep(rows, scores), 'b:7b');
  assert.deepEqual(rowsExceptTopPick(rows, keep(rows, scores)).map((r) => r.displayName), ['a:7b', 'c:7b'],
    'the winner must survive the sweep that exists to keep it');
});

test('the Top Pick is matched through its aliases', () => {
  // A score is filed under whichever name the run used; a row answers to
  // several. Missing the match here deletes the model the sweep protects.
  const rows = [row('llama3.2:3b', { id: 'llama3.2', name: 'llama3.2' }), row('other:7b')];
  const scores = { 'llama3.2': score('llama3.2', 95) };
  assert.equal(keep(rows, scores), 'llama3.2:3b', 'the winner was matched by an alias, not just displayName');
  assert.deepEqual(rowsExceptTopPick(rows, keep(rows, scores)).map((r) => r.displayName), ['other:7b']);
});

test('with nothing scored there is no match to keep', () => {
  const rows = [row('a:7b'), row('b:7b')];
  assert.equal(keep(rows, {}), undefined);
  assert.deepEqual(rowsExceptTopPick(rows, undefined).map((r) => r.displayName), ['a:7b', 'b:7b'],
    'the caller must label this case as "delete all", not as "keep my match"');
});

test('a legacy-schema score cannot crown the model that gets spared', () => {
  const rows = [row('old:7b'), row('new:7b')];
  const scores = {
    'old:7b': { ...score('old:7b', 99), scoreSchemaVersion: 4 },
    'new:7b': score('new:7b', 60),
  };
  assert.equal(keep(rows, scores), 'new:7b');
  assert.deepEqual(rowsExceptTopPick(rows, keep(rows, scores)).map((r) => r.displayName), ['old:7b']);
});

test('the sweep keeps the Top Match on screen, not the top raw score', () => {
  // A model too big for this PC can hold the best score without being the
  // Top Match, and a match the person cleared is not theirs any more.
  const rows = [row('huge:70b', { params: '70B', sizeGb: 40 }), row('fits:7b'), row('next:7b')];
  const scores = { 'huge:70b': score('huge:70b', 99), 'fits:7b': score('fits:7b', 80), 'next:7b': score('next:7b', 70) };
  const shown = getRigPick(rows, scores, VRAM)?.row.displayName;
  assert.equal(shown, 'fits:7b');
  assert.equal(keep(rows, scores), shown);
  assert.equal(keep(rows, scores, new Set(['fits:7b'])), 'next:7b', 'a cleared Top Match is not kept');
});

test('a top scorer that was already deleted does not make the sweep delete everything', () => {
  const rows = [row('gone:7b', { installed: false }), row('a:7b'), row('b:7b')];
  const scores = { 'gone:7b': score('gone:7b', 99), 'a:7b': score('a:7b', 75) };
  assert.equal(keep(rows, scores), 'a:7b');
  assert.deepEqual(rowsExceptTopPick(rows, keep(rows, scores)).map((r) => r.displayName), ['b:7b']);
});

test('sweeping an empty library deletes nothing rather than throwing', () => {
  assert.deepEqual(deletableRows([]), []);
  assert.equal(keep([], { 'ghost:7b': score('ghost:7b', 90) }), undefined);
  assert.deepEqual(rowsExceptTopPick([], undefined), []);
});

test('"Everything, including X" is offered only when X is one of the models deleted', () => {
  const dialogs = readFileSync(new URL('../src/components/dialogs.tsx', import.meta.url), 'utf-8');
  assert.ok(dialogs.includes('const topPickDeletable = Boolean(topPickName && installedRows.some((row) => row.displayName === topPickName));'));
  assert.ok(dialogs.includes('{topPickDeletable && topPickName && ('));
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  assert.ok(app.includes('topPickToKeep(modelRows, modelScores, system.gpu.vramGb, clearedTopMatches)'));
});
