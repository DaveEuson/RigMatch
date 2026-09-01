// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { History } from 'lucide-react';
import robotSpeedDateShow from '../assets/robot-speed-date-show.webp';
import type { BenchmarkQuestion, BenchmarkQuestionCount } from '../benchmarkSuite';
import { MIN_CONTESTANTS } from '../lib/downloadStatus';
import { countWithVerb, getResponseEstimate } from '../lib/format';
import { lineupStanding, standingLine } from '../lib/lineupStanding';
import type { ListTestResult, ModelTaskFilterId } from '../lib/modelCatalog';
import { getBenchmarkForModel, getHardwareFit, getModelScore, modelMatchesTask } from '../lib/modelCatalog';
import type { ComparisonViewId } from '../lib/comparisonViews';
import { buildComparisonRail, defaultComparisonView, describeRankingCoverage } from '../lib/comparisonViews';
import type { BenchmarkResult, ModelRow, NetworkHost, RunProgress, TestedModelScore } from '../types';
import { QuestionSuitePreview } from './QuestionSuitePreview';
import { RunProgressPanel } from './RunProgressPanel';
import { RomanceArtBanner } from './ScoreVisuals';
import { SpeedDateContestantCard } from './SpeedDateContestantCard';
import { SpeedDateShowAnimation } from './SpeedDateShowAnimation';
import { SpeedDateTranscriptPanel } from './SpeedDateTranscriptPanel';
import { TaskMatrix } from './TaskMatrix';
import { TestProcessCard } from './TestProcessCard';
import { Boxes, ChevronRight, Download, Plus, Settings, Trophy } from 'lucide-react';
import { useState } from 'react';

