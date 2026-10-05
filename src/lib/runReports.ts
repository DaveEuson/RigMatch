// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkResult, TestedModelScore } from '../types';
import { formatMatchScore } from './scoring.ts';

/**
 * Every test, kept as an event you can reopen: a comparison, or one model on
 * its own (until 0.9.4 only comparisons were, so a single test left no trace
 * once the model was tested again).
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
 * Thirty tests in the history, answers kept for the newest twelve. Five was
 * enough when only comparisons were saved; with every single test saved too it
 * would hold an afternoon. Answers are the bulky part, so the older ones keep
 * their scores and drop their transcripts, and safeStorage drops more if the
 * browser still runs out of room.
 */
export const MAX_STORED_REPORTS = 30;
export const REPORTS_WITH_ANSWERS = 12;

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
    () => reportsWithoutTranscripts(reports, REPORTS_WITH_ANSWERS),
    () => reportsWithoutTranscripts(reports, 3),
    () => reportsWithoutTranscripts(reports, 1),
    () => reportsWithoutTranscripts(reports, 0),
    () => reportsWithoutTranscripts(reports, 0).slice(0, 10),
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

/**
 * The row's whole summary: "3 models · qwen2.5:7b won · 10 questions each",
 * or for one model on its own, "yi:9b · 91.4 A · 10 questions".
 */
export function describeReport(report: StoredRunReport): string {
  const models = report.results.length;
  if (models === 1) {
    const [only] = report.results;
    const questions = report.questionCount > 0 ? ` · ${report.questionCount} question${report.questionCount === 1 ? '' : 's'}` : '';
    return `${only.model} · ${formatMatchScore(only)} ${only.grade}${questions}`;
  }
  const questions = report.questionCount > 0
    ? `, ${report.questionCount} question${report.questionCount === 1 ? '' : 's'} each`
    : '';
  return `${models} model${models === 1 ? '' : 's'} · ${report.winner} won${questions}`;
}
