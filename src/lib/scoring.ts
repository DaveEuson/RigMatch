// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkResult, ScoreRigStamp, TestedModelScore } from '../types';
import { summarizeTaskScores } from './taskScores.ts';

/**
 * Bump when the meaning of a saved score changes (weights, signals, or scale).
 * Scores tagged with an older version are flagged "Retest recommended" and are
 * excluded from category picks so stale calibration cannot crown a winner.
 *
 * v5: the json questions moved out of the pooled "instructions" task group
 * into their own "tools" group. A v4 instructions score mixes two question
 * kinds a v5 one does not, so the two cannot be ranked against each other.
 */
export const CURRENT_SCORE_SCHEMA_VERSION = 5;

/**
 * Relative weights that make up the 0–100 Match Score. They sum to 1.0.
 *
 * NOTE: answer quality (`sobriety`) is the single largest weight, but it is
 * currently derived from heuristic/regex checks in the benchmark engine — treat
 * it as a directional proxy, not a ground-truth quality measurement.
 */
export const SCORE_WEIGHTS = {
  sobriety: 0.34,
  speed: 0.32,
  stability: 0.18,
  fit: 0.16,
} as const;

/**
 * What "best" means, when the reader disagrees with the default.
 *
 * "Which model is best" has no answer until someone says best at what: the
 * default blend puts answer quality two points above speed, which is a real
 * editorial choice the app was making silently. A 0.6B model that answers
 * instantly and badly and a 7B that answers slowly and well are both "best"
 * under some reading, and the reader knows which one they meant.
 *
 * This re-weights signals that are already stored, so switching costs nothing
 * and invalidates nothing — no re-run, and no schema bump, because the
 * measurements have not changed, only the summary of them. `balanced` is
 * exactly the historical weighting, so the default path is bit-for-bit what it
 * always was.
 *
 * Reliability and fit hold their share in every profile. Neither is what the
 * accuracy/speed argument is about, and letting them drift would turn a
 * two-way preference into a four-way one nobody asked for.
 */
export const SCORE_PRIORITIES = {
  balanced: { label: 'Balanced', weights: SCORE_WEIGHTS },
  accuracy: {
    label: 'Accuracy first',
    weights: { sobriety: 0.52, speed: 0.14, stability: 0.18, fit: 0.16 },
  },
  speed: {
    label: 'Speed first',
    weights: { sobriety: 0.14, speed: 0.52, stability: 0.18, fit: 0.16 },
  },
} as const;

export type ScorePriorityId = keyof typeof SCORE_PRIORITIES;

export const DEFAULT_SCORE_PRIORITY: ScorePriorityId = 'balanced';

export const SCORE_PRIORITY_STORAGE_KEY = 'rigmatch:score-priority:v1';

/** Unknown or absent stored values fall back to the historical weighting. */
export function readScorePriority(raw: string | null | undefined): ScorePriorityId {
  return raw && raw in SCORE_PRIORITIES ? raw as ScorePriorityId : DEFAULT_SCORE_PRIORITY;
}

/**
 * The canonical Match Score grade bands — the single source of truth for the
 * renderer. These MUST stay identical to `gradeFor()` in electron/main.cjs,
 * which grades real benchmark runs in the main process (a separate CommonJS
 * process that can't import this module). tests/scoring.test.mjs locks the
 * boundaries so the two can't drift silently.
 *
 * Note this is deliberately NOT the same scale as getAdvancedLabGrade() in
 * labResults.ts, which grades skill tests — a different measurement.
 */
export const MATCH_GRADE_BANDS = [
  { grade: 'S', min: 95 },
  { grade: 'A', min: 88 },
  { grade: 'B+', min: 80 },
  { grade: 'B', min: 72 },
  { grade: 'C', min: 64 },
  { grade: 'D', min: 0 },
] as const;

/** Letter grade for a 0–100 Match Score, using the canonical bands above. */
export function gradeForMatchScore(total: number): string {
  const band = MATCH_GRADE_BANDS.find((entry) => total >= entry.min);
  return band ? band.grade : 'D';
}

/** Minimal shape needed to rank a model: the four signals plus optional cached fields. */
export type MatchScoreLike = Pick<TestedModelScore, 'speed' | 'sobriety' | 'fit' | 'total'> & {
  stability?: number;
  preciseTotal?: number;
};

