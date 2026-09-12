// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Running one audio model end to end: render a clip in ComfyUI, then let a
 * model that can hear check it against the prompt.
 *
 * The picture run, with two differences. What comes back is a sound, so it is
 * decoded before anything is scored: a clip that decodes to silence is a
 * failed render, not a quiet success, and the listener is handed the clip as
 * the 16 kHz mono WAV the listening test already sends every model that can
 * hear. And speed is cost per second of audio, as it is for video.
 */

import { extractAudio, readStatus, type ComfyImageRef } from './comfyui.ts';
import { dataUrlToBytes } from './dataUrl.ts';
import { getErrorMessage } from './format.ts';
import type { ComfyTransport } from './imageGenRun.ts';
import { askPropositions } from './imageGenScoring.ts';
import { scoreAudioGeneration, type AudioPrompt } from './audioGenScoring.ts';
import { isEffectivelySilent, toListeningWav, type ListeningClip } from './wavEncoder.ts';

const POLL_INTERVAL_MS = 1000;

/**
 * Ten minutes. Thirty seconds of audio renders in seconds to a minute; the
 * rest is room for a ten-gigabyte checkpoint loading cold from a slow disk.
 */
export const DEFAULT_AUDIO_TIMEOUT_MS = 600000;

/** Asks a model that can hear a yes/no question about a clip, given as base64 WAV. */
export type ListenFn = (wavBase64: string, question: string) => Promise<string>;

/** Raw channels from encoded audio: the browser's decoder in the app, a fake in tests. */
export type AudioDecoder = (data: ArrayBuffer) => Promise<{ sampleRate: number; channels: Float32Array[] }>;

