// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion } from '../benchmarkSuite';
import type { RunProgress } from '../types';

export function QuestionStatusBar({
  progress,
  questions,
}: {
  progress: RunProgress;
  questions: BenchmarkQuestion[];
}) {
  const total = Math.max(1, progress.questionTotal ?? questions.length);
  const currentIndex = Math.min(
    Math.max(0, progress.questionIndex ?? 0),
    Math.max(0, questions.length - 1),
  );
  const completedQuestions = Math.min(progress.completedQuestions ?? 0, total);
  const currentQuestion = questions[currentIndex];
  const currentLabel = progress.questionLabel ?? currentQuestion?.label ?? 'Waiting for question';
  const currentPrompt = progress.questionPrompt ?? currentQuestion?.prompt ?? 'The next judging question will appear here.';
  const runLabel = progress.questionRunTotal && progress.questionRunTotal > 1
    ? `Run ${Math.min(progress.questionRunTotal, (progress.questionRunIndex ?? 0) + 1)}/${progress.questionRunTotal}`
    : null;
  const phaseLabel = progress.phase === 'complete'
    ? 'Crowned'
    : progress.questionPhase === 'prompt-complete'
      ? 'Scored'
      : progress.questionPhase === 'prompt-run'
        ? (runLabel ?? 'Timing run')
        : progress.questionPhase === 'prompt-token'
          ? 'Responding…'
          : progress.questionPhase === 'prompt-start'
            ? 'Asking now'
            : progress.questionPhase === 'failed'
              ? 'Needs attention'
              : 'Warming up';

  return (
    <section className="question-status-bar" aria-label="Live question status">
      <div className="question-status-head">
        <div>
          <span>Live Questions</span>
          <strong>Question {Math.min(total, currentIndex + 1)} of {total}: {currentLabel}</strong>
          <p>{currentPrompt}</p>
        </div>
        <em>{phaseLabel}</em>
      </div>
      <ol className="question-chip-track" aria-label="Speed Dating questions">
        {questions.map((question, index) => {
          const score = progress.questionScores?.[question.id] ?? progress.questionScores?.[String(index)];
          const state = index < completedQuestions
            ? 'done'
            : index === currentIndex && progress.phase === 'running'
              ? 'active'
              : 'waiting';

          return (
            <li key={question.id} className={state} title={question.prompt}>
              <b>{index + 1}</b>
              <span>{question.label}</span>
              <em>{typeof score === 'number' ? score : state === 'active' ? 'Live' : 'Soon'}</em>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
