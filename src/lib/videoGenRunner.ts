/**
 * The half of the Video Lab that needs the Electron bridge.
 *
 * A run is refused rather than queued when ComfyUI is already busy. Submitting
 * alongside someone else's render does not fail — it waits, then shares a GPU,
 * and the time that produces says nothing about the machine. A wrong number
 * that looks like a measurement is worse than no number.
 */

import { batchSeed } from './videoGen.ts';
import { readComfySettings } from './comfySettings.ts';
import { createVideoTransport } from './comfyTransport.ts';
import { createOllamaJudge } from './imageGenRunner.ts';
import { imagePromptById } from './imageGenChallenge.ts';
import { runVideoGeneration, type VideoRunResult } from './videoGenRun.ts';
import { videoSizeById } from './videoGenChallenge.ts';

export type VideoChallengeOptions = {
  checkpoint: string;
  textEncoder: string;
  sizeId?: string;
  promptId?: string;
  /** Free text when promptId is the custom marker; unjudged by design. */
  customPrompt?: string;
  judgeModel?: string;
  ollamaBaseUrl: string;
  /** One per batch, so models compare fairly and reruns are not served cached. */
  seed?: number;
  signal?: AbortSignal;
};

export async function runVideoLabChallenge(options: VideoChallengeOptions): Promise<VideoRunResult> {
  const {
    checkpoint, textEncoder, sizeId, promptId, customPrompt, judgeModel, ollamaBaseUrl, seed, signal,
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
    imagePrompt: imagePromptById(promptId, customPrompt),
    settings: { width: size.width, height: size.height, seed: seed ?? batchSeed() },
    dedicated,
    signal,
  });
}
