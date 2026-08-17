import type { BenchmarkQuestion } from '../benchmarkSuite';
import { formatMs, getScoreTone } from '../lib/format';
import { getBenchmarkForModel, getShortModelName } from '../lib/modelCatalog';
import { getPromptDiagnosticText } from '../lib/promptDiagnostic';
import type { BenchmarkPromptResult, BenchmarkResult, ModelRow, RunProgress, TranscriptViewMode } from '../types';
import { PromptStatusPill } from './ScoreVisuals';
import { MessageSquare } from 'lucide-react';
import { useState } from 'react';

export function SpeedDateTranscriptPanel({
  rows,
  benchmarks,
  questionPlan,
  runProgress,
}: {
  rows: ModelRow[];
  benchmarks: Record<string, BenchmarkResult>;
  questionPlan: BenchmarkQuestion[];
  runProgress: RunProgress | null;
}) {
  const liveRow = runProgress?.currentModel
    ? rows.find((row) => row.displayName === runProgress.currentModel)
    : undefined;
  const firstAnswered = rows.find((row) => getBenchmarkForModel(benchmarks, row.displayName, row));
  const defaultModel = liveRow?.displayName ?? firstAnswered?.displayName ?? rows[0]?.displayName ?? '';
  const [requestedModel, setRequestedModel] = useState('');
  const [viewMode, setViewMode] = useState<TranscriptViewMode>('by-model');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

  const activeModel = rows.some((row) => row.displayName === requestedModel) ? requestedModel : defaultModel;
  const activeRow = rows.find((row) => row.displayName === activeModel) ?? rows[0];
  const benchmark = activeRow ? getBenchmarkForModel(benchmarks, activeRow.displayName, activeRow) : null;
  const isLiveModel = Boolean(activeRow && runProgress?.phase === 'running' && runProgress.currentModel === activeRow.displayName);
  const activePromptIndex = Math.max(0, runProgress?.questionIndex ?? 0);

  // Collect results from all rows that have been tested
  const answeredRows = rows
    .map((row) => ({ row, result: getBenchmarkForModel(benchmarks, row.displayName, row) }))
    .filter((entry): entry is { row: ModelRow; result: BenchmarkResult } => entry.result !== null && entry.result !== undefined);

  // Build the canonical question list from the result with the most prompts
  const canonicalPrompts = answeredRows.reduce<BenchmarkPromptResult[]>(
    (best, { result }) => result.prompts.length > best.length ? result.prompts : best,
    [],
  );

  const hasAnyResults = answeredRows.length > 0;
  const safeQuestionIndex = Math.min(selectedQuestionIndex, Math.max(0, canonicalPrompts.length - 1));

  if (!rows.length) {
    return (
      <section className="speed-date-transcript-card empty" aria-label="Speed Dating questions and answers">
        <MessageSquare aria-hidden="true" />
        <strong>No contestants picked yet</strong>
        <span>Choose at least two installed models, then Speed Dating will show the questions and answers here.</span>
      </section>
    );
  }

  return (
    <section className="speed-date-transcript-card" aria-label="Speed Dating questions and answers">
      <div className="speed-date-transcript-head">
        <div>
          <span>Speed Dating Q&A</span>
          <strong>{viewMode === 'by-question' ? 'Side-by-side — same question, all contestants' : 'See what RigMatch asked and how each model answered'}</strong>
          {viewMode === 'by-model' && (
            <em>{benchmark ? `${benchmark.prompts.length} answers saved for ${activeRow?.displayName}.` : isLiveModel ? 'This contestant is answering now.' : 'This contestant has not been tested yet.'}</em>
          )}
          {viewMode === 'by-question' && (
            <em>{hasAnyResults ? `${answeredRows.length} of ${rows.length} contestants tested — pick a question to compare.` : 'Run Speed Dating to see answers side by side.'}</em>
          )}
        </div>
        <div className="speed-date-view-toggle" role="group" aria-label="Transcript view mode">
          <button
            type="button"
            className={viewMode === 'by-model' ? 'active' : ''}
            onClick={() => setViewMode('by-model')}
            title="View each model's full transcript"
          >
            By Model
          </button>
          <button
            type="button"
            className={viewMode === 'by-question' ? 'active' : ''}
            onClick={() => setViewMode('by-question')}
            title="Compare all models on the same question"
          >
            Side by Side
          </button>
        </div>
        {viewMode === 'by-model' && (
          <div className="speed-date-transcript-tabs" role="tablist" aria-label="Contestant transcripts">
            {rows.map((row, index) => {
              const rowBenchmark = getBenchmarkForModel(benchmarks, row.displayName, row);
              const active = row.displayName === activeRow?.displayName;
              return (
                <button
                  key={row.displayName}
                  type="button"
                  className={active ? 'active' : ''}
                  onClick={() => setRequestedModel(row.displayName)}
                  role="tab"
                  aria-selected={active ? 'true' : 'false'}
                >
                  <b>{index + 1}</b>
                  <span>{getShortModelName(row.displayName)}</span>
                  <em>{rowBenchmark ? `${rowBenchmark.scores.total}` : runProgress?.currentModel === row.displayName ? 'Live' : '—'}</em>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── By Model view ─────────────────────────────────────────── */}
      {viewMode === 'by-model' && (benchmark ? (
        <ol className="speed-date-qa-list" aria-label={`${activeRow?.displayName} saved answers`}>
          {benchmark.prompts.map((prompt, index) => (
            <li key={`${activeRow?.displayName}-${prompt.id}-${index}`}>
              <div className="speed-date-qa-head">
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div>
                  <span>{prompt.label}</span>
                  <strong>
                    {prompt.sobrietyScore} answer quality
                    <PromptStatusPill status={prompt.status} />
                  </strong>
                </div>
                <em>{prompt.tokensPerSecond} tok/s · {formatMs(prompt.elapsedMs)}</em>
              </div>
              <div className="speed-date-qa-block asked">
                <span>RigMatch asked</span>
                <p>{prompt.prompt}</p>
              </div>
              <div className="speed-date-qa-block answered">
                <span>{activeRow?.displayName} answered</span>
                {getPromptDiagnosticText(prompt) && (
                  <em className="prompt-diagnostic-note">{getPromptDiagnosticText(prompt)}</em>
                )}
                <p className="speed-date-answer-preview">{prompt.response.trim() || 'No answer returned.'}</p>
                <pre>{prompt.response.trim() || 'No answer returned.'}</pre>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="speed-date-qa-pending">
          {isLiveModel ? (
            <div className="speed-date-live-question">
              <span>Being asked now</span>
              <strong>Question {activePromptIndex + 1}: {runProgress?.questionLabel ?? questionPlan[activePromptIndex]?.label ?? 'Question'}</strong>
              <p>{runProgress?.questionPrompt ?? questionPlan[activePromptIndex]?.prompt ?? 'Waiting for the next prompt.'}</p>
            </div>
          ) : (
            <div className="speed-date-live-question waiting">
              <span>Waiting for a test</span>
              <strong>{activeRow?.displayName} has no saved answers yet</strong>
              <p>Start Speed Dating and this panel will fill in after each contestant finishes the same question set.</p>
            </div>
          )}
          <ol className="speed-date-question-plan" aria-label="Questions queued for this contestant">
            {questionPlan.map((question, index) => (
              <li key={`${question.id}-${index}`}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div>
                  <span>{question.label}</span>
                  <p>{question.prompt}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {/* ── Side-by-Side view ──────────────────────────────────────── */}
      {viewMode === 'by-question' && (
        hasAnyResults ? (
          <div className="speed-date-sidebyside">
            {/* Question selector */}
            <div className="sbs-question-tabs" role="tablist" aria-label="Select question">
              {canonicalPrompts.map((prompt, index) => (
                <button
                  key={`q-${index}`}
                  type="button"
                  className={`sbs-q-tab${index === safeQuestionIndex ? ' active' : ''}`}
                  onClick={() => setSelectedQuestionIndex(index)}
                  role="tab"
                  aria-selected={index === safeQuestionIndex ? 'true' : 'false'}
                  title={prompt.label}
                >
                  Q{index + 1}
                </button>
              ))}
            </div>

            {/* Question prompt */}
            {canonicalPrompts[safeQuestionIndex] && (
              <div className="sbs-question-prompt">
                <span>Question {safeQuestionIndex + 1} · {canonicalPrompts[safeQuestionIndex]!.label}</span>
                <p>{canonicalPrompts[safeQuestionIndex]!.prompt}</p>
              </div>
            )}

            {/* Contestant answers */}
            <div className="sbs-answers">
              {(() => {
                // Find the best answer-quality score for this question across all contestants
                const answersForQ = answeredRows.map(({ row, result }) => ({
                  row,
                  prompt: result.prompts[safeQuestionIndex] ?? null,
                  totalScore: result.scores.total,
                }));
                const bestSobriety = Math.max(0, ...answersForQ.map((a) => a.prompt?.sobrietyScore ?? 0));

                return answersForQ.map(({ row, prompt, totalScore }) => {
                  const isBest = prompt !== null && prompt.sobrietyScore === bestSobriety && answersForQ.length > 1;
                  return (
                    <div
                      key={row.displayName}
                      className={`sbs-answer-card${isBest ? ' sbs-best' : ''}`}
                      aria-label={`${row.displayName} answer`}
                    >
                      <div className="sbs-answer-head">
                        <div className="sbs-answer-model">
                          {isBest && <span className="sbs-best-badge" title="Best answer for this question">★</span>}
                          <strong>{getShortModelName(row.displayName)}</strong>
                          <em className={`score-row-grade ${getScoreTone(totalScore)}`}>{totalScore}</em>
                        </div>
                        {prompt && (
                          <div className="sbs-answer-meta">
                            <span title="Answer quality score">{prompt.sobrietyScore} quality</span>
                            <span title="Generation speed">{prompt.tokensPerSecond} tok/s</span>
                            <span title="Time to complete">{formatMs(prompt.elapsedMs)}</span>
                            <PromptStatusPill status={prompt.status} />
                          </div>
                        )}
                      </div>
                      {prompt ? (
                        <>
                          {getPromptDiagnosticText(prompt) && (
                            <p className="sbs-answer-missing">{getPromptDiagnosticText(prompt)}</p>
                          )}
                          <p className="sbs-answer-text">{prompt.response.trim() || 'No answer returned.'}</p>
                        </>
                      ) : (
                        <p className="sbs-answer-missing">Not tested yet for this question.</p>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          <div className="speed-date-qa-pending">
            <div className="speed-date-live-question waiting">
              <span>No results yet</span>
              <strong>Run Speed Dating to unlock side-by-side comparison</strong>
              <p>After testing, switch to Side by Side to compare all contestants on the same question at once.</p>
            </div>
          </div>
        )
      )}
    </section>
  );
}
