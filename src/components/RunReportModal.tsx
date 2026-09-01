// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion } from '../benchmarkSuite';
import { getResponseEstimate } from '../lib/format';
import type { ListTestResult } from '../lib/modelCatalog';
import { formatMatchScore } from '../lib/scoring';
import { useDialog } from '../lib/useDialog';
import type { BenchmarkResult, ModelRow } from '../types';
import { SpeedDateTranscriptPanel } from './SpeedDateTranscriptPanel';
import { TaskMatrix } from './TaskMatrix';
import { Trophy, X } from 'lucide-react';

/**
 * What just happened, without going to look for it.
 *
 * A finished comparison left its results in three places — the ranking in
 * listTestResult, the answers in benchmarkByModel, the winner in the Top Match
 * badge — and told you about none of them. Beginner mode jumped to Scorecards;
 * Advanced mode simply stopped, and the reader had to know that Comparison held
 * a transcript and that Scorecards held the ranking.
 *
 * So: the grades and the answers, in one place, opened from the moment the run
 * ends. Side-by-side by default, because the question behind "I compared three
 * models" is how they differed on the same question, and one transcript at a
 * time is the wrong shape for that.
 *
 * Nothing here is computed. The ranking is the run's own sorted results and the
 * answers are the saved transcript; a report that recalculated either could
 * disagree with the screens that show them.
 */
export function RunReportModal({
  result,
  rows,
  benchmarks,
  questionPlan,
  onClose,
  onOpenScorecards,
}: {
  result: ListTestResult;
  rows: ModelRow[];
  benchmarks: Record<string, BenchmarkResult>;
  questionPlan: BenchmarkQuestion[];
  onClose: () => void;
  onOpenScorecards: () => void;
}) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const tested = result.results;
  // Keyed from the run's own results rather than the app-wide score map, so the
  // report describes this run even if a later test overwrites a model's score.
  const scoresByModel = Object.fromEntries(tested.map((score) => [score.model, score]));
  // Whether this report still has answers to show. A stored report can outlive
  // its transcript; the modal has to know the difference.
  const answersKept = rows.some((row) => (benchmarks[row.displayName]?.prompts?.length ?? 0) > 0);
  const questionCount = rows
    .map((row) => benchmarks[row.displayName]?.prompts.length ?? 0)
    .reduce((most, count) => Math.max(most, count), 0);

  return (
    <div className="run-report-backdrop" role="presentation">
      <div className="run-report" role="dialog" aria-modal="true" aria-label="Run report" ref={dialogRef}>
        <header className="run-report-head">
          <Trophy aria-hidden="true" />
          <div>
            <span>Report</span>
            <strong>
              {tested.length} model{tested.length === 1 ? '' : 's'}
              {questionCount > 0 && `, ${questionCount} question${questionCount === 1 ? '' : 's'} each`}
            </strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close report">
            <X aria-hidden="true" />
          </button>
        </header>

        <ol className="run-report-ranking" aria-label="Ranking">
          {tested.map((score, index) => (
            <li key={score.model} className={score.model === result.winner ? 'winner' : ''}>
              <b>{index + 1}</b>
              <span>{score.model}</span>
              <em>
                {score.sobriety} quality · {score.speed} speed · {getResponseEstimate(score.speed)}
              </em>
              <strong>{formatMatchScore(score)} · {score.grade}</strong>
            </li>
          ))}
        </ol>

        {/* Best at what, straight after the ranking — the two questions someone
            with three models has, in the order they ask them. */}
        <TaskMatrix models={tested.map((score) => score.model)} scores={scoresByModel} />

        {/* The answers themselves. Same component the Comparison screen uses,
            so the report cannot drift from the transcript it is reporting on.

            Unless they are gone: safeStorage drops answer text first when the
            browser runs out of room, and the panel's own empty state says "Run
            Speed Dating to see answers side by side" — which is wrong here and
            in the worst way, because the run did happen and that sentence tells
            the reader to repeat work they already did. */}
        <div className="run-report-transcript">
          {answersKept ? (
            <SpeedDateTranscriptPanel
              rows={rows}
              benchmarks={benchmarks}
              questionPlan={questionPlan}
              runProgress={null}
              initialViewMode="by-question"
            />
          ) : (
            <p className="run-report-noanswers">
              The answers from this run were not kept — they are dropped first when the
              browser runs out of saved space, so newer runs keep theirs. The scores above
              are the full result.
            </p>
          )}
        </div>

        <footer className="run-report-foot">
          <span>Saved to Scorecards. This report is the same run, read straight away.</span>
          <button type="button" className="mini-button outline" onClick={onOpenScorecards}>
            Open Scorecards
          </button>
          <button type="button" className="primary-button compact" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
