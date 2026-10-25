// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Past RigScore runs on this PC, and which of them can be set side by side.
 *
 * Kept in this computer's storage under the app's namespace, so Clear Data
 * removes them with everything else. Two runs are compared only when they
 * measured the same work: the same weights, test version and context
 * (compareStamps). A new Ollama or driver is the same work on new software, so
 * those are compared with the difference named, because that is often exactly
 * what someone wants to know: did the update make it faster.
 */
import { RIG_TIERS, compareStamps, type RigStamp, type RigTierId, type TierMeasure } from './rigScore.ts';
import type { RigResult } from './rigScoreRun.ts';
import { writeLocalJson } from './safeStorage.ts';

export const RIG_HISTORY_KEY = 'rigmatch:rigscore-history:v1';
/** A few results a tier a week for a year would still fit; the oldest go first. */
export const RIG_HISTORY_LIMIT = 60;

const TIER_IDS = new Set<string>(RIG_TIERS.map((tier) => tier.id));
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function isMeasure(value: unknown): value is TierMeasure {
  return isRecord(value) && isPositive(value.prefillTps) && isPositive(value.decodeTps)
    && typeof value.loadSeconds === 'number' && Number.isFinite(value.loadSeconds) && isPositive(value.runs);
}

function isStamp(value: unknown): value is RigStamp {
  return isRecord(value) && typeof value.tier === 'string' && TIER_IDS.has(value.tier)
    && typeof value.model === 'string' && typeof value.appVersion === 'string'
    && typeof value.workloadVersion === 'number' && typeof value.numCtx === 'number';
}

/** One saved entry, checked: a bad one is dropped, never the whole history. */
export function isRigResult(value: unknown): value is RigResult {
  return isRecord(value) && typeof value.id === 'string' && typeof value.completedAt === 'string'
    && typeof value.tier === 'string' && TIER_IDS.has(value.tier)
    && isMeasure(value.measure) && isStamp(value.stamp) && value.stamp.tier === value.tier;
}

const newestFirst = (a: RigResult, b: RigResult) => b.completedAt.localeCompare(a.completedAt);

export function parseRigHistory(raw: unknown): RigResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRigResult).sort(newestFirst);
}

/** The history with a new result at the top, capped. */
export function addRigResult(history: RigResult[], result: RigResult, limit = RIG_HISTORY_LIMIT): RigResult[] {
  return [result, ...history.filter((entry) => entry.id !== result.id)].sort(newestFirst).slice(0, limit);
}

export function readRigHistory(): RigResult[] {
  try {
    const text = window.localStorage.getItem(RIG_HISTORY_KEY);
    return text ? parseRigHistory(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function saveRigHistory(history: RigResult[]): boolean {
  return writeLocalJson(RIG_HISTORY_KEY, history);
}

/** The newest result of each tier. */
export function latestByTier(history: RigResult[]): Partial<Record<RigTierId, RigResult>> {
  const latest: Partial<Record<RigTierId, RigResult>> = {};
  for (const result of [...history].sort(newestFirst)) latest[result.tier] ??= result;
  return latest;
}

/**
 * How much faster `later` is than `earlier`, in percent, combined as the
 * points are: the geometric mean of the two speed ratios, so a gain at one
 * half cannot hide a loss at the other.
 */
export function speedChange(earlier: TierMeasure, later: TierMeasure): number {
  const ratio = Math.sqrt((later.decodeTps / earlier.decodeTps) * (later.prefillTps / earlier.prefillTps));
  return (ratio - 1) * 100;
}

export type RigComparison =
  | { comparable: true; changePct: number; notes: string[] }
  | { comparable: false; notes: string[] };

export function compareResults(earlier: RigResult, later: RigResult): RigComparison {
  const verdict = compareStamps(earlier.stamp, later.stamp);
  if (!verdict.comparable) return { comparable: false, notes: verdict.notes };
  return { comparable: true, changePct: speedChange(earlier.measure, later.measure), notes: verdict.notes };
}

export type RigHistoryRow = {
  result: RigResult;
  /** The newest of its tier, which the others are compared with. */
  latest: boolean;
  /** How the newest run of the tier compares with this one; null on the newest itself. */
  sinceThen: RigComparison | null;
};

/** Newest first, each older run compared with the newest run of its tier. */
export function historyRows(history: RigResult[]): RigHistoryRow[] {
  const latest = latestByTier(history);
  return [...history].sort(newestFirst).map((result) => {
    const newest = latest[result.tier];
    const isLatest = newest?.id === result.id;
    return { result, latest: isLatest, sinceThen: isLatest || !newest ? null : compareResults(result, newest) };
  });
}

/** "4% faster", "2% slower", or "No change" inside half a percent. */
export function describeChange(changePct: number): string {
  const rounded = Math.round(changePct);
  if (rounded === 0) return 'No change';
  return rounded > 0 ? `${rounded}% faster` : `${Math.abs(rounded)}% slower`;
}
