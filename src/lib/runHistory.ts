/**
 * Append-only run history: the timeline of every benchmark a model has ever
 * completed on this machine.
 *
 * Before this, `upsertBenchmarkResults` kept exactly one BenchmarkResult per
 * model (modelCatalog.ts) — re-testing a model destroyed the previous result,
 * which is precisely when comparing them is interesting. That store still
 * exists and still holds the *latest* full result (transcripts included); this
 * one keeps the compact score-only trail behind it.
 *
 * Entries are deliberately small. A BenchmarkResult carries every prompt and
 * full response text, so keeping whole results per run would exhaust the ~5MB
 * localStorage quota within a few sessions. A RunHistoryEntry stores scores,
 * timing, and a hardware fingerprint — enough to plot a trend and explain a
 * jump — and nothing else.
 *
 * Pure + browser storage only, no React. Mirrors labResults.ts.
 */

import { normalizeModelKey } from './modelKey.ts';
import type { BenchmarkResult, SystemProfile, TestedModelScore } from '../types';

/**
 * Declared here rather than in appConfig so this module stays a leaf that Node
 * can import directly in tests (appConfig pulls in lucide icons). appConfig
 * re-exports it, so the storage-key registry is still complete.
 */
export const RUN_HISTORY_STORAGE_KEY = 'rigmatch:run-history:v1';

/** Bumped only on a breaking shape change; readRunHistory drops mismatches. */
export const RUN_HISTORY_SCHEMA_VERSION = 1;

/** Runs kept per model. Ten points is plenty for a trend line. */
export const MAX_RUNS_PER_MODEL = 25;

/** Total runs kept across all models, oldest pruned first. */
export const MAX_RUNS_TOTAL = 200;

/**
 * The hardware a run happened on, flattened to the few fields that actually
 * move a score. Undefined when the system was never scanned — a missing
 * snapshot must never be confused with "ran on unknown hardware".
 */
export type RunHardware = {
  gpu: string;
  vramGb: number;
  ramGb: number;
  cpu: string;
  os: string;
};

/** One completed benchmark, reduced to what a trend needs. */
export type RunHistoryEntry = {
  model: string;
  completedAt: string;
  total: number;
  preciseTotal?: number;
  grade: string;
  speed: number;
  sobriety: number;
  stability: number;
  fit: number;
  questionCount: number;
  elapsedMs: number;
  avgTokensPerSecond?: number;
  suiteName?: string;
  scoreSchemaVersion?: number;
  hardware?: RunHardware;
};

export type RunHistory = {
  version: number;
  /** Normalized model key -> runs, oldest first. */
  runs: Record<string, RunHistoryEntry[]>;
};

export function emptyRunHistory(): RunHistory {
  return { version: RUN_HISTORY_SCHEMA_VERSION, runs: {} };
}

/**
 * A hardware snapshot, or undefined when the profile is the neutral
 * "not scanned yet" placeholder. Recording placeholder hardware as fact is the
 * same class of bug as showing sample scores on desktop.
 */
export function toRunHardware(system: SystemProfile | null | undefined): RunHardware | undefined {
  if (!system) return undefined;
  const gpu = system.gpu?.model?.trim() ?? '';
  const cpu = system.cpu?.brand?.trim() ?? '';
  const ramGb = Number(system.memory?.totalGb ?? 0);
  // An unscanned profile has no GPU/CPU strings and no memory reading.
  if (!gpu && !cpu && !ramGb) return undefined;
  return {
    gpu,
    vramGb: Number(system.gpu?.vramGb ?? 0),
    ramGb,
    cpu,
    os: [system.os?.distro, system.os?.release].filter(Boolean).join(' ').trim(),
  };
}

/** Two runs are on "the same rig" when GPU, VRAM, and RAM all match. */
export function sameHardware(a: RunHardware | undefined, b: RunHardware | undefined): boolean {
  if (!a || !b) return true; // Unknown provenance: never claim a hardware change.
  return a.gpu === b.gpu && a.vramGb === b.vramGb && a.ramGb === b.ramGb;
}

export function toRunHistoryEntry(
  result: BenchmarkResult,
  options: { system?: SystemProfile | null; suiteName?: string; preciseTotal?: number; scoreSchemaVersion?: number } = {},
): RunHistoryEntry {
  const hardware = toRunHardware(options.system);
  return {
    model: result.model,
    completedAt: result.completedAt,
    total: result.scores.total,
    preciseTotal: options.preciseTotal,
    grade: result.scores.grade,
    speed: result.scores.speed,
    sobriety: result.scores.sobriety,
    stability: result.scores.stability,
    fit: result.scores.fit,
    questionCount: result.questionCount,
    elapsedMs: result.elapsedMs,
    avgTokensPerSecond: result.avgTokensPerSecond,
    suiteName: options.suiteName,
    scoreSchemaVersion: options.scoreSchemaVersion,
    ...(hardware ? { hardware } : {}),
  };
}

