// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The Video Lab's decisions: which checkpoint can render, which encoder feeds
 * it, and what gets credited with the result.
 *
 * Kept apart from videoGenRunner.ts for the same reason imageGenChallenge is
 * kept apart from its runner — importing the Electron bridge here would drag
 * `window` and the whole api module chain into every test that touches these.
 */

import { isTextEncoder, isVideoCheckpoint } from './videoGen.ts';
import { imagePromptById } from './imageGenChallenge.ts';
import type { VideoRunResult } from './videoGenRun.ts';
import type { AdvancedLabResult } from './labResults.ts';

/** Presets, so the ladder that found the timings is what a user can pick. */
export const VIDEO_SIZE_PRESETS = [
  { id: 'small', label: '768 x 512 — fastest', width: 768, height: 512 },
  { id: 'medium', label: '1024 x 768', width: 1024, height: 768 },
  { id: 'wide', label: '1280 x 768', width: 1280, height: 768 },
  { id: 'fullhd', label: '1920 x 1088 — slowest', width: 1920, height: 1088 },
] as const;

export const DEFAULT_VIDEO_SIZE_ID = 'small';

export function videoSizeById(id?: string) {
  return VIDEO_SIZE_PRESETS.find((p) => p.id === id) ?? VIDEO_SIZE_PRESETS[0];
}

/** Checkpoints that can actually drive a video graph. */
export function videoCheckpoints(checkpoints: string[]): string[] {
  return (checkpoints ?? []).filter(isVideoCheckpoint);
}

/**
 * Text encoders available to an LTX graph.
 *
 * LTX checkpoints do not carry one, so without this the graph fails inside
 * CLIPLoader — which reads as the model being broken rather than as a missing
 * file the user can go and fetch.
 */
export function textEncoders(names: string[]): string[] {
  return (names ?? []).filter(isTextEncoder);
}

/**
 * Whether the Lab has everything a video run needs.
 *
 * Both halves are reported separately because they are fixed differently: a
 * missing checkpoint means downloading a video model, a missing encoder means
 * downloading T5 — and telling someone "video is unavailable" when they are
 * one file away is the sort of dead end the old Image Lab had.
 */
export type VideoReadiness =
  | { kind: 'ready'; checkpoints: string[]; encoders: string[] }
  | { kind: 'no-checkpoint' }
  | { kind: 'no-encoder' };

export function videoReadiness(checkpoints: string[], encoders: string[]): VideoReadiness {
  const models = videoCheckpoints(checkpoints);
  const t5 = textEncoders(encoders);
  if (!models.length) return { kind: 'no-checkpoint' };
  if (!t5.length) return { kind: 'no-encoder' };
  return { kind: 'ready', checkpoints: models, encoders: t5 };
}

/**
 * Fold a video run into the shape the Lab already stores.
 *
 * The video itself is not carried: a few seconds of footage is megabytes, and
 * localStorage would be full after a handful of runs. The judged frame stands
 * in for it, which is also the only part that was scored.
 */
export function toVideoLabResult(run: VideoRunResult, promptId?: string, customText?: string): AdvancedLabResult {
  const prompt = imagePromptById(promptId, customText);
  return {
    model: run.checkpoint,
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
  };
}

/** One line a person can read: what it cost to render. */
export function describeVideoCost(run: VideoRunResult): string {
  const seconds = run.frames / Math.max(1, run.fps);
  return `${(run.elapsedMs / 1000).toFixed(1)}s of compute for ${seconds.toFixed(1)}s of video `
    + `(${run.realtimeCost.toFixed(1)}x realtime)`;
}
