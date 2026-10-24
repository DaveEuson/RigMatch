// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * RigScore: how fast this PC runs local AI, as a number comparable with another PC.
 *
 * The Match Score cannot be compared across computers. It mixes answer quality,
 * which belongs to the model, with fit, which belongs to the card. This is the
 * other question: the same work, on the same weights, timed. The work is fixed
 * here so that two scores mean the same thing.
 *
 * Nothing in this file runs a model. It holds what the test is, turns timings
 * into points, and says whether two results can be set side by side.
 * See docs/rigscore.md for the reasoning.
 */

export type RigTierId = 'light' | 'standard' | 'heavy' | 'extreme';

export type RigTier = {
  id: RigTierId;
  label: string;
  /** The exact Ollama tag every machine runs, so the weights are the same. */
  model: string;
  /** Download size, so a person is told before it is fetched. */
  sizeGb: number;
  /** Below this the tier would spill into system memory and measure that instead. */
  minVramGb: number;
};

/**
 * Smallest first. A PC that cannot hold a tier gets "not run" for it, never 0:
 * a zero would read as a very slow computer when it is only a small card.
 */
export const RIG_TIERS: readonly RigTier[] = [
  { id: 'light', label: 'Light', model: 'llama3.2:3b', sizeGb: 2.0, minVramGb: 4 },
  { id: 'standard', label: 'Standard', model: 'qwen3:8b', sizeGb: 5.2, minVramGb: 8 },
  { id: 'heavy', label: 'Heavy', model: 'qwen3:14b', sizeGb: 9.3, minVramGb: 12 },
  { id: 'extreme', label: 'Extreme', model: 'qwen3:30b-a3b', sizeGb: 18, minVramGb: 24 },
];

/** The tier a score is headlined by: the one most computers that run local AI can hold. */
export const RIG_HEADLINE_TIER: RigTierId = 'standard';

/**
 * Anything that changes a speed lives here, and `version` moves when any of it
 * does. Scores with different versions are not set side by side.
 */
export const RIG_WORKLOAD = {
  version: 1,
  numCtx: 4096,
  /** Generation is capped, so every run decodes the same amount. */
  numPredict: 256,
  temperature: 0,
  seed: 1,
  /** A fixed passage, so prompt processing is measured on the same text. */
  promptTokensTarget: 1500,
  warmupRuns: 1,
  measuredRuns: 3,
} as const;

/** One timed question, as Ollama reports it. */
export type RigRun = {
  promptEvalCount: number;
  promptEvalSeconds: number;
  evalCount: number;
  evalSeconds: number;
  loadSeconds: number;
};

export type TierMeasure = {
  /** Prompt processing, tokens per second. */
  prefillTps: number;
  /** Generation, tokens per second. */
  decodeTps: number;
  loadSeconds: number;
  /** How many runs the medians came from. */
  runs: number;
};

const MIN_DECODED_TOKENS = 32;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Medians of the usable runs, or null when there are not enough to trust.
 *
 * A run that decoded almost nothing (the model stopped early, or answered with
 * an error) says nothing about speed, and a zero duration would divide by it.
 * The median is used so one slow run, a background task waking, does not move
 * the number.
 */
export function measureTier(runs: RigRun[], minRuns: number = RIG_WORKLOAD.measuredRuns): TierMeasure | null {
  const usable = runs.filter((run) => (
    run.evalCount >= MIN_DECODED_TOKENS && run.evalSeconds > 0
    && run.promptEvalCount > 0 && run.promptEvalSeconds > 0
  ));
  if (usable.length < minRuns) return null;
  return {
    prefillTps: median(usable.map((run) => run.promptEvalCount / run.promptEvalSeconds)),
    decodeTps: median(usable.map((run) => run.evalCount / run.evalSeconds)),
    loadSeconds: median(usable.map((run) => run.loadSeconds)),
    runs: usable.length,
  };
}

/** What 1000 points is, per tier: a machine measured once and written down. */
export type RigReference = { prefillTps: number; decodeTps: number };

/**
 * Points for one tier: 1000 at the reference, in proportion to how much faster.
 *
 * Both halves count, as a geometric mean, so a card that decodes quickly but
 * chews through a long prompt slowly is not hidden by either number. Twice as
 * fast at both is 2000, and twice as fast at one only is about 1414.
 */
export function tierPoints(measure: TierMeasure, reference: RigReference): number {
  const ratio = (measure.decodeTps / reference.decodeTps) * (measure.prefillTps / reference.prefillTps);
  return Math.round(1000 * Math.sqrt(ratio));
}

/** Everything that must match for two results to be set side by side. */
export type RigStamp = {
  tier: RigTierId;
  model: string;
  /** Content digest of the weights that ran. */
  modelDigest?: string;
  quantization?: string;
  workloadVersion: number;
  numCtx: number;
  ollamaVersion?: string;
  driverVersion?: string;
  gpu?: string;
  vramGb?: number;
  appVersion: string;
};

export type Comparability = {
  /** False when the numbers measure different things. */
  comparable: boolean;
  /** Why not, or what to keep in mind when it is. */
  notes: string[];
};

