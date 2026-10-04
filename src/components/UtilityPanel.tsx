// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { matchDisplayLabel } from '../lib/goals';
import type { UtilityPanelId } from '../types';
import { releaseNotes } from '../data/releaseNotes';
import type { ThemeId, UiMode } from '../lib/appConfig';
import { APP_VERSION, BUY_ME_A_COFFEE_URL } from '../lib/appConfig';
import type { CopyState } from '../lib/clipboard';
import { copyText } from '../lib/clipboard';
import { compareVersionStrings, formatGb, getResponseEstimate, getScoreTone } from '../lib/format';
import { getGoalMatches } from '../lib/goalMatches';
import type { GoalId } from '../lib/goals';
import { downloadMatchCard } from '../lib/matchCard';
import type { ListTestResult } from '../lib/modelCatalog';
import { buildBugReportUrl, buildDiagnosticsText, buildShareableScorecard, getNavLabel, getRankedModelScores, getRecentModelScores, getTaskTopPicks, getThemeLabel } from '../lib/modelCatalog';
import { MATCH_GRADE_BAND_ROWS } from '../lib/scoreReference';
import type { SettingsSectionId } from '../lib/settingsSections';
import { buildSettingsRail } from '../lib/settingsSections';
import { formatMatchScore, isLegacyScore, scoreDrift, scoreDriftLabel } from '../lib/scoring';
import { balanceSplit } from '../lib/balance';
import { describeLabAccuracy, rankLabList, type LabChannel } from '../lib/channelWinners';
import type { AdvancedLabResult } from '../lib/labResults';
import { workbenchById, type Workbench } from '../lib/workbench';
import { useDialog } from '../lib/useDialog';
import type { AutoUpdateStatus, ModelRow, NetworkHost, OllamaStatus, SystemProfile, TestedModelScore, UpdateChannel, UpdateCheckResponse } from '../types';
import { ClosetSection } from './ClosetSection';
import { ComfySettings } from './ComfySettings';
import { GoalsSummary } from './GoalsSummary';
import { HistoryTimeline } from './HistoryTimeline';
import { HowWeScoreSection } from './HowWeScoreSection';
import { SettingsSection } from './SettingsSection';
import { ModelDemoChips } from './SkillDemoViewers';
import { ThemePicker } from './ThemePicker';
import { ShowExtrasSettings } from './ShowExtrasSettings';
import { AchievementShelf } from './AchievementShelf';
import { ACHIEVEMENTS, useAchievements } from '../lib/achievements';
import { UiModePicker } from './UiModePicker';
import { BalanceFader } from './BalanceFader';
import { CodingBoard } from './CodingBoard';
import { LabStandings } from './LabStandings';
import { ReleaseNotes, UpdateCenter } from './UpdateCenter';
import { Bug, ChevronRight, Coffee, Copy, Download, ExternalLink, RefreshCw, Trash2, Trophy, X } from 'lucide-react';
import { getModelAvatarSrc } from '../lib/modelAvatars';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AllDemosButton } from './SkillDemoViewers';

/** Every kind of test: the All channel, and any caller from before channels. */
const ALL_CHANNELS = workbenchById('all');

/** What one saved result is called on each Lab channel's scorecards. */
const LAB_NOUN: Record<LabChannel, string> = {
  images: 'image test',
  video: 'video test',
  listening: 'listening test',
  reading: 'picture reading',
  audio: 'audio test',
  code: 'coding job',
  app: 'app build',
};

