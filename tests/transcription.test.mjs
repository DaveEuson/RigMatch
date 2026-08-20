// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTranscript,
  isReferenceLongEnough,
  normalizeTranscript,
  scoreTranscription,
} from '../src/lib/transcription.ts';

/**
 * The reference sentence and the two answers below are real: a WAV synthesised
 * with Windows TTS, fed to gemma4:e2b through both of Ollama's endpoints. Both
 * heard it perfectly; they wrote it down differently.
 */
const SPOKEN = 'The passcode is zebra seven seven. Remember it.';
const HEARD_NATIVE = 'the pass code is zebra seven seven remember it';
const HEARD_OPENAI = 'The passcode is zebra 77 remember it';

test('a perfect transcript scores 100 regardless of punctuation and case', () => {
  assert.equal(scoreTranscription(SPOKEN, 'the passcode is zebra seven seven remember it').score, 100);
  assert.equal(scoreTranscription(SPOKEN, 'THE PASSCODE IS ZEBRA SEVEN SEVEN. REMEMBER IT!!').score, 100);
});

test('writing digits instead of spelling them is not a mistake', () => {
  // This is the answer /v1 gave. Marking it down would measure formatting.
  const scored = scoreTranscription(SPOKEN, HEARD_OPENAI);
  assert.equal(scored.score, 100, `"zebra 77" should match "zebra seven seven"`);
  assert.equal(scored.errors, 0);
});

test('a short reference makes ordinary variance look like failure', () => {
  // The native endpoint heard the sentence perfectly but wrote "pass code" for
  // "passcode" — a substitution plus an insertion. Against eight words that is
  // 25% error, and scores 75. The metric is right; the reference is too short,
  // which is why the benchmark script has to be a passage.
  const scored = scoreTranscription(SPOKEN, HEARD_NATIVE);
  assert.equal(scored.score, 75);
  assert.equal(scored.referenceWords, 8);
  assert.equal(isReferenceLongEnough(SPOKEN), false, 'this sentence must not be used as a reference');
});

test('the same slip against a proper passage barely registers', () => {
  const passage = `${SPOKEN} ${'The quick brown fox jumps over the lazy dog. '.repeat(4)}`;
  const heard = passage.replace('passcode', 'pass code');
  assert.equal(isReferenceLongEnough(passage), true);
  const scored = scoreTranscription(passage, heard);
  assert.ok(scored.score >= 95, `one compound split should be minor, scored ${scored.score}`);
});

test('mishearing a word is scored against the reference length', () => {
  const scored = scoreTranscription(SPOKEN, 'the passcode is debra seven seven remember it');
  assert.equal(scored.errors, 1);
  assert.equal(scored.referenceWords, 8);
  assert.equal(scored.score, 88);
});

test('a model that heard nothing scores zero rather than going negative', () => {
  // Padding the answer produces more words than were spoken, so the error rate
  // can exceed one.
  const waffle = scoreTranscription(SPOKEN, 'I am sorry, I cannot hear any audio in this conversation at all.');
  assert.equal(waffle.score, 0);
  assert.ok(waffle.wordErrorRate > 1, 'insertions push the rate past one');
  assert.equal(scoreTranscription(SPOKEN, '').score, 0);
});

test('digit runs expand to spoken digits, not to quantities', () => {
  // Deliberate: "77" as a passcode is "seven seven". Quantities are out of
  // scope, which is why the reference script reads digits individually.
  assert.deepEqual(normalizeTranscript('code 407'), ['code', 'four', 'zero', 'seven']);
  assert.deepEqual(normalizeTranscript('seventy seven'), ['seventy', 'seven']);
  // And so a quantity will NOT match its digits — recorded rather than hidden.
  assert.ok(scoreTranscription('seventy seven', '77').score < 100);
});

test('spoken zero has several spellings', () => {
  assert.deepEqual(normalizeTranscript('oh seven'), ['zero', 'seven']);
  assert.equal(scoreTranscription('zero seven', 'oh seven').score, 100);
});

test('an empty reference cannot be scored', () => {
  const scored = scoreTranscription('', 'anything at all');
  assert.equal(scored.score, 0);
  assert.equal(scored.referenceWords, 0);
});

test('a transcript wrapped in a sentence is pulled out of it', () => {
  // Models are asked to write down what they hear and frame it anyway. The
  // framing should not count as errors.
  assert.equal(extractTranscript('The audio says: "the passcode is zebra seven seven"'),
    'the passcode is zebra seven seven');
  assert.equal(extractTranscript('Sure!\nthe passcode is zebra seven seven'),
    'the passcode is zebra seven seven');
  // Nothing to extract leaves it alone.
  assert.equal(extractTranscript('the passcode is zebra seven seven'),
    'the passcode is zebra seven seven');
  assert.equal(extractTranscript(''), '');
});

test('extraction does not mistake a short sign-off for the answer', () => {
  const text = 'the passcode is zebra seven seven\nHope that helps';
  assert.equal(extractTranscript(text), 'the passcode is zebra seven seven\nHope that helps');
});

test('scoring the real pair against a proper passage', () => {
  // Both answers heard the audio. Against a long enough reference, both read
  // as the passes they are.
  const filler = 'The quick brown fox jumps over the lazy dog. '.repeat(4);
  for (const [label, heard] of [['native', HEARD_NATIVE], ['openai', HEARD_OPENAI]]) {
    const scored = scoreTranscription(`${SPOKEN} ${filler}`, `${extractTranscript(heard)} ${filler}`);
    assert.ok(scored.score >= 95, `${label} scored ${scored.score}, which would read as a failure`);
  }
});