/**
 * One-decimal weighted Match value used for ranking and tie-breaks. When a
 * score predates the `stability` signal, it falls back to the rounded `total`.
 */
export function calculatePreciseTotal(
  score: MatchScoreLike,
  priority: ScorePriorityId = DEFAULT_SCORE_PRIORITY,
): number {
  const weights = SCORE_PRIORITIES[priority].weights;
  const stability = typeof score.stability === 'number' ? score.stability : score.total;
  const weighted =
    score.sobriety * weights.sobriety +
    score.speed * weights.speed +
    stability * weights.stability +
    score.fit * weights.fit;
  return Number(weighted.toFixed(1));
}

/**
 * Re-summarise saved scores under a chosen priority.
 *
 * Applied once where scores are loaded rather than threaded through the
 * thirty-seven places that render or rank a Match. Every one of those reads
 * `preciseTotal`, `total` or `grade`, so rewriting the three here means they
 * cannot disagree with each other — which is the failure mode a per-call-site
 * parameter invites: one list re-ranked, one number beside it still balanced.
 *
 * The four measured signals are untouched. `speed` still means what it always
 * did; only the headline that summarises them moves.
 */
export function applyScorePriority<T extends MatchScoreLike & { grade?: string }>(
  scores: Record<string, T>,
  priority: ScorePriorityId,
): Record<string, T> {
  if (priority === DEFAULT_SCORE_PRIORITY) return scores;
  const out: Record<string, T> = {};
  for (const [key, score] of Object.entries(scores)) {
    const preciseTotal = calculatePreciseTotal(score, priority);
    const total = Math.round(preciseTotal);
    out[key] = { ...score, preciseTotal, total, grade: gradeForMatchScore(total) };
  }
  return out;
}

/** Convert a completed benchmark run into the persisted per-model score shape. */
export function toTestedModelScore(
  result: BenchmarkResult,
  suiteName?: string,
  rig?: ScoreRigStamp,
): TestedModelScore {
  return {
    model: result.model,
    total: result.scores.total,
    grade: result.scores.grade,
    speed: result.scores.speed,
    sobriety: result.scores.sobriety,
    stability: result.scores.stability,
    fit: result.scores.fit,
    completedAt: result.completedAt,
    suiteName,
    preciseTotal: calculatePreciseTotal(result.scores),
    scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
    tokensPerSecond: result.avgTokensPerSecond,
    taskScores: summarizeTaskScores(result.prompts),
    rig,
  };
}

/** Merge new benchmark results into an existing model-score map (last write wins per model). */
export function upsertModelScores(
  current: Record<string, TestedModelScore>,
  results: BenchmarkResult[],
  suiteName?: string,
  rigForModel?: (model: string) => ScoreRigStamp | undefined,
): Record<string, TestedModelScore> {
  return results.reduce<Record<string, TestedModelScore>>((next, result) => {
    const score = toTestedModelScore(result, suiteName, rigForModel?.(result.model));
    next[score.model] = score;
    return next;
  }, { ...current });
}

/**
 * How a saved score has drifted from what is in front of the user now.
 *
 * 'model-changed' is the strongest claim — the digest proves the weights under
 * this tag are not the weights that earned the number. 'hardware-changed'
 * means the GPU or its VRAM differs from the stamp; scores are relative to a
 * rig, so the number describes a computer that is no longer this one. A score
 * with no stamp predates stamping and can claim neither — the schema-version
 * badge already covers genuinely old scores.
 */
export type ScoreDrift = 'model-changed' | 'hardware-changed' | 'measured-elsewhere' | null;

export function scoreDrift(
  score: TestedModelScore,
  current: { gpuModel?: string; vramGb?: number; modelDigest?: string },
): ScoreDrift {
  const stamp = score.rig;
  if (!stamp) return null;
  // Measured on another computer, so nothing here describes the machine the
  // user is looking at. Reported first: it explains the score more completely
  // than a changed digest would, and there is no card to compare against.
  if (stamp.host) return 'measured-elsewhere';
  if (stamp.modelDigest && current.modelDigest && stamp.modelDigest !== current.modelDigest) {
    return 'model-changed';
  }
  if (current.gpuModel && stamp.gpu && current.gpuModel !== stamp.gpu) {
    return 'hardware-changed';
  }
  // VRAM shifts of a whole gigabyte mean a different card or a different
  // sharing arrangement, not measurement jitter in the profiler.
  if (typeof current.vramGb === 'number' && current.vramGb > 0
    && typeof stamp.vramGb === 'number'
    && Math.abs(current.vramGb - stamp.vramGb) >= 1) {
    return 'hardware-changed';
  }
  return null;
}

