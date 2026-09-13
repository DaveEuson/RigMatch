// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Your ear as the judge of a made clip.
 *
 * The listeners Ollama offers today listen for speech. Asked about real music
 * and rain, both Gemma 4 models answered No to every question, and one took
 * Stable Audio's rain for a barking dog; a person hears rain in a second. So
 * under each clip you say whether it sounds like the prompt, and once you have,
 * that is the clip's accuracy. It counts at the fader, on the board and for the
 * winner, marked as yours rather than a model's. It also works for a prompt you
 * wrote yourself, which nothing else can check.
 */

import { AUDIO_CLIP_SECONDS } from './audioCatalog.ts';
import { scoreAudioGeneration } from './audioGenScoring.ts';
import type { AdvancedLabResult } from './labResults.ts';

/** What you said about a made clip, and when. */
export type EarVerdict = { matches: boolean; at: string };

/**
 * How much of its prompt a made thing matched: your verdict when you gave one,
 * the judge's or listener's check when not, and null when nothing checked it.
 */
export function promptAccuracy(result: Pick<AdvancedLabResult, 'adherence' | 'verdict'>): number | null {
  if (result.verdict) return result.verdict.matches ? 1 : 0;
  return typeof result.adherence === 'number' ? result.adherence : null;
}

/** How your verdict reads beside a result. */
export function describeEarVerdict(verdict: EarVerdict): string {
  return verdict.matches ? 'sounds right to you' : 'does not sound right to you';
}

/**
 * A made clip's result with your verdict recorded, or taken back with null,
 * and scored again with it. What the listener made of the clip is kept, so
 * taking the verdict back returns the result to what the run said.
 */
export function withEarVerdict(
  result: AdvancedLabResult,
  matches: boolean | null,
  at: string = new Date().toISOString(),
): AdvancedLabResult {
  const next: AdvancedLabResult = { ...result };
  if (matches === null) delete next.verdict;
  else next.verdict = { matches, at };
  const scored = scoreAudioGeneration({
    produced: !next.error,
    elapsedMs: next.elapsedMs,
    seconds: next.seconds ?? AUDIO_CLIP_SECONDS,
    adherence: promptAccuracy(next),
    unjudgedReason: next.unjudgedReason,
    byEar: Boolean(next.verdict),
  });
  return { ...next, score: scored.score, grade: scored.grade, checks: scored.checks };
}
