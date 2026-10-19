// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { isBenchmarkResult, isPlaceholderBenchmark, isTestedModelScore, keepValidEntries, upsertBenchmarkResults } from './modelCatalog.ts';
import { upsertModelScores } from './scoring.ts';
import type { BenchmarkResult, TestedModelScore } from '../types';

export type SavedScores = {
  benchmark: BenchmarkResult | null;
  benchmarkByModel: Record<string, BenchmarkResult>;
  modelScores: Record<string, TestedModelScore>;
};

/**
 * The scores in a saved history, or null when it holds none.
 *
 * A benchmark with no questions is the empty stand-in the screen shows after
 * "Clear all scores" or "Clear all data". It was saved like a result, and on
 * the next launch it was turned back into one: a 0.0 / N/A score that read as
 * tested, could be crowned Top Match, and was offered for deletion at close.
 */
export function restoreSavedScores(parsed: { benchmark?: unknown; benchmarkByModel?: unknown; modelScores?: unknown }): SavedScores | null {
  // Per entry: one bad row used to discard every saved score, and the next
  // save wrote the empty state over the file.
  const withPrompts = (result: BenchmarkResult): BenchmarkResult => (
    Array.isArray(result.prompts) ? result : { ...result, prompts: [] }
  );
  const isResult = (value: unknown): value is BenchmarkResult => isBenchmarkResult(value) && !isPlaceholderBenchmark(withPrompts(value));
  const benchmark = isResult(parsed.benchmark) ? withPrompts(parsed.benchmark) : null;
  const keptByModel = keepValidEntries(parsed.benchmarkByModel, isResult);
  const keptScores = keepValidEntries(parsed.modelScores, isTestedModelScore);
  const hasByModel = keptByModel !== null && Object.keys(keptByModel).length > 0;
  const hasScores = keptScores !== null && Object.keys(keptScores).length > 0;
  // Nothing usable saved (no benchmark, no per-model results, no scores) — ignore.
  if (!benchmark && !hasByModel && !hasScores) return null;

  const benchmarkByModel = hasByModel
    ? upsertBenchmarkResults({}, Object.values(keptByModel as Record<string, BenchmarkResult>).map(withPrompts))
    : benchmark ? upsertBenchmarkResults({}, [benchmark]) : {};
  const modelScores = hasScores
    ? (keptScores as Record<string, TestedModelScore>)
    : upsertModelScores({}, Object.values(benchmarkByModel));
  return { benchmark, benchmarkByModel, modelScores };
}
