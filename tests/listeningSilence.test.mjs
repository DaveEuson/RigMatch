// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SILENCE_PEAK,
  isEffectivelySilent,
  peakAmplitude,
  toListeningWav,
} from '../src/lib/wavEncoder.ts';

// A recording came back silent and the listening test reported "gemma4:e4b
// scored 0/100 against the script", with "what the model heard: (nothing)".
// Both statements were true and together they were a lie: the model was handed
// silence and marked down for not transcribing it. The failure was a
// microphone, and the number blamed the model.

const tone = (samples, amplitude) => {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) out[i] = Math.sin(i / 8) * amplitude;
  return out;
};

test('peak is the loudest sample, whichever direction it swings', () => {
  // Compared with a tolerance because Float32Array cannot hold 0.8 exactly —
  // it stores 0.800000011920929, and asserting strict equality here fails on
  // the storage format rather than on anything about the audio.
  const peak = peakAmplitude(new Float32Array([0, 0.25, -0.8, 0.3]));
  assert.ok(Math.abs(peak - 0.8) < 1e-6, `expected about 0.8, got ${peak}`);
  assert.equal(peakAmplitude(new Float32Array([])), 0);
});

test('a dead microphone is recognised as silence', () => {
  assert.equal(isEffectivelySilent(peakAmplitude(new Float32Array(16000))), true);
});

test('line noise from a muted input is still silence', () => {
  // A muted input is rarely a perfect zero; it hums a little.
  assert.equal(isEffectivelySilent(peakAmplitude(tone(16000, 0.002))), true);
});

test('a quiet voice is not silence', () => {
  // Someone speaking softly, or sitting well back from the microphone, must
  // still be scored — refusing their recording would be the same failure in
  // the other direction.
  const peak = peakAmplitude(tone(16000, 0.05));
  assert.ok(peak > SILENCE_PEAK, `expected ${peak} above the ${SILENCE_PEAK} floor`);
  assert.equal(isEffectivelySilent(peak), false);
});

test('an ordinary speaking level is comfortably clear of the floor', () => {
  assert.equal(isEffectivelySilent(peakAmplitude(tone(16000, 0.4))), false);
});

test('a converted clip reports what it contains, not just its bytes', async () => {
  // The encoder returns peak and duration so the caller can decline to score a
  // recording rather than publish a wrong number for it.
  const decode = async () => ({ sampleRate: 16000, channels: [tone(32000, 0.5)] });
  const clip = await toListeningWav(new ArrayBuffer(8), decode);
  assert.ok(clip.base64.length > 0, 'should still produce audio');
  assert.ok(clip.peak > SILENCE_PEAK);
  assert.ok(Math.abs(clip.seconds - 2) < 0.05, `expected about 2s, got ${clip.seconds}`);
});

test('a silent clip is still encoded, and still reports itself as silent', async () => {
  // Encoding must not throw: the caller decides what to do about it, and the
  // decision needs the numbers rather than an exception.
  const decode = async () => ({ sampleRate: 16000, channels: [new Float32Array(16000)] });
  const clip = await toListeningWav(new ArrayBuffer(8), decode);
  assert.ok(clip.base64.length > 0);
  assert.equal(isEffectivelySilent(clip.peak), true);
});
