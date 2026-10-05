// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Every test a model has sat, and what each question set is called.
 *
 * Dave ran Difficult Subjects on yi:9b and could not find it afterwards. Three
 * things hid it: a test of one model saved no report (only comparisons did),
 * the only full record per model is its latest test, and the timeline behind
 * it named every question set "Default Suite v0.1" or "Custom Suite", so
 * even a list could not have said which test was which.
 *
 * Pure, so the list a model page shows can be tested without React.
 */
import { BENCHMARK_PRESETS, DEFAULT_BENCHMARK_QUESTIONS, type BenchmarkQuestion } from '../benchmarkSuite.ts';
import { normalizeModelKey } from './modelKey.ts';
import type { RunHistory } from './runHistory.ts';
import type { StoredRunReport } from './runReports.ts';
import { formatMatchScore } from './scoring.ts';

const idsOf = (questions: BenchmarkQuestion[]) => questions.map((question) => question.id).join('|');

/**
 * What a test's questions are called: the preset's own name ("Difficult
 * Subjects"), "General" for the default set, or "Your own questions" once the
 * set has been edited.
 */
export function suiteNameFor(questions: BenchmarkQuestion[]): string {
  const ids = idsOf(questions);
  if (ids === idsOf(DEFAULT_BENCHMARK_QUESTIONS)) return 'General';
  return BENCHMARK_PRESETS.find((preset) => idsOf(preset.questions) === ids)?.label ?? 'Your own questions';
}

/** A saved name in words: tests recorded before suiteNameFor used two fixed labels. */
export function displaySuiteName(saved: string | undefined): string {
  if (!saved || saved === 'Default Suite v0.1') return 'General';
  if (saved === 'Custom Suite') return 'Questions not recorded';
  return saved;
}

export type ModelTest = {
  key: string;
  completedAt: string;
  suiteName: string;
  questionCount: number;
  scoreLabel: string;
  grade: string;
  /** How many other models sat the same test beside it: 0 on its own, null when not recorded. */
  opponents: number | null;
  won: boolean;
  /** The saved report holding this test, when there is one. */
  reportId?: string;
  hasAnswers: boolean;
};

/**
 * Newest first: every saved report this model is in, then the older tests the
 * timeline remembers only as scores. A timeline entry for a test a report
 * already covers is the same test, matched on the moment it finished.
 */
export function modelTests(model: string, reports: StoredRunReport[], history: RunHistory): ModelTest[] {
  const key = normalizeModelKey(model);
  const fromReports: ModelTest[] = reports.flatMap((report) => {
    const score = report.results.find((result) => normalizeModelKey(result.model) === key);
    if (!score) return [];
    return [{
      key: report.id,
      completedAt: score.completedAt || report.completedAt,
      suiteName: displaySuiteName(report.suiteName ?? score.suiteName),
      questionCount: report.questionCount,
      scoreLabel: formatMatchScore(score),
      grade: score.grade,
      opponents: report.results.length - 1,
      won: report.results.length > 1 && report.winner === score.model,
      reportId: report.id,
      hasAnswers: (report.transcripts?.[score.model]?.prompts?.length ?? 0) > 0,
    }];
  });
  const covered = new Set(fromReports.map((test) => test.completedAt));
  const fromTimeline: ModelTest[] = (history.runs[key] ?? [])
    .filter((run) => !covered.has(run.completedAt))
    .map((run) => ({
      key: `run::${run.completedAt}`,
      completedAt: run.completedAt,
      suiteName: displaySuiteName(run.suiteName),
      questionCount: run.questionCount,
      scoreLabel: formatMatchScore(run),
      grade: run.grade,
      // The timeline keeps one model's scores; who else was there is not in it.
      opponents: null,
      won: false,
      hasAnswers: false,
    }));
  return [...fromReports, ...fromTimeline]
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}