export type AudioRunOptions = {
  transport: ComfyTransport;
  /** Checks the clip as soon as it is made. A comparison leaves this out and checks later. */
  listen?: ListenFn;
  decode: AudioDecoder;
  graph: Record<string, unknown>;
  /** What the result is recorded under: the model's name. */
  model: string;
  /** Seconds of audio the graph asks for, for when the clip cannot be measured. */
  seconds: number;
  audioPrompt: AudioPrompt;
  /**
   * Unload ComfyUI first. False by default, for the reason videoGenRun gives:
   * on a ComfyUI someone else is using, it unloads their work too.
   */
  dedicated?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type AudioRunResult = {
  model: string;
  promptId?: string;
  /** Where the clip sits on the ComfyUI server, fetched again only to be played. */
  audioRef?: ComfyImageRef;
  /**
   * The clip as the listener hears it. Held in memory so a comparison can check
   * every clip once all are made; never saved.
   */
  clip?: ListeningClip;
  /** Seconds of audio: measured from the clip, or what was asked for when it could not be. */
  seconds: number;
  score: number;
  grade: string;
  judged: boolean;
  adherence: number | null;
  realtimeCost: number;
  elapsedMs: number;
  checks: { label: string; passed: boolean; detail: string }[];
  error?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runAudioGeneration(options: AudioRunOptions): Promise<AudioRunResult> {
  const {
    transport, listen, decode, graph, model, seconds, audioPrompt, dedicated = false,
    signal, timeoutMs = DEFAULT_AUDIO_TIMEOUT_MS, sleep = defaultSleep, now = () => Date.now(),
  } = options;

  let promptId: string | undefined;
  let history: unknown;
  let elapsedMs = 0;
  try {
    // Before the clock starts: unloading is not this model being slow.
    if (dedicated) await transport.free?.().catch(() => undefined);
    const startedAt = now();
    ({ promptId } = await transport.submit(graph));
    history = await waitForHistory({ transport, promptId, signal, timeoutMs, sleep, now, startedAt });
    // Stopped before the clip is fetched and checked: neither is the model's time.
    elapsedMs = now() - startedAt;
  } catch (error) {
    // A cancelled run must not leave ComfyUI making a clip nobody will hear.
    if (promptId) await transport.interrupt(promptId).catch(() => undefined);
    return audioRunFailure(model, seconds, error ? getErrorMessage(error) : 'Audio generation failed.', { promptId, elapsedMs });
  }

  const audioRef = extractAudio(history, promptId)[0];
  if (!audioRef) {
    return audioRunFailure(model, seconds, 'The run finished but produced no audio.', { promptId, elapsedMs });
  }

  let clip: ListeningClip;
  try {
    const { bytes } = dataUrlToBytes(await transport.image(audioRef));
    clip = await toListeningWav(bytes.buffer, decode);
  } catch (error) {
    return audioRunFailure(model, seconds, `ComfyUI saved the clip, but it could not be read back: ${getErrorMessage(error)}`, {
      promptId, elapsedMs, audioRef,
    });
  }
  const measured = clip.seconds > 0 ? clip.seconds : seconds;
  if (isEffectivelySilent(clip.peak)) {
    return audioRunFailure(model, measured, 'The clip came back silent.', { promptId, elapsedMs, audioRef });
  }

  const adherence = listen && audioPrompt.propositions.length > 0
    ? (await listenFor(listen, clip, audioPrompt)).adherence
    : null;
  return {
    model, promptId, audioRef, clip, seconds: measured, adherence, elapsedMs,
    ...scoreAudioGeneration({ produced: true, elapsedMs, seconds: measured, adherence }),
  };
}

/**
 * Check a finished clip, and score it again with the answers.
 *
 * Kept apart from the render so a comparison can check its clips after every
 * model has made one. The listener is a model in Ollama that stays in VRAM for
 * ten minutes after it answers; checked between renders, it would sit on the
 * graphics card while the next model was being timed.
 */
export async function judgeAudioResult(
  result: AudioRunResult,
  listen: ListenFn,
  audioPrompt: AudioPrompt,
): Promise<AudioRunResult> {
  if (result.error || !result.clip || audioPrompt.propositions.length === 0) return result;
  const { adherence } = await listenFor(listen, result.clip, audioPrompt);
  return {
    ...result,
    adherence,
    ...scoreAudioGeneration({ produced: true, elapsedMs: result.elapsedMs, seconds: result.seconds, adherence }),
  };
}

/** A run that produced nothing to hear, with the reason. */
export function audioRunFailure(
  model: string,
  seconds: number,
  error: string,
  extra: { promptId?: string; elapsedMs?: number; audioRef?: ComfyImageRef } = {},
): AudioRunResult {
  const elapsedMs = extra.elapsedMs ?? 0;
  return {
    model,
    promptId: extra.promptId,
    audioRef: extra.audioRef,
    seconds,
    adherence: null,
    elapsedMs,
    ...scoreAudioGeneration({ produced: false, elapsedMs, seconds, adherence: null }),
    error,
  };
}

function listenFor(listen: ListenFn, clip: ListeningClip, audioPrompt: AudioPrompt) {
  return askPropositions((question) => listen(clip.base64, question), audioPrompt);
}

async function waitForHistory({
  transport, promptId, signal, timeoutMs, sleep, now, startedAt,
}: {
  transport: ComfyTransport; promptId: string; signal?: AbortSignal; timeoutMs: number;
  sleep: (ms: number) => Promise<void>; now: () => number; startedAt: number;
}): Promise<unknown> {
  for (;;) {
    if (signal?.aborted) throw new Error('Audio generation was stopped.');
    if (now() - startedAt > timeoutMs) {
      throw new Error(`ComfyUI did not finish within ${Math.round(timeoutMs / 60000)} minutes.`);
    }
    const history = await transport.history(promptId);
    const status = readStatus(history, promptId);
    if (status.failed) throw new Error(status.error ?? 'ComfyUI reported the run failed.');
    if (status.done) return history;
    await sleep(POLL_INTERVAL_MS);
  }
}
