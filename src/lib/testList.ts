// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Every test this computer has a record of, as one list, newest first.
 *
 * Results opened on the Top Match and nothing else. A test was kept in one of
 * five places depending on what it was (comparison reports, the per-model
 * timeline, saved scores, Lab results, speed-test history), and each place had
 * its own screen, so after a first show there was no way to get from the
 * winner to the other tests or back. This reads all five and names no record
 * twice: a report, the timeline entries and the saved scores that came from the
 * same test are one row.
 *
 * Read-only. Nothing here writes, migrates or prunes a stored record, so old
 * saved data lists exactly as it loads.
 */
import { formatHistoryTime } from './modelCatalog.ts';
import { normalizeModelKey } from './modelKey.ts';
import type { AdvancedLabResult } from './labResults.ts';
import type { RunHistory } from './runHistory.ts';
import type { StoredRunReport } from './runReports.ts';
import { hasTranscripts } from './runReports.ts';
import type { RigResult } from './rigScoreRun.ts';
import { RIG_TIERS } from './rigScore.ts';
import { formatMatchScore } from './scoring.ts';
import { displaySuiteName } from './testHistory.ts';
import type { TestedModelScore } from '../types';

export type TestKind =
  | 'show' | 'model' | 'app' | 'code' | 'picture' | 'video' | 'sound' | 'reading' | 'listening' | 'speed' | 'lab';

/** Where a row's results come from, which is also how the detail opens them. */
export type TestSource =
  | { type: 'report'; reportId: string }
  /** A test only the timeline or the saved scores remember: scores, no answers. */
  | { type: 'scores'; model: string; at: string }
  | { type: 'lab'; keys: string[] }
  | { type: 'speed'; id: string };

export type TestEntry = {
  id: string;
  kind: TestKind;
  /** What it was, in words: "Show", "Single test", "Build an app". */
  what: string;
  /** Who sat it, in the order the results ranked them. */
  models: string[];
  /** ISO time it finished; '' when the record never said. */
  at: string;
  /** The result in a line: "qwen3:8b won · 91.4", "91.4 · A", "Did not finish". */
  headline: string;
  /** False when only the scores were kept, so the row can say so. */
  hasAnswers: boolean;
  source: TestSource;
};

export type TestSources = {
  reports: StoredRunReport[];
  history: RunHistory;
  scores: Record<string, TestedModelScore>;
  lab: Record<string, AdvancedLabResult>;
  speed: RigResult[];
};

