// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion, BenchmarkQuestionCount, BenchmarkQuestionType } from '../benchmarkSuite';
import { BENCHMARK_PRESETS, BENCHMARK_QUESTION_LEVELS } from '../benchmarkSuite';
import { AlertTriangle, CheckCircle, RefreshCw, X, Zap } from 'lucide-react';

/** Moved out of App.tsx with TestSuiteEditorDock, its only consumer. */
const BENCHMARK_TYPE_LABELS: Record<BenchmarkQuestionType, string> = {
  assistant: 'Assistant response',
  writing: 'Writing task',
  json: 'JSON output',
  truth: 'Truthfulness',
  format: 'Format following',
  coding: 'Coding task',
};

/** Moved out of App.tsx with TestSuiteEditorDock, its only consumer. */
const BENCHMARK_QUESTION_TYPES: BenchmarkQuestionType[] = ['assistant', 'writing', 'json', 'truth', 'format', 'coding'];

export function TestSuiteEditorDock({
  questions,
  isCustom,
  questionCount,
  onChange,
  onQuestionCountChange,
  onReset,
  onClose,
}: {
  questions: BenchmarkQuestion[];
  isCustom: boolean;
  questionCount: BenchmarkQuestionCount;
  onChange: (questions: BenchmarkQuestion[]) => void;
  onQuestionCountChange: (count: BenchmarkQuestionCount) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const activePreset = BENCHMARK_PRESETS.find(
    (p) => p.questions.length === questions.length &&
      p.questions.every((q, i) => q.id === questions[i]?.id),
  ) ?? null;
  const updateQuestion = (index: number, patch: Partial<BenchmarkQuestion>) => {
    onChange(questions.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    ));
  };

  const addQuestion = () => {
    onChange([
      ...questions,
      {
        id: `custom_${Date.now()}`,
        label: 'Custom prompt',
        type: 'assistant',
        prompt: '',
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    onChange(questions.filter((_question, questionIndex) => questionIndex !== index));
  };

  // Not aria-modal: this dock has no backdrop and the app behind it stays
  // usable, so claiming modality told assistive tech the rest of the page was
  // inert when it was not.
  return (
    <aside className="suite-editor-dock" role="dialog" aria-label="Test Suite Editor">
      <div className="suite-editor-title">
        <div>
          <span>Benchmark Lab</span>
          <strong>Test Suite Editor</strong>
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </button>
      </div>
      <div className="suite-editor-presets">
        <span className="suite-preset-label">Load preset:</span>
        <button
          type="button"
          className={!activePreset ? 'active' : ''}
          onClick={onReset}
          title="Mixed general-purpose questions covering JSON output, instruction following, and daily tasks."
        >
          General
        </button>
        {BENCHMARK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={activePreset?.id === preset.id ? 'active' : ''}
            onClick={() => onChange([...preset.questions])}
            title={preset.description}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="suite-editor-toolbar">
        <button type="button" className="mini-button" onClick={addQuestion}>
          <Zap aria-hidden="true" />
          Add Question
        </button>
        <button type="button" className="mini-button outline" onClick={onReset}>
          <RefreshCw aria-hidden="true" />
          Reset Defaults
        </button>
        <span>{questions.length} base questions</span>
        <div className="suite-count-picker" aria-label="Questions per run">
          <span>Run count:</span>
          {BENCHMARK_QUESTION_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={questionCount === level ? 'active' : ''}
              onClick={() => onQuestionCountChange(level)}
              title={`Run ${level} questions per model`}
            >
              {level}
            </button>
          ))}
        </div>
        <span className="suite-autosave-label">
          <CheckCircle aria-hidden="true" />
          Changes autosave
        </span>
      </div>
      {isCustom && (
        <div className="suite-custom-warning" role="note">
          <AlertTriangle aria-hidden="true" />
          <span>Custom benchmark — scores from different test suites may not be directly comparable.</span>
        </div>
      )}
      <div className="suite-editor-list">
        {questions.map((question, index) => (
          <section className="suite-question-card" key={`${question.id}-${index}`}>
            <div className="suite-question-head">
              <b>{String(index + 1).padStart(2, '0')}</b>
              <label>
                <span>Label</span>
                <input
                  value={question.label}
                  onChange={(event) => updateQuestion(index, { label: event.target.value })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={question.type}
                  onChange={(event) => updateQuestion(index, { type: event.target.value as BenchmarkQuestionType })}
                >
                  {BENCHMARK_QUESTION_TYPES.map((type) => (
                    <option key={type} value={type}>{BENCHMARK_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="mini-button outline"
                onClick={() => removeQuestion(index)}
                disabled={questions.length <= 1}
              >
                <X aria-hidden="true" />
                Remove
              </button>
            </div>
            <label className="suite-prompt-field">
              <span>Prompt</span>
              <textarea
                value={question.prompt}
                onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
              />
            </label>
          </section>
        ))}
      </div>
    </aside>
  );
}
