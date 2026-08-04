import type { BenchmarkResult, TestedModelScore } from '../types';

/**
 * Bump when the meaning of a saved score changes (weights, signals, or scale).
 * Scores tagged with an older version are flagged "Retest recommended" and are
 * excluded from category picks so stale calibration cannot crown a winner.
 */
export const CURRENT_SCORE_SCHEMA_VERSION = 4;

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
export function calculatePreciseTotal(score: MatchScoreLike): number {
  const stability = typeof score.stability === 'number' ? score.stability : score.total;
  const weighted =
    score.sobriety * SCORE_WEIGHTS.sobriety +
    score.speed * SCORE_WEIGHTS.speed +
    stability * SCORE_WEIGHTS.stability +
    score.fit * SCORE_WEIGHTS.fit;
  return Number(weighted.toFixed(1));
}

/** Convert a completed benchmark run into the persisted per-model score shape. */
export function toTestedModelScore(result: BenchmarkResult, suiteName?: string): TestedModelScore {
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
  };
}

/** Merge new benchmark results into an existing model-score map (last write wins per model). */
export function upsertModelScores(
  current: Record<string, TestedModelScore>,
  results: BenchmarkResult[],
  suiteName?: string,
): Record<string, TestedModelScore> {
  return results.reduce<Record<string, TestedModelScore>>((next, result) => {
    const score = toTestedModelScore(result, suiteName);
    next[score.model] = score;
    return next;
  }, { ...current });
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