/** Oldest first, so a trend line reads left to right. */
function byCompletedAt(a: RunHistoryEntry, b: RunHistoryEntry) {
  return Date.parse(a.completedAt || '') - Date.parse(b.completedAt || '');
}

/**
 * Append runs, newest last, pruning per model and then globally.
 * Re-appending an identical run (same model + completedAt) is a no-op, so a
 * re-render or a double save can't inflate the timeline.
 */
export function appendRuns(history: RunHistory, entries: RunHistoryEntry[]): RunHistory {
  if (!entries.length) return history;
  const runs: Record<string, RunHistoryEntry[]> = { ...history.runs };

  for (const entry of entries) {
    const key = normalizeModelKey(entry.model);
    if (!key) continue;
    const existing = runs[key] ?? [];
    if (existing.some((run) => run.completedAt === entry.completedAt)) continue;
    runs[key] = [...existing, entry].sort(byCompletedAt).slice(-MAX_RUNS_PER_MODEL);
  }

  return pruneToTotal({ version: RUN_HISTORY_SCHEMA_VERSION, runs });
}

/**
 * Enforce the global cap by dropping the oldest runs across all models. A model
 * always keeps its most recent run, so nothing disappears from the table just
 * because another model was tested a lot.
 */
export function pruneToTotal(history: RunHistory, max = MAX_RUNS_TOTAL): RunHistory {
  const all: Array<{ key: string; entry: RunHistoryEntry }> = [];
  for (const [key, entries] of Object.entries(history.runs)) {
    for (const entry of entries) all.push({ key, entry });
  }
  if (all.length <= max) return history;

  const newestPerModel = new Map<string, string>();
  for (const [key, entries] of Object.entries(history.runs)) {
    const newest = entries[entries.length - 1];
    if (newest) newestPerModel.set(key, newest.completedAt);
  }

  const protectedRun = (key: string, entry: RunHistoryEntry) => newestPerModel.get(key) === entry.completedAt;
  const droppable = all.filter(({ key, entry }) => !protectedRun(key, entry)).sort((a, b) => byCompletedAt(a.entry, b.entry));
  const dropCount = Math.min(all.length - max, droppable.length);
  const dropped = new Set(droppable.slice(0, dropCount).map(({ key, entry }) => `${key}@${entry.completedAt}`));

  const runs: Record<string, RunHistoryEntry[]> = {};
  for (const [key, entries] of Object.entries(history.runs)) {
    const kept = entries.filter((entry) => !dropped.has(`${key}@${entry.completedAt}`));
    if (kept.length) runs[key] = kept;
  }
  return { version: RUN_HISTORY_SCHEMA_VERSION, runs };
}

/**
 * Drop every run for the given models. Used when a model's scores are cleared
 * or the model is uninstalled — leaving the timeline behind would let a later
 * run report a delta against a score the user believed was deleted.
 * Takes aliases because one model can be referred to by several names.
 */
export function removeRuns(history: RunHistory, models: string[]): RunHistory {
  const keys = new Set(models.map(normalizeModelKey).filter(Boolean));
  if (!keys.size) return history;
  const runs: Record<string, RunHistoryEntry[]> = {};
  let changed = false;
  for (const [key, entries] of Object.entries(history.runs)) {
    if (keys.has(key)) { changed = true; continue; }
    runs[key] = entries;
  }
  return changed ? { version: RUN_HISTORY_SCHEMA_VERSION, runs } : history;
}

export function getModelRuns(history: RunHistory, model: string): RunHistoryEntry[] {
  return history.runs[normalizeModelKey(model)] ?? [];
}

/** Score-only trail per model, oldest first — what the sparklines want. */
export function getScoreTrend(history: RunHistory): Record<string, number[]> {
  const trend: Record<string, number[]> = {};
  for (const entries of Object.values(history.runs)) {
    const model = entries[entries.length - 1]?.model;
    if (!model) continue;
    trend[model] = entries.map((entry) => entry.total);
  }
  return trend;
}

export type RunDelta = {
  model: string;
  latest: RunHistoryEntry;
  previous: RunHistoryEntry;
  /** Positive = improved. Uses preciseTotal when both runs have it. */
  points: number;
  /** True when the two runs were measured on different hardware. */
  hardwareChanged: boolean;
};

/**
 * Latest vs. the run before it, or null when there is nothing to compare.
 * Only comparable runs count: a different question count or a different
 * scoring schema means the two numbers were not produced the same way.
 */
