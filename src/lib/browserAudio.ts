// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Decode whatever the browser can read into raw channels.
 *
 * A microphone gives webm/opus, an upload could be anything, and ComfyUI saves
 * MP3. All three are decoded here and re-encoded to the 16 kHz mono WAV the
 * bundled reference uses (wavEncoder.ts), so no model is ever handed a container
 * it might refuse. A refusal would land on that model's scorecard as if it
 * could not hear.
 */
export async function decodeAudio(data: ArrayBuffer): Promise<{ sampleRate: number; channels: Float32Array[] }> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(data.slice(0));
    return {
      sampleRate: buffer.sampleRate,
      channels: Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
    };
  } finally {
    void ctx.close();
  }
}