export function SpeedDatePanel({
  active,
  host,
  allModelRows,
  shortlistedRows,
  modelScores,
  benchmarkByModel,
  listTestResult,
  runProgress,
  isListTesting,
  vramGb,
  questionCount,
  questionPlan,
  onQuestionCountChange,
  onOpenSuiteEditor,
  onOpenLogs,
  onOpenModelPool,
  onRemoveCandidate,
  onQueueMissingModels,
  onRunListTest,
  onOpenHistory,
}: {
  active: boolean;
  host?: NetworkHost;
  allModelRows: ModelRow[];
  shortlistedRows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  benchmarkByModel: Record<string, BenchmarkResult>;
  listTestResult: ListTestResult | null;
  runProgress: RunProgress | null;
  isListTesting: boolean;
  vramGb: number;
  questionCount: BenchmarkQuestionCount;
  questionPlan: BenchmarkQuestion[];
  onQuestionCountChange: (count: BenchmarkQuestionCount) => void;
  onOpenSuiteEditor: () => void;
  onOpenLogs: () => void;
  onOpenModelPool: () => void;
  onRemoveCandidate: (row: ModelRow) => void;
  onQueueMissingModels: (rows: ModelRow[]) => void;
  onRunListTest: () => void;
  onOpenHistory: () => void;
}) {
  /**
   * null means "follow the default".
   *
   * So the screen keeps moving to the newest answer — finishing a run lands
   * you on the ranking — right up until someone picks a view themselves, at
   * which point it stops moving under them.
   */
  const [chosenView, setChosenView] = useState<ComparisonViewId | null>(null);
  const winnerResult = listTestResult?.results.find((result) => result.model === listTestResult.winner);
  const selectedSlots = Array.from({ length: 5 }, (_, index) => shortlistedRows[index]);
  const uninstalledLineupRows = shortlistedRows.filter((row) => !row.installed);
  const canRunListTest = shortlistedRows.length >= MIN_CONTESTANTS && uninstalledLineupRows.length === 0 && !isListTesting;
  const questionLabel = `${questionCount} questions per model`;
  const runReadiness = shortlistedRows.length >= MIN_CONTESTANTS
    ? uninstalledLineupRows.length > 0
      ? `${countWithVerb(uninstalledLineupRows.length, 'contestant', 'needs', 'need')} downloading before the show starts.`
      : `${shortlistedRows.length} contestants will answer the same ${questionCount} questions.`
    : 'Pick at least two installed contestants before the show starts.';

  const CORE_TASKS: Array<{ id: ModelTaskFilterId; label: string }> = [
    { id: 'coding', label: 'Coding' },
    { id: 'assistant', label: 'Chat' },
    { id: 'writing', label: 'Writing' },
    { id: 'reasoning', label: 'Reasoning' },
  ];
  const answeredCount = shortlistedRows
    .filter((row) => getBenchmarkForModel(benchmarkByModel, row.displayName, row)).length;
  const comparisonRail = buildComparisonRail({
    lineupCount: shortlistedRows.length,
    maxContestants: 5,
    answeredCount,
    questionCount,
    winner: listTestResult?.winner ?? null,
  });
  const activeView = chosenView
    ?? defaultComparisonView({ answeredCount, winner: listTestResult?.winner ?? null });

  const shortlistIds = new Set(shortlistedRows.map((r) => r.displayName));
  const lineupSuggestions = shortlistedRows.length < 5
    ? CORE_TASKS.flatMap(({ id, label }) => {
        const covered = shortlistedRows.some((r) => modelMatchesTask(r, id));
        if (covered) return [];
        const candidate = allModelRows
          .filter((r) => r.installed && !shortlistIds.has(r.displayName) && getHardwareFit(r, vramGb).recommend && modelMatchesTask(r, id))
          .sort((a, b) => (modelScores[b.displayName]?.total ?? 0) - (modelScores[a.displayName]?.total ?? 0))[0];
        return candidate ? [{ task: label, row: candidate }] : [];
      }).slice(0, 2)
    : [];

  return (
    <section className={active ? 'panel speed-date-panel panel-focused' : 'panel speed-date-panel'} aria-label="Speed Dating">
      {/* The eyebrow said "Round 3". There is no Round 1 or Round 2 anywhere in
          the app — it was the only "Round N" in the codebase, promising a
          sequence that does not exist. It says the word in the nav instead, so
          clicking "Comparison" lands somewhere that confirms you arrived; the
          feature keeps its name on the line below. */}
      <div className="speed-date-title">
        <div>
          <span>Comparison</span>
          <strong>Speed Dating</strong>
        </div>
        <em>Compare up to five picked models with the same questions.</em>
      </div>

      <RomanceArtBanner
        image={robotSpeedDateShow}
        className="speed-date-art-banner art-banner-slim"
        kicker="Tonight's lineup"
        // Was the fixed string "Five contestants, one rig, same questions",
        // which a three-model lineup made false in its first word.
        title={`${shortlistedRows.length} contestant${shortlistedRows.length === 1 ? '' : 's'}, one rig, same questions`}
        // Checked against the lineup on screen, not just read from the saved
        // result: listTestResult survives across sessions, so swapping one
        // contestant was enough to make this announce a leader that is not in
        // tonight's lineup at all.
        body={standingLine(
          lineupStanding(listTestResult?.winner, shortlistedRows.map((row) => row.displayName)),
          winnerResult?.total,
        )}
      />

      <div className="speed-date-body">
        <div className="speed-date-command-bar">
          <div>
            {/* "Dating Game Setup" was the third themed heading in the top
                200px, after the title and the banner kicker. This one labels
                the row of controls that actually runs the thing, so it says
                what the row is. */}
            <span>Setup</span>
            <strong>{shortlistedRows.length}/5 contestants picked</strong>
            <em>{runReadiness}</em>
          </div>
          <div className="speed-date-command-actions">
            <button
              type="button"
              className="mini-button outline"
              onClick={onOpenModelPool}
              disabled={isListTesting}
            >
              <Boxes aria-hidden="true" />
              Choose Models
            </button>
            {uninstalledLineupRows.length > 0 && (
              <button
                type="button"
                className="mini-button outline"
                onClick={() => onQueueMissingModels(uninstalledLineupRows)}
                disabled={isListTesting}
                title={`Queue ${uninstalledLineupRows.length} uninstalled contestant${uninstalledLineupRows.length === 1 ? '' : 's'} for download`}
              >
                <Download aria-hidden="true" />
                Download All ({uninstalledLineupRows.length})
              </button>
            )}
            <button
              type="button"
              className="mini-button outline advanced-only"
              onClick={onOpenSuiteEditor}
              disabled={isListTesting}
            >
              <Settings aria-hidden="true" />
              Edit Questions
            </button>
            <button
              type="button"
              className="primary-button compact"
              onClick={onRunListTest}
              disabled={!canRunListTest}
            >
              <Trophy aria-hidden="true" />
              {isListTesting ? 'Testing' : shortlistedRows.length >= MIN_CONTESTANTS ? uninstalledLineupRows.length > 0 ? 'Download First' : 'Start Speed Dating' : `Pick ${MIN_CONTESTANTS}+`}
            </button>
            {/* The lineup collapse toggle used to live here. It hid one card of
                seven and left the other six stacked, which is not the problem
                anyone had; the rail below replaces it by making every part of
                this screen a place you can go instead of a thing you scroll
                past. */}
          </div>
        </div>

        {/* The stage earns its 112px while there is a show, and not before.
            Idle it said "Ready Check — 5 contestants ready for the same
            questions", which is the sentence the command bar directly above it
            was already saying, drawn as an avatar strip. On a 575px panel that
            is 20% of the screen spent restating the line above it, while the
            transcript underneath was down to 128px. */}
        {(runProgress?.mode === 'speed-date' || listTestResult?.winner) && (
          <SpeedDateShowAnimation
            rows={shortlistedRows}
            runProgress={runProgress?.mode === 'speed-date' ? runProgress : null}
            winner={listTestResult?.winner}
            host={host}
          />
        )}

        {/* Above the rail, not inside it: a run in progress is the one thing on
            this screen you should not have to navigate to. */}
        {runProgress?.mode === 'speed-date' && (
          <RunProgressPanel
            progress={runProgress}
            host={host}
            questionPlan={questionPlan}
            onOpenLogs={onOpenLogs}
          />
        )}

        <div className="comparison-layout">
          <nav className="comparison-rail" aria-label="Comparison sections">
            {comparisonRail.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeView === item.id ? 'comparison-rail-item active' : 'comparison-rail-item'}
                onClick={() => setChosenView(item.id)}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <strong>{item.label}</strong>
                {item.status && <em>{item.status}</em>}
              </button>
            ))}
          </nav>

          <div className="comparison-view">
        {activeView === 'transcript' && <SpeedDateTranscriptPanel
          rows={shortlistedRows}
          benchmarks={benchmarkByModel}
          questionPlan={questionPlan}
          runProgress={runProgress?.mode === 'speed-date' ? runProgress : null}
        />}

        {activeView === 'lineup' && <section className="speed-date-lineup-card" aria-label="Selected models for Speed Dating">
          <div className="speed-date-lineup-head">
            <div>
              <span>Tonight's Lineup</span>
              <strong>These are the models RigMatch will test</strong>
              <em>Use Choose Models to add contestants. Use the X on a card to remove one.</em>
            </div>
            <div className="speed-date-lineup-stats" aria-label="Speed Dating setup summary">
              <span>{questionLabel}</span>
              <strong>{shortlistedRows.length * questionCount} total prompts</strong>
              {uninstalledLineupRows.length > 0 && (
                <button
                  type="button"
                  className="mini-button outline"
                  onClick={() => onQueueMissingModels(uninstalledLineupRows)}
                  disabled={isListTesting}
                  title={`Queue ${uninstalledLineupRows.length} uninstalled model${uninstalledLineupRows.length !== 1 ? 's' : ''} for download`}
                >
                  <Download aria-hidden="true" />
                  Download All ({uninstalledLineupRows.length})
                </button>
              )}
            </div>
          </div>

          <div className="speed-date-contestants">
            {selectedSlots.map((row, index) => (
              row ? (
                <SpeedDateContestantCard
                  key={row.displayName}
                  row={row}
                  index={index}
                  score={getModelScore(row, modelScores)}
                  vramGb={vramGb}
                  disabled={isListTesting}
                  onRemove={onRemoveCandidate}
                />
              ) : (
                <button
                  key={`empty-${index}`}
                  type="button"
                  className="speed-date-empty-slot"
                  onClick={onOpenModelPool}
                  disabled={isListTesting}
                  aria-label={`Choose model for Speed Dating slot ${index + 1}`}
                >
                  <Plus aria-hidden="true" />
                  <span>Contestant {index + 1}</span>
                  <strong>Add model</strong>
                </button>
              )
            ))}
          </div>
          {lineupSuggestions.length > 0 && (
            <div className="lineup-gap-suggestions" aria-label="Lineup suggestions">
              <span>Complete your lineup</span>
              <div className="lineup-suggestions-list">
                {lineupSuggestions.map(({ task, row }) => (
                  <div key={row.displayName} className="lineup-suggestion-item">
                    <div>
                      <strong>{row.displayName}</strong>
                      <em>Covers {task}</em>
                    </div>
                    <button
                      type="button"
                      className="mini-button outline"
                      onClick={() => onRemoveCandidate(row)}
                      disabled={isListTesting}
                      title={`Add ${row.displayName} to the lineup`}
                    >
                      <Plus aria-hidden="true" />
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>}

        {activeView === 'questions' && <QuestionSuitePreview
          questionCount={questionCount}
          questions={questionPlan}
          disabled={isListTesting}
          onQuestionCountChange={onQuestionCountChange}
          onOpenSuiteEditor={onOpenSuiteEditor}
        />}

        {activeView === 'process' && <TestProcessCard mode="speed-date" questionCount={questionCount} />}

        {activeView === 'ranking' && (listTestResult ? (
          <div className="speed-date-results">
            <div className="list-winner">
              <span>Best Match</span>
              <strong>{listTestResult.winner}</strong>
              <em>{winnerResult ? `${winnerResult.total} · ${winnerResult.grade}` : 'Ranked'}</em>
            </div>
            {/* Directly under the crown, because it is the caveat on the crown.
                A Best Match drawn from three of your five models is a different
                claim from one drawn from all five, and the screen used to make
                both of them in the same words. */}
            <p className="ranking-coverage">
              {describeRankingCoverage({
                ranked: listTestResult.results.map((result) => result.model),
                lineup: shortlistedRows.map((row) => row.displayName),
                questionCount,
              })}
            </p>
            <ol aria-label="Speed Dating ranking">
              {listTestResult.results.map((result, index) => (
                <li key={result.model} className={result.model === listTestResult.winner ? 'winner' : ''}>
                  <b>{index + 1}</b>
                  <span>{result.model}</span>
                  <em>{result.speed} speed · {result.sobriety} accuracy · {getResponseEstimate(result.speed)}</em>
                  <strong>{result.total}</strong>
                </li>
              ))}
            </ol>
            {/* Under the ranking, not beside it: the ranking answers "which is
                best overall" and this answers "best at what", which is the
                question someone with several models actually has. */}
            <TaskMatrix
              models={listTestResult.results.map((result) => result.model)}
              // The run's own results, not the app-wide score map. This view is
              // showing one comparison; a later single test on one of these
              // models would otherwise silently rewrite a cell of it.
              scores={Object.fromEntries(listTestResult.results.map((result) => [result.model, result]))}
            />
            <button type="button" className="primary-button compact speed-date-next-btn" onClick={onOpenHistory}>
              <History aria-hidden="true" />
              View Scorecards
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="speed-date-empty">
            <Trophy aria-hidden="true" />
            {/* "No ranking yet" read as a contradiction next to a crowned Top
                Match in the header. A Top Match comes from any saved score; a
                ranking only comes from a comparison run, so say which is
                missing rather than implying nothing has been tested. */}
            <strong>No head-to-head ranking yet</strong>
            <span>Scores from single tests are saved in Scorecards. Run a comparison to rank models against each other on the same questions.</span>
          </div>
        ))}
          </div>
        </div>
      </div>
    </section>
  );
}
