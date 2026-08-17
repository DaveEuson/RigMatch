import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LISTENING_SCRIPT_ID,
  LISTENING_SCRIPTS,
  MIN_SCRIPT_WORDS,
  isScriptLongEnough,
  listeningScriptById,
  referenceFor,
} from '../src/lib/listeningScripts.ts';
import {
  TARGET_SAMPLE_RATE,
  encodeWav,
  resample,
  toMono,
} from '../src/lib/wavEncoder.ts';
import { normalizeTranscript, scoreTranscription } from '../src/lib/transcription.ts';

test('every script is long enough for word error rate to mean anything', () => {
  // Against eight words, a model that hears perfectly but writes "pass code"
  // for "passcode" scores 75. Against forty, the same slip is 5.
  for (const script of LISTENING_SCRIPTS) {
    assert.ok(isScriptLongEnough(script.text), `${script.id} is under ${MIN_SCRIPT_WORDS} words`);
  }
});

test('scripts read digits as separate words, which is all the scorer understands', () => {
  // "seventy seven" could never match "77"; "seven seven" does.
  for (const script of LISTENING_SCRIPTS) {
    assert.ok(!/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/i.test(script.text),
      `${script.id} uses a quantity word the scorer cannot match`);
    assert.ok(!/\d/.test(script.text), `${script.id} contains a numeral rather than spoken digits`);
  }
});

test('a perfect reading of a script scores 100', () => {
  const script = listeningScriptById('first-date');
  assert.equal(scoreTranscription(script.text, script.text).score, 100);
});

test('an unknown script id falls back rather than crashing a run', () => {
  assert.equal(listeningScriptById('nonsense').id, DEFAULT_LISTENING_SCRIPT_ID);
  assert.equal(listeningScriptById(undefined).id, DEFAULT_LISTENING_SCRIPT_ID);
});

test('the reference comes from the script the user was asked to read', () => {
  const chosen = referenceFor('record', { sampleReference: 'bundled', scriptId: 'table-number' });
  assert.equal(chosen, listeningScriptById('table-number').text);
});

test('an upload with no stated transcript has no reference, and that is not a failure', () => {
  // Scoring it against a guess — or against what another model thinks it heard
  // — would measure agreement between two models, not transcription accuracy.
  assert.equal(referenceFor('upload', { sampleReference: 'bundled' }), null);
  assert.equal(referenceFor('upload', { sampleReference: 'bundled', typedReference: '   ' }), null);
});

test('an upload with a stated transcript is scored against it', () => {
  const said = 'the quick brown fox jumped over the lazy dog';
  assert.equal(referenceFor('upload', { sampleReference: 'bundled', typedReference: said }), said);
});

test('the bundled sample still uses the bundled reference', () => {
  assert.equal(referenceFor('sample', { sampleReference: 'bundled words' }), 'bundled words');
});

test('stereo is averaged, not half-discarded', () => {
  // Taking the left channel alone would silently lose a recording made with
  // the microphone on the right input.
  const left = new Float32Array([1, 0, -1]);
  const right = new Float32Array([0, 0, 1]);
  assert.deepEqual([...toMono([left, right])], [0.5, 0, 0]);
});

test('mono passes through untouched', () => {
  const mono = new Float32Array([0.25, -0.5]);
  assert.equal(toMono([mono]), mono);
});

test('resampling 48k to 16k keeps a third of the samples', () => {
  const input = new Float32Array(48000);
  assert.equal(resample(input, 48000, TARGET_SAMPLE_RATE).length, 16000);
});

test('resampling to the same rate is a no-op', () => {
  const input = new Float32Array([0.1, 0.2]);
  assert.equal(resample(input, 16000, 16000), input);
});

test('the WAV header says 16 kHz mono 16-bit', () => {
  const wav = encodeWav(new Float32Array([0, 0.5, -0.5]), TARGET_SAMPLE_RATE);
  const view = new DataView(wav);
  assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
  assert.equal(view.getUint16(22, true), 1, 'channels');
  assert.equal(view.getUint32(24, true), 16000, 'sample rate');
  assert.equal(view.getUint16(34, true), 16, 'bits per sample');
  assert.equal(wav.byteLength, 44 + 3 * 2);
});

test('a clipped recording does not wrap into a crack', () => {
  // Letting values beyond +/-1 wrap produces a loud pop exactly where the
  // speaker was loudest, which the model then mishears.
  const view = new DataView(encodeWav(new Float32Array([2, -2])));
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

test('the themed scripts survive the transcript normaliser intact', () => {
  // A script whose words vanish in normalisation would score every model down.
  for (const script of LISTENING_SCRIPTS) {
    const words = normalizeTranscript(script.text);
    assert.ok(words.length >= MIN_SCRIPT_WORDS, `${script.id} normalises to ${words.length} words`);
  }
});
