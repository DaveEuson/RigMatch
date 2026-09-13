// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The audio test's decisions: which model may listen, and what a clip's result
 * is saved as. Free of the bridge, so both are tested directly.
 */

import { canHearAudio, type CapabilityBearing } from './modelCatalog.ts';
import type { AudioRunResult } from './audioGenRun.ts';
import type { AudioPrompt } from './audioGenScoring.ts';
import type { AdvancedLabResult } from './labResults.ts';

/**
 * Models on this machine that can hear, in the order they are listed.
 *
 * Only what Ollama reports counts. A model that cannot hear does not answer
 * badly, it refuses the request ("Failed to load image or audio file"), and
 * every clip it was asked about would come back unjudged.
 */
export function listenerCandidates(installed: CapabilityBearing[]): string[] {
  return installed
    // The Models list includes what the Ollama website says a model can do,
    // downloaded or not; only a model on this machine can answer.
    .filter((row) => row.installed !== false && canHearAudio(row))
    .map((row) => row.installedModel?.name ?? row.installedModel?.model ?? row.name ?? row.displayName ?? '')
    .filter(Boolean);
}

/**
 * A made clip in the shape every Lab result is saved in.
 *
 * The clip itself is not saved, only where ComfyUI wrote it: thirty seconds is
 * a megabyte, and a handful of comparisons would fill storage. The response is
 * the prompt, which is what groups results that can fairly be compared.
 */
export function toAudioLabResult(
  run: AudioRunResult,
  audioPrompt: AudioPrompt,
  extra: { lineupId?: string; balance?: number } = {},
): AdvancedLabResult {
  return {
    model: run.model,
    challenge: 'audio-generation',
    score: run.score,
    grade: run.grade,
    elapsedMs: run.elapsedMs,
    response: audioPrompt.prompt,
    checks: run.checks,
    completedAt: new Date().toISOString(),
    audioRef: run.audioRef,
    seconds: run.seconds,
    ...(run.unjudgedReason ? { unjudgedReason: run.unjudgedReason } : {}),
    adherence: run.adherence,
    error: run.error,
    ...(extra.lineupId ? { lineupId: extra.lineupId } : {}),
    ...(typeof extra.balance === 'number' ? { balance: extra.balance } : {}),
  };
}
