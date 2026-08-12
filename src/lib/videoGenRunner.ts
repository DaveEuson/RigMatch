/**
 * The half of the Video Lab that needs the Electron bridge.
 *
 * A run is refused rather than queued when ComfyUI is already busy. Submitting
 * alongside someone else's render does not fail — it waits, then shares a GPU,
 * and the time that produces says nothing about the machine. A wrong number
 * that looks like a measurement is worse than no number.
 */

import { agentArcadeApi } from '../api.ts';
import { batchSeed, comfyBusyCount } from './videoGen.ts';
import { readComfySettings } from './comfySettings.ts';
import { comfyBaseUrl, createVideoTransport } from './comfyTransport.ts';
import { createOllamaJudge } from './imageGenRunner.ts';
import { imagePromptById } from './imageGenChallenge.ts';
import { runVideoGeneration, type VideoRunResult } from './videoGenRun.ts';
import { videoSizeById } from './videoGenChallenge.ts';

export type VideoChallengeOptions = {
  checkpoint: string;
  textEncoder: string;
  sizeId?: string;
  promptId?: string;
  judgeModel?: string;
  ollamaBaseUrl: string;
  /** One per batch, so models compare fairly and reruns are not served cached. */
  seed?: number;
  signal?: AbortSignal;
};

/**
 * Is ComfyUI free to be measured on?
 *
 * Returns the queue depth. Anything above zero means something else is in
 * flight, which on a shared instance is the normal state rather than an error.
 */
export async function comfyQueueDepth(baseUrl: string = comfyBaseUrl()): Promise<number> {
  if (!agentArcadeApi.getComfyStatus) return 0;
  try {
    const status = await agentArcadeApi.getComfyStatus(baseUrl);
    return comfyBusyCount(status.execInfo ?? null);
  } catch {
    // Unreadable queue counts as idle: failing to ask must not block a run.
    return 0;
  }
}

/**
 * Why a benchmark should not start right now, or null when it may.
 *
 * Sharing a GPU with a render already in flight does not fail — it queues,
 * then both jobs fight for the card, and the time that produces describes
 * neither. A wrong number that looks like a measurement is worse than a
 * refusal, and on a shared ComfyUI this is the normal state rather than an
 * error.
 */
export async function describeComfyBusy(baseUrl: string = comfyBaseUrl()): Promise<string | null> {
  const depth = await comfyQueueDepth(baseUrl);
  if (depth <= 0) return null;
  return `ComfyUI is already working on ${depth} job${depth === 1 ? '' : 's'}. `
    + 'Timing a run alongside it would measure the queue rather than this computer — '
    + 'wait for it to finish, then try again.';
}

export async function runVideoLabChallenge(options: VideoChallengeOptions): Promise<VideoRunResult> {
  const {
    checkpoint, textEncoder, sizeId, promptId, judgeModel, ollamaBaseUrl, seed, signal,
  } = options;
  const { baseUrl, dedicated } = readComfySettings();
  const size = videoSizeById(sizeId);

  return runVideoGeneration({
    transport: createVideoTransport(baseUrl),
    // No vision model is not a failure: the run still measures whether the
    // machine can render, and reports itself unjudged rather than scoring the
    // picture as wrong.
    judge: judgeModel ? createOllamaJudge(judgeModel, ollamaBaseUrl) : undefined,
    checkpoint,
    textEncoder,
    imagePrompt: imagePromptById(promptId),
    settings: { width: size.width, height: size.height, seed: seed ?? batchSeed() },
    dedicated,
    signal,
  });
}
