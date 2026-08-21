// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { isDegenerateTranscript } from '../src/lib/labScoring.ts';

// gemma4:e4b, handed the listening audio, returns "le le le le le" thirty times
// over. The panel called that a PASS — "returned an answer" — because text had
// arrived. Text had arrived; an answer had not, and saying otherwise sends
// someone hunting a transcription problem when nothing was transcribed.

test('one short token on repeat is not an answer', () => {
  assert.equal(isDegenerateTranscript('le le le le le le le le le le le le'), true);
  assert.equal(isDegenerateTranscript('re re re re re re re re re re'), true);
  // The Devanagari case the generate endpoint produced, before the fix.
  assert.equal(isDegenerateTranscript('एलो एलो एलो एलो एलो एलो एलो एलो एलो'), true);
});

test('a real transcript is left alone', () => {
  const real = 'the passcode is zebra seven seven please deliver the package to '
    + 'warehouse four on tuesday morning the order reference is alpha nine three';
  assert.equal(isDegenerateTranscript(real), false);
});

test('speech that genuinely repeats is not called degenerate', () => {
  // This is the line that matters. People do repeat themselves, and marking a
  // real recording as a model failure would be the same error pointed the other
  // way — worse, because it would blame a working model.
  assert.equal(isDegenerateTranscript('very very very good indeed and rather rather fine'), false);
  assert.equal(isDegenerateTranscript('I I I think that that is right'), false);
  assert.equal(isDegenerateTranscript('no no no no please do not do that again'), false);
});

test('a short answer is never judged degenerate', () => {
  // Too little to tell, and a brief transcript is a legitimate result.
  assert.equal(isDegenerateTranscript('yes yes yes'), false);
  assert.equal(isDegenerateTranscript('hello'), false);
  assert.equal(isDegenerateTranscript(''), false);
});

test('two alternating short tokens still count as stuck', () => {
  // The failure mode is not always a single word; a two-token loop is the same
  // thing and just as far from a transcript.
  assert.equal(isDegenerateTranscript('la le la le la le la le la le la le'), true);
});

test('long repeated words are left to the accuracy score', () => {
  // A model looping a real word is odd, but it is language, and the word-error
  // count already handles it honestly. This check is only for token collapse.
  assert.equal(isDegenerateTranscript('warehouse warehouse warehouse warehouse warehouse warehouse warehouse warehouse'), false);
});

test('nothing throws on the shapes a broken model can return', () => {
  for (const value of [null, undefined, '   ', '\n\n']) {
    assert.equal(isDegenerateTranscript(value), false, JSON.stringify(value));
  }
});
