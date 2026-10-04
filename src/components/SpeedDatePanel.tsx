// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { History } from 'lucide-react';
import type { BenchmarkQuestion, BenchmarkQuestionCount } from '../benchmarkSuite';
import { MIN_CONTESTANTS } from '../lib/downloadStatus';
import { balanceLabel, balanceSplit, crowned } from '../lib/balance';
import { comparisonGroups, rankCoding, rankLabList, rankMatchResults } from '../lib/channelWinners';
import type { AdvancedLabResult } from '../lib/labResults';
import { workbenchById, type Workbench, type WorkbenchId } from '../lib/workbench';
import { countWithVerb, getResponseEstimate } from '../lib/format';
import { lineupStanding, standingLine } from '../lib/lineupStanding';
import type { ListTestResult, ModelTaskFilterId } from '../lib/modelCatalog';
import { getBenchmarkForModel, getHardwareFit, getModelScore, modelMatchesTask } from '../lib/modelCatalog';
import type { ComparisonViewId } from '../lib/comparisonViews';
import { buildComparisonRail, defaultComparisonView, describeRankingCoverage } from '../lib/comparisonViews';
import type { BenchmarkResult, ModelRow, NetworkHost, RunProgress, TestedModelScore } from '../types';
import { QuestionSuitePreview } from './QuestionSuitePreview';
import { RunProgressPanel } from './RunProgressPanel';
import { SpeedDateContestantCard } from './SpeedDateContestantCard';
import { SpeedDateShowAnimation } from './SpeedDateShowAnimation';
import { SpeedDateTranscriptPanel } from './SpeedDateTranscriptPanel';
import { TaskMatrix } from './TaskMatrix';
import { TestProcessCard } from './TestProcessCard';
import { BalanceFader } from './BalanceFader';
import { CodingBoard } from './CodingBoard';
import { LabComparison } from './LabComparison';
import { ChevronRight, Download, Plus, Trophy } from 'lucide-react';
import { useState } from 'react';

/** Every kind of test: the All channel, and any caller from before channels. */
const ALL_CHANNELS = workbenchById('all');

