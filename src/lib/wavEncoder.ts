// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Turning captured microphone audio into the format the listening test uses.
 *
 * MediaRecorder hands back webm/opus, which is not what the bundled reference
 * recording is: 16 kHz mono 16-bit PCM WAV. Rather than find out per model
 * whether a container is accepted — a failure that would land on the model's
 * scorecard as if it could not hear — captured audio is decoded and re-encoded
 * to exactly the format already known to work.
 *
 * 16 kHz is not a compromise here. Speech recognition models are trained at it,
 * and it is a quarter the bytes of 44.1 kHz for audio that is going to be
 * base64-encoded and pushed through an HTTP request.
 */

export const TARGET_SAMPLE_RATE = 16000;

/**
 * Average channels down to mono.
 *
 * Taking only the left channel instead would silently lose half of a recording
 * made on a stereo interface with the microphone on the right input.
 */
export function toMono(channels: Float32Array[]): Float32Array {
  if (!channels.length) return new Float32Array(0);
  if (channels.length === 1) return channels[0];

  const length = Math.min(...channels.map((c) => c.length));
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    mono[i] = sum / channels.length;
  }
  return mono;
}

/**
 * Resample by linear interpolation.
 *
 * Not the best resampler available — a proper one would low-pass first to stop
 * frequencies above 8 kHz folding back as aliasing. For speech going into a
 * transcription model the difference is inaudible and the dependency is not
 * worth it; this is the same approach the reference WAV was prepared with.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    out[i] = input[left] * (1 - weight) + input[right] * weight;
  }
  return out;
}

/**
 * Write a mono 16-bit PCM WAV.
 *
 * Samples are clamped before scaling. A recording that clipped carries values
 * beyond +/-1, and letting those wrap produces a loud crack exactly where the
 * speaker was loudest — which a transcription model then mishears.
 */
export function encodeWav(samples: Float32Array, sampleRate: number = TARGET_SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM header size
  view.setUint16(20, 1, true);           // format: PCM
  view.setUint16(22, 1, true);           // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);  // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

/** Bytes to bare base64, chunked — spreading a large array overflows the stack. */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/**
 * Decode anything the browser can read and re-encode it as the test's WAV.
 *
 * Used for a microphone capture and for an uploaded file alike: an mp3 someone
 * uploads gets the same treatment, so no model is ever handed a container it
 * might refuse.
 */
export async function toListeningWav(
  data: ArrayBuffer,
  decode: (data: ArrayBuffer) => Promise<{ sampleRate: number; channels: Float32Array[] }>,
): Promise<string> {
  const { sampleRate, channels } = await decode(data);
  const mono = toMono(channels);
  const resampled = resample(mono, sampleRate, TARGET_SAMPLE_RATE);
  return bytesToBase64(encodeWav(resampled, TARGET_SAMPLE_RATE));
}

/** Seconds of audio, so a caller can refuse something far too short to score. */
export function durationSeconds(samples: number, sampleRate: number): number {
  return sampleRate > 0 ? samples / sampleRate : 0;
}