/**
 * Whether two results can be put in one table.
 *
 * Different weights, workload or context mean different work: not comparable.
 * A different Ollama or driver version is the same work on different software,
 * and speeds do move with it (a same-card re-run drifted 12 to 18 percent between
 * two days), so those are compared with the difference named beside them.
 */
export function compareStamps(a: RigStamp, b: RigStamp): Comparability {
  const blockers: string[] = [];
  const notes: string[] = [];

  if (a.workloadVersion !== b.workloadVersion) blockers.push('Measured with different versions of the test.');
  if (a.tier !== b.tier || a.model !== b.model) blockers.push('Different model tiers.');
  if (a.numCtx !== b.numCtx) blockers.push('Different context sizes.');
  if (a.modelDigest && b.modelDigest && a.modelDigest !== b.modelDigest) blockers.push('The model files differ.');
  if (!a.modelDigest || !b.modelDigest) notes.push('The model file could not be confirmed on one of them.');
  if (a.quantization && b.quantization && a.quantization !== b.quantization) blockers.push('Different quantization.');

  if (a.ollamaVersion && b.ollamaVersion && a.ollamaVersion !== b.ollamaVersion) {
    notes.push(`Ollama ${a.ollamaVersion} against ${b.ollamaVersion}.`);
  }
  if (a.driverVersion && b.driverVersion && a.driverVersion !== b.driverVersion) {
    notes.push(`Driver ${a.driverVersion} against ${b.driverVersion}.`);
  }

  return blockers.length
    ? { comparable: false, notes: blockers }
    : { comparable: true, notes };
}

/** The tiers a card can hold, so the screen offers only those and says so for the rest. */
export function tiersThatFit(vramGb: number, isUnifiedMemory = false): RigTier[] {
  if (isUnifiedMemory) return [...RIG_TIERS];
  return RIG_TIERS.filter((tier) => vramGb >= tier.minVramGb);
}

/** A tier's reference, with everything needed to check a result against it. */
export type RigReferenceRecord = RigReference & {
  /** The day it was measured, as YYYY-MM-DD. */
  measuredOn: string;
  gpu: string;
  vramGb: number;
  model: string;
  modelDigest: string;
  quantization: string;
  ollamaVersion: string;
  driverVersion: string;
  appVersion: string;
  workloadVersion: number;
  numCtx: number;
};

/** The machine that scores 1000: Dave's own, so the number is one anyone can check. */
export const RIG_REFERENCE_MACHINE = 'RTX 4070 12 GB on Ollama 0.35.1';

/**
 * 1000 points, per tier, measured once with RigMatch's own runner and written
 * down. A tier still null has not been measured, and the screen shows its raw
 * speeds with "points after the reference is measured" rather than a number
 * made up to fill the gap.
 *
 * Pending, and what measuring each needs:
 *  - Standard and Heavy: qwen3:8b (5.2 GB) and qwen3:14b (9.3 GB) installed on
 *    the reference machine.
 *  - Extreme: qwen3:30b-a3b (18 GB) on a card with 24 GB. The reference card has
 *    12, so this tier needs a second reference machine, or a decision to score
 *    it some other way.
 */
export const RIG_REFERENCES: Record<RigTierId, RigReferenceRecord | null> = {
  light: null,
  standard: null,
  heavy: null,
  extreme: null,
};

/** The reference as a stamp, so it is checked by the same rule as any two results. */
export function referenceStamp(tier: RigTierId, reference: RigReferenceRecord): RigStamp {
  return {
    tier,
    model: reference.model,
    modelDigest: reference.modelDigest,
    quantization: reference.quantization,
    workloadVersion: reference.workloadVersion,
    numCtx: reference.numCtx,
    ollamaVersion: reference.ollamaVersion,
    driverVersion: reference.driverVersion,
    gpu: reference.gpu,
    vramGb: reference.vramGb,
    appVersion: reference.appVersion,
  };
}

export type RigPoints =
  /** Points, with anything that differs from the reference named. */
  | { kind: 'points'; points: number; notes: string[] }
  /** The tier's reference has not been measured yet. */
  | { kind: 'pending' }
  /** Different weights, test or context from the reference: no points, and why. */
  | { kind: 'not-comparable'; notes: string[] };

/**
 * A result's points, only when it measured the same work as the reference.
 *
 * Points are a ratio to the reference, so a result on other weights (a tag
 * that moved), another test version or another context has no honest ratio.
 */
export function rigPoints(
  measure: TierMeasure,
  stamp: RigStamp,
  references: Record<RigTierId, RigReferenceRecord | null> = RIG_REFERENCES,
): RigPoints {
  const reference = references[stamp.tier];
  if (!reference) return { kind: 'pending' };
  const verdict = compareStamps(referenceStamp(stamp.tier, reference), stamp);
  if (!verdict.comparable) return { kind: 'not-comparable', notes: verdict.notes };
  return { kind: 'points', points: tierPoints(measure, reference), notes: verdict.notes };
}
