// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * How long a run will take, before the user commits to it.
 *
 * Unexplained waits are where beginners quit: a video render can be twelve
 * seconds or several minutes depending on the card, and Speed Dating five
 * models through twenty questions is real time that nothing warned about.
 * Every estimate declares its source, on the same rule as hardware
 * expectations — 'measured' comes from real runs recorded on this rig, and
 * anything else is a rule of thumb presented as one, never as a finding.
 *
 * The data was already here: run history keeps elapsedMs, questionCount, and
 * a hardware snapshot per run. Estimating is a read, not new bookkeeping.
 */

import { normalizeModelKey } from './modelKey.ts';
import { sameHardware, type RunHardware, type RunHistory } from './runHistory.ts';

export type RunEstimate = {
  ms: number;
  source: 'measured' | 'heuristic';
  /** How many past runs on this rig back the number. Zero for heuristics. */
  sampleCount: number;
};

/**
 * Rule of thumb for an unmeasured rig: each question runs three times for
 * stability, and a mid-size model on a mid-size card answers in a few seconds.
 * The demo's reference run (97s for 10 questions) sits right on this line.
 */
const HEURISTIC_MS_PER_QUESTION = 10_000;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Expected duration for one model's benchmark at the given question count.
 *
 * Prefers the model's own history on this hardware, falls back to any model's
 * history on this hardware — a rig's general pace is still real data — and
 * only then to the rule of thumb. Runs from different hardware are excluded
 * outright; a laptop's pace says nothing about the desktop it moved to.
 */
export function estimateBenchmarkMs(
  history: RunHistory | null | undefined,
  opts: { model?: string; questionCount: number; hardware?: RunHardware },
): RunEstimate {
  const perQuestionRates = (runs: Array<{ elapsedMs: number; questionCount: number; hardware?: RunHardware }>) =>
    runs
      .filter((run) => run.elapsedMs > 0 && run.questionCount > 0 && sameHardware(run.hardware, opts.hardware))
      .map((run) => run.elapsedMs / run.questionCount);

  const allRuns = history ? Object.entries(history.runs) : [];
  const modelKey = opts.model ? normalizeModelKey(opts.model) : '';
  const ownRuns = modelKey
    ? allRuns.filter(([key]) => key === modelKey).flatMap(([, runs]) => runs)
    : [];
  const own = perQuestionRates(ownRuns);
  if (own.length > 0) {
    return { ms: median(own) * opts.questionCount, source: 'measured', sampleCount: own.length };
  }

  const any = perQuestionRates(allRuns.flatMap(([, runs]) => runs));
  if (any.length > 0) {
    return { ms: median(any) * opts.questionCount, source: 'measured', sampleCount: any.length };
  }

  return { ms: HEURISTIC_MS_PER_QUESTION * opts.questionCount, source: 'heuristic', sampleCount: 0 };
}

/** Speed Dating is the single-model estimate repeated per contestant. */
export function estimateSpeedDateMs(
  history: RunHistory | null | undefined,
  opts: { models: string[]; questionCount: number; hardware?: RunHardware },
): RunEstimate {
  const each = opts.models.map((model) =>
    estimateBenchmarkMs(history, { model, questionCount: opts.questionCount, hardware: opts.hardware }));
  const total = each.reduce((sum, estimate) => sum + estimate.ms, 0);
  return {
    ms: total,
    source: each.every((estimate) => estimate.source === 'measured') && each.length > 0 ? 'measured' : 'heuristic',
    sampleCount: each.reduce((sum, estimate) => sum + estimate.sampleCount, 0),
  };
}

/**
 * "~40s", "~2 min", "~15 min" — deliberately coarse. An estimate shown to the
 * half-second would read as a promise, and these are forecasts.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 57_500) return `~${Math.max(5, Math.round(ms / 5000) * 5)}s`;
  const minutes = ms / 60_000;
  if (minutes < 9.75) return `~${Math.max(1, Math.round(minutes))} min`;
  return `~${Math.round(minutes / 5) * 5} min`;
}

/** The full sentence for a run dialog, source included. */
export function estimateLine(estimate: RunEstimate): string {
  const duration = formatDuration(estimate.ms);
  if (!duration) return '';
  return estimate.source === 'measured'
    ? `Expect about ${duration.replace('~', '')}, going by past runs on this rig.`
    : `Expect roughly ${duration.replace('~', '')} — a rule of thumb until this rig's first run measures it.`;
}