/** What a lineup on each channel should cover, for the "complete your lineup" nudge. */
const LINEUP_TASKS: Partial<Record<WorkbenchId, Array<{ id: ModelTaskFilterId; label: string }>>> = {
  chat: [{ id: 'assistant', label: 'Chat' }, { id: 'writing', label: 'Writing' }],
  code: [{ id: 'coding', label: 'Coding' }],
  reading: [{ id: 'vision', label: 'Reads images' }],
};

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
  workbench = ALL_CHANNELS,
  balance,
  onBalanceChange,
  labResults,
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
  /** The channel Advanced Mode is on: it decides what the ranking ranks. */
  workbench?: Workbench;
  /** That channel's Balance fader. */
  balance: number;
  onBalanceChange: (value: number) => void;
  /** Saved Lab results: Reading pictures ranks the lineup's own descriptions. */
  labResults: Record<string, AdvancedLabResult>;
}) {
  /**
   * null means "follow the default".
   *
   * So the screen keeps moving to the newest answer — finishing a run lands
   * you on the ranking — right up until someone picks a view themselves, at
   * which point it stops moving under them.
   */
  const [chosenView, setChosenView] = useState<ComparisonViewId | null>(null);
  const channel = workbench.id;
  const lineupNames = shortlistedRows.map((row) => row.displayName);
  // The run's own results, re-ranked at this channel's fader: nothing runs
  // again, so the ranking follows the fader the moment it moves. Chat ranks the
  // Match Score, Code the coding answers alone.
  const matchRanking = listTestResult ? rankMatchResults(listTestResult.results, balance) : [];
  const codeLeader = channel === 'code' && listTestResult
    ? crowned(rankCoding(listTestResult.results, balance).ranked)
    : null;
  // Reading pictures is judged on the descriptions the lineup gave in the Run
  // dialog's picture test, not on the question round.
  const readingGroups = channel === 'reading'
    ? comparisonGroups(Object.values(labResults).filter((result) => result && lineupNames.includes(result.model)), 'reading')
    : [];
  const readingLeader = readingGroups[0] ? crowned(rankLabList(readingGroups[0].results, 'reading', balance)) : null;
  const leader = channel === 'code'
    ? codeLeader?.item.model ?? null
    : channel === 'reading'
      ? readingLeader?.item.model ?? null
      : matchRanking[0]?.model ?? null;
  const winnerResult = channel === 'code' || channel === 'reading' ? undefined : matchRanking[0];
  const hasRanking = channel === 'reading' ? readingGroups.length > 0 : Boolean(listTestResult);
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
  const lineupTasks = LINEUP_TASKS[channel] ?? CORE_TASKS;
  const answeredCount = shortlistedRows
    .filter((row) => getBenchmarkForModel(benchmarkByModel, row.displayName, row)).length;
  const comparisonRail = buildComparisonRail({
    lineupCount: shortlistedRows.length,
    maxContestants: 5,
    answeredCount,
    questionCount,
    winner: leader,
  });
  const activeView = chosenView
    ?? defaultComparisonView({ answeredCount, winner: leader });

  const shortlistIds = new Set(shortlistedRows.map((r) => r.displayName));
  const lineupSuggestions = shortlistedRows.length < 5
    ? lineupTasks.flatMap(({ id, label }) => {
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
      {/* One header: what this screen is, what the next run will ask, and the
          actions that set it up and start it. It replaced a title, a photo
          banner and a "Setup" card that each said part of this. */}
      <header className="page-head">
        <div>
          <h2>{channel === 'all' ? 'Comparison' : `Comparison · ${workbench.label}`}</h2>
          <p>
            {runReadiness}
            {' '}
            {standingLine(lineupStanding(leader ?? undefined, lineupNames), winnerResult?.total)}
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-line" onClick={onOpenModelPool} disabled={isListTesting}>
            Choose models
          </button>
          {uninstalledLineupRows.length > 0 && (
            <button
              type="button"
              className="btn btn-line"
              onClick={() => onQueueMissingModels(uninstalledLineupRows)}
              disabled={isListTesting}
              title={`Queue ${uninstalledLineupRows.length} uninstalled contestant${uninstalledLineupRows.length === 1 ? '' : 's'} for download`}
            >
              Download all ({uninstalledLineupRows.length})
            </button>
          )}
          <button type="button" className="btn btn-line" onClick={onOpenSuiteEditor} disabled={isListTesting}>
            Questions and judge
          </button>
          <button type="button" className="btn btn-gold" onClick={onRunListTest} disabled={!canRunListTest}>
            {isListTesting
              ? 'Running…'
              : shortlistedRows.length >= MIN_CONTESTANTS
                ? uninstalledLineupRows.length > 0 ? 'Download first' : listTestResult ? 'Run again' : 'Start the show'
                : `Pick ${MIN_CONTESTANTS} or more`}
          </button>
        </div>
      </header>

      <div className="speed-date-body">
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
            winner={leader ?? undefined}
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
          <nav className="screen-tabs comparison-rail" aria-label="Comparison sections">
            {comparisonRail.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeView === item.id ? 'comparison-rail-item active' : 'comparison-rail-item'}
                onClick={() => setChosenView(item.id)}
                aria-pressed={activeView === item.id}
                aria-current={activeView === item.id ? 'page' : undefined}
                title={item.status ?? undefined}
              >
                {item.label}
                {item.status && <span className="comparison-rail-status">{item.status}</span>}
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

        {activeView === 'ranking' && hasRanking && (
          <BalanceFader
            value={balance}
            onChange={onBalanceChange}
            accuracyMeans={workbench.accuracyMeans}
            label={`What matters more for ${channel === 'all' ? 'chat and writing' : workbench.activity}?`}
          />
        )}

        {activeView === 'ranking' && channel === 'reading' && (readingGroups.length > 0 ? (
          <LabComparison channel="reading" results={labResults} balance={balance} models={lineupNames} />
        ) : (
          <div className="speed-date-empty">
            <Trophy aria-hidden="true" />
            <strong>No pictures read yet</strong>
            <span>
              Start Speed Dating and tick “Recognize an image” in the Run dialog: every model in the lineup
              describes the same picture, and the descriptions line up here.
            </span>
          </div>
        ))}

        {activeView === 'ranking' && channel !== 'reading' && (listTestResult ? (
          <div className="speed-date-results">
            {channel === 'code' ? (
              <CodingBoard scores={listTestResult.results} balance={balance} label={workbench.shortLabel} />
            ) : (
              <>
                <div className="list-winner">
                  <span>{channel === 'all' ? 'Best Match' : workbench.shortLabel}</span>
                  <strong>{leader}</strong>
                  <em>{winnerResult ? `${winnerResult.total} · ${winnerResult.grade} · ${balanceLabel(balance)}` : 'Ranked'}</em>
                </div>
                {/* Directly under the crown, because it is the caveat on the crown.
                    A Best Match drawn from three of your five models is a different
                    claim from one drawn from all five, and the screen used to make
                    both of them in the same words. */}
                <p className="ranking-coverage">
                  {describeRankingCoverage({
                    ranked: matchRanking.map((result) => result.model),
                    lineup: lineupNames,
                    questionCount,
                  })}
                  {' '}Ranked at {balanceSplit(balance)}.
                </p>
                <ol aria-label="Speed Dating ranking">
                  {matchRanking.map((result, index) => (
                    <li key={result.model} className={result.model === leader ? 'winner' : ''}>
                      <b>{index + 1}</b>
                      <span>{result.model}</span>
                      <em>{result.speed} speed · {result.sobriety} accuracy · {getResponseEstimate(result.speed)}</em>
                      <strong>{result.total}</strong>
                    </li>
                  ))}
                </ol>
              </>
            )}
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
