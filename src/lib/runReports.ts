// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkResult, TestedModelScore } from '../types';

/**
 * Comparisons, kept as events you can reopen.
 *
 * Nothing in the app recorded a run as a thing that happened. RunHistory is
 * keyed per model — "reduced to what a trend needs" — so it knows qwen scored
 * 92 on Tuesday and has no idea that two other models sat the same exam beside
 * it. And benchmarkByModel holds only the most recent result per model, so the
 * moment a second comparison runs, the first one's answers are gone.
 *
 * A list built from those could say "3 models, Aug 31" and be unable to show
 * how any of them answered, which is the only reason to open it.
 *
 * So reports get their own store, capped, newest first. The cap is not
 * tidiness: transcripts are the bulky part of this app's saved state, and
 * safeStorage already drops answer text first when the browser runs out of
 * room. Keeping every run forever would push that day closer for everyone.
 */

export const RUN_REPORTS_STORAGE_KEY = 'rigmatch:run-reports:v1';

/**
 * Five is enough to answer "what did I try last week" and few enough that the
 * transcripts stay a rounding error next to the rest of the saved state.
 */
export const MAX_STORED_REPORTS = 5;

export type StoredRunReport = {
  /** Stable across reloads: one comparison finished at one instant. */
  id: string;
  completedAt: string;
  winner: string;
  results: TestedModelScore[];
  questionCount: number;
  suiteName?: string;
  /**
   * Per-model answers. Absent when the transcript was dropped to fit the
   * browser's storage budget — the report is still worth keeping without it,
   * and saying "the answers were not kept" is better than an empty panel.
   */
  transcripts?: Record<string, BenchmarkResult>;
};

export function makeReportId(completedAt: string, winner: string): string {
  return `${completedAt}::${winner}`;
}

/** True when this report still has the answers it was saved with. */
export function hasTranscripts(report: StoredRunReport): boolean {
  return Boolean(report.transcripts && Object.keys(report.transcripts).length > 0);
}

/**
 * Newest first, capped, and never two entries for one run.
 *
 * Re-saving the same run replaces it rather than stacking: a re-render or a
 * restored session must not turn one comparison into three list entries.
 */
export function addRunReport(reports: StoredRunReport[], report: StoredRunReport): StoredRunReport[] {
  const withoutDuplicate = reports.filter((entry) => entry.id !== report.id);
  return [report, ...withoutDuplicate].slice(0, MAX_STORED_REPORTS);
}

/** Drops answers from every report but the newest, then from all of them. */
export function reportsWithoutTranscripts(reports: StoredRunReport[], keepNewest: number): StoredRunReport[] {
  return reports.map((report, index) =>
    index < keepNewest ? report : { ...report, transcripts: undefined });
}

/**
 * The ladder safeStorage walks when the browser refuses a write: everything,
 * then answers for the newest run only, then no answers at all, then the two
 * newest runs as bare scores. Each rung keeps the reports themselves — the
 * list is what the reader came for, and it survives even when the answers
 * cannot.
 */
export function reportStorageCandidates(reports: StoredRunReport[]): Array<() => unknown> {
  return [
    () => reports,
    () => reportsWithoutTranscripts(reports, 1),
    () => reportsWithoutTranscripts(reports, 0),
    () => reportsWithoutTranscripts(reports, 0).slice(0, 2),
  ];
}

/** Anything that is not a well-formed report list reads as no reports at all. */
export function parseStoredReports(raw: unknown): StoredRunReport[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is StoredRunReport =>
    Boolean(entry)
    && typeof entry === 'object'
    && typeof (entry as StoredRunReport).id === 'string'
    && typeof (entry as StoredRunReport).completedAt === 'string'
    && Array.isArray((entry as StoredRunReport).results));
}

/** "3 models · qwen2.5:7b won · 10 questions each" — the row's whole summary. */
export function describeReport(report: StoredRunReport): string {
  const models = report.results.length;
  const questions = report.questionCount > 0
    ? `, ${report.questionCount} question${report.questionCount === 1 ? '' : 's'} each`
    : '';
  return `${models} model${models === 1 ? '' : 's'} · ${report.winner} won${questions}`;
}
