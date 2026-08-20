// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Scoring a generated video.
 *
 * Not the image scorer with a different constant. Two of its three components
 * stop working when the subject is video, and pretending otherwise would
 * produce a number that looks precise and measures nothing.
 *
 * "Fits in VRAM" is worth 15% of an image score, and for video it is worth
 * nothing. Measured on a 12 GB RTX 4070, every resolution from 768x512 to
 * 1920x1088 sat at 12.4-12.75 GB of 12.9 GB — the models alone are about
 * 11.2 GB before a frame is sampled, so the card is saturated whatever you
 * ask of it. A check that returns the same answer on every run of every model
 * is not a measurement.
 *
 * Prompt adherence still works, but only on one frame. A still either has a
 * red lighthouse or it does not, and the image judge settles that unchanged —
 * it scored 5/5 on frames at both 768x512 and 1920x1088. What it cannot judge
 * is motion: temporal consistency, flicker, whether the camera move was the
 * one that was asked for. Those have no ground truth and no reliable judge, so
 * they are reported as unmeasured rather than folded into a score. Saying
 * "83" about motion nobody assessed would be inventing the number.
 *
 * That leaves speed carrying most of the weight, which is right: on this
 * hardware, time is the only thing that separates one machine from another.
 */

import { getAdvancedLabGrade } from './labScoring.ts';

/**
 * Seconds of compute per second of footage.
 *
 * Measured on an RTX 4070: 4 seconds of 768x512 took 12.1s (3.0x), and the
 * same footage at 1920x1088 took 70.7s (17.7x). Three times realtime is a
 * machine you can iterate on; forty times is one where you start a render and
 * go and do something else.
 */
export const COMFORTABLE_COST = 3;
export const PAINFUL_COST = 40;

export function scoreVideoSpeed(elapsedMs: number, frames: number, fps: number): number {
  const seconds = frames / Math.max(1, fps);
  if (seconds <= 0 || elapsedMs <= 0) return 0;
  const cost = elapsedMs / 1000 / seconds;
  if (cost <= COMFORTABLE_COST) return 1;
  if (cost >= PAINFUL_COST) return 0;
  return 1 - (cost - COMFORTABLE_COST) / (PAINFUL_COST - COMFORTABLE_COST);
}

/** Seconds of compute per second of footage — the headline number. */
export function realtimeCost(elapsedMs: number, frames: number, fps: number): number {
  const seconds = frames / Math.max(1, fps);
  return seconds > 0 ? elapsedMs / 1000 / seconds : 0;
}

export type VideoRunFacts = {
  produced: boolean;
  elapsedMs: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
  /** Frame adherence, or null when the judge could not answer enough. */
  adherence: number | null;
};

/**
 * Weights.
 *
 * Speed dominates because it is the only component that varies with the
 * machine. Adherence is withheld rather than redistributed when unjudged, for
 * the same reason as images: a fast rig must not score full marks on a video
 * nobody looked at.
 */
const WEIGHT_SPEED = 0.6;
const WEIGHT_ADHERENCE = 0.4;

export function scoreVideoGeneration(facts: VideoRunFacts): {
  score: number;
  grade: string;
  judged: boolean;
  realtimeCost: number;
  checks: { label: string; passed: boolean; detail: string }[];
} {
  const speed = scoreVideoSpeed(facts.elapsedMs, facts.frames, facts.fps);
  const cost = realtimeCost(facts.elapsedMs, facts.frames, facts.fps);
  const judged = facts.adherence !== null;
  const seconds = facts.frames / Math.max(1, facts.fps);

  const checks = [
    {
      label: 'Video produced',
      passed: facts.produced,
      detail: facts.produced
        ? `${facts.frames} frames at ${facts.width}x${facts.height} — ${seconds.toFixed(1)}s of footage.`
        : 'The graph ran but produced no video.',
    },
    {
      label: 'Frame matches prompt',
      passed: judged && (facts.adherence ?? 0) >= 0.8,
      detail: judged
        ? `The judge confirmed ${Math.round((facts.adherence ?? 0) * 100)}% of the prompt in the middle frame.`
        : 'No judge could read the frame, so this run is unjudged.',
    },
    {
      label: 'Usable speed',
      passed: speed >= 0.5,
      detail: `${cost.toFixed(1)}x realtime — ${(facts.elapsedMs / 1000).toFixed(1)}s of compute for ${seconds.toFixed(1)}s of video.`,
    },
    {
      // Stated rather than scored, so nobody reads the total as covering it.
      label: 'Motion quality',
      passed: false,
      detail: 'Not measured. Temporal consistency and flicker have no ground truth, and no local judge assesses them reliably.',
    },
  ];

  if (!facts.produced) {
    return { score: 0, grade: getAdvancedLabGrade(0), judged: false, realtimeCost: cost, checks };
  }

  const earned = speed * WEIGHT_SPEED + (judged ? (facts.adherence ?? 0) * WEIGHT_ADHERENCE : 0);
  const score = Math.round(earned * 100);
  return { score, grade: getAdvancedLabGrade(score), judged, realtimeCost: cost, checks };
}