export function getRunDelta(history: RunHistory, model: string): RunDelta | null {
  const runs = getModelRuns(history, model);
  if (runs.length < 2) return null;
  const latest = runs[runs.length - 1];

  for (let i = runs.length - 2; i >= 0; i -= 1) {
    const previous = runs[i];
    if (previous.questionCount !== latest.questionCount) continue;
    if ((previous.scoreSchemaVersion ?? 0) !== (latest.scoreSchemaVersion ?? 0)) continue;

    const usePrecise = typeof latest.preciseTotal === 'number' && typeof previous.preciseTotal === 'number';
    const points = usePrecise
      ? Number(((latest.preciseTotal as number) - (previous.preciseTotal as number)).toFixed(1))
      : latest.total - previous.total;

    return { model: latest.model, latest, previous, points, hardwareChanged: !sameHardware(previous.hardware, latest.hardware) };
  }
  return null;
}

/** Every model that has a comparable delta, keyed by the model's own name. */
export function getAllRunDeltas(history: RunHistory): Record<string, RunDelta> {
  const deltas: Record<string, RunDelta> = {};
  for (const entries of Object.values(history.runs)) {
    const model = entries[entries.length - 1]?.model;
    if (!model) continue;
    const delta = getRunDelta(history, model);
    if (delta) deltas[model] = delta;
  }
  return deltas;
}

const DAY_MS = 86_400_000;

/** "5 weeks ago" — vague on purpose; the exact timestamp is in the tooltip. */
export function describeElapsed(fromIso: string, now: number): string {
  const then = Date.parse(fromIso || '');
  if (!Number.isFinite(then)) return 'earlier';
  const days = Math.floor((now - then) / DAY_MS);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

export type RunDeltaLabel = {
  direction: 'up' | 'down' | 'flat';
  /** "+7", "−3", "0" — uses a real minus sign, not a hyphen. */
  points: string;
  /** "vs. 5 weeks ago" */
  detail: string;
  /** Set only when the two runs were measured on different hardware. */
  hardwareNote?: string;
};

/**
 * Turn a delta into display text. Deliberately does NOT claim the hardware
 * caused the change — only that the rig differed, because a re-test also picks
 * up driver, model, and Ollama version changes.
 */
export function formatRunDelta(delta: RunDelta, now = Date.now()): RunDeltaLabel {
  const direction = delta.points > 0 ? 'up' : delta.points < 0 ? 'down' : 'flat';
  const magnitude = Math.abs(delta.points);
  const points = direction === 'flat' ? '0' : `${direction === 'up' ? '+' : '−'}${magnitude}`;
  return {
    direction,
    points,
    detail: `vs. ${describeElapsed(delta.previous.completedAt, now)}`,
    ...(delta.hardwareChanged ? { hardwareNote: 'Different hardware since that run' } : {}),
  };
}

export function readRunHistory(): RunHistory {
  if (typeof window === 'undefined') return emptyRunHistory();
  try {
    const raw = window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    if (!raw) return emptyRunHistory();
    const parsed = JSON.parse(raw) as RunHistory;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== RUN_HISTORY_SCHEMA_VERSION) return emptyRunHistory();
    if (!parsed.runs || typeof parsed.runs !== 'object') return emptyRunHistory();
    return parsed;
  } catch {
    return emptyRunHistory();
  }
}

export function writeRunHistory(history: RunHistory) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Quota or unavailable storage: prune hard and retry once rather than
    // losing the whole timeline.
    try {
      window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(pruneToTotal(history, Math.floor(MAX_RUNS_TOTAL / 4))));
    } catch {
      // Storage genuinely unavailable (preview contexts) — history is optional.
    }
  }
}

/**
 * Seed the timeline from the pre-0.3.8 single-slot store so upgrading users
 * keep their existing results instead of watching them vanish. Each model
 * contributes its one saved result as the first point in its trend.
 */
export function seedFromBenchmarkResults(
  history: RunHistory,
  benchmarkByModel: Record<string, BenchmarkResult>,
  scores: Record<string, TestedModelScore> = {},
): RunHistory {
  const entries: RunHistoryEntry[] = [];
  for (const result of Object.values(benchmarkByModel ?? {})) {
    if (!result?.model || !result.completedAt || !result.scores) continue;
    const score = scores[normalizeModelKey(result.model)];
    entries.push(
      toRunHistoryEntry(result, {
        suiteName: score?.suiteName,
        preciseTotal: score?.preciseTotal,
        scoreSchemaVersion: score?.scoreSchemaVersion,
      }),
    );
  }
  return appendRuns(history, entries);
}
