import type { BenchmarkQuestion, BenchmarkQuestionCount } from '../benchmarkSuite';
import { BENCHMARK_QUESTION_LEVELS } from '../benchmarkSuite';
import { Settings } from 'lucide-react';

export function QuestionSuitePreview({
  questionCount,
  questions,
  disabled,
  onQuestionCountChange,
  onOpenSuiteEditor,
}: {
  questionCount: BenchmarkQuestionCount;
  questions: BenchmarkQuestion[];
  disabled: boolean;
  onQuestionCountChange: (count: BenchmarkQuestionCount) => void;
  onOpenSuiteEditor: () => void;
}) {
  return (
    <section className="question-suite" aria-label="Benchmark question suite">
      <div className="question-suite-head">
        <div>
          <span>Question Set</span>
          <strong>{questionCount} questions per model</strong>
        </div>
        <div className="question-count-control" role="group" aria-label="Question count">
          {BENCHMARK_QUESTION_LEVELS.map((count) => (
            <button
              key={count}
              type="button"
              className={count === questionCount ? 'active' : ''}
              onClick={() => onQuestionCountChange(count)}
              disabled={disabled}
              aria-pressed={count === questionCount}
            >
              {count}
            </button>
          ))}
        </div>
        <button type="button" className="mini-button outline suite-edit-button advanced-only" onClick={onOpenSuiteEditor}>
          <Settings aria-hidden="true" />
          Edit Suite
        </button>
      </div>
      <div className="question-list" aria-label={`${questionCount} benchmark questions`}>
        {questions.map((question, index) => (
          <article className="question-row" key={question.id}>
            <b>{String(index + 1).padStart(2, '0')}</b>
            <div>
              <span>{question.label}</span>
              <p>{question.prompt}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
