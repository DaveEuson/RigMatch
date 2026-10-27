// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion } from '../benchmarkSuite.ts';
import type { BenchmarkResult, ModelRow, TestedModelScore } from '../types';
import { normalizeModelKey } from './modelKey.ts';
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

/**
 * The reports with one model's results and answers taken out, for "Clear
 * score". A report left with nobody in it goes; one whose winner was cleared
 * is headed by the next in its ranking. The same list back when the model is
 * in none of them.
 *
 * Clearing a score used to leave every report it was in, transcripts and all,
 * while the dialog said its transcripts were cleared.
 */
export function removeModelFromReports(reports: StoredRunReport[], aliases: string[]): StoredRunReport[] {
  const keys = new Set(aliases.map(normalizeModelKey));
  const cleared = (model: string) => keys.has(normalizeModelKey(model));
  if (!reports.some((report) => report.results.some((result) => cleared(result.model)))) return reports;
  return reports.flatMap((report) => {
    if (!report.results.some((result) => cleared(result.model))) return [report];
    const results = report.results.filter((result) => !cleared(result.model));
    if (results.length === 0) return [];
    const transcripts = report.transcripts
      ? Object.fromEntries(Object.entries(report.transcripts).filter(([model]) => !cleared(model)))
      : undefined;
    return [{ ...report, results, transcripts, winner: cleared(report.winner) ? results[0].model : report.winner }];
  });
}

/**
 * The rows a saved report is shown with: one per model in it, in its order.
 *
 * A model no longer listed (LM Studio closed, the model deleted) was dropped,
 * taking its answers with it, and with every row gone the report said its
 * answers "were not kept", blaming storage for answers it still had.
 */
export function reportRows(results: Array<{ model: string }>, modelRows: ModelRow[]): ModelRow[] {
  return results.map(({ model }) => modelRows.find((row) => row.displayName === model) ?? {
    id: model,
    name: model.split(':')[0],
    tag: model.split(':')[1] ?? 'latest',
    displayName: model,
    params: '',
    sizeGb: null,
    pack: 'Saved report',
    source: 'Saved report',
    live: false,
    installed: false,
    ready: false,
    installLabel: 'Not on this computer now',
  });
}

/**
 * A saved report's own questions, read from its answers: a Difficult Subjects
 * report reopened while General was selected showed General's questions over
 * Difficult Subjects' answers. Undefined once the answers were dropped.
 */
export function reportQuestionPlan(report: StoredRunReport): BenchmarkQuestion[] | undefined {
  const first = report.transcripts ? Object.values(report.transcripts)[0] : undefined;
  return first?.prompts.map((p) => ({ id: p.id, label: p.label, prompt: p.prompt, type: p.type ?? 'assistant' }));
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
