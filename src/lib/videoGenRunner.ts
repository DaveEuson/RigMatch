// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The half of the Video Lab that needs the Electron bridge.
 *
 * Callers ask describeComfyBusy first, and refuse rather than queue when
 * ComfyUI is already busy. Submitting alongside someone else's render does not
 * fail — it waits, then shares a GPU, and the time that produces says nothing
 * about the machine. A wrong number that looks like a measurement is worse than
 * no number.
 */

import { batchSeed } from './videoGen.ts';
import { readComfySettings } from './comfySettings.ts';
import { createVideoTransport } from './comfyTransport.ts';
import { createOllamaJudge } from './imageGenRunner.ts';
import { imagePromptById } from './imageGenChallenge.ts';
import { runVideoLineup, type LineupOutcome, type LineupProgress, type VideoLineupEntry } from './videoLineup.ts';

export type VideoLineupOptions = {
  entries: VideoLineupEntry[];
  promptId?: string;
  /** Free text when promptId is the custom marker; unjudged by design. */
  customPrompt?: string;
  judgeModel?: string;
  ollamaBaseUrl: string;
  /** One per lineup, so models compare fairly and reruns are not served cached. */
  seed?: number;
  /**
   * Unload ComfyUI before every model. The Lab passes true once it has told
   * the user a lineup does this; otherwise it follows the Settings switch that
   * says this ComfyUI is RigMatch's alone.
   */
  unloadBetweenRuns?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LineupProgress) => void;
};

/**
 * A lineup against the real ComfyUI and the user's own vision model.
 *
 * Also how the Run dialog's video skill test runs a model: a lineup of one,
 * so a model renders the same graph whichever screen started it.
 */
export async function runVideoLineupLive(options: VideoLineupOptions): Promise<LineupOutcome[]> {
  const { baseUrl, dedicated } = readComfySettings();
  return runVideoLineup({
    entries: options.entries,
    transport: createVideoTransport(baseUrl),
    // No vision model is not a failure: the run still measures whether the
    // machine can render, and reports itself unjudged rather than scoring the
    // picture as wrong.
    judge: options.judgeModel ? createOllamaJudge(options.judgeModel, options.ollamaBaseUrl) : undefined,
    imagePrompt: imagePromptById(options.promptId, options.customPrompt),
    seed: options.seed ?? batchSeed(),
    unloadBetweenRuns: options.unloadBetweenRuns ?? dedicated,
    signal: options.signal,
    onProgress: options.onProgress,
  });
}
