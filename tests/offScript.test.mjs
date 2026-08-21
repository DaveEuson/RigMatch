// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { looksOffScript } from '../src/lib/labScoring.ts';

// The listening score compares the transcript against the script, so reading
// something else scores near zero — correctly, and for a reason that looks
// exactly like the model failing. It caught the same person twice: a flawless
// transcript of "My name is Dave and I'm in San Diego" scored 6/100, and every
// visible signal said the model was at fault.

const SCRIPT = 'Bachelor number one, if we went on a date, where would you take me? '
  + 'And be honest, because I have heard every answer twice already. '
  + 'Bachelor number two, same question, but you only get seven words.';

test('a clean transcript of something else is recognised', () => {
  assert.equal(looksOffScript(SCRIPT, "My name is Dave and I'm in San Diego."), true);
});

test('a correct reading is not flagged', () => {
  assert.equal(looksOffScript(SCRIPT, SCRIPT), false);
});

test('an ordinary mishearing is not flagged', () => {
  // The point of the check: a model that got words wrong still kept most of
  // them, and must not be excused as the reader going off script.
  const misheard = 'Bachelor number one if we went on a day where would you take me '
    + 'and be honest because I have herd every answer twice already '
    + 'Bachelor number two same question but you only get seven words';
  assert.equal(looksOffScript(SCRIPT, misheard), false);
});

test('a badly misheard but genuine attempt is still not flagged', () => {
  // Half the passage wrong is a bad score, not a different sentence.
  const rough = 'bachelor number one if we want on a date were would you take me '
    + 'and be honest because I heard every answer twice';
  assert.equal(looksOffScript(SCRIPT, rough), false);
});

test('too little text to judge is left alone', () => {
  assert.equal(looksOffScript(SCRIPT, 'yes'), false);
  assert.equal(looksOffScript(SCRIPT, ''), false);
  assert.equal(looksOffScript('', 'anything at all here'), false);
});

test('nothing throws on the shapes a broken run can produce', () => {
  for (const value of [null, undefined]) {
    assert.equal(looksOffScript(SCRIPT, value), false);
    assert.equal(looksOffScript(value, 'some words here to compare'), false);
  }
});

test('a different passage of similar length is flagged', () => {
  const other = 'The quick brown fox jumps over the lazy dog while nobody watches from the hill';
  assert.equal(looksOffScript(SCRIPT, other), true);
});
