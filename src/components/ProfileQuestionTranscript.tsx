import { getPromptDiagnosticText } from '../lib/promptDiagnostic';
import { formatMs } from '../lib/format';
import { formatHistoryTime } from '../lib/modelCatalog';
import { formatMatchScore } from '../lib/scoring';
import type { BenchmarkResult } from '../types';
import { PromptStatusPill } from './ScoreVisuals';
import { MessageSquare, Settings } from 'lucide-react';

export function ProfileQuestionTranscript({
  model,
  benchmark,
  onEditQuestions,
}: {
  model: string;
  benchmark: BenchmarkResult | null;
  onEditQuestions: () => void;
}) {
  const prompts = benchmark?.prompts ?? [];

  if (!benchmark || !prompts.length) {
    return (
      <div
        id="profile-panel-questions"
        className="profile-question-empty"
        role="tabpanel"
        aria-labelledby="profile-tab-questions"
      >
        <MessageSquare aria-hidden="true" />
        <strong>No test transcript yet</strong>
        <span>Use Test in Contestants or run Speed Dating. RigMatch will save each question, answer, score, and timing here.</span>
        <em>Questions can still be changed from the test popup or Edit Suite in Speed Dating.</em>
        <button type="button" className="mini-button outline advanced-only" onClick={onEditQuestions}>
          <Settings aria-hidden="true" />
          Edit Questions
        </button>
      </div>
    );
  }

  return (
    <div
      id="profile-panel-questions"
      className="profile-question-transcript"
      role="tabpanel"
      aria-labelledby="profile-tab-questions"
      aria-label={`${model} benchmark question transcript`}
    >
      <div className="profile-question-summary">
        <div>
          <span>Test Transcript</span>
          <strong>{prompts.length} questions asked</strong>
          <em>{formatHistoryTime(benchmark.completedAt)} · {formatMatchScore(benchmark.scores)} Match · {benchmark.scores.grade}</em>
        </div>
        <div>
          <span>Question Suite</span>
          <strong>Editable</strong>
          <em>Changes apply to the next single test or Speed Dating run.</em>
          <button type="button" className="mini-button outline advanced-only" onClick={onEditQuestions}>
            <Settings aria-hidden="true" />
            Edit Questions
          </button>
        </div>
      </div>

      <ol className="profile-question-list">
        {prompts.map((prompt, index) => (
          <li key={`${prompt.id}-${index}`}>
            <div className="profile-question-head">
              <b>{String(index + 1).padStart(2, '0')}</b>
              <div>
                <span>
                  {prompt.label}
                  {/* The suite contains more than one JSON question, so a label
                      alone cannot tell you which entry an answer came from. */}
                  <code className="profile-question-id">{prompt.id}</code>
                </span>
                <strong>
                  {prompt.sobrietyScore} answer quality
                  <PromptStatusPill status={prompt.status} />
                </strong>
              </div>
              <em>{prompt.tokensPerSecond} tok/s · {formatMs(prompt.elapsedMs)}</em>
            </div>
            <div className="profile-qa-block asked">
              <span>RigMatch asked</span>
              <p>{prompt.prompt}</p>
            </div>
            <div className="profile-qa-block answered">
              <span>{model} answered</span>
              {getPromptDiagnosticText(prompt) && (
                <em className="prompt-diagnostic-note">{getPromptDiagnosticText(prompt)}</em>
              )}
              <pre>{prompt.response.trim() || 'No answer returned.'}</pre>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