export function UtilityPanel({
  panel,
  listTestResult,
  selectedHost,
  selectedModel,
  ollama,
  system,
  themeId,
  uiMode,
  selectedGoals,
  installedRows,
  modelScores,
  updateChannel,
  updateCheck,
  isCheckingUpdates,
  logPath,
  onThemeChange,
  onUiModeChange,
  onEditGoals,
  onShowWelcome,
  topMatch,
  onDeleteModel,
  onRefreshLogs,
  onClearScore,
  onClearAllScores,
  onClearAllData,
  onOpenSetupGuide,
  onUpdateChannelChange,
  onCheckForUpdates,
  onOpenUpdatePage,
  autoUpdateStatus,
  onDownloadUpdate,
  onInstallUpdate,
  onSelectTopPick,
  workbench = ALL_CHANNELS,
  channelBalance,
  onChannelBalanceChange,
  channelBalanceLock = null,
  labResults,
}: {
  panel: UtilityPanelId;
  listTestResult: ListTestResult | null;
  selectedHost?: NetworkHost;
  selectedModel: string;
  ollama: OllamaStatus;
  system: SystemProfile;
  themeId: ThemeId;
  uiMode: UiMode;
  selectedGoals: GoalId[];
  installedRows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  updateChannel: UpdateChannel;
  updateCheck: UpdateCheckResponse | null;
  isCheckingUpdates: boolean;
  logPath: string;
  onThemeChange: (themeId: ThemeId) => void;
  onUiModeChange: (mode: UiMode) => void;
  onEditGoals: () => void;
  /** Opens the first-run welcome again. */
  onShowWelcome: () => void;
  /** The Top Match card, shown at the head of the Scorecards. */
  topMatch?: ReactNode;
  onDeleteModel: (row: ModelRow) => void;
  onRefreshLogs: () => void;
  onClearScore: (model: string) => void;
  onClearAllScores: () => void;
  onClearAllData: () => void;
  onOpenSetupGuide: () => void;
  onUpdateChannelChange: (channel: UpdateChannel) => void;
  onCheckForUpdates: () => void;
  onOpenUpdatePage: () => void;
  autoUpdateStatus: AutoUpdateStatus;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onSelectTopPick?: (model: string) => void;
  /** The channel Advanced Mode is on: Scorecards ranks its results. */
  workbench?: Workbench;
  /** That channel's Balance fader. */
  channelBalance: number;
  onChannelBalanceChange: (value: number) => void;
  /** Why that fader is held at speed, when nothing can judge accuracy. */
  channelBalanceLock?: string | null;
  labResults: Record<string, AdvancedLabResult>;
}) {

  // Load the log when this panel opens.
  //
  // openLogsPanel() did it, but that is only the Activity screen's shortcut —
  // arriving here from the rail left the console at "0 entries" with Copy and
  // Clear disabled and nothing saying why. Worse, "No logs yet" was not
  // necessarily true: the file could be full and simply unread.
  useEffect(() => {
    if (panel === 'history') onRefreshLogs();
  }, [panel, onRefreshLogs]);
  const [diagnosticsCopy, setDiagnosticsCopy] = useState<CopyState>('idle');
  const recentModelScores = useMemo(() => getRecentModelScores(modelScores), [modelScores]);
  const rankedModelScores = useMemo(() => getRankedModelScores(modelScores), [modelScores]);
  const isScoreDrifted = useCallback((score: TestedModelScore) => {
    const installed = ollama.models.find((m) => m.name === score.model || m.model === score.model);
    return scoreDrift(score, {
      gpuModel: system.gpu.model,
      vramGb: system.gpu.vramGb,
      modelDigest: installed?.digest,
    }) !== null;
  }, [ollama.models, system.gpu.model, system.gpu.vramGb]);
  const taskPicks = useMemo(() => getTaskTopPicks(modelScores, isScoreDrifted), [modelScores, isScoreDrifted]);
  const goalMatches = useMemo(
    () => getGoalMatches(selectedGoals, modelScores, isScoreDrifted),
    [selectedGoals, modelScores, isScoreDrifted],
  );
  const topRankedScore = rankedModelScores[0];
  // Scorecards follows the channel. Chat and All keep the Match Score board,
  // Code ranks the coding answers, and each Lab channel lists its own results.
  const channel = workbench.id;
  const labChannel: LabChannel | null = channel === 'images' || channel === 'video' || channel === 'listening'
    || channel === 'reading' || channel === 'audio'
    ? channel
    : null;
  const channelRankAt = channelBalanceLock ? 0 : channelBalance;
  const labBoard = useMemo(
    () => (labChannel ? rankLabList(Object.values(labResults), labChannel, channelRankAt) : []),
    [labChannel, labResults, channelRankAt],
  );
  const [scoreExplainerOpen, setScoreExplainerOpen] = useState(false);
  const scoreExplainerRef = useDialog<HTMLDivElement>(() => setScoreExplainerOpen(false));
  const [scoreCopied, setScoreCopied] = useState(false);
  const [ollamaUpdateLatest, setOllamaUpdateLatest] = useState<string | null>(null);
  const [isCheckingOllamaUpdate, setIsCheckingOllamaUpdate] = useState(false);

  /**
   * Settings shows one section at a time and opens on Preferences. The rail
   * picks the section; picking a new one starts the column at its top, and
   * picking the one already showing scrolls back up to its heading.
   *
   * The column is scrolled directly rather than with scrollIntoView, which
   * also scrolls every ancestor and pushed the top bar off the window.
   */
  const [openSection, setOpenSection] = useState<SettingsSectionId>('interface');
  const settingsBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    settingsBodyRef.current?.scrollTo({ top: 0 });
  }, [openSection]);
  const openSectionFromRail = useCallback((id: SettingsSectionId) => {
    if (id === openSection) settingsBodyRef.current?.scrollTo({ top: 0 });
    else setOpenSection(id);
  }, [openSection]);
  const installedSizeGb = useMemo(
    () => installedRows.reduce((total, row) => total + (row.sizeGb ?? 0), 0),
    [installedRows],
  );
  const { earned: earnedAchievements } = useAchievements();
  const earnedCount = ACHIEVEMENTS.filter((a) => earnedAchievements[a.id]).length;
  const settingsRail = useMemo(() => buildSettingsRail({
    // The mode is on the top bar's switch, so the rail names the theme.
    interface: getThemeLabel(themeId),
    achievements: `${earnedCount} of ${ACHIEVEMENTS.length}`,
    storage: installedRows.length > 0 ? formatGb(installedSizeGb) : 'Empty',
    providers: ollama.version ? `Ollama ${ollama.version}` : 'No Ollama',
    updates: `v${APP_VERSION}`,
    // ComfyUI, Support and Advanced get no status line: this panel does not
    // hold a true one for them, and a filler word would read as information.
  }, { advanced: uiMode !== 'beginner' }), [uiMode, themeId, earnedCount, installedRows.length, installedSizeGb, ollama.version]);

  const checkOllamaUpdate = useCallback(async () => {
    setIsCheckingOllamaUpdate(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch('https://api.github.com/repos/ollama/ollama/releases/latest', { signal: controller.signal });
      const data = await res.json() as { tag_name: string };
      setOllamaUpdateLatest(data.tag_name.replace(/^v/, ''));
    } catch {
      // network unavailable or timed out
    } finally {
      clearTimeout(timer);
      setIsCheckingOllamaUpdate(false);
    }
  }, []);

  const ollamaHasUpdate = ollamaUpdateLatest !== null && ollama.version != null
    && compareVersionStrings(ollamaUpdateLatest, ollama.version) > 0;

  const copyScorecard = useCallback(() => {
    const text = buildShareableScorecard(rankedModelScores, taskPicks, system);
    void navigator.clipboard.writeText(text).then(() => {
      setScoreCopied(true);
      setTimeout(() => setScoreCopied(false), 2500);
    });
  }, [rankedModelScores, taskPicks, system]);

  // The run log belongs to every channel: a failed test is a failed test
  // whatever it was testing.

  return (
    <section
      className={panel === 'history' ? 'panel utility-panel history-panel panel-focused' : 'panel utility-panel panel-focused'}
      aria-label={`${getNavLabel(panel)} panel`}
    >
      {panel === 'history' ? (
        <header className="page-head">
          <div>
            <h2>Results</h2>
            <p>
              {labChannel
                ? `${labBoard.length} saved ${LAB_NOUN[labChannel]}${labBoard.length === 1 ? '' : 's'} on ${workbench.label.toLowerCase()}, ranked by what matters to you.`
                : rankedModelScores.length > 0
                  ? `${rankedModelScores.length} tested model${rankedModelScores.length === 1 ? '' : 's'}, ranked at ${balanceSplit(channelBalance)}. Moving the fader re-ranks what is already measured; nothing runs again.`
                  : 'Nothing measured yet. Run a single test or the show to build the ranking.'}
            </p>
          </div>
        </header>
      ) : null}

      {panel === 'history' && !labChannel && topMatch}

      {scoreExplainerOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setScoreExplainerOpen(false)}>
          <div ref={scoreExplainerRef} className="run-warning-modal score-explainer-modal" role="dialog" aria-modal="true" aria-label="How we score" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Trophy aria-hidden="true" />
              <div>
                <span>Scoring system</span>
                <strong>How RigMatch scores your models</strong>
              </div>
              <button type="button" className="icon-action" onClick={() => setScoreExplainerOpen(false)} aria-label="Close">
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="score-explainer-body">
              {/* Four components, always — this said "three signals", silently
                  dropping Finish Rate and 18% of the score. */}
              <p>RigMatch runs the same set of prompts across each model on <strong>your actual computer</strong> and combines four signals into a single Match score (0–100): <strong>34% answer quality, 32% speed, 18% finish rate, 16% computer fit</strong>.</p>
              <p className="score-explainer-weight">Answer quality matters most. Speed and hardware fit help separate close matches.</p>
              <p className="score-explainer-note">Scored benchmarks disable hidden thinking when Ollama supports it, so models are graded on visible answers instead of internal reasoning tokens. Chat mode is not affected.</p>
              <div className="score-explainer-grid">
                <div>
                  <span>Answer quality</span>
                  <strong>How well it follows the prompt</strong>
                  <em>Did it follow instructions, stay on task, and give complete answers? Graded across all test prompts.</em>
                </div>
                <div>
                  <span>Speed</span>
                  <strong>How fast it responds</strong>
                  <em>Tokens per second, measured live on your hardware. Faster = higher speed score.</em>
                </div>
                <div>
                  <span>Hardware fit</span>
                  <strong>How well it suits your rig</strong>
                  <em>Models that run comfortably within your VRAM and RAM get a bonus. Models that strain your hardware get penalised.</em>
                </div>
              </div>
              <div className="score-explainer-grades">
                <span>Grade bands</span>
                <div>
                  {/* Rendered from MATCH_GRADE_BANDS so this can't drift from the
                      grades the app actually assigns. It previously published
                      A 80–94 / B 65–79 while the engine used A 88–94 / B+ 80–87,
                      so a displayed grade could match neither table. */}
                  {MATCH_GRADE_BAND_ROWS.map(({ grade, range, tone }) => (
                    <div key={grade} className={`grade-chip ${tone}`}>
                      <strong>{grade}</strong>
                      <em>{range}</em>
                    </div>
                  ))}
                </div>
              </div>
              <p className="score-explainer-note">All tests run locally — no data leaves your machine.</p>
            </div>
          </div>
        </div>
      )}


      {panel === 'history' && labChannel && (
        <div className="utility-body">
          <div className="results-toolbar">
            <BalanceFader
              variant="row"
              value={channelBalance}
              onChange={onChannelBalanceChange}
              accuracyMeans={workbench.accuracyMeans}
              lockedReason={channelBalanceLock}
              label={`What matters more for ${workbench.activity}?`}
            />
            {/* The results are here; what they made was only ever reachable
                from the model that made it. */}
            <div className="results-toolbar-actions">
              <AllDemosButton className="btn btn-line btn-sm" label="Everything they made" />
            </div>
          </div>
          {labBoard.length > 0 ? (
            <LabStandings
              ranked={labBoard}
              balance={channelRankAt}
              heading={`Every ${LAB_NOUN[labChannel]} on this PC`}
              describeAccuracy={(accuracy, result) => describeLabAccuracy(labChannel, accuracy, result)}
              limit={labBoard.length}
              showDates
            />
          ) : (
            <div className="utility-empty">
              <strong>No {LAB_NOUN[labChannel]}s yet</strong>
              <span>{workbench.emptyHint}</span>
            </div>
          )}
        </div>
      )}

      {panel === 'history' && !labChannel && (
        <div className="utility-body">
          <div className="results-toolbar">
            <BalanceFader
              variant="row"
              value={channelBalance}
              onChange={onChannelBalanceChange}
              accuracyMeans={workbench.accuracyMeans}
              label={`What matters more for ${channel === 'code' ? 'code' : 'chat and writing'}?`}
            />
            <div className="results-toolbar-actions">
              {topRankedScore && (
                <button
                  type="button"
                  className="btn btn-line btn-sm"
                  onClick={() => { void downloadMatchCard({ score: topRankedScore, appVersion: APP_VERSION }); }}
                  title={`Save a match card image of ${topRankedScore.model}. RigMatch sends nothing anywhere.`}
                >
                  Share scorecard
                </button>
              )}
              {rankedModelScores.length > 0 && (
                <button
                  type="button"
                  className="btn btn-line btn-sm"
                  onClick={copyScorecard}
                  title="Copy the results as Markdown, for Reddit, Discord and the like"
                >
                  {scoreCopied ? 'Copied' : 'Copy results'}
                </button>
              )}
              <button type="button" className="btn btn-line btn-sm" onClick={() => setScoreExplainerOpen(true)}>
                How we score
              </button>
              {rankedModelScores.length > 0 && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={onClearAllScores}
                  title="Clear every saved score and transcript (asks first)"
                >
                  Clear scores…
                </button>
              )}
            </div>
          </div>
          {/* Code's own board, first: the coding answers alone, at the Code
              fader. The Match ranking below still blends every kind of question. */}
          {channel === 'code' && (
            <section className="speed-date-results coding-board" aria-label="Coding board">
              <CodingBoard scores={rankedModelScores} balance={channelBalance} label={workbench.shortLabel} />
            </section>
          )}
          {channel !== 'code' && goalMatches.length > 0 && (
            <div className="task-picks-section goal-match-board" aria-label="Your matches by goal">
              <span>Matches</span>
              <div className="task-picks-grid">
                {goalMatches.map((match) => (
                  <div
                    key={match.goal.id}
                    className={`task-pick-card${match.isMainGoal ? ' main-goal-card' : ''}${match.pick ? '' : ' awaiting-card'}`}
                  >
                    <em>
                      {match.isMainGoal ? 'Your Match' : match.goal.matchLabel}
                      {match.pick && (
                        <span
                          className="task-pick-measured"
                          title={`Measured here: scored ${match.pick.taskScore} on this rig's ${match.goal.label.toLowerCase()} questions. Goal crowns only ever come from measurement.`}
                        >measured</span>
                      )}
                    </em>
                    {match.isMainGoal && <span className="goal-match-sub">{match.goal.matchLabel}</span>}
                    {match.pick ? (
                      <>
                        <strong title={match.pick.model}>{match.pick.model}</strong>
                        <span className={`score-row-grade ${getScoreTone(match.pick.score.total)}`}>
                          {match.pick.taskScore} on {match.goal.label.toLowerCase()} · {formatMatchScore(match.pick.score)} overall
                        </span>
                        <span className="task-pick-response-time">{getResponseEstimate(match.pick.score.speed)}</span>
                      </>
                    ) : (
                      <>
                        <strong>No crown yet</strong>
                        <span className="goal-match-awaiting">{match.awaiting}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {channel !== 'code' && taskPicks.length > 0 && (
            <div className="task-picks-section" aria-label="Category picks">
              <span>{goalMatches.length > 0 ? 'More picks' : 'Matches'}</span>
              <div className="task-picks-grid">
                {taskPicks.map((pick) => (
                  <div key={pick.id} className="task-pick-card">
                    <em>
                      {matchDisplayLabel(pick.id, pick.label)}
                      {pick.measured && (
                        <span
                          className="task-pick-measured"
                          title={`Measured here: scored ${pick.taskScore} on this rig's ${pick.label.toLowerCase()} questions, rather than taken from the model's description.`}
                        >measured</span>
                      )}
                    </em>
                    <strong title={pick.model}>{pick.model}</strong>
                    <span className={`score-row-grade ${getScoreTone(pick.score.total)}`}>
                      {formatMatchScore(pick.score)} · {pick.score.grade}
                    </span>
                    <span className="task-pick-response-time">{getResponseEstimate(pick.score.speed)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rankedModelScores.length > 0 && <h3 className="results-heading">Every tested model</h3>}
          {rankedModelScores.length > 0 && (
            <ol className="utility-list score-ranking-list" aria-label="Ranked model scores">
              {rankedModelScores.map((score, index) => {
                const prevScore = rankedModelScores[index - 1];
                const isTied = prevScore !== undefined && prevScore.total === score.total;
                const installed = ollama.models.find((m) => m.name === score.model || m.model === score.model);
                const drift = scoreDrift(score, {
                  gpuModel: system.gpu.model,
                  vramGb: system.gpu.vramGb,
                  modelDigest: installed?.digest,
                });
                return (
                  <li
                    key={`${score.model}-${score.completedAt}`}
                    className={`${isTied ? 'score-row-tied' : ''}${onSelectTopPick ? ' score-row-clickable' : ''}`}
                    onClick={() => onSelectTopPick?.(score.model)}
                    title={onSelectTopPick ? `View ${score.model} in Top Pick` : undefined}
                    role={onSelectTopPick ? 'button' : undefined}
                    tabIndex={onSelectTopPick ? 0 : undefined}
                    onKeyDown={(e) => {
                      // Only when the row itself has focus. The row is a
                      // role="button" containing a real button, so without this
                      // test Enter on "Remove" deleted the score AND navigated
                      // away — one keystroke, two actions, mouse users immune.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        // Space scrolls the page otherwise.
                        e.preventDefault();
                        onSelectTopPick?.(score.model);
                      }
                    }}
                  >
                    <b>{isTied ? '=' : index + 1}</b>
                    <img className="score-row-portrait" src={getModelAvatarSrc(score.model)} alt="" />
                    <div className="score-row-name">
                      <span>
                        {score.model}
                        {isLegacyScore(score) && <span className="legacy-score-badge">Retest recommended</span>}
                        {!isLegacyScore(score) && drift && (
                          <span
                            className="legacy-score-badge drift-badge"
                            title={score.rig ? (score.rig.host ? `Scored on ${score.rig.host} — that computer's hardware is not known here — with RigMatch ${score.rig.appVersion}.` : `Scored on ${score.rig.gpu ?? 'this computer'}${score.rig.vramGb ? ` (${score.rig.vramGb} GB)` : ''} with RigMatch ${score.rig.appVersion}.`) : undefined}
                          >
                            {scoreDriftLabel(drift)}
                          </span>
                        )}
                        <ModelDemoChips model={score.model} label="" className="inline" />
                      </span>
                      <em>{score.speed} speed · {score.sobriety} accuracy · {score.fit} fit · {getResponseEstimate(score.speed)}</em>
                    </div>
                    <strong className={`score-row-grade ${getScoreTone(score.total)}`}>
                      {isTied && <span className="tie-badge">Tied</span>}
                      {formatMatchScore(score)} · {score.grade}
                    </strong>
                    {onSelectTopPick && <ChevronRight className="score-row-nav-arrow" aria-hidden="true" />}
                    <button
                      type="button"
                      className="icon-action score-clear-button"
                      onClick={(e) => { e.stopPropagation(); onClearScore(score.model); }}
                      title={`Clear ${score.model} score`}
                      aria-label={`Clear ${score.model} score`}
                    >
                      <span>Remove</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <HistoryTimeline scores={recentModelScores} onClearScore={onClearScore} />
          {listTestResult && <h3 className="results-heading">The last show</h3>}
          {listTestResult ? (
            <ol className="utility-list" aria-label="The last show's ranking">
              {listTestResult.results.map((result, index) => (
                <li key={result.model} className={result.model === listTestResult.winner ? 'winner' : ''}>
                  <b>{index + 1}</b>
                  <span>{result.model}</span>
                  <strong>{formatMatchScore(result)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="utility-empty">
              <strong>No comparison yet</strong>
              <span>Compare two or more models to rank the best match.</span>
            </div>
          )}
        </div>
      )}

      {panel === 'settings' && (
        // settings-body, not just utility-body: this column is prose-width
        // rows, and the class other utility panels share must not inherit that.
        <div className="settings-layout">
          {/* The navigation: one entry per section, with what it is set to. */}
          <nav className="settings-rail" aria-label="Settings sections">
            <h2 className="settings-rail-title">Settings</h2>
            {settingsRail.map((item) => (
              <button
                key={item.id}
                type="button"
                className={openSection === item.id ? 'settings-rail-item open' : 'settings-rail-item'}
                onClick={() => openSectionFromRail(item.id)}
                aria-current={openSection === item.id ? 'true' : undefined}
              >
                <strong>{item.title}</strong>
                {item.status && <em>{item.status}</em>}
              </button>
            ))}
          </nav>
        <div ref={settingsBodyRef} className="utility-body settings-body">
          <SettingsSection
            title="Preferences"
            summary="Mode, theme, goals, show extras, and the Simple Mode path."
            open={openSection === 'interface'}
            sectionId="interface"
          >
          <UiModePicker uiMode={uiMode} onUiModeChange={onUiModeChange} />
          <GoalsSummary goals={selectedGoals} onEditGoals={onEditGoals} />
          <div className="utility-stat">
            <span>Welcome</span>
            <em>Three steps: what RigMatch is, what a model is, and what you want one for.</em>
            <button type="button" className="btn btn-line" onClick={onShowWelcome}>Show the welcome again</button>
          </div>
          <ThemePicker themeId={themeId} onThemeChange={onThemeChange} />
          <ShowExtrasSettings />
          </SettingsSection>
          <SettingsSection
            title="Achievements"
            summary={`${earnedCount} of ${ACHIEVEMENTS.length} earned. Each one is something worth trying.`}
            open={openSection === 'achievements'}
            sectionId="achievements"
          >
            <AchievementShelf />
          </SettingsSection>
          <SettingsSection
            title="The Closet"
            summary="Who is taking up shelf space, and whether they earned it."
            open={openSection === 'storage'}
            sectionId="storage"
          >
            <ClosetSection
              rows={installedRows}
              modelScores={modelScores}
              topModel={rankedModelScores[0]?.model}
              onDeleteModel={onDeleteModel}
            />
          </SettingsSection>
          <SettingsSection
            title="Providers"
            summary="Runtime, Ollama, LM Studio, and local-only scope."
            open={openSection === 'providers'}
            sectionId="providers"
          >
          <div className="utility-stat">
            <span>Status</span>
            <strong>Full details are on My PC</strong>
            <em>Hardware, CUDA, Ollama and LM Studio status are all on My PC. Local models run entirely on this computer; nothing leaves it.</em>
            <button type="button" className="btn btn-line" onClick={onOpenSetupGuide}>Setup guide</button>
          </div>
          </SettingsSection>

          <SettingsSection
            title="ComfyUI"
            summary="Where image and video generation run, and whether RigMatch may unload models."
            open={openSection === 'generation'}
            sectionId="generation"
          >
          <ComfySettings />
          </SettingsSection>

          <SettingsSection
            title="Updates"
            summary="RigMatch app updates, Ollama updates, and recent changes."
            open={openSection === 'updates'}
            sectionId="updates"
          >
          <UpdateCenter
            channel={updateChannel}
            result={updateCheck}
            isChecking={isCheckingUpdates}
            autoUpdateStatus={autoUpdateStatus}
            onChannelChange={onUpdateChannelChange}
            onCheck={onCheckForUpdates}
            onOpenPage={onOpenUpdatePage}
            onDownload={onDownloadUpdate}
            onInstall={onInstallUpdate}
          />
          <section className={`ollama-update-card ${ollamaHasUpdate ? 'has-update' : ''}`} aria-label="Ollama version">
            <div className="ollama-update-head">
              <div>
                <span>Ollama</span>
                <strong>
                  {ollama.version ? `v${ollama.version} installed` : 'Not detected'}
                  {ollamaUpdateLatest && !ollamaHasUpdate ? ' — up to date' : ''}
                </strong>
                {ollamaHasUpdate && (
                  <em className="ollama-update-badge">v{ollamaUpdateLatest} available</em>
                )}
              </div>
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => void checkOllamaUpdate()}
                disabled={isCheckingOllamaUpdate}
              >
                <RefreshCw className={isCheckingOllamaUpdate ? 'spin' : ''} aria-hidden="true" />
                {isCheckingOllamaUpdate ? 'Checking' : 'Check'}
              </button>
            </div>
            {ollamaHasUpdate && (
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                className="ollama-update-dl-btn"
              >
                <Download aria-hidden="true" />
                Download Ollama v{ollamaUpdateLatest}
                <ExternalLink aria-hidden="true" />
              </a>
            )}
          </section>
          <ReleaseNotes releases={releaseNotes} />
          </SettingsSection>

          <SettingsSection
            title="Support"
            summary="Donationware link, bug reports, and diagnostics."
            open={openSection === 'support'}
            sectionId="support"
          >
          <div className="utility-stat">
            <span>Support RigMatch</span>
            <strong>Donationware</strong>
            <em>Simple Mode stays free. Advanced is the natural home for future supporter tools, but this beta keeps everything open while the flow gets polished.</em>
            <a
              className="btn btn-line"
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Coffee aria-hidden="true" />
              Buy Me a Coffee
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
          <div className="utility-stat bug-report-stat">
            <span>Beta feedback</span>
            <strong>Found something broken?</strong>
            <em>One click opens a prefilled GitHub issue with your hardware specs attached. No telemetry — this is the only way I hear about bugs.</em>
            <div className="bug-report-actions">
              <a
                className="btn btn-line"
                href={buildBugReportUrl(system, ollama, logPath)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Bug aria-hidden="true" />
                Report a bug
                <ExternalLink aria-hidden="true" />
              </a>
              <button
                type="button"
                className="btn btn-line"
                onClick={() => void copyText(buildDiagnosticsText(system, ollama, logPath)).then((ok) => {
                  setDiagnosticsCopy(ok ? 'copied' : 'failed');
                  window.setTimeout(() => setDiagnosticsCopy('idle'), 2400);
                })}
                title="Copy hardware + version info to clipboard"
              >
                <Copy aria-hidden="true" />
                {diagnosticsCopy === 'copied' ? 'Copied' : diagnosticsCopy === 'failed' ? 'Copy failed' : 'Copy diagnostics'}
              </button>
            </div>
          </div>
          <div className="utility-stat">
            <span>Current target</span>
            <strong>{selectedHost?.hostname ?? 'Local machine'}</strong>
            <em>{selectedModel}</em>
          </div>
          </SettingsSection>

          <SettingsSection
            title="Scoring and reset"
            summary="How scoring works and destructive cleanup."
            advancedOnly
            open={openSection === 'advanced'}
            sectionId="advanced"
          >
          <HowWeScoreSection />
          <section className="danger-zone" aria-label="Data reset">
            <div>
              <span>Danger zone</span>
              <strong>Clear app data</strong>
              <em>Clears everything RigMatch saved here: logs, scores, comparison results, chat, model notes, goals, theme, question suite, and grading settings including any saved API key. Installed Ollama models stay put, and so does your Simple or Advanced choice; the getting-started guide is not replayed.</em>
            </div>
            <button type="button" className="btn btn-danger" onClick={onClearAllData}>
              <Trash2 aria-hidden="true" />
              Clear all data
            </button>
          </section>
          </SettingsSection>
        </div>
        </div>
      )}
    </section>
  );
}
