// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What a video run is credited with, in the shape the Lab stores.
 *
 * Kept apart from videoGenRunner.ts for the same reason imageGenChallenge is
 * kept apart from its runner — importing the Electron bridge here would drag
 * `window` and the whole api module chain into every test that touches this.
 *
 * Which models can render, and with what, is the lineup's job now
 * (videoLineup.ts): a checkpoint name and the first encoder in the folder was
 * how an LTX-2 file ended up in the LTX-Video 0.9 graph.
 */

import { imagePromptById } from './imageGenChallenge.ts';
import type { VideoRunResult } from './videoGenRun.ts';
import type { AdvancedLabResult } from './labResults.ts';

/**
 * Fold a video run into the shape the Lab already stores.
 *
 * The video itself is not carried: a few seconds of footage is megabytes, and
 * localStorage would be full after a handful of runs. The judged frame stands
 * in for it, which is also the only part that was scored.
 *
 * `model` is the name a person reads; the storage key carries the id. `gpu` is
 * what lets a measured time replace the estimate on this machine and no other.
 */
export function toVideoLabResult(
  run: VideoRunResult,
  promptId?: string,
  customText?: string,
  extra: { model?: string; gpu?: string; lineupId?: string } = {},
): AdvancedLabResult {
  const prompt = imagePromptById(promptId, customText);
  return {
    model: extra.model ?? run.checkpoint,
    challenge: 'video-generation',
    score: run.score,
    grade: run.grade,
    elapsedMs: run.elapsedMs,
    response: prompt.prompt,
    checks: run.checks,
    completedAt: new Date().toISOString(),
    imageDataUrl: run.frameDataUrl,
    videoRef: run.videoRef,
    width: run.width,
    height: run.height,
    error: run.error,
    ...(extra.gpu ? { gpu: extra.gpu } : {}),
    ...(extra.lineupId ? { lineupId: extra.lineupId } : {}),
  };
}
