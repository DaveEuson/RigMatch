import { matchDisplayLabel } from '../lib/goals';
import type { UtilityPanelId } from '../types';
import robotScorecardCeremony from '../assets/robot-scorecard-ceremony.webp';
import { releaseNotes } from '../data/releaseNotes';
import type { ThemeId, UiMode } from '../lib/appConfig';
import { APP_VERSION, BUY_ME_A_COFFEE_URL } from '../lib/appConfig';
import type { CopyState } from '../lib/clipboard';
import { copyText } from '../lib/clipboard';
import { compareVersionStrings, getResponseEstimate, getScoreTone } from '../lib/format';
import { getGoalMatches } from '../lib/goalMatches';
import type { GoalId } from '../lib/goals';
import { downloadMatchCard } from '../lib/matchCard';
import type { ListTestResult } from '../lib/modelCatalog';
import { buildBugReportUrl, buildDiagnosticsText, buildShareableScorecard, getNavLabel, getRankedModelScores, getRecentModelScores, getTaskTopPicks } from '../lib/modelCatalog';
import { MATCH_GRADE_BAND_ROWS } from '../lib/scoreReference';
import { formatMatchScore, isLegacyScore, scoreDrift, scoreDriftLabel } from '../lib/scoring';
import { useDialog } from '../lib/useDialog';
import type { AppLogEntry, AutoUpdateStatus, ChatMessage, ModelRow, NetworkHost, OllamaStatus, SystemProfile, TestedModelScore, UpdateChannel, UpdateCheckResponse } from '../types';
import { ClosetSection } from './ClosetSection';
import { ComfySettings } from './ComfySettings';
import { BrandMark } from './CommonChrome';
import { GoalsSummary } from './GoalsSummary';
import { HistoryTimeline } from './HistoryTimeline';
import { HowWeScoreSection } from './HowWeScoreSection';
import { LogEntry } from './LogEntry';
import { RomanceArtBanner } from './ScoreVisuals';
import { SettingsSection } from './SettingsSection';
import { ModelDemoChips } from './SkillDemoViewers';
import { ThemePicker } from './ThemePicker';
import { UiModePicker } from './UiModePicker';
import { ReleaseNotes, UpdateCenter } from './UpdateCenter';
// `History` must be imported explicitly: without it the name resolves to the
// DOM's global History constructor, which is a real value, so nothing errors
// until it is used as a JSX component.
import { Bot, Bug, Check, ChevronRight, Coffee, Copy, Download, ExternalLink, FolderOpen, HelpCircle, History, RefreshCw, Settings, Share2, Trash2, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  appLogs,
  modelScores,
  chatMessages,
  updateChannel,
  updateCheck,
  isCheckingUpdates,
  logPath,
  isLoadingLogs,
  onThemeChange,
  onUiModeChange,
  onEditGoals,
  onDeleteModel,
  onRefreshLogs,
  onCopyLogs,
  onClearLogs,
  onOpenLogsFolder,
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
  appLogs: AppLogEntry[];
  modelScores: Record<string, TestedModelScore>;
  chatMessages: ChatMessage[];
  updateChannel: UpdateChannel;
  updateCheck: UpdateCheckResponse | null;
  isCheckingUpdates: boolean;
  logPath: string;
  isLoadingLogs: boolean;
  onThemeChange: (themeId: ThemeId) => void;
  onUiModeChange: (mode: UiMode) => void;
  onEditGoals: () => void;
  onDeleteModel: (row: ModelRow) => void;
  onRefreshLogs: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
  onOpenLogsFolder: () => void;
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
}) {
  const Icon = panel === 'history' ? History : Settings;

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
  const savedChatMessageCount = Math.max(0, chatMessages.length - 1);
  const [scoreExplainerOpen, setScoreExplainerOpen] = useState(false);
  const scoreExplainerRef = useDialog<HTMLDivElement>(() => setScoreExplainerOpen(false));
  const [scoreCopied, setScoreCopied] = useState(false);
  const [ollamaUpdateLatest, setOllamaUpdateLatest] = useState<string | null>(null);
  const [isCheckingOllamaUpdate, setIsCheckingOllamaUpdate] = useState(false);

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

  return (
    <section
      className={panel === 'history' ? 'panel utility-panel history-panel panel-focused' : 'panel utility-panel panel-focused'}
      aria-label={`${getNavLabel(panel)} panel`}
    >
      <div className="utility-title">
        <div>
          <Icon aria-hidden="true" />
          <div>
            <span>Panel</span>
            <strong>{getNavLabel(panel)}</strong>
          </div>
        </div>
      </div>

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
                  <span>Answer Quality</span>
                  <strong>How well it follows the prompt</strong>
                  <em>Did it follow instructions, stay on task, and give complete answers? Graded across all test prompts.</em>
                </div>
                <div>
                  <span>Speed</span>
                  <strong>How fast it responds</strong>
                  <em>Tokens per second, measured live on your hardware. Faster = higher speed score.</em>
                </div>
                <div>
                  <span>Hardware Fit</span>
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

      {panel === 'history' && (
        <RomanceArtBanner
          image={robotScorecardCeremony}
          className="scorecard-art-banner"
          kicker="Scorecard ceremony"
          title="Saved tests, ranked scores, crowned matches"
          body={rankedModelScores.length > 0 ? `${rankedModelScores.length} tested model${rankedModelScores.length === 1 ? '' : 's'} ranked by Match score.` : 'Run a model test or Speed Dating to start the ceremony.'}
        />
      )}

      {panel === 'history' && (
        <div className="utility-body">
          <div className="utility-stat">
            <div className="utility-stat-head">
              <span>Ranking board</span>
              <div className="utility-stat-head-actions">
                {topRankedScore && (
                  <button
                    type="button"
                    className="how-we-score-trigger"
                    onClick={() => {
                      void downloadMatchCard({ score: topRankedScore, appVersion: APP_VERSION }).then((saved) => {
                        if (!saved) return;
                      });
                    }}
                    title={`Save a match card image of ${topRankedScore.model} — share it wherever you like; RigMatch sends nothing anywhere.`}
                  >
                    <Share2 aria-hidden="true" />
                    Share card
                  </button>
                )}
                {rankedModelScores.length > 0 && onSelectTopPick && (
                  <button
                    type="button"
                    className="how-we-score-trigger flow-next-trigger"
                    onClick={() => onSelectTopPick(rankedModelScores[0].model)}
                    title={`Open ${rankedModelScores[0].model} in Top Pick`}
                  >
                    <Bot aria-hidden="true" />
                    Top Pick
                    <ChevronRight aria-hidden="true" />
                  </button>
                )}
                {rankedModelScores.length > 0 && (
                  <button
                    type="button"
                    className={`how-we-score-trigger${scoreCopied ? ' copied' : ''}`}
                    onClick={copyScorecard}
                    title="Copy results as markdown to share on Reddit, Discord, etc."
                    aria-label="Copy scorecard to clipboard"
                  >
                    {scoreCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {scoreCopied ? 'Copied!' : 'Share results'}
                  </button>
                )}
                <button
                  type="button"
                  className="how-we-score-trigger"
                  onClick={() => setScoreExplainerOpen(true)}
                  title="How scores are calculated"
                  aria-label="How we score — open explanation"
                >
                  <HelpCircle aria-hidden="true" />
                  How we score
                </button>
                {rankedModelScores.length > 0 && (
                  <button
                    type="button"
                    className="how-we-score-trigger clear-all-scores-trigger"
                    onClick={onClearAllScores}
                    title="Clear every saved score and transcript (asks first)"
                    aria-label="Clear all saved scores"
                  >
                    <Trash2 aria-hidden="true" />
                    Clear all
                  </button>
                )}
              </div>
            </div>
            <strong>{rankedModelScores.length} tested model{rankedModelScores.length === 1 ? '' : 's'}</strong>
            <em>
              {rankedModelScores.length > 0
                ? 'Click any row to open it in Top Pick.'
                : 'Run a single test or Speed Dating to build the ranking.'}
            </em>
          </div>
          <div className="utility-stat">
            <span>Best saved test</span>
            <strong>{topRankedScore ? topRankedScore.model : 'No saved score'}</strong>
            <em>{topRankedScore ? `${formatMatchScore(topRankedScore)} total · ${topRankedScore.grade}` : 'Run a test to save the next scorecard.'}</em>
          </div>
          {goalMatches.length > 0 && (
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
          {taskPicks.length > 0 && (
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
                    <div className="score-row-name">
                      <span>
                        {score.model}
                        {isLegacyScore(score) && <span className="legacy-score-badge">Retest recommended</span>}
                        {!isLegacyScore(score) && drift && (
                          <span
                            className="legacy-score-badge drift-badge"
                            title={score.rig ? `Scored on ${score.rig.gpu} (${score.rig.vramGb} GB) with RigMatch ${score.rig.appVersion}.` : undefined}
                          >
                            {scoreDriftLabel(drift)}
                          </span>
                        )}
                        <ModelDemoChips model={score.model} label="" className="inline" />
                      </span>
                      <em>{score.speed} speed · {score.sobriety} accuracy · {score.fit} fit · {getResponseEstimate(score.speed)}</em>
                    </div>
                    <strong className={`score-row-grade ${getScoreTone(score.total)}`}>
                      {isTied && <span className="tie-badge">TIED</span>}
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
                      <Trash2 aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <section className="score-cleanup-panel" aria-label="Score cleanup">
            <div>
              <span>Score Cleanup</span>
              <strong>Forget stale match history</strong>
              <em>Clears scorecards and test transcripts only. Installed Ollama models stay put.</em>
            </div>
            <button type="button" className="danger-button compact" onClick={onClearAllScores} disabled={!rankedModelScores.length}>
              <Trash2 aria-hidden="true" />
              Clear All Scores
            </button>
          </section>
          <HistoryTimeline scores={recentModelScores} onClearScore={onClearScore} />
          <div className="utility-stat">
            <span>Current match</span>
            <strong>{selectedHost?.hostname ?? 'Local machine'}</strong>
            <em>{selectedModel}</em>
          </div>
          <div className="utility-stat">
            <span>Saved app history</span>
            <strong>{recentModelScores.length} scorecard{recentModelScores.length === 1 ? '' : 's'}</strong>
            <em>
              {savedChatMessageCount > 0
                ? `${savedChatMessageCount} chat message${savedChatMessageCount === 1 ? '' : 's'} saved locally`
                : 'Chat starts saving locally after your first message'}
            </em>
          </div>
          {listTestResult ? (
            <ol className="utility-list" aria-label="Latest Speed Dating ranking">
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
          <section className="log-console advanced-only" aria-label="Run logs">
            <div className="log-console-head">
              <div>
                <span>Run Logs</span>
                <strong>{isLoadingLogs ? 'Loading' : `${appLogs.length} entries`}</strong>
                <em>{logPath || 'Log file not created yet'}</em>
              </div>
              <div className="log-actions">
                <button type="button" className="mini-button outline icon-only" onClick={onRefreshLogs} title="Refresh logs" aria-label="Refresh logs">
                  <RefreshCw className={isLoadingLogs ? 'spin' : ''} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="mini-button outline icon-only"
                  onClick={onCopyLogs}
                  disabled={!appLogs.length}
                  title={appLogs.length ? 'Copy logs' : 'Nothing to copy — the log is empty'}
                  aria-label={appLogs.length ? 'Copy logs' : 'Copy logs — nothing to copy, the log is empty'}
                >
                  <Copy aria-hidden="true" />
                </button>
                <button type="button" className="mini-button outline icon-only" onClick={onOpenLogsFolder} title="Open log folder" aria-label="Open log folder">
                  <FolderOpen aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="mini-button outline"
                  onClick={onClearLogs}
                  disabled={!appLogs.length}
                  title={appLogs.length ? 'Clear the run log' : 'Nothing to clear — the log is empty'}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="log-list">
              {appLogs.length ? (
                appLogs.slice(0, 12).map((entry) => (
                  <LogEntry key={entry.id} entry={entry} />
                ))
              ) : (
                <div className="utility-empty">
                  <strong>No logs yet</strong>
                  <span>Failed tests and desktop bridge errors will appear here.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {panel === 'settings' && (
        // settings-body, not just utility-body: this column is prose-width
        // rows, and the class other utility panels share must not inherit that.
        <div className="utility-body settings-body">
          <div className="utility-logo">
            <BrandMark />
            <strong>RigMatch</strong>
            <em>v{APP_VERSION}</em>
          </div>
          <SettingsSection eyebrow="Interface" title="Preferences" summary="Mode, theme, goals, and the Simple Mode path." defaultOpen>
          <UiModePicker uiMode={uiMode} onUiModeChange={onUiModeChange} />
          <GoalsSummary goals={selectedGoals} onEditGoals={onEditGoals} />
          <ThemePicker themeId={themeId} onThemeChange={onThemeChange} />
          </SettingsSection>
          <SettingsSection eyebrow="Storage" title="The Closet" summary="Who is taking up shelf space, and whether they earned it.">
            <ClosetSection
              rows={installedRows}
              modelScores={modelScores}
              topModel={rankedModelScores[0]?.model}
              onDeleteModel={onDeleteModel}
            />
          </SettingsSection>
          <SettingsSection eyebrow="Local AI" title="Computer & Providers" summary="Runtime, Ollama, LM Studio, and local-only scope.">
          <div className="utility-stat">
            <span>Computer & providers</span>
            <strong>Full details live in Your Rig</strong>
            <em>Hardware, CUDA, Ollama and LM Studio status all live under Your Rig. Local models run entirely on this machine — nothing leaves your computer.</em>
          </div>
          <button type="button" className="primary-button compact" onClick={onOpenSetupGuide}>
            <ExternalLink aria-hidden="true" />
            Setup Guide
          </button>
          </SettingsSection>

          <SettingsSection eyebrow="Generation" title="ComfyUI" summary="Where image and video generation run, and whether RigMatch may unload models.">
          <ComfySettings />
          </SettingsSection>

          <SettingsSection eyebrow="Updates" title="Versions & Release Notes" summary="RigMatch app updates, Ollama updates, and recent changes.">
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
                <span>Ollama Engine</span>
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
                className="mini-button outline"
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

          <SettingsSection eyebrow="Support" title="Feedback & Support" summary="Donationware link, bug reports, and diagnostics.">
          <div className="utility-stat">
            <span>Mode</span>
            <strong>Donationware</strong>
            <em>Simple Mode stays free. Advanced is the natural home for future supporter tools, but this beta keeps everything open while the flow gets polished.</em>
            <a
              className="donation-link donation-link-prominent"
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Coffee aria-hidden="true" />
              Support RigMatch — Buy Me a Coffee
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
          <div className="utility-stat bug-report-stat">
            <span>Beta feedback</span>
            <strong>Found something broken?</strong>
            <em>One click opens a prefilled GitHub issue with your hardware specs attached. No telemetry — this is the only way I hear about bugs.</em>
            <div className="bug-report-actions">
              <a
                className="primary-button compact"
                href={buildBugReportUrl(system, ollama, logPath)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Bug aria-hidden="true" />
                Report a Bug
                <ExternalLink aria-hidden="true" />
              </a>
              <button
                type="button"
                className="mini-button outline"
                onClick={() => void copyText(buildDiagnosticsText(system, ollama, logPath)).then((ok) => {
                  setDiagnosticsCopy(ok ? 'copied' : 'failed');
                  window.setTimeout(() => setDiagnosticsCopy('idle'), 2400);
                })}
                title="Copy hardware + version info to clipboard"
              >
                <Copy aria-hidden="true" />
                {diagnosticsCopy === 'copied' ? 'Copied' : diagnosticsCopy === 'failed' ? 'Copy failed' : 'Copy Diagnostics'}
              </button>
            </div>
          </div>
          <div className="utility-stat">
            <span>Current target</span>
            <strong>{selectedHost?.hostname ?? 'Local machine'}</strong>
            <em>{selectedModel}</em>
          </div>
          </SettingsSection>

          <SettingsSection eyebrow="Advanced" title="Scoring & Reset" summary="How scoring works and destructive cleanup." advancedOnly>
          <HowWeScoreSection />
          <section className="danger-zone" aria-label="Data reset">
            <div>
              <span>Danger Zone</span>
              <strong>Clear App Data</strong>
              <em>Clears everything RigMatch saved here: logs, scores, comparison results, chat, model notes, goals, theme, question suite, and grading settings including any saved API key. Installed Ollama models stay put, and so does your Simple or Advanced choice; the getting-started guide is not replayed.</em>
            </div>
            <button type="button" className="danger-button compact" onClick={onClearAllData}>
              <Trash2 aria-hidden="true" />
              Clear All Data
            </button>
          </section>
          </SettingsSection>
        </div>
      )}
    </section>
  );
}