/** The badge line for a drifted score, in words a user can act on. */
export function scoreDriftLabel(drift: Exclude<ScoreDrift, null>): string {
  if (drift === 'model-changed') return 'Model updated since this score — retest';
  if (drift === 'measured-elsewhere') return 'Measured on another computer — retest here';
  return 'Scored on different hardware — retest';
}

/** True when a saved score was produced by an older scoring schema. */
export function isLegacyScore(score: TestedModelScore): boolean {
  return score.scoreSchemaVersion !== CURRENT_SCORE_SCHEMA_VERSION;
}

/** Prefer the cached precise total when present, otherwise compute it on the fly. */
export function getScoreSortTotal(score: MatchScoreLike): number {
  return typeof score.preciseTotal === 'number' ? score.preciseTotal : calculatePreciseTotal(score);
}

/**
 * The one way to render a Match score: always one decimal.
 *
 * This used to switch formats — one decimal when the precise value differed from
 * the integer by >= 0.05, the bare integer otherwise — so a single function
 * produced "92" and "92.7" depending on the model, and the same score appeared
 * as 92, 92.7, 93 and 93.1 across the lineup card, header, table and Scorecards.
 * A benchmarking tool that rounds away its own tie-breaker reads as careless, so
 * the decimal is always shown, even when it is ".0".
 */
export function formatMatchScore(score: MatchScoreLike): string {
  const precise = getScoreSortTotal(score);
  // Defensive: a Match score is 0-100 by contract (main.cjs clamps it), but a
  // corrupt or hand-edited saved score must never render as "NaN" or "320254.0"
  // next to a confident letter grade. "--" is what the score pill already shows
  // for an untested model, so an unreadable score reads as "no number", not as
  // a number that happens to be wrong.
  if (!Number.isFinite(precise)) return '--';
  return Math.min(100, Math.max(0, precise)).toFixed(1);
}

/**
 * Ranking comparator: returns a negative number when `left` ranks ahead of
 * `right`, so `array.sort(compareTestedModelScores)` puts the best model first.
 *
 * Order of precedence:
 *  1. Current-schema scores rank ahead of legacy ones.
 *  2. One-decimal precise Match value (compared directly, any non-zero gap).
 *  3. Integer total, then answer quality, stability, fit, speed.
 *  4. Model name (alphabetical) as a final deterministic tie-break.
 */
export function compareTestedModelScores(left: TestedModelScore, right: TestedModelScore): number {
  const leftLegacy = isLegacyScore(left);
  const rightLegacy = isLegacyScore(right);
  if (leftLegacy !== rightLegacy) return leftLegacy ? 1 : -1;

  // Compare the precise total directly. A previous ">= 0.05 band" here made the
  // comparator intransitive (A~B and B~C tie, but A vs C flips), so sort order
  // depended on input arrangement. preciseTotal is already rounded to 1dp, so a
  // direct compare is stable; exact ties fall through to the chain below.
  const preciseDelta = getScoreSortTotal(right) - getScoreSortTotal(left);
  if (preciseDelta !== 0) return preciseDelta;
  if (right.total !== left.total) return right.total - left.total;
  if (right.sobriety !== left.sobriety) return right.sobriety - left.sobriety;
  if ((right.stability ?? right.total) !== (left.stability ?? left.total)) return (right.stability ?? right.total) - (left.stability ?? left.total);
  if (right.fit !== left.fit) return right.fit - left.fit;
  if (right.speed !== left.speed) return right.speed - left.speed;
  return left.model.localeCompare(right.model);
}

/** Same ranking as {@link compareTestedModelScores}, but for raw benchmark results. */
export function compareBenchmarkResults(left: BenchmarkResult, right: BenchmarkResult): number {
  return compareTestedModelScores(toTestedModelScore(left), toTestedModelScore(right));
}