const LAB_KINDS: Record<string, { kind: TestKind; what: string; lineup: string }> = {
  'app-builder': { kind: 'app', what: 'Build an app', lineup: 'Build an app comparison' },
  code: { kind: 'code', what: 'Code challenge', lineup: 'Code challenge comparison' },
  'image-generation': { kind: 'picture', what: 'Picture test', lineup: 'Picture comparison' },
  'video-generation': { kind: 'video', what: 'Video test', lineup: 'Video comparison' },
  'audio-generation': { kind: 'sound', what: 'Sound test', lineup: 'Sound comparison' },
  'image-recognition': { kind: 'reading', what: 'Picture reading', lineup: 'Picture reading comparison' },
  listening: { kind: 'listening', what: 'Listening test', lineup: 'Listening comparison' },
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const stamp = (at: string) => {
  const time = Date.parse(at);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
};
const keyAt = (model: string, at: string) => `${normalizeModelKey(model)}@${at}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "General, 10 questions" — what the questions were, when the record knows. */
function describeQuestions(suiteName: string | undefined, count: number): string {
  const suite = displaySuiteName(suiteName);
  return count > 0 ? `${suite}, ${plural(count, 'question')}` : suite;
}

function fromReport(report: StoredRunReport): TestEntry {
  const results = report.results.filter(isRecord) as unknown as TestedModelScore[];
  const models = results.map((result) => result.model);
  const questions = describeQuestions(report.suiteName ?? results[0]?.suiteName, report.questionCount);
  if (results.length === 0) {
    // Nothing to rank, but it was saved: it stays in the list rather than vanish.
    return {
      id: `report:${report.id}`,
      kind: 'show',
      what: 'Show',
      models: [],
      at: report.completedAt,
      headline: 'No results were kept',
      hasAnswers: false,
      source: { type: 'report', reportId: report.id },
    };
  }
  if (results.length === 1) {
    return {
      id: `report:${report.id}`,
      kind: 'model',
      what: 'Single test',
      models,
      at: report.completedAt,
      headline: `${formatMatchScore(results[0])} · ${results[0].grade} · ${questions}`,
      hasAnswers: hasTranscripts(report),
      source: { type: 'report', reportId: report.id },
    };
  }
  const top = results.find((result) => result.model === report.winner) ?? results[0];
  return {
    id: `report:${report.id}`,
    kind: 'show',
    what: `Show · ${plural(results.length, 'model')}`,
    models,
    at: report.completedAt,
    headline: top ? `${report.winner} won · ${formatMatchScore(top)} · ${questions}` : questions,
    hasAnswers: hasTranscripts(report),
    source: { type: 'report', reportId: report.id },
  };
}

function scoresEntry(model: string, at: string, score: string, grade: string, suiteName: string | undefined, questions: number): TestEntry {
  return {
    id: `scores:${keyAt(model, at)}`,
    kind: 'model',
    what: 'Single test',
    models: [model],
    at,
    headline: `${score} · ${grade} · ${describeQuestions(suiteName, questions)}`,
    hasAnswers: false,
    source: { type: 'scores', model, at },
  };
}

function labHeadline(result: AdvancedLabResult): string {
  return result.error ? 'Did not finish' : `${result.score} · ${result.grade}`;
}

function fromLab(lab: Record<string, AdvancedLabResult>): TestEntry[] {
  const entries: TestEntry[] = [];
  const lineups = new Map<string, Array<[string, AdvancedLabResult]>>();
  for (const [key, result] of Object.entries(lab)) {
    if (!isRecord(result)) continue;
    if (typeof result.lineupId === 'string' && result.lineupId) {
      lineups.set(result.lineupId, [...(lineups.get(result.lineupId) ?? []), [key, result]]);
    } else {
      entries.push(labEntry([[key, result]], `lab:${key}`));
    }
  }
  for (const [lineupId, group] of lineups) {
    // One result is a lone test that happens to carry an id.
    entries.push(labEntry(group, group.length === 1 ? `lab:${group[0][0]}` : `lineup:${lineupId}`));
  }
  return entries;
}

function labEntry(group: Array<[string, AdvancedLabResult]>, id: string): TestEntry {
  const results = group.map(([, result]) => result);
  const info = LAB_KINDS[results[0].challenge] ?? { kind: 'lab' as const, what: 'Lab test', lineup: 'Lab comparison' };
  const best = [...results].sort((a, b) => Number(b.score) - Number(a.score))[0];
  const newest = results.reduce((latest, result) => (stamp(result.completedAt ?? '') > stamp(latest) ? result.completedAt : latest), '');
  const alone = results.length === 1;
  return {
    id,
    kind: info.kind,
    what: alone ? info.what : `${info.lineup} · ${plural(results.length, 'model')}`,
    models: [...results].sort((a, b) => Number(b.score) - Number(a.score)).map((result) => result.model ?? ''),
    at: newest,
    headline: alone ? labHeadline(results[0]) : (best.error ? 'None finished' : `${best.model} scored highest · ${best.score}`),
    hasAnswers: true,
    source: { type: 'lab', keys: group.map(([key]) => key) },
  };
}

function fromSpeed(speed: RigResult[]): TestEntry[] {
  return speed.filter(isRecord).map((result) => {
    const tier = RIG_TIERS.find((candidate) => candidate.id === result.tier);
    return {
      id: `speed:${result.id}`,
      kind: 'speed' as const,
      what: 'Speed test',
      models: [result.stamp?.model ?? tier?.model ?? ''],
      at: result.completedAt,
      headline: `${tier?.label ?? result.tier} · ${Math.round(result.measure.decodeTps)} tokens a second`,
      hasAnswers: true,
      source: { type: 'speed' as const, id: result.id },
    };
  });
}

/**
 * The list. `hide` names models whose tests must not show yet — a blind show
 * keeps its contestants' names back until the reveal, and its results with them.
 */
export function buildTestList(sources: Partial<TestSources>, options: { hide?: readonly string[] } = {}): TestEntry[] {
  const reports = (sources.reports ?? []).filter((report) => isRecord(report) && Array.isArray(report.results));
  const entries: TestEntry[] = reports.map(fromReport);

  // A test a report holds is also in the timeline and the saved scores, once per
  // model; those copies are not extra tests.
  const covered = new Set<string>();
  for (const report of reports) {
    for (const result of report.results) {
      if (!isRecord(result)) continue;
      covered.add(keyAt(result.model, result.completedAt || report.completedAt));
      covered.add(keyAt(result.model, report.completedAt));
    }
  }
  for (const runs of Object.values(sources.history?.runs ?? {})) {
    for (const run of runs) {
      const key = keyAt(run.model, run.completedAt);
      if (covered.has(key)) continue;
      covered.add(key);
      entries.push(scoresEntry(run.model, run.completedAt, formatMatchScore(run), run.grade, run.suiteName, run.questionCount));
    }
  }
  for (const score of Object.values(sources.scores ?? {})) {
    if (!isRecord(score) || !score.completedAt) continue;
    const key = keyAt(score.model, score.completedAt);
    if (covered.has(key)) continue;
    covered.add(key);
    entries.push(scoresEntry(score.model, score.completedAt, formatMatchScore(score), score.grade, score.suiteName, 0));
  }

  entries.push(...fromLab(sources.lab ?? {}), ...fromSpeed(sources.speed ?? []));

  const hidden = new Set((options.hide ?? []).map(normalizeModelKey));
  const shown = hidden.size
    ? entries.filter((entry) => !entry.models.some((model) => hidden.has(normalizeModelKey(model))))
    : entries;
  // Newest first. Stable for equal times, and a record with no date sinks to the end.
  return shown
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => stamp(b.entry.at) - stamp(a.entry.at) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** When a test finished, in the app's regional format; plain words when the record never said. */
export function testWhen(at: string): string {
  return at ? formatHistoryTime(at) : 'Date not recorded';
}

/** The row a stored id points at, or null once it is gone (cleared, or pushed out by newer tests). */
export function findTest(entries: readonly TestEntry[], id: string | null): TestEntry | null {
  return id ? entries.find((entry) => entry.id === id) ?? null : null;
}
