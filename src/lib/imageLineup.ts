// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Several image models, one prompt, one seed, one after another.
 *
 * The picture half of what the video lineup does. What makes it a comparison
 * rather than a list of separate runs is that every checkpoint gets identical
 * input and starts from the same state: the same prompt and seed and, when the
 * person has been told it will, ComfyUI unloaded before each, so none inherits
 * a warm model from the one before it.
 *
 * The pictures are checked only once every model has drawn. The judge is a
 * vision model in Ollama that stays in VRAM for ten minutes after it answers;
 * checked between renders, every checkpoint after the first would be timed
 * with gigabytes of the card taken.
 *
 * One model failing is recorded with its reason and the rest carry on. Pure
 * apart from what it is handed, so tests drive a fake ComfyUI.
 */

import type { Txt2ImgRequest } from './comfyui.ts';
import {
  judgeImageResult,
  runImageGeneration,
  type ComfyTransport,
  type ImageRunResult,
  type JudgeFn,
} from './imageGenRun.ts';
import type { ImagePrompt } from './imageGenScoring.ts';

export type ImageLineupEntry = {
  /** The file as ComfyUI lists it, which is the name its loader is asked for. */
  checkpoint: string;
  name: string;
};

export type ImageLineupOutcome = { entry: ImageLineupEntry; result: ImageRunResult };

// One member per phase that carries no result, as in the video lineup.
export type ImageLineupProgress =
  | { index: number; total: number; entry: ImageLineupEntry; phase: 'rendering' }
  | { index: number; total: number; entry: ImageLineupEntry; phase: 'judging' }
  | { index: number; total: number; entry: ImageLineupEntry; phase: 'done' | 'failed' | 'judged'; result: ImageRunResult };

export async function runImageLineup({
  entries,
  transport,
  judge,
  imagePrompt,
  seed,
  settings = {},
  unloadBetweenRuns,
  signal,
  onProgress,
  sleep,
  now,
}: {
  entries: ImageLineupEntry[];
  transport: ComfyTransport;
  judge?: JudgeFn;
  imagePrompt: ImagePrompt;
  /** One for the whole comparison, so the checkpoints are the only difference. */
  seed: number;
  /** Size and the like, the same for every model. Steps stay each checkpoint's own. */
  settings?: Partial<Omit<Txt2ImgRequest, 'checkpoint' | 'prompt' | 'seed'>>;
  /** Only when the person was told a comparison unloads ComfyUI, or it is RigMatch's own. */
  unloadBetweenRuns: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ImageLineupProgress) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<ImageLineupOutcome[]> {
  const outcomes: ImageLineupOutcome[] = [];
  for (const [index, entry] of entries.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ index, total: entries.length, entry, phase: 'rendering' });
    const result = await runImageGeneration({
      transport,
      checkpoint: entry.checkpoint,
      imagePrompt,
      settings: { ...settings, seed },
      dedicated: unloadBetweenRuns,
      signal,
      sleep,
      now,
    });
    outcomes.push({ entry, result });
    onProgress?.({ index, total: entries.length, entry, phase: result.error ? 'failed' : 'done', result });
  }

  // A prompt someone typed has no questions to ask, so there is nothing to check.
  if (judge && imagePrompt.propositions.length > 0 && !signal?.aborted) {
    for (const [index, outcome] of outcomes.entries()) {
      if (signal?.aborted) break;
      if (outcome.result.error || !outcome.result.imageDataUrl) continue;
      onProgress?.({ index, total: entries.length, entry: outcome.entry, phase: 'judging' });
      const judged = await judgeImageResult(outcome.result, judge, imagePrompt);
      outcomes[index] = { entry: outcome.entry, result: judged };
      onProgress?.({ index, total: entries.length, entry: outcome.entry, phase: 'judged', result: judged });
    }
  }
  return outcomes;
}
