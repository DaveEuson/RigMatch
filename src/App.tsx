// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { agentArcadeApi, isDesktopRuntime } from './api';
import {
  buildBenchmarkPromptPlan,
  DEFAULT_BENCHMARK_QUESTIONS,
  normalizeBenchmarkQuestions,
  QUICK_CHECK_QUESTIONS,
  type BenchmarkQuestion,
  type BenchmarkQuestionCount,
} from './benchmarkSuite';
import {
  demoBenchmark,
  demoRunHistory,
  demoCatalog,
  demoHosts,
  demoLmStudio,
  demoOllama,
  demoSystem,
  unscannedSystem,
  unscannedProviderStatus,
} from './sampleData';
import type {
  BenchmarkResult,
  BenchmarkStatus,
  CatalogModel,
  LocalModelProvider,
  ModelRow,
  NetworkHost,
  OllamaStatus,
  PullProgressUpdate,
  SystemProfile,
  OllamaInstallProgress,
  TestedModelScore,
  ChatMessage,
  SkillRunStatus,
  GpuContention,
  ScoreRigStamp,
  PendingRunMode,
  SkillTestSelection,
  RunProgress,
  PendingScoreClear,
} from './types';
import {
  SCORE_PRIORITY_STORAGE_KEY,
  compareBenchmarkResults,
  compareTestedModelScores,
  formatMatchScore,
  toTestedModelScore,
  upsertModelScores,
} from './lib/scoring';
import { BALANCE_STORAGE_KEY, applyBalance, readBalances, type Balances } from './lib/balance';
import { codeWinner, labWinner, rankCoding, rankLabList, videoWinner } from './lib/channelWinners';
import { audioMakerChoices, chatPicks, videoMakerChoices } from './lib/chatMakers';
import { renderChatAudio, renderChatVideo, type ChatRender } from './lib/chatRenders';
import { installedAudioEntries } from './lib/audioLineup';
import { audioModelSpec } from './lib/audioCatalog';
import { ChannelComparisonPanel } from './components/ChannelComparisonPanel';
import {
  WORKBENCH_STORAGE_KEY,
  balanceChannel,
  isComparedChannel,
  readWorkbench,
  workbenchById,
  workbenchForGoal,
  type ChannelId,
  type WorkbenchId,
} from './lib/workbench';
import { useLabResults } from './hooks/useLabResults';
import { useVideoLineupSession } from './hooks/useVideoLineupSession';
import { useRenderActivity, useRenderOutcome } from './hooks/useRenderActivity';
import { endImageTest, renderChannel, startImageTest, type RenderActivity } from './lib/renderActivity';
import { RunReportModal } from './components/RunReportModal';
import type { StoredRunReport } from './lib/runReports';
import {
  RUN_REPORTS_STORAGE_KEY,
  addRunReport,
  makeReportId,
  parseStoredReports,
  reportStorageCandidates,
} from './lib/runReports';
import { WhatsNewPanel } from './components/WhatsNewPanel';
import { SideMenu, type NavId, type NavItem } from './components/SideMenu';
import { GameShowHost } from './components/GameShowHost';
import { PanelHeader } from './components/CommonChrome';
import { readDeckExpanded, writeDeckExpanded } from './lib/deckSettings';
import { playJingle } from './lib/sound';
import { ChannelSwitch, TopDeck } from './components/TopDeck';
import {
  addSetValues,
  buildBugReportUrl,
  createEmptyBenchmark,
  createQueuedPullProgress,
  createRunProgressId,
  formatBenchmarkBanner,
  formatHistoryTime,
  getAgentName,
  getBenchmarkForModel,
  getDiskGuard,
  getHardwareFit,
  getLineupBenchmarkBlocker,
  getModelAliases,
  getModelBenchmarkBlocker,
  getModelDreamTags,
  getModelEpithet,
  getModelGoodForLine,
  getModelProfile,
  getModelRuntime,
  getModelScore,
  getNavLabel,
  getPlatformFit,
  getRigPick,
  getSavedThemeId,
  getSavedTutorialSeen,
  getSavedUiMode,
  getFriendlyModelName,
  getThemeLabel,
  isBenchmarkByModel,
  isBenchmarkForAliases,
  isBenchmarkForModel,
  isBenchmarkResult,
  isCloudModel,
  isEmbeddingModel,
  isHostBenchmarkReady,
  canGenerateText,
  canJoinComparison,
  canHearAudio,
  canReadImages,
  isLikelyImageGenerationModel,
  isListTestResult,
  isModelScores,
  isRecord,
  mergeModelRows,
  normalizeBenchmarkResultModel,
  normalizeModelKey,
  ollamaModelMatchesAliases,
  playDoneJingle,
  removeBenchmarkResults,
  removeListTestScores,
  removeModelScores,
  removePullProgress,
  removePullProgressForModels,
  removeSetValues,
  sumQueuedGb,
  upsertBenchmarkResults,
} from './lib/modelCatalog';
import type {
  ListTestResult,
} from './lib/modelCatalog';
import { clearAppStorage, dropChat, dropTranscripts, writeLocal, writeLocalJson, writeLocalJsonWithFallback } from './lib/safeStorage';
import { collapseModelVariants } from './lib/wizardVariants';
// Same constant the Simple Mode download step gates on, so the wizard cannot
// wave a lineup through that the run then refuses.
import { MIN_CONTESTANTS } from './lib/downloadStatus';
import {
  appendRuns,
  emptyRunHistory,
  getAllRunDeltas,
  getScoreTrend,
  readRunHistory,
  removeRuns,
  seedFromBenchmarkResults,
  toRunHardware,
  toRunHistoryEntry,
  writeRunHistory,
  type RunHistory,
} from './lib/runHistory';
import { estimateBenchmarkMs, estimateSpeedDateMs } from './lib/runEstimates';
import {
  APP_VERSION,
  CLEARED_TOP_MATCHES_STORAGE_KEY,
  DEFAULT_SHORTLIST_IDS,
  HISTORY_STORAGE_KEY,
  LINEUP_STRIP_SCREENS,
  NAV_ITEM_BY_ID,
  SIMPLE_NAV_ORDER,
  TEST_SUITE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TUTORIAL_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
  navItems,
  readCloseCleanupAsk,
  writeCloseCleanupAsk,
  type ThemeId,
  type UiMode,
} from './lib/appConfig';
import { AvatarBust } from './components/Avatars';
import { ShareScorecard } from './components/ShareScorecard';
import { ExportHatchModal } from './components/ExportHatchModal';
import { buildHatchProfile } from './lib/hatchProfile';
import { UpdateAvailableToast } from './components/UpdateAvailableToast';
import { SimpleWizard, type DreamFilterId, type StepId as WizardStepId, type WizardModel } from './components/SimpleWizard';
import { DeleteModelModal, CloseCleanupModal, ClearDataModal, SupportModal, ChoiceCruiseModal } from './components/dialogs';
import { ChatDock } from './components/ChatDock';
import { SkillRunMiniBar, LiveBuildModal, DemoResultModal } from './components/SkillDemoViewers';
import { RunWarningModal } from './components/RunWarningModal';
import { ClearScoresModal } from './components/ClearScoresModal';
import { ThirdPartyDownloadConsentModal } from './components/ThirdPartyDownloadConsentModal';
import { QuickCheckWarningModal } from './components/QuickCheckWarningModal';
import { SetupGuideDock } from './components/SetupGuideDock';
import { LanBrowser } from './components/LanBrowser';
import { Ticker } from './components/Ticker';
import { TestSuiteEditorDock } from './components/TestSuiteEditorDock';
import { FirstRunSplash } from './components/FirstRunSplash';
import { ModelPoolLineupStrip } from './components/ModelPoolLineupStrip';
import { FirstRunTutorial } from './components/FirstRunTutorial';
import { ActivityPanel } from './components/ActivityPanel';
import { SpeedDatePanel } from './components/SpeedDatePanel';
import { UtilityPanel } from './components/UtilityPanel';
import { ModelCabinet } from './components/ModelCabinet';
import { AgentReveal } from './components/AgentReveal';
import { LiveFlirtSpotlight } from './components/LiveFlirtSpotlight';
import { extractHtmlDocument } from './lib/labPreview';
import {
  describeLabFailure,
  readAdvancedLabResults,
  writeAdvancedLabResults,
  wasJudged,
  checkState,
  type DemoArtifact,
  type AdvancedLabResult,
} from './lib/labResults';
import {
  DEFAULT_APP_BUILDER_PRESET_ID,
  resolveAppBuilderPrompt,
  buildAppBuilderRetryPrompt,
  extractJudgedProblem,
  getListeningTestAudio,
  getVisionTestImageDataUrl,
  runAdvancedAppBuilderChallenge,
  runCodeChallenge,
  runAdvancedListeningChallenge,
  runAdvancedVisionChallenge,
  DEFAULT_VISION_TEST_IMAGE,
  VISION_TEST_IMAGES,
} from './lib/labChallenges';
import { AUDIO_BENCHMARK_PROMPTS } from './lib/audioGenScoring';
import { startAudioLineup } from './lib/audioLineupSession';
import { startVideoLineup } from './lib/videoLineupSession';
import { IMAGE_BENCHMARK_PROMPTS } from './lib/imageGenScoring';
import { judgeCandidates, toLabResult } from './lib/imageGenChallenge';
import { listenerCandidates } from './lib/audioGenChallenge';
import { isPictureCheckpoint } from './lib/checkpointKinds';
import { batchSeed } from './lib/videoGen';
import { toVideoLabResult } from './lib/videoGenChallenge';
import { downloadPlan, formatBytesGb, generationCatalogRows, generationModelById } from './lib/generationCatalog';
import { readHuggingFaceToken } from './lib/huggingFaceToken';
import { goalById, presetIdForGoal } from './lib/goals';
import { modelMatchesTask } from './lib/modelCatalog';
import { deletableRows, rowsExceptTopPick, topPickToKeep } from './lib/modelCleanup';
import { runVideoLineupLive } from './lib/videoGenRunner';
import {
  allLineupEntries,
  asHardwareFit,
  comfyListing,
  estimateLineup,
  lineupEntry,
  runnableLineup,
  videoMachineFrom,
  type LineupOutcome,
  type VideoLineupEntry,
} from './lib/videoLineup';
import { formatVideoEstimate, videoFit } from './lib/videoFit';
import { readVideoCalibration } from './lib/videoCalibrationStore';
import { runImageLabChallenge } from './lib/imageGenRunner';
import { CUSTOM_IMAGE_PROMPT_ID } from './lib/imageGenScoring';
import { describeComfyBusy, getComfyStatus, locateComfyFolder } from './lib/comfyTransport';
import { ensureComfyRunning } from './lib/comfyStarter';
import { readComfySettings } from './lib/comfySettings';
import {
  CODE_TASK_PRESETS,
  DEFAULT_CODE_LANGUAGE,
  resolveCodeTask,
  extractCodeBlock,
} from './lib/codeChallenge';
import {
  countWithVerb,
  formatGb,
  formatPullCount,
  getErrorMessage,
} from './lib/format';
import { useAppLogs } from './hooks/useAppLogs';
import { useAppUpdates } from './hooks/useAppUpdates';
import { useModelNews } from './hooks/useModelNews';
import { useJudgeSettings } from './hooks/useJudgeSettings';
import { useComfy } from './hooks/useComfy';
import { useChat } from './hooks/useChat';
import { useGoals } from './hooks/useGoals';
import { attachmentBlockedReason } from './lib/chatCapabilityGuard';
import { usePullControl } from './hooks/usePullControl';
import { useGpuContention } from './hooks/useGpuContention';
import { gpuBusyNote } from './lib/gpuBusyNote';
import { pullOutcome } from './lib/pullControl';
import './App.css';


// Quick TEST resource warning opt-out ('off' = user chose "don't warn again").
const QUICK_CHECK_WARNING_KEY = 'rigmatch:quick-test-warning:v1';
const initialHosts = isDesktopRuntime ? [] : demoHosts.filter((host) => host.isLocal);
const initialSelectedHostId = initialHosts[0]?.id ?? 'localhost';
const welcomeChatMessage: ChatMessage = {
  id: 'welcome',
  role: 'agent',
  content: 'I am your local AI matchmaker. Run a model test, then I can introduce you to the model that fits this computer best.',
};

type PersistedHistory = {
  // Null on a fresh desktop install that has scores/scorecards but no single
  // "current" benchmark — restore derives fallbacks from benchmarkByModel.
  benchmark: BenchmarkResult | null;
  benchmarkByModel?: Record<string, BenchmarkResult>;
  listTestResult: ListTestResult | null;
  modelScores: Record<string, TestedModelScore>;
  chatMessagesByModel: Record<string, ChatMessage[]>;
  chatMessages?: ChatMessage[]; // kept for migrating old saves
  selectedModel?: string;
  savedAt: string;
};

/**
 * The skill each test Chat can ask for runs, by the name Chat uses for it.
 *
 * Chat speaks in what a person would ask for — a picture it reads, an app it
 * builds — and the run flow speaks in the skill's own name. One map, so the
 * two vocabularies meet in exactly one place.
 */
const SKILL_FOR_TEST: Record<'reading' | 'listening' | 'code' | 'app', 'vision' | 'listening' | 'code' | 'app-builder'> = {
  reading: 'vision',
  listening: 'listening',
  code: 'code',
  app: 'app-builder',
};

function App() {
  const savedHistory = useMemo(() => getSavedHistory(), []);
  // On desktop, start with no benchmark data — the demo transcript/scores are
  // preview-only sample data and must not appear as if the user ran a real test.
  // (modelScores is gated the same way below.)
  const initialBenchmark = savedHistory?.benchmark ?? (isDesktopRuntime ? null : demoBenchmark);
  // Desktop starts from a neutral "not scanned yet" profile so a failed launch
  // scan can never present sample hardware as detected fact (and size real model
  // recommendations against it). The browser demo keeps the sample data, which
  // is now labeled by the demo banner.
  const [system, setSystem] = useState<SystemProfile>(isDesktopRuntime ? unscannedSystem : demoSystem);
  const [ollama, setOllama] = useState<OllamaStatus>(isDesktopRuntime ? unscannedProviderStatus : demoOllama);
  const [lmStudio, setLmStudio] = useState<OllamaStatus>(isDesktopRuntime ? unscannedProviderStatus : demoLmStudio);
  const [catalog, setCatalog] = useState<CatalogModel[]>(demoCatalog.models);
  const [catalogMeta, setCatalogMeta] = useState({
    syncedAt: demoCatalog.syncedAt,
    source: demoCatalog.source,
    error: demoCatalog.error,
  });
  const [hosts, setHosts] = useState<NetworkHost[]>(initialHosts);
  const [selectedHostId, setSelectedHostId] = useState(initialSelectedHostId);
  const [selectedModel, setSelectedModel] = useState(savedHistory?.selectedModel ?? 'qwen2.5:7b');
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(initialBenchmark);
  const [benchmarkByModel, setBenchmarkByModel] = useState<Record<string, BenchmarkResult>>(
    () => savedHistory?.benchmarkByModel ?? (initialBenchmark ? upsertBenchmarkResults({}, [initialBenchmark]) : {}),
  );
  const [queuedModelIds, setQueuedModelIds] = useState<Set<string>>(() => new Set());
  // Start empty on desktop: pre-picking five models made the wizard tick "Pick"
  // as done before the user chose anything, showed the alternatives grayed out
  // as "Lineup full", and told people to pick while having already picked for
  // them. Simple Mode offers an explicit "Choose for me" instead. The browser
  // demo keeps a filled lineup so the flow can be explored without setup.
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(
    () => new Set(isDesktopRuntime ? [] : DEFAULT_SHORTLIST_IDS),
  );
  const [isScanningRig, setIsScanningRig] = useState(false);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [externalBenchmark, setExternalBenchmark] = useState<BenchmarkStatus | null>(null);
  const [isListTesting, setIsListTesting] = useState(false);
  const [isPullingModels, setIsPullingModels] = useState(false);
  const [isPullPaused, setIsPullPaused] = useState(false);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgressByModel, setPullProgressByModel] = useState<Record<string, PullProgressUpdate>>({});
  const {
    cancelRequested: isPullCancelRequested,
    pauseRequested: isPullPauseRequested,
    currentRequest: currentPullRequest,
    shouldStop: pullQueueShouldStop,
    ask: askPullQueue,
    clearRequest: clearPullRequest,
    setActiveProgressId: setActivePullProgressId,
  } = usePullControl();
  const stopRunRef = useRef(false);
  // The benchmark progressId / skill-test streamId currently in flight, so Stop
  // can actually cancel the running generation instead of only being noticed at
  // the next model boundary (which made Stop feel dead for minutes).
  const activeBenchmarkProgressIdRef = useRef<string | null>(null);
  const activeSkillStreamIdRef = useRef<string | null>(null);
  const requestStopRun = useCallback(() => {
    stopRunRef.current = true;
    const progressId = activeBenchmarkProgressIdRef.current;
    if (progressId) void agentArcadeApi.cancelBenchmark?.(progressId);
  }, []);
  const requestStopSkills = useCallback(() => {
    stopSkillRef.current = true;
    const streamId = activeSkillStreamIdRef.current;
    if (streamId) void agentArcadeApi.abortAdvancedGenerate?.(streamId);
  }, []);
  const stopSkillRef = useRef(false);
  const [pendingDeleteModel, setPendingDeleteModel] = useState<ModelRow | null>(null);
  const [listTestResult, setListTestResult] = useState<ListTestResult | null>(savedHistory?.listTestResult ?? null);
  /**
   * A finished comparison used to announce itself only in the ticker, which
   * scrolls, and by quietly updating three screens the reader had to know to
   * visit. The bar says the report exists; opening it is their choice.
   */
  const [runReports, setRunReports] = useState<StoredRunReport[]>(() => {
    try { return parseStoredReports(JSON.parse(localStorage.getItem(RUN_REPORTS_STORAGE_KEY) ?? '[]')); }
    catch { return []; }
  });
  /** Which stored report the modal is showing, or null for the newest run. */
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [reportReady, setReportReady] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  /**
   * The scores as measured. Everything downstream reads `modelScores` below,
   * which is this map re-summarized at the chat Balance fader — so
   * what gets saved here is always the measurement, never a view of it.
   */
  const [savedModelScores, setModelScores] = useState<Record<string, TestedModelScore>>(() =>
    savedHistory?.modelScores ?? (isDesktopRuntime ? {} : upsertModelScores({}, [demoBenchmark])),
  );
  /**
   * How much accuracy counts against speed: one Balance fader per channel,
   * asked before every test. The Match Score is the chat measurement, so the
   * chat fader is the one that re-summarizes it below.
   */
  const [balances, setBalances] = useState<Balances>(() => readBalances(
    localStorage.getItem(BALANCE_STORAGE_KEY),
    // The old three-way "Best Match Means" setting, carried over once.
    localStorage.getItem(SCORE_PRIORITY_STORAGE_KEY),
  ));
  const setBalance = useCallback((channel: ChannelId, value: number) => {
    setBalances((current) => (current[channel] === value ? current : { ...current, [channel]: value }));
  }, []);
  /** The channel picked in Advanced Mode; until someone picks, the first-run goal decides. */
  const [workbenchPick, setWorkbenchPick] = useState<WorkbenchId | null>(
    () => readWorkbench(localStorage.getItem(WORKBENCH_STORAGE_KEY)),
  );
  /**
   * Applied here, once, rather than at the thirty-seven places that render or
   * rank a Match. Those all read total, preciseTotal or grade, so rewriting the
   * three in one spot means a re-ranked list cannot end up beside a number that
   * was not.
   */
  const modelScores = useMemo(
    () => applyBalance(savedModelScores, balances.chat),
    [savedModelScores, balances.chat],
  );
  const [modelNotes, setModelNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('rigmatch:model-notes:v1') ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  // The benchmark timeline. Seeded once from the pre-0.3.8 single-slot store so
  // upgrading users keep their existing results as the first point in a trend.
  const [runHistory, setRunHistory] = useState<RunHistory>(() => {
    // Preview mode gets a sample timeline so the trend and delta are visible on
    // the demo page; it is never persisted and never reaches desktop.
    if (!isDesktopRuntime) return demoRunHistory();
    const stored = readRunHistory();
    const seeded = seedFromBenchmarkResults(stored, savedHistory?.benchmarkByModel ?? {}, savedHistory?.modelScores ?? {});
    if (seeded !== stored) writeRunHistory(seeded);
    return seeded;
  });
  // Derived, not tracked separately: before 0.3.8 this was its own useState that
  // was never persisted, so every trend reset on close.
  const scoreTrend = useMemo(() => getScoreTrend(runHistory), [runHistory]);
  const scoreDeltas = useMemo(() => getAllRunDeltas(runHistory), [runHistory]);
  // Held here, not inside SimpleWizard: switching to Advanced unmounts the wizard,
  // and the user should come back to the step they left.
  const [wizardStep, setWizardStep] = useState<WizardStepId>('setup');
  // Set when Simple Mode sends the user to an Advanced-only view, so we can offer
  // a way back instead of silently changing modes under them.
  const [cameFromSimple, setCameFromSimple] = useState(false);
  // Contention measured when the run was confirmed, stamped onto every result
  // from that run. A ref rather than state: it must not trigger a re-render, and
  // it is read inside async run loops that would otherwise close over a stale value.
  const runGpuContentionRef = useRef<GpuContention['level'] | undefined>(undefined);
  /** Where the Balance fader stood when the current run started; every score from it records that. */
  const runBalanceRef = useRef<number | undefined>(undefined);
  // Re-measured every time the pre-flight modal opens: whether the GPU is busy
  // is a right-now fact, and a reading from earlier in the session would be
  // worse than none.
  const [pendingGpuContention, setPendingGpuContention] = useState<GpuContention | null>(null);
  const [pendingRunMode, setPendingRunMode] = useState<PendingRunMode | null>(null);
  const [pendingSingleModel, setPendingSingleModel] = useState<string | null>(null);
  const [pendingQuickCheck, setPendingQuickCheck] = useState<ModelRow | null>(null);
  const [skillTestSelection, setSkillTestSelection] = useState<SkillTestSelection>({
    appBuilder: false,
    appPromptId: DEFAULT_APP_BUILDER_PRESET_ID,
    appCustomPrompt: '',
    image: false,
    imagePrompt: IMAGE_BENCHMARK_PROMPTS[0].id,
    video: false,
    recognize: false,
    recognizeImage: DEFAULT_VISION_TEST_IMAGE,
    listen: false,
    code: false,
    codeLanguage: DEFAULT_CODE_LANGUAGE,
    codeTaskId: CODE_TASK_PRESETS[0].id,
    codeCustomTask: '',
    skipQuestions: false,
  });
  const [skillRunStatus, setSkillRunStatus] = useState<SkillRunStatus>({ phase: 'idle', label: '', completed: 0, total: 0 });
  const [demoPopup, setDemoPopup] = useState<DemoArtifact[] | null>(null);
  // Live "watch it work" stream for an in-flight skill test (build / recognize).
  const [liveBuild, setLiveBuild] = useState<{ model: string; kind: 'app' | 'image' | 'vision'; text: string; done: boolean; error?: string } | null>(null);
  // Whether the live view is expanded (true) or minimized to the mini-bar (false).
  const [liveBuildOpen, setLiveBuildOpen] = useState(true);
  const [closeCleanupOpen, setCloseCleanupOpen] = useState(false);
  /** Whether the disk-space offer still appears on the way out. */
  const [closeCleanupAsk, setCloseCleanupAsk] = useState(() => readCloseCleanupAsk());
  const [isCloseCleanupDeleting, setIsCloseCleanupDeleting] = useState(false);
  const [closeCleanupMessage, setCloseCleanupMessage] = useState<string | null>(null);
  const [benchmarkQuestionCount, setBenchmarkQuestionCount] = useState<BenchmarkQuestionCount>(10);
  // Answer-grading mode: 'heuristic' (built-in, fast, offline) or 'judge' (grade
  // answers with a local model). Off by default so existing scores don't move.
  // How many improve passes each model has had this session (App Builder retries).
  const [improveCounts, setImproveCounts] = useState<Record<string, number>>({});
  const [benchmarkQuestions, setBenchmarkQuestions] = useState<BenchmarkQuestion[]>(() => getSavedBenchmarkQuestions());
  const [suiteEditorOpen, setSuiteEditorOpen] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [activity, setActivity] = useState('Contestants is your hub: browse models, run tests, manage downloads, and start Speed Dating.');
  const [activeNavId, setActiveNavId] = useState<NavId>('models');
  const {
    comfyCheckpoints, comfyFolders, comfyReachable, comfySettings,
    refreshComfyStatus, beginComfyDownload, endComfyDownload, abortComfyDownload,
  } = useComfy({ activeNavId });
  const {
    appLogs, logPath, isLoadingLogs,
    loadLogs, openLogsPanel, clearLogs, openLogsFolder, copyLogs, adoptClearedLogs,
  } = useAppLogs({ setActivity, setActiveNavId });
  const [ollamaInstallProgress, setOllamaInstallProgress] = useState<OllamaInstallProgress>({ phase: 'idle' });
  const [themeId, setThemeId] = useState<ThemeId>(() => getSavedThemeId());
  const [uiMode, setUiMode] = useState<UiMode>(() => getSavedUiMode());
  // First-launch splash: ask Simple vs Advanced before showing the app.
  /**
   * What to ask on launch. See firstRunStep: an upgrading user has already
   * answered the mode question, and the old gate read that as having answered
   * the goal question too — so everyone upgrading from 0.5 would have arrived
   * in 0.6 with the goal picker, the Matches board and the goal lens all dark.
   */
  // The message Simple Mode is currently showing, if any. Advanced reads the
  // same text off the Ticker and does not need it.
  const [simpleNotice, setSimpleNotice] = useState<string | null>(null);
  /**
   * Something Simple Mode can do about the notice it is showing.
   *
   * Notices there used to be pure text, which is fine for "the run stopped" and
   * useless for "RigMatch does not know where ComfyUI is" — that one named
   * Settings → Generation, a place Simple Mode does not have, so the only way
   * out was to find Advanced Mode. The fix belongs beside the problem.
   */
  const [simpleNoticeAction, setSimpleNoticeAction] =
    useState<{ label: string; run: () => void | Promise<void> } | null>(null);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [pendingThirdPartyDownloadRows, setPendingThirdPartyDownloadRows] = useState<ModelRow[] | null>(null);
  // A download the Video Lab asked for, waiting on the same consent dialog,
  // and the one in flight once it is agreed to.
  const [pendingLabDownload, setPendingLabDownload] = useState<ModelRow | null>(null);
  const [labDownloadName, setLabDownloadName] = useState<string | null>(null);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [exportHatchOpen, setExportHatchOpen] = useState(false);
  const [clearedTopMatches, setClearedTopMatches] = useState<Set<string>>(() => getSavedClearedTopMatches());
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [pendingScoreClear, setPendingScoreClear] = useState<PendingScoreClear | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => !getSavedTutorialSeen());
  const [tutorialStep, setTutorialStep] = useState(0);

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0];

  const localModels = useMemo(
    () => [
      ...ollama.models.map((model) => ({
        ...model,
        provider: model.provider ?? ('ollama' as LocalModelProvider),
        providerLabel: model.providerLabel ?? 'Ollama',
        baseUrl: model.baseUrl ?? ollama.baseUrl,
      })),
      ...lmStudio.models.map((model) => ({
        ...model,
        provider: model.provider ?? ('lm-studio' as LocalModelProvider),
        providerLabel: model.providerLabel ?? 'LM Studio',
        baseUrl: model.baseUrl ?? lmStudio.baseUrl,
      })),
    ],
    [lmStudio.baseUrl, lmStudio.models, ollama.baseUrl, ollama.models],
  );

  // The machine a video model is sized against, rebuilt only when the hardware
  // changes: the profile refreshes its live load every few seconds, and every
  // model row would be rebuilt with it.
  const videoMachine = useMemo(
    () => videoMachineFrom({
      platform: system.platform,
      memory: { totalGb: system.memory.totalGb },
      gpu: { vramGb: system.gpu.vramGb, model: system.gpu.model, isUnifiedMemory: system.gpu.isUnifiedMemory },
    }),
    [system.platform, system.memory.totalGb, system.gpu.vramGb, system.gpu.model, system.gpu.isUnifiedMemory],
  );

  const modelRows = useMemo(
    () => {
      const rows = mergeModelRows(catalog, localModels);
      // Generation models join the same list rather than living on a screen of
      // their own. Someone who wants to make a video searches for "makes
      // video"; that video comes from Hugging Face and runs on ComfyUI is our
      // problem, not a category they should have to learn.
      const hasToken = Boolean(readHuggingFaceToken());
      const generation: ModelRow[] = generationCatalogRows(comfyFolders)
        .map((entry) => {
          // Sized the way the Video Lab sizes it: ComfyUI offloads what VRAM
          // cannot hold, so VRAM alone called runnable models too big and the
          // download queue refused them.
          const lineup = entry.generationKind === 'video' ? lineupEntry(entry.generationId) : undefined;
          return {
            ...entry,
            displayName: entry.name,
            installed: entry.installedFile,
            ready: entry.installedFile,
            installLabel: entry.installedFile ? 'Installed' : 'Download',
            canDownload: !entry.installedFile,
            pulls: null,
            ...(lineup
              ? { fitOverride: asHardwareFit(videoFit(lineup.sizing, videoMachine, { hasToken: hasToken || entry.installedFile })) }
              : {}),
          };
        });
      return [...generation, ...rows];
    },
    [catalog, localModels, comfyFolders, videoMachine],
  );

  const selectedRow = modelRows.find(
    (row) => row.displayName === selectedModel || row.id === selectedModel,
  );

  const [chatImageRunning, setChatImageRunning] = useState(false);

  /**
   * Making a picture from the chat box, when this computer really can.
   *
   * Memoised because it is handed to useChat: an object literal rebuilt every
   * render rebuilds every callback that depends on it, including sendChat.
   */
  const { refresh: refreshChatGpu } = useGpuContention();

  const chatImageGeneration = useMemo(() => {
    // Video and audio checkpoints cannot draw a still.
    //
    // The first checkpoint ComfyUI reported on this machine was ltx-video-2b,
    // and handing that to the image graph fails with "CLIPTextEncode: clip
    // input is invalid: None" — it carries no text encoder. The offer appeared,
    // it was pressed, and it could never have worked: exactly the empty promise
    // this feature exists to prevent, made by the feature itself.
    const drawable = comfyCheckpoints.filter(isPictureCheckpoint);

    return {
      // ComfyUI answering is not the same as ComfyUI being able to draw.
      available: drawable.length > 0,
      // The one that would actually be used, so the companion can name it
      // rather than leaving Make image as a leap of faith.
      checkpoint: drawable[0] ?? null,
      run: async (prompt: string, signal: AbortSignal) => {
        setChatImageRunning(true);
        try {
          const result = await runImageLabChallenge({
            checkpoint: drawable[0],
            promptId: CUSTOM_IMAGE_PROMPT_ID,
            customPrompt: prompt,
            ollamaBaseUrl: ollama.baseUrl,
            comfyBaseUrl: comfySettings.baseUrl,
            signal,
          });
          return result.imageDataUrl
            ? { dataUrl: result.imageDataUrl }
            : { error: result.error || 'ComfyUI returned no image.' };
        } catch (error) {
          return { error: getErrorMessage(error) };
        } finally {
          setChatImageRunning(false);
        }
      },
      gpuNote: async () => gpuBusyNote(await refreshChatGpu()),
    };
  }, [comfyCheckpoints, ollama.baseUrl, comfySettings.baseUrl, refreshChatGpu]);

  /**
   * Generate on behalf of RigMatch Chat.
   *
   * The companion cannot drive ComfyUI and should not learn how — everything
   * needed is here already and a second implementation would be a second thing
   * to keep right. It asks over the loopback bridge, the main process relays
   * the request here, and this runs the very same path the app's own chat uses,
   * so the two cannot drift apart.
   *
   * Chat can stop what it asked for: the bridge passes its Stop on, and the
   * job's AbortController, kept below, is what it reaches.
   */
  const chatRenderStops = useRef(new Map<string, AbortController>());
  useEffect(() => {
    if (!agentArcadeApi.onBridgeGenerateRequest) return undefined;
    return agentArcadeApi.onBridgeGenerateRequest(({ id, prompt, kind }) => {
      // Clips and sounds have their own path, further down.
      if (kind && kind !== 'image') return;
      void (async () => {
        if (!chatImageGeneration.available) {
          await agentArcadeApi.reportBridgeGenerateResult?.({
            id,
            error: 'No ComfyUI checkpoint that can draw is loaded, so RigMatch cannot make a picture right now.',
          });
          return;
        }
        const controller = new AbortController();
        chatRenderStops.current.set(id, controller);
        try {
          const result = await chatImageGeneration.run(prompt, controller.signal);
          await agentArcadeApi.reportBridgeGenerateResult?.({ id, ...result, ...(controller.signal.aborted ? { stopped: true } : {}) });
        } finally {
          chatRenderStops.current.delete(id);
        }
      })();
    });
  }, [chatImageGeneration]);

  const {
    chatOpen, setChatOpen, chatInput, setChatInput,
    chatAttachment, setChatAttachment, chatMessagesByModel,
    chatMessages, chatSupportsImages, sendChat, runChatAction, dropAttachment, resetChat,
    isReplying, stopReply,
  } = useChat({
    selectedModel,
    selectedRow,
    ollama,
    welcomeMessage: welcomeChatMessage,
    initialMessagesByModel: savedHistory?.chatMessagesByModel ?? {},
    setActivity,
    imageGeneration: chatImageGeneration,
  });
  /**
   * Switch the model the chat is talking to, and keep the attachment honest.
   *
   * The attach button is gated on what the model can do, but nothing re-checked
   * after the model changed — so a recording made for a listening model was
   * still sent to a text one, and came back as "Failed to load image or audio
   * file". That reads as a broken recording rather than the wrong model.
   */
  const changeChatModel = useCallback((nextModel: string) => {
    setSelectedModel(nextModel);
    if (!chatAttachment) return;
    const nextRow = modelRows.find((row) => row.displayName === nextModel || row.id === nextModel);
    const reason = attachmentBlockedReason({
      kind: chatAttachment.kind,
      model: nextModel,
      canSee: canReadImages(nextRow ?? { displayName: nextModel }),
      canHear: canHearAudio(nextRow ?? { displayName: nextModel }),
    });
    if (reason) dropAttachment(reason, nextModel);
  }, [chatAttachment, modelRows, dropAttachment]);

  // No name fallback: a model without the audio capability rejects the request
  // outright rather than answering badly, so guessing would produce a 400.
  const chatSupportsAudio = canHearAudio(selectedRow ?? { displayName: selectedModel });
  const selectedModelScore = selectedRow
    ? getModelScore(selectedRow, modelScores)
    : modelScores[selectedModel];
  const selectedBenchmark = getBenchmarkForModel(benchmarkByModel, selectedModel, selectedRow)
    ?? (benchmark && isBenchmarkForModel(benchmark, selectedModel, selectedRow) ? benchmark : null);
  const selectedHostCanBenchmark = Boolean(selectedRow?.localProvider === 'lm-studio' || isHostBenchmarkReady(selectedHost, ollama));

  const installedModelNames = useMemo(
    () => new Set(localModels.map((model) => model.model || model.name)),
    [localModels],
  );

  useEffect(() => {
    if (modelRows.length > 0 && !selectedRow) {
      setSelectedModel('qwen2.5:7b');
    }
  }, [modelRows, selectedRow]);


  const {
    modelNews, modelNewsNotificationsEnabled, notificationPermission,
    applyCatalogNews, resetModelNews, toggleModelNewsNotifications,
  } = useModelNews({ setActivity });

  const canBenchmark = Boolean(selectedRow?.installed && selectedHostCanBenchmark);
  const agentName = getAgentName(selectedModel);
  const shortlistedRows = useMemo(
    // canJoinComparison here as well as at the doors: the shortlist persists in
    // localStorage, so names can arrive from older sessions that predate the
    // rule. Whatever got in, nothing without a text floor reaches a run.
    () => modelRows.filter((row) => shortlistIds.has(row.displayName) && canJoinComparison(row)).slice(0, 5),
    [modelRows, shortlistIds],
  );
  const uninstalledShortlistedCount = useMemo(
    () => shortlistedRows.filter((row) => !row.installed).length,
    [shortlistedRows],
  );
  const installedRowsForCleanup = useMemo(() => deletableRows(modelRows), [modelRows]);
  const {
    qualityMode, setQualityMode, setJudgeModel,
    judgeSource, setJudgeSource, cloudJudgeModel, setCloudJudgeModel,
    openRouterKey, setOpenRouterKey,
    judgeModelOptions, effectiveJudgeModel, autoJudgeModels, effectiveJudge,
    resetJudgeSettings,
  } = useJudgeSettings({ installedRows: installedRowsForCleanup });

  const unscoredRowsForCleanup = useMemo(
    () => installedRowsForCleanup.filter((row) => !getModelScore(row, modelScores)),
    [installedRowsForCleanup, modelScores],
  );
  const exceptTopPickRowsForCleanup = useMemo(
    () => rowsExceptTopPick(modelRows, modelScores),
    [modelRows, modelScores],
  );

  const lowScoredRowsForCleanup = useMemo(
    () => installedRowsForCleanup.filter((row) => {
      const score = getModelScore(row, modelScores);
      return Boolean(score && score.total <= 80);
    }),
    [installedRowsForCleanup, modelScores],
  );
  const scoredModelCount = Object.keys(modelScores).length;
  const benchmarkPromptPlan = useMemo(
    () => buildBenchmarkPromptPlan(benchmarkQuestionCount, benchmarkQuestions),
    [benchmarkQuestionCount, benchmarkQuestions],
  );
  const currentSuiteName = useMemo(
    () => JSON.stringify(benchmarkQuestions) === JSON.stringify(DEFAULT_BENCHMARK_QUESTIONS)
      ? 'Default Suite v0.1'
      : 'Custom Suite',
    [benchmarkQuestions],
  );
  /**
   * Append finished runs to the timeline. Called per model as each one
   * completes, so stopping a Speed Dating run part-way still keeps whatever
   * finished. appendRuns dedupes on (model, completedAt), so the batch call at
   * the end of a run is a no-op rather than a double entry.
   */
  const recordRuns = useCallback((results: BenchmarkResult[]) => {
    if (!isDesktopRuntime || !results.length) return;
    const entries = results.map((result) => {
      const score = toTestedModelScore(result, currentSuiteName);
      return toRunHistoryEntry(result, {
        system,
        suiteName: currentSuiteName,
        preciseTotal: score.preciseTotal,
        scoreSchemaVersion: score.scoreSchemaVersion,
        gpuContention: runGpuContentionRef.current,
      });
    });
    setRunHistory((current) => {
      const next = appendRuns(current, entries);
      if (next !== current) writeRunHistory(next);
      return next;
    });
  }, [currentSuiteName, system]);
  const queuedRows = useMemo(
    () => modelRows.filter((row) => queuedModelIds.has(row.displayName)),
    [modelRows, queuedModelIds],
  );
  const diskGuard = useMemo(
    () => getDiskGuard(modelRows, queuedRows, system.storage.availableGb),
    [modelRows, queuedRows, system.storage.availableGb],
  );
  const topRigPick = useMemo(
    () => getRigPick(modelRows, modelScores, system.gpu.vramGb, clearedTopMatches),
    [clearedTopMatches, modelRows, modelScores, system.gpu.vramGb],
  );

  const wizardModels = useMemo<WizardModel[]>(() => {
    const vramGb = system.gpu.vramGb;
    const fitRank: Record<string, number> = { 'sweet-spot': 0, good: 1, tight: 2 };
    const mapped = modelRows
      // The wizard exists to seat a Speed Dating lineup, and generation models
      // can never sit in one — showing them as pickable contestants and then
      // silently refusing the pick was the cold walkthrough's worst finding.
      // They live in Models and run in the Lab; the video/image dream filters
      // say so instead of listing them.
      .filter((row) => canJoinComparison(row))
      .filter((row) => getPlatformFit(row.displayName, system.platform).compatible)
      .map((row) => ({ row, fit: getHardwareFit(row, vramGb) }))
      .filter((entry) => entry.fit.recommend && entry.fit.tone !== 'unknown')
      // Prefer the best fit tone first, then the LARGEST model that still fits —
      // a capable GPU should be steered toward more model, not the smallest one.
      // (Sorting by ascending size here surfaced tiny models like phi3:mini as the
      // top pick on high-VRAM rigs.)
      .sort((a, b) => (fitRank[a.fit.tone] ?? 9) - (fitRank[b.fit.tone] ?? 9) || (b.row.sizeGb ?? 0) - (a.row.sizeGb ?? 0))
      .map(({ row, fit }): WizardModel => ({
        row,
        // Friendly name for beginners; the raw pull tag shows as subtext.
        name: getFriendlyModelName(row.displayName),
        epithet: getModelEpithet(row),
        goodForLine: getModelGoodForLine(row),
        fitTier: fit.tone === 'sweet-spot' ? 'great' : fit.tone === 'good' ? 'well' : 'slower',
        // The grid only ever shows models that fit, so every tier label reads the
        // same. State the numbers a beginner actually needs to judge it.
        fitDetail: row.sizeGb && vramGb > 0
          ? `${formatGb(row.sizeGb)} of your ${formatGb(vramGb)} VRAM`
          : row.sizeGb
            ? `${formatGb(row.sizeGb)} on disk`
            : '',
        dreamTags: getModelDreamTags(row),
      }));

    // One card per model name — see collapseModelVariants for the reasoning
    // (first outside review: "many versions of Gemma 4").
    return collapseModelVariants(mapped, shortlistIds);
  }, [modelRows, shortlistIds, system.gpu.vramGb, system.platform]);

  /**
   * What Simple Mode's show should measure.
   *
   * The wizard asks who your dream model is and then ran the same question
   * round whatever the answer, so a coding buddy and a picture reader were
   * both crowned on chat. The three answers Ollama can settle on its own now
   * run their own test; makers need ComfyUI and still fall back to the
   * questions, which is the next thing to fix rather than a thing to pretend
   * about.
   */
  const [wizardDream, setWizardDream] = useState<DreamFilterId>('all');
  const wizardRound: 'chat' | 'code' | 'vision' | 'listening' = wizardDream === 'code' ? 'code'
    : wizardDream === 'read-image' ? 'vision'
      : wizardDream === 'hear' ? 'listening'
        : 'chat';
  /**
   * The channel whose results that round is ranked on.
   *
   * A coding buddy builds the small app rather than answering a code snippet
   * question: it is the one round whose result a beginner can open, click and
   * judge for themselves, which is worth more here than a number alone.
   */
  const wizardChannel: 'chat' | 'app' | 'reading' | 'listening' = wizardRound === 'vision' ? 'reading'
    : wizardRound === 'code' ? 'app'
      : wizardRound;
  /** The skill each round runs, and the fader it is ranked at. */
  const wizardSkill = wizardRound === 'code' ? 'app-builder' : wizardRound;
  const wizardBalance = wizardChannel === 'app' ? balances.code : balances[wizardChannel];

  /**
   * What the wizard's Compare screen watches while a skill round runs.
   *
   * The picture, listening and app rounds report through `skillRunStatus`,
   * which the wizard has never seen: its progress bar reads `RunProgress`, and
   * its "the show is over" latch waits for a run to go active and then idle. So
   * a picture round ran invisibly — Compare sat at 0% with Meet the winner
   * disabled for as long as anyone waited — and where an earlier chat run had
   * left `phase: 'complete'` behind, the latch released on the spot and crowned
   * the previous board while the round was still going.
   */
  const wizardRunProgress: RunProgress | null = useMemo(() => {
    if (wizardRound === 'chat') return runProgress;
    if (skillRunStatus.phase === 'idle') return null;
    const total = Math.max(skillRunStatus.total, 1);
    return {
      mode: 'speed-date',
      phase: skillRunStatus.phase,
      label: skillRunStatus.label,
      // The label ends "… — <model>"; the screen names who is up now.
      currentModel: skillRunStatus.label.split(' — ')[1] ?? '',
      completed: skillRunStatus.completed,
      total: skillRunStatus.total,
      percent: Math.round((skillRunStatus.completed / total) * 100),
      message: skillRunStatus.label,
    };
  }, [wizardRound, runProgress, skillRunStatus]);


  // Advanced's stats strip. Read once from the stored choice, falling back to
  // a rule based on how much height this screen actually has — see
  // scripts/measure-shell.mjs for the numbers that set the threshold.
  const [deckExpanded, setDeckExpanded] = useState(
    () => readDeckExpanded(typeof window === 'undefined' ? 1080 : window.innerHeight, getSavedUiMode()),
  );

  /**
   * What this PC can actually generate.
   *
   * The Pick screen filters generation models out of the Speed Dating lineup —
   * correctly, they cannot be benchmarked — and then had to describe the empty
   * grid. It said "No contestants can make video on this PC", which is not
   * true: LTX-Video and WAN both ship in the catalog and run here. Handing
   * the wizard the real figures lets it say something true instead of
   * discouraging someone away from a feature that works.
   */
  const generationSummary = useMemo(() => {
    const summarize = (kind: 'image' | 'video' | 'audio') => {
      // Only the ones that run here: Simple Mode says "N run on this PC", and
      // counting every catalog row made that true of models too big for it.
      const rows = modelRows.filter((row) => row.generationKind === kind
        && getHardwareFit(row, system.gpu.vramGb).recommend);
      return {
        total: rows.length,
        installed: rows.filter((row) => row.installed).length,
        names: rows.map((row) => row.displayName),
      };
    };
    return { image: summarize('image'), video: summarize('video'), audio: summarize('audio') };
  }, [modelRows, system.gpu.vramGb]);

  // Simple Mode needs its own share state: Advanced's lives inside the profile
  // panel, which is not mounted in the guided path.
  const [shareWinnerOpen, setShareWinnerOpen] = useState(false);

  const openChatWithWinner = useCallback(() => {
    const model = topRigPick?.row.displayName;
    if (!model) return;
    setSelectedModel(model);
    setChosenModel(model);
    if (isDesktopRuntime) {
      void agentArcadeApi.openChatApp().then((result) => { if (!result?.ok) setChatOpen(true); });
    } else {
      setChatOpen(true);
    }
  }, [topRigPick, setChatOpen]);

  /**
   * Cheap provider-only re-check: no hardware scan, no catalog sync. Used on
   * failure paths where the interesting question is just "is Ollama still
   * there", and where a full rig refresh would be far too heavy.
   */
  const refreshProviderStatus = useCallback(async () => {
    try {
      const [ollamaStatus, lmStudioStatus] = await Promise.all([
        agentArcadeApi.getOllamaStatus(),
        agentArcadeApi.getLmStudioStatus(),
      ]);
      setOllama(ollamaStatus);
      setLmStudio(lmStudioStatus);
    } catch {
      // Unreachable is itself the answer here, and the reconnect poll will keep
      // trying. Nothing to report that the failure message hasn't already said.
    }
  }, []);

  // `userInitiated` decides whether this refresh is allowed to reach the network
  // beyond the local machine. A user pressing "Check again" gets a live catalog
  // sync and a CUDA-version lookup; anything automatic — launch, the reconnect
  // poll — reads the machine and reuses the cached catalog instead. Forcing on
  // every call is what turned the 15s offline poll into a continuous scrape of
  // ollama.com.
  const runRigRefresh = useCallback(async ({ userInitiated }: { userInitiated: boolean }) => {
    setIsScanningRig(true);
    setActivity('Checking this computer, Ollama, and available models...');

    try {
      const [profile, ollamaStatus, lmStudioStatus, catalogResponse] = await Promise.all([
        agentArcadeApi.getSystemProfile({ checkForUpdates: userInitiated }),
        agentArcadeApi.getOllamaStatus(),
        agentArcadeApi.getLmStudioStatus(),
        agentArcadeApi.getOllamaCatalog({ force: userInitiated }),
      ]);

      setSystem(profile);
      setOllama(ollamaStatus);
      setLmStudio(lmStudioStatus);
      setCatalog(catalogResponse.models);
      setCatalogMeta({
        syncedAt: catalogResponse.syncedAt,
        source: catalogResponse.source,
        error: catalogResponse.error,
      });

      const nextNewsState = applyCatalogNews(catalogResponse.models);

      const localHost: NetworkHost = {
        id: 'localhost',
        hostname: `${profile.hostname} (This Machine)`,
        ip: profile.networks[0]?.address ?? '127.0.0.1',
        provider: 'Ollama',
        discovery: 'ollama',
        version: ollamaStatus.version ?? undefined,
        models: ollamaStatus.models.length,
        status: ollamaStatus.ready ? 'Ready' : 'Offline',
        pingMs: ollamaStatus.pingMs,
        baseUrl: ollamaStatus.baseUrl,
        isLocal: true,
        isDemo: !isDesktopRuntime,
      };
      const lmStudioHost: NetworkHost | null = lmStudioStatus.ready ? {
        id: 'lm-studio-localhost',
        hostname: `${profile.hostname} (LM Studio)`,
        ip: '127.0.0.1',
        provider: 'LM Studio',
        discovery: 'lm-studio',
        version: lmStudioStatus.version ?? undefined,
        models: lmStudioStatus.models.length,
        status: 'Ready',
        pingMs: lmStudioStatus.pingMs,
        baseUrl: lmStudioStatus.baseUrl,
        isLocal: true,
        isDemo: !isDesktopRuntime,
      } : null;

      setHosts(lmStudioHost ? [localHost, lmStudioHost] : [localHost]);
      setSelectedHostId(ollamaStatus.ready ? localHost.id : lmStudioHost?.id ?? localHost.id);

      if (ollamaStatus.models.length > 0 || lmStudioStatus.models.length > 0) {
        const availableModels = [...ollamaStatus.models, ...lmStudioStatus.models];
        setSelectedModel((current) =>
          availableModels.some((model) => model.model === current) ? current : availableModels[0].model,
        );
      }

      const mode = isDesktopRuntime ? 'desktop bridge' : 'preview fallback';
      const catalogNote = catalogResponse.error ? ` Catalog fallback: ${catalogResponse.error}` : '';
      const catalogSyncNote = !catalogResponse.error && catalogResponse.models.length > 0
        ? ` Model catalog synced from ${catalogResponse.source}.`
        : '';
      const lmStudioNote = lmStudioStatus.ready
        ? ` LM Studio found ${lmStudioStatus.models.length} local model${lmStudioStatus.models.length === 1 ? '' : 's'} for testing/chat.`
        : '';
      const modelNewsNote = nextNewsState.latestNewModelIds.length > 0
        ? ` ${nextNewsState.latestNewModelIds.length} new model${nextNewsState.latestNewModelIds.length === 1 ? '' : 's'} found.`
        : '';
      setActivity(
        isDesktopRuntime
          ? `Computer check complete via ${mode}.${catalogNote}${catalogSyncNote}${lmStudioNote}${modelNewsNote}`
          : `Preview sample data loaded via ${mode}.${catalogNote}${catalogSyncNote}${lmStudioNote}${modelNewsNote}`,
      );
    } catch (error) {
      setActivity(`Computer check failed: ${getErrorMessage(error)}`);
    } finally {
      setIsScanningRig(false);
    }
  }, [applyCatalogNews]);

  // Every control that says "check my computer" is the user asking for it, so
  // these may sync. Takes no arguments so wiring it straight to onClick cannot
  // smuggle a MouseEvent in as options.
  const refreshRig = useCallback(() => runRigRefresh({ userInitiated: true }), [runRigRefresh]);


  const openOllamaDownload = useCallback(async () => {
    setActivity('Opening Ollama official download page...');

    try {
      await agentArcadeApi.openOllamaDownload();
      setActivity('Ollama download page opened. RigMatch downloads through Ollama; LM Studio models can be tested when the LM Studio local server is running.');
    } catch (error) {
      setActivity(`Could not open Ollama download page: ${getErrorMessage(error)}`);
    }
  }, []);

  useEffect(() => {
    return agentArcadeApi.onOllamaInstallProgress?.((progress) => {
      setOllamaInstallProgress(progress);
    });
  }, []);

  const startOllamaInstall = useCallback(async () => {
    setOllamaInstallProgress({ phase: 'downloading', percent: 0, receivedBytes: 0, totalBytes: 0 });
    try {
      await agentArcadeApi.startOllamaInstall();
    } catch (err) {
      setOllamaInstallProgress({ phase: 'error', error: getErrorMessage(err) });
    }
  }, []);

  const launchOllamaInstaller = useCallback(async (installerPath: string) => {
    try {
      await agentArcadeApi.launchOllamaInstaller(installerPath);
    } catch (err) {
      setActivity(`Could not launch installer: ${getErrorMessage(err)}`);
    }
  }, []);

  const openSetupGuide = useCallback(() => {
    setSetupGuideOpen(true);
    setActivity('Ollama setup guide opened. RigMatch v1 is focused on this computer only.');
  }, []);

  const {
    updateChannel, updateCheck, isCheckingUpdates, autoUpdateStatus, dismissedUpdateVersion,
    downloadUpdate, installUpdate, selectUpdateChannel, checkForUpdates, openUpdatePage,
    dismissUpdatePrompt,
  } = useAppUpdates({ setActivity });

  const requestClearData = useCallback(() => {
    setClearDataOpen(true);
  }, []);

  const requestClearScore = useCallback((model: string) => {
    setPendingScoreClear({ mode: 'single', model });
  }, []);

  const requestClearAllScores = useCallback(() => {
    setPendingScoreClear({ mode: 'all' });
  }, []);

  const clearTopMatch = useCallback(() => {
    if (!topRigPick) return;

    const model = topRigPick.row.displayName;
    const aliases = getModelAliases(topRigPick.row);
    setClearedTopMatches((current) => addSetValues(current, aliases));
    if (aliases.includes(selectedModel)) {
      setChosenModel(null);
    }
    setActivity(`${model} was cleared as Top Match for now. Its scorecard is still saved.`);
  }, [selectedModel, topRigPick]);

  const restoreClearedTopMatches = useCallback(() => {
    setClearedTopMatches(new Set<string>());
    setActivity('Cleared Top Match candidates were restored. Saved scorecards are eligible again.');
  }, []);

  const cancelClearScores = useCallback(() => {
    setPendingScoreClear(null);
  }, []);

  const confirmClearScores = useCallback(() => {
    if (!pendingScoreClear) return;

    if (pendingScoreClear.mode === 'all') {
      setModelScores({});
      setBenchmarkByModel({});
      setListTestResult(null);
    setReportReady(false);
      setClearedTopMatches(new Set<string>());
      setBenchmark(createEmptyBenchmark(selectedModel, ollama.baseUrl));
      setRunProgress(null);
      setPendingScoreClear(null);
      // Clear the timeline too — otherwise "clear all" leaves trends behind and
      // the next run reports a delta against a score the user thought was gone.
      setRunHistory(() => {
        const cleared = emptyRunHistory();
        writeRunHistory(cleared);
        return cleared;
      });
      setActivity('All saved match scores, test transcripts, and score history were cleared. Ollama models stayed installed.');
      return;
    }

    const targetRow = modelRows.find((row) =>
      row.displayName === pendingScoreClear.model ||
      row.id === pendingScoreClear.model ||
      normalizeModelKey(row.displayName) === normalizeModelKey(pendingScoreClear.model),
    );
    const aliases = targetRow ? getModelAliases(targetRow) : [pendingScoreClear.model];

    setModelScores((current) => removeModelScores(current, aliases));
    setBenchmarkByModel((current) => removeBenchmarkResults(current, aliases));
    setListTestResult((current) => removeListTestScores(current, aliases));
    setClearedTopMatches((current) => removeSetValues(current, aliases));
    setRunHistory((current) => {
      const next = removeRuns(current, aliases);
      if (next !== current) writeRunHistory(next);
      return next;
    });
    setBenchmark((current) =>
      current && isBenchmarkForAliases(current, aliases)
        ? createEmptyBenchmark(selectedModel, ollama.baseUrl)
        : current,
    );
    setRunProgress(null);
    setPendingScoreClear(null);
    setActivity(`${pendingScoreClear.model} score and test transcript cleared. The model is still installed.`);
  }, [modelRows, ollama.baseUrl, pendingScoreClear, selectedModel]);


  const closeTutorial = useCallback(() => {
    writeLocal(TUTORIAL_STORAGE_KEY, 'seen');
    setTutorialOpen(false);
    setActivity('Quick guide closed. Use the Matchmaker Menu to move through the app.');
  }, []);

  const selectUiMode = useCallback((nextMode: UiMode) => {
    setUiMode(nextMode);
    setActivity(nextMode === 'beginner'
      ? 'Simple mode selected. RigMatch will keep the interface focused on the next useful step.'
      : 'Advanced mode selected. RigMatch will show more setup details, commands, and diagnostics.');
  }, []);

  const {
    showModeSplash, showGoalsIntro, showGoalsEditor, setShowGoalsEditor, selectedGoals,
    chooseInterfaceMode, saveGoalsFromIntro, dismissGoalsIntro, saveGoalsFromSettings, resetGoals,
  } = useGoals({ selectUiMode, setActivity });

  /**
   * What Advanced Mode is testing. It follows the first-run goal until someone
   * picks a channel, then remembers the pick. Simple Mode has no channels, and
   * everything it shows is ranked as chat.
   */
  const workbench: WorkbenchId = workbenchPick ?? workbenchForGoal(selectedGoals[0]);
  const workbenchInfo = workbenchById(uiMode === 'advanced' ? workbench : 'all');
  const activeChannel = balanceChannel(workbenchInfo.id);
  const chooseWorkbench = useCallback((id: WorkbenchId) => {
    setWorkbenchPick(id);
    writeLocal(WORKBENCH_STORAGE_KEY, id);
  }, []);
  // Images, Video and Audio run on ComfyUI, so choosing any of them is the
  // moment to start it: loading by the time anything is tested, and nobody
  // leaves RigMatch to find a .bat file. Once a session, and only while
  // Settings allows it.
  const wantsComfy = workbenchInfo.id === 'images' || workbenchInfo.id === 'video' || workbenchInfo.id === 'audio';
  useEffect(() => {
    if (wantsComfy) void ensureComfyRunning('auto');
  }, [wantsComfy]);
  /** The Run dialog asks the fader of the channel it serves: code and reading pictures have their own. */
  const runChannel: ChannelId = workbenchInfo.id === 'code' || workbenchInfo.id === 'reading' ? workbenchInfo.id : 'chat';

  const labResults = useLabResults();

  /**
   * The show's results, from whichever round it ran.
   *
   * A skill round writes Lab results rather than Match scores, so the Winner
   * screen reads those when the show was a coding job, a picture test or a
   * listening test — ranked at that channel's fader, among the models that
   * were actually picked, so the board on the last screen is the show that
   * just happened and not a different one.
   */
  const wizardSkillBoard = useMemo(() => {
    if (wizardRound === 'chat') return null;
    const picked = new Set(shortlistedRows.map((row) => row.displayName));
    const mine = Object.values(labResults).filter((result) => result && picked.has(result.model));
    // Failures stay on the board. Dropping them made a round where nobody
    // passed indistinguishable from a round that never ran — and since the
    // winner screen unlocks on having a winner, five models that all fell short
    // left the show with no way forward and nothing said. They are listed,
    // last, and none of them is crowned.
    const board = rankLabList(mine, wizardChannel as Exclude<typeof wizardChannel, 'chat'>, wizardBalance);
    return board.length > 0 ? board : null;
  }, [wizardRound, wizardChannel, shortlistedRows, labResults, wizardBalance]);

  const wizardWinner = useMemo(
    () => (wizardSkillBoard
      // The first one that actually passed. A result that failed its check is
      // never crowned, at any fader position.
      ? (() => {
        const top = wizardSkillBoard.find((ranked) => ranked.standing !== 'failed')?.item;
        return top
          ? { model: top.model, score: top.score, scoreLabel: String(top.score), grade: top.grade }
          : null;
      })()
      : topRigPick?.score
      ? {
        model: topRigPick.row.displayName,
        score: topRigPick.score.total,
        // The winner screen was printing the raw integer, so the app's most-seen
        // score was the one surface still disagreeing with the decimal policy.
        scoreLabel: formatMatchScore(topRigPick.score),
        grade: topRigPick.score.grade,
      }
      : null),
    [topRigPick, wizardSkillBoard],
  );

  /**
   * How the whole lineup placed, best first.
   *
   * The show is a comparison and the Winner screen was throwing the comparison
   * away: it announced one model "out of the 5 you tested" and then showed
   * nothing whatever about the other four. Every score is already here; only
   * Advanced Mode was allowed to see them, which is exactly backwards for the
   * mode whose users will never open Advanced.
   */
  const wizardLineupResults = useMemo(
    () => (wizardSkillBoard
      ? wizardSkillBoard.map(({ item: result, standing }) => {
        // The coding round also asked questions, and that score is this
        // model's Match: shown beside the app's, never instead of it.
        const asked = wizardChannel === 'app' ? modelScores[result.model] : undefined;
        return {
          model: result.model,
          name: getFriendlyModelName(result.model),
          scoreLabel: String(result.score),
          total: result.score,
          grade: result.grade,
          note: standing === 'failed'
            ? 'did not pass the check'
            : asked ? `${formatMatchScore(asked)} Match on the questions` : undefined,
        };
      })
      : shortlistedRows
      .flatMap((row) => {
        const score = modelScores[row.displayName];
        return score ? [{ row, score }] : [];
      })
      // The app's own comparator, not a total-descending sort: the board shows
      // the one-decimal Match value, and ranking on the rounded integer put
      // 87.5 above 87.6 — a list that visibly contradicted its own numbers.
      .sort((a, b) => compareTestedModelScores(a.score, b.score))
      .map(({ row, score }) => ({
        model: row.displayName,
        name: getFriendlyModelName(row.displayName),
        scoreLabel: formatMatchScore(score),
        total: score.total,
        grade: score.grade,
      }))),
    [shortlistedRows, modelScores, wizardSkillBoard, wizardChannel],
  );
  const lineupSession = useVideoLineupSession();
  /** Whatever ComfyUI is rendering for RigMatch now, wherever it was started. */
  const renderActivity = useRenderActivity();
  /** How the last render ended: announced in the status bar, and kept in Activity. */
  const renderOutcome = useRenderOutcome();
  const renderEndedAt = renderOutcome?.endedAt ?? null;
  const [announcedRenderEnd, setAnnouncedRenderEnd] = useState(renderEndedAt);
  if (renderEndedAt !== announcedRenderEnd) {
    setAnnouncedRenderEnd(renderEndedAt);
    if (renderOutcome) setActivity(renderOutcome.message);
  }
  // Images and video are judged by a model that can see, made audio by one that
  // can hear. With none installed, accuracy cannot be measured there, so those
  // faders hold at speed.
  const pictureJudged = useMemo(() => judgeCandidates(ollama.models).length > 0, [ollama.models]);
  /** The model that listens to made audio, from what is installed. */
  const audioListener = useMemo(() => listenerCandidates(ollama.models)[0] ?? '', [ollama.models]);
  const balanceLock = (channel: ChannelId) => {
    if ((channel === 'images' || channel === 'video') && !pictureJudged) {
      return 'No model that can check pictures is available right now, so only speed can be measured. Install one, or start Ollama, and accuracy counts again.';
    }
    // Audio is never held at speed: when no model can hear, your ear can judge a clip.
    return null;
  };
  /** The vision model that checks pictures and clips, from what is installed. */
  const pictureJudge = useMemo(() => judgeCandidates(ollama.models)[0] ?? '', [ollama.models]);
  /** Something else holds the graphics card, so a render timed now would measure the contention. */
  const gpuBusy = isListTesting || isBenchmarking || runProgress?.phase === 'running' || Boolean(externalBenchmark?.running);
  /** One winner per channel, from its own measurement at its own fader. Chat and All keep the Top Match. */
  const channelWinner = useMemo(() => {
    const judged = (value: number) => (pictureJudged ? value : 0);
    switch (workbenchInfo.id) {
      case 'code': return codeWinner(savedModelScores, balances.code);
      case 'images': return labWinner(labResults, 'images', judged(balances.images));
      case 'listening': return labWinner(labResults, 'listening', balances.listening);
      case 'reading': return labWinner(labResults, 'reading', balances.reading);
      case 'video': return videoWinner(lineupSession.record, judged(balances.video));
      case 'audio': return labWinner(labResults, 'audio', balances.audio);
      default: return null;
    }
  }, [workbenchInfo.id, savedModelScores, labResults, lineupSession.record, balances, pictureJudged]);

  /**
   * What RigMatch Chat is offered for each thing RigMatch tests.
   *
   * Each chat choice opens on the model that channel's own tests crowned, and a
   * clip or a sound is made by the channel winner when it can run here, else by
   * the fastest that can (chatMakers.ts). Worked out here, where the rankings
   * are, and sent to Chat with the scores.
   */
  const chatModelPicks = useMemo(() => chatPicks({
    chosen: selectedModel || null,
    scores: savedModelScores,
    results: labResults,
    balances: { code: balances.code, reading: balances.reading, listening: balances.listening },
  }), [selectedModel, savedModelScores, labResults, balances.code, balances.reading, balances.listening]);
  const chatListing = useMemo(
    () => comfyListing({ checkpoints: comfyCheckpoints, folders: comfyFolders ?? undefined }),
    [comfyCheckpoints, comfyFolders],
  );
  /** Every video model that can run here, as Chat lists them: tested first. */
  const chatVideoChoices = useMemo(() => {
    if (!comfyReachable) return [];
    const options = { calibration: readVideoCalibration(), saved: labResults };
    return videoMakerChoices({
      runnable: runnableLineup(chatListing, videoMachine, options),
      catalog: allLineupEntries(chatListing),
      record: lineupSession.record,
      balance: pictureJudged ? balances.video : 0,
      secondsFor: (entry) => estimateLineup([entry], videoMachine, options).seconds,
    });
  }, [comfyReachable, chatListing, videoMachine, labResults, lineupSession.record, pictureJudged, balances.video]);
  const chatAudioChoices = useMemo(() => (comfyReachable
    ? audioMakerChoices({ installed: installedAudioEntries(chatListing), results: labResults, balance: balances.audio })
    : []), [comfyReachable, chatListing, labResults, balances.audio]);
  /**
   * The model a Chat request runs on: the one it asked for, else the first
   * offered. A key Chat was never offered is refused rather than guessed at,
   * since the only sender that can name one is a Chat reading this same list.
   */
  const chatVideoEntry = useCallback((key?: string | null) => {
    const wanted = key || chatVideoChoices[0]?.key;
    if (!wanted || !chatVideoChoices.some((choice) => choice.key === wanted)) return null;
    return allLineupEntries(chatListing).find((entry) => entry.key === wanted) ?? null;
  }, [chatVideoChoices, chatListing]);
  const chatAudioEntry = useCallback((key?: string | null) => {
    const wanted = key || chatAudioChoices[0]?.key;
    if (!wanted || !chatAudioChoices.some((choice) => choice.key === wanted)) return null;
    return audioModelSpec(wanted) ?? null;
  }, [chatAudioChoices]);

  // Chat asking for a clip or a sound. Pictures keep their own path, above.
  useEffect(() => {
    if (!agentArcadeApi.onBridgeGenerateRequest) return undefined;
    return agentArcadeApi.onBridgeGenerateRequest(({ id, prompt, kind, model }) => {
      if (kind !== 'video' && kind !== 'audio') return;
      void (async () => {
        const report = (result: ChatRender) => agentArcadeApi.reportBridgeGenerateResult?.({ id, ...result });
        const noun = kind === 'video' ? 'a clip' : 'audio';
        const entry = kind === 'video' ? chatVideoEntry(model) : null;
        const spec = kind === 'audio' ? chatAudioEntry(model) : null;
        const name = entry?.name ?? spec?.name;
        if (!name) {
          await report({
            error: model
              ? `RigMatch cannot make ${noun} with that model here. Pick another one.`
              : kind === 'video'
                ? 'No video model that can run on this PC is installed, or ComfyUI is not running.'
                : 'No audio model is installed, or ComfyUI is not running.',
          });
          return;
        }
        // One render at a time: a second would slow both, and time neither honestly.
        if (renderActivity) {
          await report({ error: `RigMatch is busy with ${renderActivity.model ?? 'another render'}. Try again when it finishes.` });
          return;
        }
        const controller = new AbortController();
        chatRenderStops.current.set(id, controller);
        const key = `chat:${id}`;
        startImageTest({ key, kind, name, message: `Making ${noun} for RigMatch Chat: “${prompt}”`, stop: () => controller.abort() });
        try {
          const baseUrl = comfySettings.baseUrl;
          const result: ChatRender = entry
            ? await renderChatVideo({ entry, prompt, baseUrl, signal: controller.signal })
            : spec
              ? await renderChatAudio({ spec, prompt, baseUrl, signal: controller.signal })
              : { error: 'Nothing is installed to make it with.' };
          endImageTest(key, result.stopped
            ? { message: `Stopped making ${noun} for RigMatch Chat.`, failed: false }
            : result.error
              ? { message: `${name} could not make ${noun} for RigMatch Chat: ${result.error}`, failed: true }
              : { message: `${name} made ${noun} for RigMatch Chat.`, failed: false });
          await report(result);
        } catch (error) {
          endImageTest(key, { message: `${name} could not make ${noun} for RigMatch Chat: ${getErrorMessage(error)}`, failed: true });
          await report({ error: getErrorMessage(error) });
        } finally {
          chatRenderStops.current.delete(id);
        }
      })();
    });
  }, [chatVideoEntry, chatAudioEntry, comfySettings.baseUrl, renderActivity]);

  // Chat's Stop, for whichever of its jobs is still running.
  useEffect(() => {
    if (!agentArcadeApi.onBridgeGenerateStop) return undefined;
    return agentArcadeApi.onBridgeGenerateStop(({ id }) => chatRenderStops.current.get(id)?.abort());
  }, []);
  /** The side menu's Models count follows the channel, as the Models screen does. */
  const channelModelCount = useMemo(() => {
    const filter = workbenchInfo.taskFilter;
    return filter ? modelRows.filter((row) => modelMatchesTask(row, filter)).length : modelRows.length;
  }, [workbenchInfo.taskFilter, modelRows]);
  /** Images, Video and Listening compare their own results; Speed Dating cannot test them. */
  const comparedWorkbench = isComparedChannel(workbenchInfo.id) ? { ...workbenchInfo, id: workbenchInfo.id } : null;
  /** The goal the Run dialog's focus suggestion answers: the channel's, on a channel. */
  const runGoal: string | undefined = workbenchInfo.id === 'all' ? selectedGoals[0] : workbenchInfo.goals[0];
  /** What the side menu counts for Comparison and Scorecards on this channel. */
  const channelMetas = useMemo(() => {
    const count = (challenge: string) => Object.values(labResults).filter((result) => result?.challenge === challenge).length;
    // "None" rather than "0 pictures", as What's New says it.
    const tally = (amount: number, noun: string) => (amount > 0 ? `${amount} ${noun}${amount === 1 ? '' : 's'}` : 'None');
    const kept = (amount: number) => (amount > 0 ? `${amount}` : 'New');
    switch (workbenchInfo.id) {
      case 'images': return { comparison: tally(count('image-generation'), 'picture'), scorecards: kept(count('image-generation')) };
      case 'video': return { comparison: tally(lineupSession.record?.entries.length ?? 0, 'clip'), scorecards: kept(count('video-generation')) };
      case 'listening': return { comparison: tally(count('listening'), 'test'), scorecards: kept(count('listening')) };
      case 'reading': return { comparison: undefined, scorecards: kept(count('image-recognition')) };
      case 'audio': return { comparison: tally(count('audio-generation'), 'clip'), scorecards: kept(count('audio-generation')) };
      case 'code': return { comparison: undefined, scorecards: kept(rankCoding(Object.values(modelScores), balances.code).ranked.length) };
      default: return { comparison: undefined, scorecards: undefined };
    }
  }, [workbenchInfo.id, labResults, lineupSession.record, modelScores, balances.code]);

  const confirmClearData = useCallback(async () => {
    // The run log is cleared first but must not gate anything: the main process
    // rate-limits log clearing, so clearing logs and then clearing data a moment
    // later threw, and the single try/catch abandoned the whole wipe — the user
    // saw "Could not clear all data" and none of it was cleared. A file lock or
    // a permissions error would have done the same. Its failure is now reported
    // alongside the wipe rather than instead of it.
    let logNote = '';
    try {
      adoptClearedLogs(await agentArcadeApi.clearLogs());
    } catch (error) {
      logNote = ` The run log could not be cleared: ${getErrorMessage(error)}`;
    }

    try {
      // Every namespaced key, not a hand-written list of six — see
      // clearAppStorage. The state resets below then stop the save effects
      // writing anything back, and stop the UI showing data that is gone.
      clearAppStorage();
      // Same invariant as initialBenchmark above: on desktop the demo transcript
      // and scores must never appear as if the user ran a real test. Clearing
      // everything and then seeding sample data is the worst place to break it —
      // the save effect writes it straight back, so it survives restart and reads
      // as a genuine saved run. Preview keeps the demo so the browser still has
      // something to show after a reset.
      setBenchmark(isDesktopRuntime ? createEmptyBenchmark(selectedModel, ollama.baseUrl) : demoBenchmark);
      setBenchmarkByModel(isDesktopRuntime ? {} : upsertBenchmarkResults({}, [demoBenchmark]));
      setModelScores({});
      setListTestResult(null);
    setReportReady(false);
      setQueuedModelIds(new Set<string>());
      setShortlistIds(new Set(DEFAULT_SHORTLIST_IDS));
      setPendingRunMode(null);
      setPendingSingleModel(null);
      setBenchmarkQuestionCount(10);
      setBenchmarkQuestions([...DEFAULT_BENCHMARK_QUESTIONS]);
      setRunProgress(null);
      setThemeId('orange');
      // Deliberately not resetting uiMode. Clearing your scores is not a reason
      // to demote an Advanced user to Simple Mode and hand them the beginner
      // wizard — they asked to clear data, not to start over. The matching keys
      // are in KEEP_ON_CLEAR, so the choice also survives a restart.
      resetChat();
      setChosenModel(null);
      setClearedTopMatches(new Set<string>());
      resetModelNews();
      setSuiteEditorOpen(false);
      // The guide is not reopened either. Clearing data is not the same as
      // asking to be taught the app again, and the Matchmaker Menu title
      // reopens it on demand for anyone who does want it.
      setPendingDeleteModel(null);
      // Persisted settings whose state outlived the old wipe: the judge setup
      // and, worst of them, the OpenRouter API key, which stayed in the field
      // and would be written back the next time it changed.
      resetJudgeSettings();
      setModelNotes({});
      setRunHistory(emptyRunHistory());
      resetGoals();
      // The faders and the channel are preferences about data that is gone.
      setBalances(readBalances(null, null));
      setWorkbenchPick(null);
      setClearDataOpen(false);
      setActivity(`RigMatch app data cleared. Ollama models were left installed.${logNote}`);
    } catch (error) {
      setActivity(`Could not clear all data: ${getErrorMessage(error)}`);
    }
  }, [ollama.baseUrl, selectedModel, adoptClearedLogs, resetModelNews, resetJudgeSettings, resetChat, resetGoals]);

  const requestDeleteModel = useCallback((row: ModelRow) => {
    if (row.localProvider === 'lm-studio') {
      setActivity(`${row.displayName} is managed by LM Studio. Delete it from LM Studio if you want to free disk space.`);
      return;
    }
    // Deliberately does NOT touch selectedModel. It used to, which was fine on
    // the Models screen but wrong from the Closet in Settings: clicking Evict
    // reassigned the app's selected model, and canceling the confirmation left
    // it reassigned — Top Pick and chat silently pointing somewhere new after an
    // action the user backed out of.
    setPendingDeleteModel(row);
  }, []);

  const cancelDeleteModel = useCallback(() => {
    if (isDeletingModel) return;
    setPendingDeleteModel(null);
  }, [isDeletingModel]);

  const removeDeletedModelFromState = useCallback((row: ModelRow) => {
    const aliases = getModelAliases(row);

    setOllama((current) => ({
      ...current,
      models: current.models.filter((model) => !ollamaModelMatchesAliases(model, aliases)),
    }));
    setHosts((current) => current.map((host) =>
      host.id === selectedHostId
        ? { ...host, models: Math.max(0, (host.models || 0) - 1) }
        : host,
    ));
    setModelScores((current) => removeModelScores(current, aliases));
    setBenchmarkByModel((current) => removeBenchmarkResults(current, aliases));
    // Run history deliberately survives an uninstall: deleting a model frees
    // disk, it does not mean "forget what I measured". Reinstalling later picks
    // the trend back up. Clearing scores (confirmClearScores) is the explicit
    // way to erase measurements, and that path does drop the timeline.
    setShortlistIds((current) => removeSetValues(current, aliases));
    setQueuedModelIds((current) => removeSetValues(current, aliases));
    setClearedTopMatches((current) => removeSetValues(current, aliases));

    if (aliases.includes(selectedModel)) {
      const nextModel = modelRows.find((candidate) => !aliases.includes(candidate.displayName) && candidate.installed)?.displayName
        ?? modelRows.find((candidate) => !aliases.includes(candidate.displayName))?.displayName
        ?? 'qwen2.5:7b';
      setSelectedModel(nextModel);
    }
  }, [modelRows, selectedHostId, selectedModel]);

  const confirmDeleteModel = useCallback(async () => {
    if (!pendingDeleteModel) return;

    const modelName = pendingDeleteModel.installedModel?.model ?? pendingDeleteModel.displayName;
    const targetHost = selectedHost?.hostname ?? 'selected computer';

    setIsDeletingModel(true);
    setActivity(`Deleting ${modelName} from ${targetHost}...`);

    try {
      const result = await agentArcadeApi.deleteModel({
        model: modelName,
        baseUrl: ollama.baseUrl,
      });

      removeDeletedModelFromState(pendingDeleteModel);
      setPendingDeleteModel(null);
      setActivity(`${result.model} deleted from ${targetHost}. Download it again if that match deserves another test.`);
    } catch (error) {
      setActivity(`Model delete failed: ${getErrorMessage(error)}`);
    } finally {
      setIsDeletingModel(false);
    }
  }, [ollama.baseUrl, pendingDeleteModel, removeDeletedModelFromState, selectedHost?.hostname]);

  const closeAppAfterCleanup = useCallback(async () => {
    setCloseCleanupOpen(false);
    setCloseCleanupMessage(null);
    await agentArcadeApi.closeApp();
  }, []);

  const cancelCloseCleanup = useCallback(() => {
    setCloseCleanupOpen(false);
    setCloseCleanupMessage(null);
    void agentArcadeApi.cancelCloseApp().catch(() => undefined);
  }, []);

  const deleteRowsThenClose = useCallback(async (rows: ModelRow[], label: string) => {
    if (rows.length === 0) {
      setCloseCleanupMessage(`No ${label} models were found.`);
      return;
    }

    setIsCloseCleanupDeleting(true);
    setCloseCleanupMessage(null);
    setActivity(`Deleting ${rows.length} ${label} model${rows.length === 1 ? '' : 's'} before closing...`);

    let deletedCount = 0;
    try {
      for (const row of rows) {
        const modelName = row.installedModel?.model ?? row.displayName;
        await agentArcadeApi.deleteModel({
          model: modelName,
          baseUrl: ollama.baseUrl,
        });
        removeDeletedModelFromState(row);
        deletedCount += 1;
      }

      setActivity(`Deleted ${deletedCount} ${label} model${deletedCount === 1 ? '' : 's'} before closing.`);
      await closeAppAfterCleanup();
    } catch (error) {
      const message = `Deleted ${deletedCount} of ${rows.length}. Cleanup stopped: ${getErrorMessage(error)}`;
      setCloseCleanupMessage(message);
      setActivity(message);
    } finally {
      setIsCloseCleanupDeleting(false);
    }
  }, [closeAppAfterCleanup, ollama.baseUrl, removeDeletedModelFromState]);

  useEffect(() => {
    if (!agentArcadeApi.onAppCloseRequest) return undefined;

    return agentArcadeApi.onAppCloseRequest(() => {
      // Nothing to offer, or the offer was declined for good.
      if (installedRowsForCleanup.length === 0 || !closeCleanupAsk) {
        void agentArcadeApi.closeApp();
        return;
      }

      setCloseCleanupMessage(null);
      setCloseCleanupOpen(true);
    });
  }, [installedRowsForCleanup.length, closeCleanupAsk]);

  const selectNav = useCallback((id: NavId) => {
    setActiveNavId(id);

    if (id === 'history') {
      void loadLogs();
      setActivity(`${getNavLabel(id)} selected.`);
      return;
    }

    setActivity(`${getNavLabel(id)} selected.`);
  }, [loadLogs]);

  /** Where a render in flight is shown in full: its model's row for a test of one, Comparison for a race. */
  /**
   * Open a model from another screen, and actually land on it.
   *
   * What's New sent the reader to the Models screen with the model selected and
   * the channel left as it was. Opening a new cloud model while the channel was
   * Reads images put them in front of an empty table: the model cannot read
   * pictures, so the channel's lens filtered it out, and Open looked broken. A
   * model the channel would hide moves to All, where every model is; a model the
   * channel already shows leaves the channel alone.
   */
  /** A model opened from another screen, and when, so the list can bring it into view. */
  const [revealModel, setRevealModel] = useState<{ model: string; at: number } | null>(null);
  const openModelRow = useCallback((model: string) => {
    setSelectedModel(model);
    const row = modelRows.find((candidate) => candidate.displayName === model || candidate.id === model);
    const lens = workbenchInfo.taskFilter;
    if (!row || (lens && !modelMatchesTask(row, lens))) chooseWorkbench('all');
    // The moment, not the name: switching channel remounts the list, and a name
    // it has already seen would leave the row collapsed and off screen.
    setRevealModel({ model, at: Date.now() });
    selectNav('models');
  }, [modelRows, workbenchInfo.taskFilter, chooseWorkbench, selectNav]);

  const openRender = useCallback((render: RenderActivity) => {
    chooseWorkbench(renderChannel(render.kind));
    const row = render.solo && render.key
      ? modelRows.find((candidate) => candidate.generationId === render.key)
      : undefined;
    if (row) {
      setSelectedModel(row.displayName);
      setRevealModel({ model: row.displayName, at: Date.now() });
    }
    selectNav(render.solo ? 'models' : 'speedDate');
  }, [chooseWorkbench, modelRows, selectNav]);

  // Simple Mode runs as a wizard: when the rig check passes while the user is
  // on the setup round, move them to the pick round instead of waiting for a
  // manual navigation. (The comparison round advances on run completion.)
  const prevOllamaReadyRef = useRef(ollama.ready);
  useEffect(() => {
    const wasReady = prevOllamaReadyRef.current;
    prevOllamaReadyRef.current = ollama.ready;
    if (uiMode !== 'beginner' || wasReady || !ollama.ready) return;
    if (activeNavId === 'lan') {
      selectNav('models');
      setActivity('Local AI is ready. Next round: pick up to 5 contestants for the lineup.');
    }
  }, [activeNavId, ollama.ready, selectNav, uiMode]);

  const selectTheme = useCallback((nextThemeId: ThemeId) => {
    setThemeId(nextThemeId);
    setActivity(`${getThemeLabel(nextThemeId)} theme selected.`);
  }, []);


  /**
   * Say something the user genuinely needs to read, in whichever mode they are in.
   *
   * setActivity alone was not enough: it renders only inside <Ticker>, which is
   * gated to Advanced, so in Simple Mode — the default — every refusal and
   * failure was written to state nobody paints. Use this for anything a user
   * must act on; plain setActivity remains right for running commentary.
   */
  const tellUser = useCallback((message: string, action?: { label: string; run: () => void | Promise<void> }) => {
    setActivity(message);
    setSimpleNotice(message);
    // Cleared when absent, so an offer from a previous problem cannot sit under
    // an unrelated message and appear to fix it.
    setSimpleNoticeAction(action ?? null);
  }, []);

  // Stamped onto every score at scoring time. Scores are relative to a rig,
  // and Ollama tags mutate — the digest is the only durable identity for the
  // weights that actually earned the number.
  const rigStampForModel = useCallback((model: string): ScoreRigStamp => {
    const installed = ollama.models.find((m) => m.name === model || m.model === model);

    // Where this actually ran.
    //
    // A benchmark can go to an Ollama on another computer — getHostBenchmarkBlocker
    // allows a remote host that reports ready, and the request goes to that
    // host's own baseUrl. This used to stamp the local card regardless, so a
    // model scored on someone else's machine came back credited to this one:
    // a false statement made by the very mechanism built to stop scores being
    // attributed to hardware that did not earn them.
    //
    // RigMatch cannot ask a remote Ollama what card it has, so the honest stamp
    // names the host and no hardware at all. Everything downstream now treats a
    // stamp with a host as measured elsewhere and asks for a retest here.
    const remoteHost = selectedHost && !selectedHost.isLocal && !selectedHost.isDemo
      ? selectedHost.hostname
      : undefined;

    return {
      ...(remoteHost
        ? { host: remoteHost }
        : { gpu: system.gpu.model, vramGb: system.gpu.vramGb, driverVersion: system.gpu.driverVersion || undefined }),
      appVersion: APP_VERSION,
      modelDigest: installed?.digest,
      quantization: installed?.quantization,
    };
  }, [ollama.models, selectedHost, system.gpu.model, system.gpu.vramGb, system.gpu.driverVersion]);


  const requestBenchmarkForModel = useCallback((model: string) => {
    const row = modelRows.find((candidate) => candidate.displayName === model || candidate.id === model);
    const installed = Boolean(row?.installed || installedModelNames.has(model));
    const hostBlocker = getModelBenchmarkBlocker(row, selectedHost, ollama);

    if (!installed) {
      setActivity('Pick an installed local model before starting the compatibility test.');
      return;
    }

    if (hostBlocker) {
      setActivity(hostBlocker);
      return;
    }

    setSelectedModel(model);
    setPendingSingleModel(model);
    setPendingRunMode('single');
    setActivity(`Confirm the resource warning before testing ${model}.`);
  }, [installedModelNames, modelRows, ollama, selectedHost]);

  const requestBenchmark = useCallback(() => {
    if (!canBenchmark) {
      setActivity(getModelBenchmarkBlocker(selectedRow, selectedHost, ollama) ?? 'Pick an installed local model before starting the compatibility test.');
      return;
    }

    requestBenchmarkForModel(selectedModel);
  }, [canBenchmark, ollama, requestBenchmarkForModel, selectedHost, selectedModel, selectedRow]);

  const requestBenchmarkRow = useCallback((row: ModelRow) => {
    requestBenchmarkForModel(row.displayName);
  }, [requestBenchmarkForModel]);

  /**
   * The picture test for one checkpoint, as the Images screen runs it: the same
   * benchmark prompt, the same judge, and the result kept where every other
   * picture result is kept, so a test started from Chat counts for the same
   * crown as one started here.
   */
  const runPictureTest = useCallback(async (checkpoint: string) => {
    const key = `picture-test:${checkpoint}`;
    const promptId = IMAGE_BENCHMARK_PROMPTS[0].id;
    const controller = new AbortController();
    startImageTest({ key, kind: 'image', name: checkpoint, message: `Testing ${checkpoint}`, stop: () => controller.abort() });
    try {
      const run = await runImageLabChallenge({
        checkpoint,
        promptId,
        judgeModel: pictureJudge || undefined,
        ollamaBaseUrl: ollama.baseUrl,
        comfyBaseUrl: comfySettings.baseUrl,
        signal: controller.signal,
      });
      const result = toLabResult(run, promptId);
      if (!result.error) writeAdvancedLabResults({ ...readAdvancedLabResults(), [`image:${checkpoint}`]: result });
      endImageTest(key, result.error
        ? { message: `${checkpoint} could not be tested: ${result.error}`, failed: true }
        : { message: `${checkpoint} scored ${result.score} (${result.grade}).`, failed: false });
    } catch (error) {
      endImageTest(key, { message: `${checkpoint} could not be tested: ${getErrorMessage(error)}`, failed: true });
    }
  }, [pictureJudge, ollama.baseUrl, comfySettings.baseUrl]);



  const saveModelNote = useCallback((model: string, note: string) => {
    setModelNotes((current) => {
      const next = { ...current, [model]: note };
      writeLocalJson('rigmatch:model-notes:v1', next);
      return next;
    });
  }, []);

  const startBenchmark = useCallback(async (modelOverride?: string | null, questionsOverride?: BenchmarkQuestion[]) => {
    const modelToTest = modelOverride ?? selectedModel;
    const rowToTest = modelRows.find((row) => row.displayName === modelToTest || row.id === modelToTest);
    const runtime = getModelRuntime(rowToTest, ollama);
    const hostBlocker = getModelBenchmarkBlocker(rowToTest, selectedHost, ollama);
    const progressId = createRunProgressId('single');
    activeBenchmarkProgressIdRef.current = progressId;
    const questions = questionsOverride ?? benchmarkPromptPlan;
    const count = questionsOverride ? questionsOverride.length : benchmarkQuestionCount;

    if (hostBlocker) {
      setRunProgress({
        mode: 'single',
        phase: 'failed',
        label: 'Test Model',
        currentModel: modelToTest,
        completed: 0,
        total: 1,
        percent: 0,
        message: hostBlocker,
      });
      setActivity(hostBlocker);
      return;
    }

    setIsBenchmarking(true);
    setSelectedModel(modelToTest);
    setRunProgress({
      progressId,
      mode: 'single',
      phase: 'running',
      label: 'Test Model',
      currentModel: modelToTest,
      completed: 0,
      total: 1,
      percent: 12,
      message: `${count} question suite warming up...`,
      questionIndex: 0,
      questionTotal: questions.length,
      questionLabel: questions[0]?.label,
      questionPrompt: questions[0]?.prompt,
      completedQuestions: 0,
      questionScores: {},
    });
    setActivity(`Testing ${modelToTest} with ${count} questions for speed, reliability, and computer fit...`);

    try {
      const result = normalizeBenchmarkResultModel(await agentArcadeApi.runBenchmark({
        model: modelToTest,
        baseUrl: runtime.baseUrl,
        provider: runtime.provider,
        questionCount: count,
        questions,
        progressId,
        qualityMode: effectiveJudge ? 'judge' : 'heuristic',
        judgeModel: effectiveJudge?.model,
        judgeProvider: effectiveJudge?.provider,
        judgeApiKey: effectiveJudge?.apiKey,
        autoJudgeModels,
      }), modelToTest);
      setBenchmark(result);
      setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
      const runBalance = runBalanceRef.current;
      setModelScores((current) => upsertModelScores(current, [result], currentSuiteName, rigStampForModel, runBalance));
      setClearedTopMatches((current) => removeSetValues(current, [result.model, modelToTest]));
      recordRuns([result]);
      setRunProgress({
        progressId,
        mode: 'single',
        phase: 'complete',
        label: 'Test Model',
        currentModel: result.model,
        completed: 1,
        total: 1,
        percent: 100,
        message: `${result.model} finished with ${result.scores.grade} grade.`,
        questionIndex: result.prompts.length - 1,
        questionTotal: result.prompts.length,
        questionLabel: result.prompts[result.prompts.length - 1]?.label,
        questionPrompt: result.prompts[result.prompts.length - 1]?.prompt,
        completedQuestions: result.prompts.length,
        questionScores: Object.fromEntries(result.prompts.map((prompt) => [prompt.id, prompt.sobrietyScore])),
        lastResult: {
          model: result.model,
          total: result.scores.total,
          grade: result.scores.grade,
        },
      });
      setActivity(`${result.model} finished with ${result.scores.grade} grade and ${result.scores.total} match score.`);
      // Run Logs previously only recorded failures — both appendLog calls lived in
      // catch blocks — so a panel whose whole purpose is showing what ran was
      // empty after every successful run.
      await agentArcadeApi.appendLog({
        level: 'info',
        source: 'renderer',
        message: `Tested ${result.model}: ${result.scores.total} Match (${result.scores.grade})`,
        details: {
          model: result.model,
          computer: selectedHost?.hostname ?? system.hostname,
          questions: result.questionCount,
          elapsedMs: result.elapsedMs,
          speed: result.scores.speed,
          answerQuality: result.scores.sobriety,
          finishRate: result.scores.stability,
          computerFit: result.scores.fit,
          suite: currentSuiteName,
        },
      });
      playDoneJingle();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      await agentArcadeApi.appendLog({
        level: 'error',
        source: 'renderer',
        message: `Model test failed: ${modelToTest}`,
        details: {
          model: modelToTest,
          computer: selectedHost?.hostname ?? system.hostname,
          baseUrl: runtime.baseUrl,
          provider: runtime.provider,
          questionCount: benchmarkQuestionCount,
          error: errorMessage,
        },
      }).catch(() => undefined);
      void loadLogs();
      setRunProgress({
        progressId,
        mode: 'single',
        phase: 'failed',
        label: 'Test Model',
        currentModel: modelToTest,
        completed: 0,
        total: 1,
        percent: 0,
        message: errorMessage,
      });
      tellUser(`The test stopped: ${errorMessage}`);
      // Re-read the provider. The commonest reason a run dies is that Ollama
      // went away mid-test, and nothing here updated ollama.ready — so the app
      // kept showing "Ollama ready" and "Desktop bridge online" for a provider
      // that was gone. Worse, the 15s auto-reconnect poll is gated on
      // !ollama.ready, so a stale true meant it never engaged and the app could
      // not self-heal until the user manually pressed Check Local.
      void refreshProviderStatus();
    } finally {
      activeBenchmarkProgressIdRef.current = null;
      setIsBenchmarking(false);
    }
  }, [benchmarkPromptPlan, benchmarkQuestionCount, currentSuiteName, loadLogs, modelRows, ollama, recordRuns, refreshProviderStatus, selectedHost, selectedModel, system.hostname, effectiveJudge, rigStampForModel, tellUser, autoJudgeModels]);

  const requestQuickCheckRow = useCallback((row: ModelRow) => {
    // The quick TEST button skips the full launch modal, but it still loads a
    // multi-GB model into VRAM — warn once unless the user opted out.
    let skipWarning = false;
    try { skipWarning = localStorage.getItem(QUICK_CHECK_WARNING_KEY) === 'off'; } catch { /* storage unavailable */ }
    if (skipWarning) {
      void startBenchmark(row.displayName, QUICK_CHECK_QUESTIONS);
      return;
    }
    setPendingQuickCheck(row);
  }, [startBenchmark]);

  const confirmQuickCheck = useCallback((dontWarnAgain: boolean) => {
    const row = pendingQuickCheck;
    setPendingQuickCheck(null);
    if (!row) return;
    if (dontWarnAgain) {
      try { localStorage.setItem(QUICK_CHECK_WARNING_KEY, 'off'); } catch { /* storage unavailable */ }
    }
    void startBenchmark(row.displayName, QUICK_CHECK_QUESTIONS);
  }, [pendingQuickCheck, startBenchmark]);

  const queueModel = useCallback((row: ModelRow) => {
    if (row.localProvider === 'lm-studio' || row.canDownload === false) {
      setActivity(`${row.displayName} is already available through ${row.localProviderLabel ?? 'a local provider'}; no Ollama download needed.`);
      return;
    }
    setSelectedModel(row.displayName);
    setQueuedModelIds((current) => {
      const next = new Set(current);
      if (next.has(row.displayName)) {
        next.delete(row.displayName);
        setPullProgressByModel((current) => removePullProgress(current, row.displayName));
        const remainingGb = sumQueuedGb(modelRows, next);
        setActivity(`${row.displayName} removed from the download queue. Queue now totals ${formatGb(remainingGb)}.`);
      } else {
        const rowGb = row.sizeGb || 0;
        const nextQueuedGb = sumQueuedGb(modelRows, next) + rowGb;
        const freeAfterQueue = system.storage.availableGb - nextQueuedGb;

        if (rowGb <= 0) {
          setActivity(`${row.displayName} has unknown size. Check the model page before downloading.`);
          return current;
        }

        const platformFit = getPlatformFit(row.displayName, system.platform);
        if (!platformFit.compatible) {
          setActivity(`${row.displayName} is macOS-only (MLX format) and cannot be downloaded on ${system.platform === 'win32' ? 'Windows' : 'Linux'}.`);
          return current;
        }

        const hardwareFit = getHardwareFit(row, system.gpu.vramGb);
        if (!hardwareFit.recommend) {
          setActivity(`${row.displayName} is ${hardwareFit.label.toLowerCase()} for this rig: ${hardwareFit.detail}`);
          return current;
        }

        if (freeAfterQueue < 10) {
          setActivity(`${row.displayName} blocked: ${formatGb(rowGb)} would leave only ${formatGb(freeAfterQueue)} free. Keep at least 10 GB open.`);
          return current;
        }

        next.add(row.displayName);
        setPullProgressByModel((current) => ({
          ...current,
          [row.displayName]: createQueuedPullProgress(row.displayName, ollama.baseUrl),
        }));
        const warning = freeAfterQueue < 25 ? ' Low-space warning.' : '';
        setActivity(`${row.displayName} added to the download queue (+${formatGb(rowGb)}). Queue totals ${formatGb(nextQueuedGb)}; ${formatGb(freeAfterQueue)} free after queue.${warning}`);
      }
      return next;
    });
  }, [modelRows, ollama.baseUrl, system.gpu.vramGb, system.platform, system.storage.availableGb]);

  const cancelDownloadQueue = useCallback(() => {
    if (isPullingModels) {
      if (isPullCancelRequested) {
        setActivity('Download queue stop is already requested. Waiting for the current Ollama pull to finish.');
        return;
      }

      askPullQueue('cancel');
      setIsPullPaused(false);
      // A generation download is a file stream, not an Ollama pull, and
      // abortPull cannot touch it — without this the multi-gigabyte fetch
      // carried on writing after Stop and the UI said it had stopped.
      abortComfyDownload();
      setQueuedModelIds(new Set<string>());
      setPullProgressByModel((current) => {
        if (!pullingModel) return {};
        const activeProgress = current[pullingModel] ?? createQueuedPullProgress(pullingModel, ollama.baseUrl);
        return {
          [pullingModel]: {
            ...activeProgress,
            phase: activeProgress.phase === 'complete' ? 'complete' : 'pulling',
            status: 'Stopping after current pull',
            updatedAt: new Date().toISOString(),
          },
        };
      });
      setActivity(
        pullingModel
          ? `Canceling the download queue and stopping ${pullingModel}.`
          : 'Canceling the download queue.',
      );
      return;
    }

    if (queuedModelIds.size === 0) {
      setActivity('Download queue is already empty.');
      return;
    }

    const queuedGb = sumQueuedGb(modelRows, queuedModelIds);
    setQueuedModelIds(new Set<string>());
    setPullProgressByModel((current) => removePullProgressForModels(current, queuedModelIds));
    setActivity(`Download queue canceled. Removed ${formatGb(queuedGb)} of planned downloads.`);
  }, [isPullCancelRequested, isPullingModels, modelRows, ollama.baseUrl, pullingModel, queuedModelIds, abortComfyDownload, askPullQueue]);

  const pauseDownloadQueue = useCallback(() => {
    if (!isPullingModels || !pullingModel) {
      setActivity('No active download to pause.');
      return;
    }

    if (isPullPauseRequested || isPullCancelRequested) {
      setActivity('Download pause/stop is already requested.');
      return;
    }

    askPullQueue('pause');
    setPullProgressByModel((current) => {
      const activeProgress = current[pullingModel] ?? createQueuedPullProgress(pullingModel, ollama.baseUrl);
      return {
        ...current,
        [pullingModel]: {
          ...activeProgress,
          phase: 'paused',
          status: 'Pausing download',
          speedBps: 0,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setActivity(`Pausing ${pullingModel}. Start Download will resume through Ollama instead of dropping the queue.`);
  }, [isPullCancelRequested, isPullPauseRequested, isPullingModels, ollama.baseUrl, pullingModel, askPullQueue]);

  /**
   * Fetch a generation model into ComfyUI's own folders.
   *
   * Needs somewhere to write, and ComfyUI never says where it lives — so
   * without a verified folder this stops and says so rather than failing
   * somewhere less obvious. The encoder rides along: a video checkpoint on its
   * own renders nothing.
   */
  /**
   * Look for ComfyUI on the user's behalf, from wherever they were refused.
   *
   * Same search Settings runs, and the same verification: the folder is checked
   * against the checkpoints the running ComfyUI lists, so a second install
   * cannot quietly collect a multi-gigabyte download the live server never
   * looks at.
   *
   * Deliberately does not restart the download. The person asked RigMatch to
   * find a folder, not to spend their bandwidth — it reports what it found and
   * lets them press the button again.
   */
  const findComfyForDownload = useCallback(async () => {
    tellUser('Looking for ComfyUI…');
    const outcome = await locateComfyFolder();
    if (outcome.found) {
      tellUser(`Found ComfyUI at ${outcome.folder}, and checked it against the copy that is `
        + 'running. Start the download again and it will land there.');
      return;
    }
    if (outcome.reason === 'not-running') {
      // Keeps the button. "Start ComfyUI first" is an instruction the person can
      // carry out in the next thirty seconds, and taking the control away means
      // their reward for following it is having to trigger the whole download
      // again to get the offer back — the same shape of dead end this replaced.
      tellUser(
        'Start ComfyUI first — RigMatch finds it by looking at what is already running. '
        + 'Once it is up, try again.',
        { label: 'Look again', run: findComfyForDownload },
      );
      return;
    }
    tellUser('RigMatch could not work out where ComfyUI keeps its models. Switch to Advanced Mode '
      + '→ Settings → Generation, where you can pick the folder yourself.');
  }, [tellUser]);

  const downloadGenerationModel = useCallback(async (row: ModelRow): Promise<boolean> => {
    /**
     * Refusing a download must LOOK like refusing it.
     *
     * These early returns used to leave no progress entry behind, and
     * getDownloadRowStatus reads "no entry" as 'queued' — so a download that
     * was declined before it started sat in the list saying "Queued" forever,
     * with the reason in a single Ticker line that scrolls away and never
     * appears in Simple Mode at all. A stuck progress bar is worse than an
     * error: it tells the user to keep waiting.
     */
    const refuse = (why: string, action?: { label: string; run: () => void | Promise<void> }): false => {
      setPullProgressByModel((current) => ({
        ...current,
        [row.displayName]: {
          id: `comfy-refused-${row.displayName}`,
          model: row.displayName,
          phase: 'failed',
          status: why,
          percent: null,
          error: why,
          updatedAt: new Date().toISOString(),
        },
      }));
      tellUser(why, action);
      return false;
    };

    const model = row.generationId ? generationModelById(row.generationId) : undefined;
    if (!model) {
      return refuse(`${row.displayName} is not in RigMatch's download list, so there is nothing to fetch.`);
    }

    const { folder: comfyRoot } = readComfySettings();
    if (!comfyRoot) {
      // The old wording sent people to Settings → Generation, which exists only in
      // Advanced Mode — so in Simple Mode, where a beginner most likely picked
      // "making images" in the first place, the instruction named a place they
      // could not reach. The search that Settings runs is offered here instead.
      return refuse(
        `${row.displayName} installs into ComfyUI — a separate free program RigMatch does not `
        + 'install — and RigMatch does not know where it is yet. Start ComfyUI, then let '
        + 'RigMatch look for it.',
        { label: 'Find ComfyUI for me', run: findComfyForDownload },
      );
    }

    const { needed, totalBytes } = downloadPlan(model, comfyFolders);
    if (needed.length === 0) return true;

    setActivity(`Downloading ${needed.map((m) => m.label).join(' + ')} — ${formatBytesGb(totalBytes)} in total.`);
    for (const item of needed) {
      // A video model and its encoder are two files; Stop during the first
      // must not be followed by the second starting anyway.
      if (pullQueueShouldStop()) return false;
      const progressId = createRunProgressId('comfy');
      beginComfyDownload(progressId);
      const unsubscribe = agentArcadeApi.onComfyDownloadProgress?.((progress) => {
        if (progress.id !== progressId) return;
        setPullProgressByModel((current) => ({
          ...current,
          [row.displayName]: {
            id: progressId,
            model: row.displayName,
            phase: 'pulling',
            status: `${item.label} — ${formatBytesGb(progress.received)} of ${formatBytesGb(progress.total)}`,
            percent: progress.percent,
            // The detail line under the bar reads these three; without them a
            // moving download said "-- MB/s · waiting for bytes" at 3%.
            completedBytes: progress.received,
            totalBytes: progress.total || undefined,
            speedBps: progress.bytesPerSecond ?? undefined,
            updatedAt: new Date().toISOString(),
          },
        }));
      });
      try {
        await agentArcadeApi.comfyDownloadModel?.({
          root: comfyRoot, folder: item.folder, filename: item.filename,
          url: item.url, expectedBytes: item.bytes, progressId,
          // Checked before ComfyUI can see the file. The token goes only with a
          // gated file, and the downloader keeps it off the CDN.
          sha256: item.sha256,
          token: item.gated ? readHuggingFaceToken() || undefined : undefined,
        });
      } catch (error) {
        // A canceled stream lands here too; say stopped rather than failed,
        // since the user asked for it.
        const message = getErrorMessage(error);
        if (pullQueueShouldStop()) {
          setActivity(`${item.label} download stopped.`);
          return false;
        }
        return refuse(`${item.label} could not be downloaded. ${message}`);
      } finally {
        endComfyDownload();
        unsubscribe?.();
      }
    }
    // ComfyUI only rescans its folders at startup, so a fresh file is invisible
    // until it does. Better said now than discovered as a missing model later.
    setActivity(`${row.displayName} downloaded. Restart ComfyUI so it picks up the new file.`);
    void refreshComfyStatus();
    return true;
  }, [comfyFolders, tellUser, refreshComfyStatus, beginComfyDownload, endComfyDownload, pullQueueShouldStop, findComfyForDownload]);

  /**
   * A generation download the Video Lab asked for, rather than the queue.
   *
   * The queue sizes every row against VRAM and waits on Ollama, and neither
   * belongs to a video model: the Lab has already said whether it fits, and a
   * ComfyUI download has nothing to do with Ollama. It still goes through the
   * same consent dialog and the same downloader, one at a time, so Stop always
   * reaches the download it names.
   */
  const requestLabDownload = useCallback((generationId: string) => {
    const row = modelRows.find((candidate) => candidate.generationId === generationId);
    if (!row || row.installed) return;
    if (isPullingModels || labDownloadName) {
      tellUser('Another download is running. Let it finish, or stop it, before starting this one.');
      return;
    }
    setPendingLabDownload(row);
  }, [modelRows, isPullingModels, labDownloadName, tellUser]);

  const confirmLabDownload = useCallback(async () => {
    const row = pendingLabDownload;
    setPendingLabDownload(null);
    if (!row) return;
    setLabDownloadName(row.displayName);
    clearPullRequest();
    try {
      const downloaded = await downloadGenerationModel(row);
      setPullProgressByModel((current) => {
        const entry = current[row.displayName];
        if (downloaded) {
          return {
            ...current,
            [row.displayName]: {
              ...(entry ?? createQueuedPullProgress(row.displayName, ollama.baseUrl)),
              phase: 'complete',
              status: 'Downloaded. Restart ComfyUI so it can see the new files.',
              percent: 100,
              updatedAt: new Date().toISOString(),
            },
          };
        }
        // A refusal has already said why; a stopped download leaves nothing to show.
        return entry?.phase === 'failed' ? current : removePullProgress(current, row.displayName);
      });
    } finally {
      clearPullRequest();
      setLabDownloadName(null);
    }
  }, [pendingLabDownload, downloadGenerationModel, clearPullRequest, ollama.baseUrl]);

  const stopLabDownload = useCallback(() => {
    askPullQueue('cancel');
    abortComfyDownload();
  }, [askPullQueue, abortComfyDownload]);

  const pullQueuedModels = useCallback(async () => {
    if (queuedRows.length === 0) {
      setActivity('Pick a model to download before starting the queue.');
      return;
    }

    // Only Ollama models need Ollama. A ComfyUI download is a file fetch into
    // a folder and has nothing to do with it, so a queue of those must not be
    // blocked by an unrelated service being off.
    if (!ollama.ready && queuedRows.some((row) => row.runtime !== 'comfyui')) {
      setActivity('Ollama must be running before RigMatch can download models.');
      return;
    }

    clearPullRequest();
    setIsPullPaused(false);
    setIsPullingModels(true);
    let completedCount = 0;
    let wasCanceled = false;
    let activePullModel: string | null = null;
    const startingCount = queuedRows.length;

    try {
      for (const row of queuedRows) {
        if (pullQueueShouldStop()) {
          wasCanceled = true;
          break;
        }

        // A generation model is a .safetensors file for ComfyUI, not something
        // `ollama pull` could ever fetch. Routed here rather than filtered out
        // of the queue, so the reason is visible instead of the row silently
        // doing nothing.
        if (row.runtime === 'comfyui') {
          const done = await downloadGenerationModel(row);
          if (done) completedCount += 1;
          continue;
        }

        const progressId = createRunProgressId('pull');
        activePullModel = row.displayName;
        setActivePullProgressId(progressId);
        setPullingModel(row.displayName);
        setPullProgressByModel((current) => ({
          ...current,
          [row.displayName]: {
            ...(current[row.displayName] ?? createQueuedPullProgress(row.displayName, ollama.baseUrl)),
            id: progressId,
            model: row.displayName,
            baseUrl: ollama.baseUrl,
            phase: 'started',
            status: current[row.displayName]?.phase === 'paused' ? 'Resuming download' : 'Starting download',
            percent: current[row.displayName]?.percent ?? 0,
            speedBps: 0,
            updatedAt: new Date().toISOString(),
          },
        }));
        setActivity(`${pullProgressByModel[row.displayName]?.phase === 'paused' ? 'Resuming' : 'Downloading'} ${row.displayName} into ${selectedHost?.hostname ?? 'this computer'}... This can take a while.`);
        await agentArcadeApi.pullModel({
          model: row.displayName,
          baseUrl: ollama.baseUrl,
          progressId,
        });

        setOllama((current) => {
          if (current.models.some((model) => (model.model || model.name) === row.displayName)) return current;

          return {
            ...current,
            models: [
              ...current.models,
              {
                name: row.displayName,
                model: row.displayName,
                sizeGb: row.sizeGb || 0,
                parameterSize: row.params,
              },
            ],
          };
        });

        completedCount += 1;
        setPullProgressByModel((current) => ({
          ...current,
          [row.displayName]: {
            ...(current[row.displayName] ?? createQueuedPullProgress(row.displayName, ollama.baseUrl)),
            id: progressId,
            model: row.displayName,
            baseUrl: ollama.baseUrl,
            phase: 'complete',
            status: 'Download complete',
            percent: 100,
            speedBps: 0,
            updatedAt: new Date().toISOString(),
          },
        }));
        setQueuedModelIds((current) => {
          const next = new Set(current);
          next.delete(row.displayName);
          return next;
        });
      }

      if (pullQueueShouldStop()) {
        wasCanceled = true;
      }

      if (wasCanceled) {
        const finishedLabel = completedCount === 0
          ? 'No models finished downloading.'
          : `${completedCount} of ${startingCount} model${startingCount === 1 ? '' : 's'} finished. Refreshing the model list...`;
        setActivity(`Download queue stopped. ${finishedLabel}`);
        if (completedCount > 0) {
          await refreshRig();
        }
        return;
      }

      setQueuedModelIds(new Set<string>());
      setActivity(`${completedCount} model${completedCount === 1 ? '' : 's'} downloaded. Refreshing the model list...`);
      await refreshRig();
    } catch (error) {
      const outcome = pullOutcome({ request: currentPullRequest(), hasActiveModel: Boolean(activePullModel) });
      if (outcome === 'paused' && activePullModel) {
        const pausedModel = activePullModel;
        setIsPullPaused(true);
        setQueuedModelIds((current) => {
          const next = new Set(current);
          next.add(pausedModel);
          return next;
        });
        setPullProgressByModel((current) => ({
          ...current,
          [pausedModel]: {
            ...(current[pausedModel] ?? createQueuedPullProgress(pausedModel, ollama.baseUrl)),
            model: pausedModel,
            baseUrl: ollama.baseUrl,
            phase: 'paused',
            status: 'Paused',
            percent: current[pausedModel]?.percent ?? null,
            speedBps: 0,
            error: null,
            updatedAt: new Date().toISOString(),
          },
        }));
        setActivity(`Paused ${pausedModel}. Start Download will resume through Ollama's cached layers when possible.`);
        return;
      }

      if (outcome === 'canceled') {
        setPullProgressByModel({});
        setActivity('Download queue canceled. No more queued models will start.');
        return;
      }

      if (activePullModel) {
        const failedModel = activePullModel;
        // Take it out of the queue. The queue was only ever emptied on success
        // or an explicit cancel, so a failed model stayed queued — and the
        // auto-start effect below restarts the queue the moment isPullingModels
        // goes false. A bad tag, a 404, or a full disk therefore produced a
        // tight retry loop against Ollama with the ticker flickering the same
        // error forever, and no way out but canceling the whole queue. The
        // failed entry stays in pullProgressByModel so the UI can show what
        // happened and offer a retry.
        setQueuedModelIds((current) => {
          const next = new Set(current);
          next.delete(failedModel);
          return next;
        });
        setPullProgressByModel((current) => ({
          ...current,
          [failedModel]: {
            ...(current[failedModel] ?? createQueuedPullProgress(failedModel, ollama.baseUrl)),
            model: failedModel,
            baseUrl: ollama.baseUrl,
            phase: 'failed',
            status: 'Download failed',
            percent: current[failedModel]?.percent ?? null,
            speedBps: 0,
            error: getErrorMessage(error),
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      setActivity(`Model download failed: ${getErrorMessage(error)}`);
    } finally {
      setPullingModel(null);
      setIsPullingModels(false);
      clearPullRequest();
    }
    // downloadGenerationModel closes over the ComfyUI file lists; without it
    // here a queue would write against whatever they were when this callback
    // was last built, and re-download a file already fetched.
  }, [ollama.baseUrl, ollama.ready, pullProgressByModel, queuedRows, refreshRig, selectedHost?.hostname, downloadGenerationModel, clearPullRequest, currentPullRequest, pullQueueShouldStop, setActivePullProgressId]);

  const queueMissingSpeedDateModels = useCallback((rows: ModelRow[]) => {
    const missingRows = rows.filter((row) => !row.installed && !queuedModelIds.has(row.displayName));

    if (missingRows.length === 0) {
      const queuedMissingCount = rows.filter((row) => !row.installed && queuedModelIds.has(row.displayName)).length;
      setActivity(
        queuedMissingCount > 0
          ? 'All missing Speed Dating contestants are already queued for download.'
          : 'All selected Speed Dating contestants are already downloaded.',
      );
      return;
    }

    const nextQueuedIds = new Set(queuedModelIds);
    let nextQueuedGb = sumQueuedGb(modelRows, nextQueuedIds);
    const queuedRowsForDownload: ModelRow[] = [];
    const blockedReasons: string[] = [];

    for (const row of missingRows) {
      const rowGb = row.sizeGb || 0;

      if (rowGb <= 0) {
        blockedReasons.push(`${row.displayName}: unknown size`);
        continue;
      }

      const platformFit = getPlatformFit(row.displayName, system.platform);
      if (!platformFit.compatible) {
        blockedReasons.push(`${row.displayName}: ${platformFit.reason}`);
        continue;
      }

      const hardwareFit = getHardwareFit(row, system.gpu.vramGb);
      if (!hardwareFit.recommend) {
        blockedReasons.push(`${row.displayName}: ${hardwareFit.label.toLowerCase()}`);
        continue;
      }

      const freeAfterQueue = system.storage.availableGb - nextQueuedGb - rowGb;
      if (freeAfterQueue < 10) {
        blockedReasons.push(`${row.displayName}: would leave ${formatGb(freeAfterQueue)} free`);
        continue;
      }

      nextQueuedIds.add(row.displayName);
      nextQueuedGb += rowGb;
      queuedRowsForDownload.push(row);
    }

    if (queuedRowsForDownload.length === 0) {
      tellUser(`Nothing could be queued for download. ${blockedReasons[0] ?? 'Check model availability first.'} Go back and pick a different model.`);
      return;
    }

    setSelectedModel(queuedRowsForDownload[0].displayName);
    setQueuedModelIds(nextQueuedIds);
    setPullProgressByModel((current) => {
      const next = { ...current };
      queuedRowsForDownload.forEach((row) => {
        next[row.displayName] = next[row.displayName] ?? createQueuedPullProgress(row.displayName, ollama.baseUrl);
      });
      return next;
    });

    const blockedNote = blockedReasons.length > 0 ? ` ${blockedReasons.length} could not be queued.` : '';
    setActivity(`${queuedRowsForDownload.length} missing Speed Dating contestant${queuedRowsForDownload.length === 1 ? '' : 's'} queued for download.${blockedNote}`);
  }, [modelRows, ollama.baseUrl, queuedModelIds, system.gpu.vramGb, system.platform, system.storage.availableGb, tellUser]);

  const requestThirdPartyModelDownloads = useCallback((rows: ModelRow[]) => {
    const missingRows = rows.filter((row) => !row.installed);
    if (missingRows.length === 0) return;
    setPendingThirdPartyDownloadRows(missingRows);
  }, []);

  const confirmThirdPartyModelDownloads = useCallback(() => {
    if (!pendingThirdPartyDownloadRows) return;
    queueMissingSpeedDateModels(pendingThirdPartyDownloadRows);
    setPendingThirdPartyDownloadRows(null);
  }, [pendingThirdPartyDownloadRows, queueMissingSpeedDateModels]);

  // "Choose for me": fill the lineup with the best-fitting models this PC can
  // run, preferring ones already installed (nothing to download) and then the
  // largest that still fits comfortably.
  const chooseShortlistForMe = useCallback(() => {
    const eligible = modelRows.filter((row) =>
      getPlatformFit(row.displayName, system.platform).compatible
      && getHardwareFit(row, system.gpu.vramGb).recommend
      && !isCloudModel(row.displayName)
      && !isEmbeddingModel(row.displayName)
      // Capability-checked rather than name-guessed: a model Ollama reports as
      // image-only cannot answer a benchmark question at all, and would take an
      // F for a fault that is not its own.
      && canGenerateText(row));

    // One entry per model name: an auto-picked lineup of five Gemma sizes would
    // be a rigged show — five near-identical contestants answering the same
    // questions. The point of "Choose for me" is a varied field.
    const seenNames = new Set<string>();
    const ranked = [...eligible].sort((left, right) => {
      if (left.installed !== right.installed) return left.installed ? -1 : 1;
      return (right.sizeGb ?? 0) - (left.sizeGb ?? 0);
    }).filter((row) => {
      const name = getFriendlyModelName(row.displayName);
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    }).slice(0, 5);

    if (ranked.length === 0) {
      // "chat models", not "models": this ranks Speed Dating contestants, and
      // image and video makers are excluded by design. Saying "no models fit"
      // turns a deliberate filter into a claim about the hardware — the same
      // mistake that told people this PC could not make video.
      tellUser('No chat models fit this computer yet — run the computer check first, or download one from the list.');
      return;
    }

    setShortlistIds(new Set(ranked.map((row) => row.displayName)));
    setActivity(`Picked ${ranked.length} contestant${ranked.length === 1 ? '' : 's'} that fit this computer.`);
  }, [modelRows, system.gpu.vramGb, system.platform, tellUser]);

  const toggleShortlist = useCallback((row: ModelRow) => {
    if (!canJoinComparison(row)) {
      setActivity(`${row.displayName} cannot join Speed Dating — the comparison is a conversation, and this model does not chat. Generation models race each other in the Lab, where every checkpoint gets the same prompt and seed.`);
      return;
    }
    const hardwareFit = getHardwareFit(row, system.gpu.vramGb);
    const platformFit = getPlatformFit(row.displayName, system.platform);

    setShortlistIds((current) => {
      const next = new Set(current);
      if (next.has(row.displayName)) {
        next.delete(row.displayName);
        setActivity(`${row.displayName} removed from the Speed Dating lineup.`);
        return next;
      }

      if (!platformFit.compatible) {
        setActivity(`${row.displayName} cannot join Speed Dating on this computer: ${platformFit.reason}`);
        return current;
      }

      if (!hardwareFit.recommend) {
        setActivity(`${row.displayName} is ${hardwareFit.label.toLowerCase()} for this rig, so it is staying out of the Speed Dating lineup.`);
        return current;
      }

      if (next.size >= 5) {
        setActivity('The Speed Dating lineup is full. Remove one model from the lineup below before adding another.');
        return current;
      }

      next.add(row.displayName);
      setActivity(`${row.displayName} added to the Speed Dating lineup.`);
      return next;
    });
  }, [system.gpu.vramGb, system.platform]);

  const requestListTest = useCallback(() => {
    const incompatibleLineupRows = shortlistedRows.filter((row) => !getPlatformFit(row.displayName, system.platform).compatible);
    if (incompatibleLineupRows.length > 0) {
      const first = incompatibleLineupRows[0];
      const reason = getPlatformFit(first.displayName, system.platform).reason;
      setActivity(`${first.displayName} cannot run Speed Dating on this computer: ${reason}. Remove it from the lineup first.`);
      return;
    }

    const runnableRows = shortlistedRows.filter((row) => row.installed).slice(0, 5);
    const missingDownloadCount = shortlistedRows.filter((row) => !row.installed).length;
    const hostBlocker = getLineupBenchmarkBlocker(runnableRows, selectedHost, ollama);

    if (missingDownloadCount > 0) {
      setActivity(`${countWithVerb(missingDownloadCount, 'Speed Dating contestant', 'needs', 'need')} downloading first. Open setup and use Download All.`);
      return;
    }

    if (runnableRows.length < MIN_CONTESTANTS) {
      setActivity(`Pick at least ${MIN_CONTESTANTS} installed models for Speed Dating. Five is the sweet spot.`);
      return;
    }

    if (hostBlocker) {
      setActivity(hostBlocker);
      return;
    }

    setPendingSingleModel(null);
    setPendingRunMode('speed-date');
    setActivity(`Confirm resource warning before comparing ${runnableRows.length} models with ${benchmarkQuestionCount} questions each.`);
  }, [benchmarkQuestionCount, ollama, selectedHost, shortlistedRows, system.platform]);

  const runListTest = useCallback(async () => {
    const runnableRows = shortlistedRows.filter((row) => row.installed && getPlatformFit(row.displayName, system.platform).compatible).slice(0, 5);
    const hostBlocker = getLineupBenchmarkBlocker(runnableRows, selectedHost, ollama);
    const listRunId = createRunProgressId('speed-date');
    const firstProgressId = `${listRunId}-0`;

    // requestListTest checks this, but Simple Mode calls runListTest directly
    // (onStartShow), bypassing it. With nothing runnable the loop below never
    // executes, and the unseeded results.reduce threw "Reduce of empty array
    // with no initial value" straight at the user. Reachable in practice:
    // shortlisted models can all be platform-incompatible, which this filter
    // removes but the download step's count does not.
    if (runnableRows.length < MIN_CONTESTANTS) {
      const why = runnableRows.length === 0
        // Scoped to chat models for the same reason as onChooseForMe above.
        ? 'No installed chat models can run on this computer yet. Download at least two that fit.'
        : `Speed Dating needs at least ${MIN_CONTESTANTS} installed models that run on this computer.`;
      // Reported as a failed run rather than by clearing runProgress. Simple
      // Mode latches `awaitingRun` when it asks for a show and only releases it
      // once the run goes active or reports complete/failed — so returning
      // silently would swap the crash for a wizard stuck on Compare with Next
      // disabled under "The show is still running", no Back, and no way out but
      // a restart. A failed phase releases it and shows the reason.
      setRunProgress({
        mode: 'speed-date',
        phase: 'failed',
        label: 'Speed Dating',
        currentModel: runnableRows[0]?.displayName ?? 'Waiting',
        completed: 0,
        total: runnableRows.length,
        percent: 0,
        message: why,
      });
      setActivity(why);
      return;
    }

    if (hostBlocker) {
      setRunProgress({
        mode: 'speed-date',
        phase: 'failed',
        label: 'Speed Dating',
        currentModel: runnableRows[0]?.displayName ?? 'Waiting',
        completed: 0,
        total: runnableRows.length,
        percent: 0,
        message: hostBlocker,
      });
      setActivity(hostBlocker);
      return;
    }

    stopRunRef.current = false;
    setIsListTesting(true);
    setListTestResult(null);
    setReportReady(false);
    setRunProgress({
      progressId: firstProgressId,
      mode: 'speed-date',
      phase: 'running',
      label: 'Speed Dating',
      currentModel: runnableRows[0]?.displayName ?? 'Waiting',
      completed: 0,
      total: runnableRows.length,
      percent: 0,
      message: `0 of ${runnableRows.length} model candidates tested with ${benchmarkQuestionCount} questions each.`,
      questionIndex: 0,
      questionTotal: benchmarkPromptPlan.length,
      questionLabel: benchmarkPromptPlan[0]?.label,
      questionPrompt: benchmarkPromptPlan[0]?.prompt,
      completedQuestions: 0,
      questionScores: {},
    });
    setActivity(`Running Speed Dating across ${runnableRows.length} model candidates with ${benchmarkQuestionCount} questions each...`);

    try {
      const results: BenchmarkResult[] = [];
      for (const [index, row] of runnableRows.entries()) {
        const progressId = `${listRunId}-${index}`;
        activeBenchmarkProgressIdRef.current = progressId;
        setRunProgress((current) => ({
          progressId,
          mode: 'speed-date',
          phase: 'running',
          label: 'Speed Dating',
          currentModel: row.displayName,
          completed: index,
          total: runnableRows.length,
          percent: Math.round(((index + 0.25) / runnableRows.length) * 100),
          message: `Testing candidate ${index + 1} of ${runnableRows.length}.`,
          questionIndex: 0,
          questionTotal: benchmarkPromptPlan.length,
          questionLabel: benchmarkPromptPlan[0]?.label,
          questionPrompt: benchmarkPromptPlan[0]?.prompt,
          completedQuestions: 0,
          questionScores: {},
          lastResult: current?.lastResult,
        }));
        setActivity(`Speed Dating: testing compatibility with ${row.displayName}...`);
        const runtime = getModelRuntime(row, ollama);
        const result = normalizeBenchmarkResultModel(await agentArcadeApi.runBenchmark({
          model: row.displayName,
          baseUrl: runtime.baseUrl,
          provider: runtime.provider,
          questionCount: benchmarkQuestionCount,
          questions: benchmarkPromptPlan,
          progressId,
          qualityMode: effectiveJudge ? 'judge' : 'heuristic',
          judgeModel: effectiveJudge?.model,
          judgeProvider: effectiveJudge?.provider,
          judgeApiKey: effectiveJudge?.apiKey,
        autoJudgeModels,
        }), row.displayName);
        results.push(result);
        setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
        const runBalance = runBalanceRef.current;
        setModelScores((current) => upsertModelScores(current, [result], currentSuiteName, rigStampForModel, runBalance));
        setClearedTopMatches((current) => removeSetValues(current, [result.model, row.displayName]));
        recordRuns([result]);
        const isStopped = stopRunRef.current;
        setRunProgress({
          progressId: !isStopped && runnableRows[index + 1] ? `${listRunId}-${index + 1}` : progressId,
          mode: 'speed-date',
          phase: isStopped ? 'complete' : 'running',
          label: 'Speed Dating',
          currentModel: runnableRows[index + 1]?.displayName ?? result.model,
          completed: index + 1,
          total: runnableRows.length,
          percent: isStopped ? 100 : Math.round(((index + 1) / runnableRows.length) * 100),
          message: isStopped ? `Stopped early — ${index + 1} of ${runnableRows.length} models tested.` : `${result.model} scored ${result.scores.total} (${result.scores.grade}).`,
          questionIndex: result.prompts.length - 1,
          questionTotal: result.prompts.length,
          questionLabel: result.prompts[result.prompts.length - 1]?.label,
          questionPrompt: result.prompts[result.prompts.length - 1]?.prompt,
          completedQuestions: result.prompts.length,
          questionScores: Object.fromEntries(result.prompts.map((prompt) => [prompt.id, prompt.sobrietyScore])),
          lastResult: {
            model: result.model,
            total: result.scores.total,
            grade: result.scores.grade,
          },
        });
        if (isStopped) break;
      }

      // Belt and braces: the guard above makes this unreachable today, but an
      // unseeded reduce over an empty array throws a raw TypeError that lands
      // in front of the user as the run's failure message. Fail with something
      // readable if a future path ever gets here with nothing.
      if (results.length === 0) {
        throw new Error('No models finished a run, so there is nothing to compare.');
      }
      const winner = results.reduce((best, result) =>
        compareBenchmarkResults(result, best) < 0 ? result : best,
      );

      setBenchmark(winner);
      setBenchmarkByModel((current) => upsertBenchmarkResults(current, results));
      setSelectedModel(winner.model);
      setRunProgress({
        progressId: `${listRunId}-complete`,
        mode: 'speed-date',
        phase: 'complete',
        label: 'Speed Dating',
        currentModel: winner.model,
        completed: runnableRows.length,
        total: runnableRows.length,
        percent: 100,
        message: `${winner.model} gets the rose for this computer. 🌹`,
        questionIndex: winner.prompts.length - 1,
        questionTotal: winner.prompts.length,
        questionLabel: winner.prompts[winner.prompts.length - 1]?.label,
        questionPrompt: winner.prompts[winner.prompts.length - 1]?.prompt,
        completedQuestions: winner.prompts.length,
        questionScores: Object.fromEntries(winner.prompts.map((prompt) => [prompt.id, prompt.sobrietyScore])),
        lastResult: {
          model: winner.model,
          total: winner.scores.total,
          grade: winner.scores.grade,
        },
      });
      setListTestResult({
        winner: winner.model,
        results: results
          .map((r) => toTestedModelScore(r, currentSuiteName))
          .sort(compareTestedModelScores),
      });
      {
        const completedAt = new Date().toISOString();
        const stored: StoredRunReport = {
          id: makeReportId(completedAt, winner.model),
          completedAt,
          winner: winner.model,
          results: results.map((r) => toTestedModelScore(r, currentSuiteName)).sort(compareTestedModelScores),
          questionCount: winner.prompts.length,
          suiteName: currentSuiteName,
          // The whole result, not just its prompts: the transcript panel reads
          // scores off it too, and storing the shape it already expects means
          // a reopened report renders through exactly the same component.
          transcripts: Object.fromEntries(results.map((r) => [r.model, r])),
        };
        setRunReports((current) => addRunReport(current, stored));
      }
      setReportReady(true);
      setActivity(`Best match: ${winner.model} scored ${winner.scores.total} for this setup.`);
      await agentArcadeApi.appendLog({
        level: 'info',
        source: 'renderer',
        message: `Speed Dating finished: ${winner.model} won with ${winner.scores.total} Match (${winner.scores.grade})`,
        details: {
          computer: selectedHost?.hostname ?? system.hostname,
          modelsTested: results.length,
          questionsEach: winner.questionCount,
          suite: currentSuiteName,
          ranking: results
            .map((entry) => `${entry.model}: ${entry.scores.total} ${entry.scores.grade}`)
            .join(', '),
        },
      });
      playJingle('speed-date-complete');
      if (uiMode === 'beginner') selectNav('history');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      await agentArcadeApi.appendLog({
        level: 'error',
        source: 'renderer',
        message: 'Speed Dating failed',
        details: {
          computer: selectedHost?.hostname ?? system.hostname,
          baseUrl: ollama.baseUrl,
          questionCount: benchmarkQuestionCount,
          candidates: runnableRows.map((row) => row.displayName),
          error: errorMessage,
        },
      }).catch(() => undefined);
      void loadLogs();
      setRunProgress((current) => ({
        mode: 'speed-date',
        phase: 'failed',
        label: 'Speed Dating',
        currentModel: current?.currentModel ?? 'Unknown candidate',
        completed: current?.completed ?? 0,
        total: current?.total ?? runnableRows.length,
        percent: current?.percent ?? 0,
        message: errorMessage,
        lastResult: current?.lastResult,
      }));
      tellUser(`Speed Dating stopped: ${errorMessage}`);
      // See the note in startBenchmark's catch: without this, ollama.ready
      // stays stale-true and the reconnect poll never starts.
      void refreshProviderStatus();
    } finally {
      activeBenchmarkProgressIdRef.current = null;
      setIsListTesting(false);
    }
  }, [benchmarkPromptPlan, benchmarkQuestionCount, currentSuiteName, loadLogs, ollama, recordRuns, refreshProviderStatus, selectNav, selectedHost, shortlistedRows, system.hostname, system.platform, uiMode, effectiveJudge, rigStampForModel, tellUser, autoJudgeModels]);

  /**
   * A skill run that throws must not leave the mini bar spinning forever.
   * These are launched with `void`, so nothing else catches them.
   */
  const reportSkillRunFailure = useCallback((error: unknown) => {
    const message = getErrorMessage(error);
    setSkillRunStatus({ phase: 'failed', label: `Skill tests stopped: ${message}`, completed: 0, total: 0 });
    setLiveBuild(null);
    activeSkillStreamIdRef.current = null;
    tellUser(`Skill tests stopped: ${message}`);
  }, [tellUser]);

  /**
   * `only` runs one skill across the models given, whatever the Skill Tests
   * checkboxes say. Simple Mode's show uses it: someone who asked for a coding
   * buddy gets the coding job, and someone who asked for a picture reader gets
   * the picture test, rather than the question round every answer used to get.
   */
  const runSkillTestsAfterRun = useCallback(async (
    models: string[],
    only?: 'app-builder' | 'code' | 'vision' | 'listening',
  ) => {
    const selection = only
      ? {
        ...skillTestSelection,
        appBuilder: only === 'app-builder',
        code: only === 'code',
        recognize: only === 'vision',
        listen: only === 'listening',
        image: false,
        video: false,
      }
      : skillTestSelection;
    const appPrompt = resolveAppBuilderPrompt(selection.appPromptId, selection.appCustomPrompt);
    const codeTask = resolveCodeTask(selection.codeTaskId, selection.codeCustomTask);
    const jobs: Array<{ model: string; kind: 'app-builder' | 'image' | 'vision' | 'code' | 'listening' | 'video' }> = [];
    // Only models the provider reports as able to hear. A model without the
    // `audio` capability fails the request outright — measured on gemma3:4b,
    // which reads images happily and returns "Failed to load image or audio
    // file" for the same call — and would take an F for being asked something
    // it cannot do.
    const canHear = (model: string) => canHearAudio(
      modelRows.find((row) => row.displayName === model) ?? { displayName: model },
    );
    // Same rule for eyes as for ears: what the provider reports about this
    // model, with the name only as the fallback for one it will not describe.
    // The name rule alone knows `gemma3` and not `gemma4`, so a model that
    // reports `vision` was dropped from the picture round without a word.
    const canSee = (model: string) => canReadImages(
      modelRows.find((row) => row.displayName === model) ?? { displayName: model },
    );
    for (const model of models) {
      if (selection.appBuilder && !isLikelyImageGenerationModel(model) && !isEmbeddingModel(model)) {
        jobs.push({ model, kind: 'app-builder' });
      }
      if (selection.code && !isLikelyImageGenerationModel(model) && !isEmbeddingModel(model)) {
        jobs.push({ model, kind: 'code' });
      }
      if (selection.recognize && canSee(model)) {
        jobs.push({ model, kind: 'vision' });
      }
      if (selection.listen && canHear(model)) {
        jobs.push({ model, kind: 'listening' });
      }
    }

    // Generation jobs do not come from this model list at all. Every other
    // skill runs on an Ollama model; images and video run on ComfyUI
    // checkpoints, so the candidates are whatever ComfyUI has loaded. Asking
    // Ollama for them is what made the image checkbox silently do nothing — it
    // looked for installed models named flux or sdxl, and Ollama has none.
    let videoEntries: VideoLineupEntry[] = [];
    if (selection.image || selection.video) {
      // One check for the whole batch. Every generation job in it shares the
      // same ComfyUI, so if it is busy now none of them will be measuring this
      // computer.
      const busy = await describeComfyBusy();
      if (busy) {
        setActivity(busy);
        void agentArcadeApi.appendLog({ level: 'warn', source: 'renderer', message: `Generation jobs skipped: ${busy}` });
      }
      const comfy = busy ? { checkpoints: [], textEncoders: [] } : await getComfyStatus();
      if (selection.image) {
        // A video or audio checkpoint in a still-image graph fails deep in the
        // sampler with a shape error, so it is never offered one.
        for (const name of comfy.checkpoints.filter(isPictureCheckpoint)) {
          jobs.push({ model: name, kind: 'image' });
        }
      }
      if (selection.video) {
        // Every video model on disk that runs here, each with its own files
        // and graph. A checkpoint name and the first encoder in the folder was
        // how an LTX-2 file reached the LTX-Video 0.9 graph.
        videoEntries = runnableLineup(comfyListing(comfy), videoMachine, { calibration: readVideoCalibration() });
        for (const entry of videoEntries) jobs.push({ model: entry.key, kind: 'video' });
      }
    }

    if (!jobs.length) {
      // Silence here stranded the wizard: it waits for a run to start and then
      // stop, and a round where nothing was eligible never did either. Say what
      // happened, in the terms of what was asked for.
      const nothing = selection.recognize ? 'None of these models can read pictures.'
        : selection.listen ? 'None of these models can listen to audio.'
        : 'None of these models can be tested that way.';
      setSkillRunStatus({ phase: 'complete', label: nothing, completed: 0, total: 0 });
      setActivity(nothing);
      return;
    }

    // One seed for the whole batch. Every video model then renders identical
    // input so the comparison is fair, while a later batch gets a different
    // seed and does real work instead of being served ComfyUI's cache — which
    // returns the previous video in about 1.5s and would read as a fast rig.
    const videoSeed = batchSeed();

    // A vision recognition job needs a picture to read; load the bundled test
    // image once up front.
    const visionImage = jobs.some((job) => job.kind === 'vision') ? await getVisionTestImageDataUrl(selection.recognizeImage) : '';
    // Likewise the listening test needs its recording, loaded once rather than
    // per model — it is 630 KB of base64.
    const listeningAudio = jobs.some((job) => job.kind === 'listening') ? await getListeningTestAudio() : '';

    const demos: DemoArtifact[] = [];
    // Filled by the first video job, which renders every video model at once.
    let videoOutcomes: LineupOutcome[] | null = null;
    stopSkillRef.current = false;
    for (const [index, job] of jobs.entries()) {
      if (stopSkillRef.current) {
        setSkillRunStatus({ phase: 'complete', label: 'Skill tests stopped', completed: index, total: jobs.length });
        setActivity(`Skill tests stopped after ${index} of ${jobs.length} run${jobs.length === 1 ? '' : 's'}.`);
        break;
      }
      const label = job.kind === 'app-builder' ? `App Builder skill test — ${job.model}`
        : job.kind === 'code' ? `Code Challenge — ${job.model}`
        : job.kind === 'image' ? `Image skill test — ${job.model}`
        : job.kind === 'video' ? `Video skill test — ${videoEntries.find((entry) => entry.key === job.model)?.name ?? job.model}`
        : `Image recognition skill test — ${job.model}`;
      setSkillRunStatus({ phase: 'running', label, completed: index, total: jobs.length });
      setActivity(`Skill test ${index + 1}/${jobs.length}: ${label}. This can take a few minutes per model.`);
      setLiveBuildOpen(true);
      let result: AdvancedLabResult;
      if (job.kind === 'app-builder') {
        // Stream the model reasoning + code live into the "watch it build" modal.
        const streamId = `build-${Date.now()}-${index}`;
        activeSkillStreamIdRef.current = streamId;
        setLiveBuild({ model: job.model, kind: 'app', text: '', done: false });
        const unsubscribe = agentArcadeApi.onAdvancedGenerateProgress?.((payload) => {
          if (payload.streamId !== streamId) return;
          setLiveBuild({ model: payload.model ?? job.model, kind: 'app', text: payload.text, done: payload.done, error: payload.error });
        });
        try {
          result = await runAdvancedAppBuilderChallenge(
            job.model, ollama.baseUrl, appPrompt, streamId, undefined,
            effectiveJudge ? { ...effectiveJudge, taskDescription: appPrompt } : undefined,
          );
        } finally {
          unsubscribe?.();
        }
      } else if (job.kind === 'code') {
        // Stream the model writing the solution, then judge it (judge-only).
        const streamId = `code-${Date.now()}-${index}`;
        activeSkillStreamIdRef.current = streamId;
        setLiveBuild({ model: job.model, kind: 'app', text: '', done: false });
        const unsubscribe = agentArcadeApi.onAdvancedGenerateProgress?.((payload) => {
          if (payload.streamId !== streamId) return;
          setLiveBuild({ model: payload.model ?? job.model, kind: 'app', text: payload.text, done: payload.done, error: payload.error });
        });
        try {
          result = await runCodeChallenge(
            job.model, ollama.baseUrl, selection.codeLanguage, codeTask.task, codeTask.reference, streamId,
            effectiveJudge ? { ...effectiveJudge } : undefined,
          );
        } finally {
          unsubscribe?.();
        }
      } else if (job.kind === 'vision') {
        // Stream the model's live description of the test image.
        const streamId = `recognize-${Date.now()}-${index}`;
        activeSkillStreamIdRef.current = streamId;
        setLiveBuild({ model: job.model, kind: 'vision', text: '', done: false });
        const unsubscribe = agentArcadeApi.onAdvancedGenerateProgress?.((payload) => {
          if (payload.streamId !== streamId) return;
          setLiveBuild({ model: payload.model ?? job.model, kind: 'vision', text: payload.text, done: payload.done, error: payload.error });
        });
        try {
          result = await runAdvancedVisionChallenge(job.model, ollama.baseUrl, visionImage, {
            streamId,
            // Checked against what is in it only when it is one of RigMatch's own pictures.
            picture: VISION_TEST_IMAGES.find((image) => image.src === selection.recognizeImage)?.id,
          });
        } finally {
          unsubscribe?.();
        }
      } else if (job.kind === 'listening') {
        // The transcript arrives as tokens, so it can be watched being typed
        // out the same way a description is.
        const streamId = `listening-${Date.now()}-${index}`;
        activeSkillStreamIdRef.current = streamId;
        setLiveBuild({ model: job.model, kind: 'vision', text: '', done: false });
        const unsubscribe = agentArcadeApi.onAdvancedGenerateProgress?.((payload) => {
          if (payload.streamId !== streamId) return;
          setLiveBuild({ model: payload.model ?? job.model, kind: 'vision', text: payload.text, done: payload.done, error: payload.error });
        });
        try {
          result = await runAdvancedListeningChallenge(job.model, ollama.baseUrl, listeningAudio, streamId);
        } finally {
          unsubscribe?.();
        }
      } else if (job.kind === 'video') {
        // job.model is a lineup key. The batch's video models all render as
        // one lineup the first time a video job comes up — the same seed and
        // graph the Video Lab would use, and the frames judged only once every
        // model has rendered, so none is timed while the judge sits in VRAM.
        // Each later video job then reads its own result from it.
        const entry = videoEntries.find((candidate) => candidate.key === job.model)!;
        if (!videoOutcomes) {
          const firstVideo = index;
          const stopVideo = new AbortController();
          videoOutcomes = await runVideoLineupLive({
            entries: videoEntries,
            promptId: selection.imagePrompt,
            judgeModel: pictureJudge || undefined,
            ollamaBaseUrl: ollama.baseUrl,
            seed: videoSeed,
            signal: stopVideo.signal,
            onProgress: (progress) => {
              // Stop is honored between models, as it is between other jobs.
              if (stopSkillRef.current) stopVideo.abort();
              if (progress.phase !== 'rendering') return;
              setSkillRunStatus({
                phase: 'running',
                label: `Video skill test — ${progress.entry.name}`,
                completed: firstVideo + progress.index,
                total: jobs.length,
              });
              setLiveBuild({ model: progress.entry.name, kind: 'image', text: '', done: false });
            },
          });
        }
        const outcome = videoOutcomes.find((candidate) => candidate.entry.key === job.model);
        // Stopped before this model's turn: there is nothing to record.
        if (!outcome) continue;
        result = toVideoLabResult(outcome.result, selection.imagePrompt, undefined, {
          model: entry.name,
          gpu: videoMachine.gpuName,
        });
        setLiveBuild({ model: entry.name, kind: 'image', text: '', done: true, error: result.error });
      } else {
        // Image generation can't stream tokens — show a "generating" state.
        // job.model is a ComfyUI checkpoint here, not an Ollama model.
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: false });
        const run = await runImageLabChallenge({
          checkpoint: job.model,
          promptId: selection.imagePrompt,
          judgeModel: pictureJudge || undefined,
          ollamaBaseUrl: ollama.baseUrl,
        });
        result = toLabResult(run, selection.imagePrompt);
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: true, error: result.error });
      }
      if (!result.error) {
        const key = job.kind === 'image' ? `image:${job.model}`
          : job.kind === 'video' ? `video:${job.model}`
          : job.kind === 'vision' ? `vision:${job.model}`
          : job.kind === 'code' ? `code:${job.model}`
          : job.model;
        writeAdvancedLabResults({ ...readAdvancedLabResults(), [key]: result });
        // Every skill test lands in Run Logs, pass or fail, with the rubric that
        // produced the grade. A model that returns nothing is the case most
        // worth being able to look up afterwards.
        void agentArcadeApi.appendLog({
          level: result.error || result.score === 0 ? 'error' : 'info',
          source: 'renderer',
          message: `Skill test ${job.kind} · ${job.model}: ${result.score} (${result.grade})`,
          details: {
            model: job.model,
            challenge: job.kind,
            score: result.score,
            grade: result.grade,
            elapsedMs: result.elapsedMs,
            responseChars: result.response?.length ?? 0,
            producedImage: Boolean(result.imageDataUrl),
            error: result.error ?? null,
            failedChecks: (result.checks ?? []).filter((check) => checkState(check) === 'failed').map((check) => `${check.label}: ${check.detail}`),
            notChecked: (result.checks ?? []).filter((check) => checkState(check) === 'unchecked').map((check) => check.label),
          },
        });
        if (job.kind === 'app-builder') {
          const html = extractHtmlDocument(result.response);
          if (html) demos.push({ model: job.model, kind: 'app', html, judged: wasJudged(result), grade: result.grade, score: result.score });
        } else if (job.kind === 'code') {
          const code = extractCodeBlock(result.response);
          if (code) demos.push({ model: job.model, kind: 'code', code, language: result.language, note: result.checks[0]?.detail, grade: result.grade, score: result.score });
        } else if (job.kind === 'image' || job.kind === 'video') {
          // Carry the reason forward when nothing usable came back, so the viewer
          // can say why instead of showing an empty panel next to a grade.
          // A video's viewable artifact is its judged frame, so it rides the
          // image kind; without this branch the frame was produced, scored,
          // saved — and then silently dropped from the results popup.
          // result.model rather than job.model: a video job's key is an id,
          // and its result carries the name a person reads.
          demos.push({ model: result.model, kind: 'image', imageDataUrl: result.imageDataUrl, note: describeLabFailure(result), grade: result.grade, score: result.score });
        } else if (job.kind === 'vision') {
          demos.push({ model: job.model, kind: 'vision', imageDataUrl: result.imageDataUrl, description: result.response, note: describeLabFailure(result), grade: result.grade, score: result.score });
        }
      }
    }
    if (!stopSkillRef.current) {
      setSkillRunStatus({ phase: 'complete', label: 'Skill tests finished', completed: jobs.length, total: jobs.length });
    }
    // The live build view hands off to the rendered-app viewer below.
    activeSkillStreamIdRef.current = null;
    setLiveBuild(null);
    // Auto-open a viewer for whatever the models produced, per the "pop up to
    // view this when a demo completes" flow.
    if (demos.length) {
      setDemoPopup(demos);
      setActivity(`Demo ready — ${demos.length} result${demos.length === 1 ? '' : 's'} to view. Lab Grades saved in Settings → Advanced Lab.`);
    } else if (!stopSkillRef.current) {
      setActivity(`Skill tests finished (${jobs.length} run${jobs.length === 1 ? '' : 's'}). Lab Grades are saved in Settings → Advanced Lab.`);
    }
    // pictureJudge checks the pictures and clips, and modelRows says which
    // models can hear; without them here the run would use whatever was
    // installed when this callback was last built.
  }, [ollama.baseUrl, skillTestSelection, effectiveJudge, modelRows, videoMachine, pictureJudge]);

  /**
   * Chat asking RigMatch to test a model.
   *
   * Every choice in Chat names a model RigMatch has an opinion about, and until
   * now the only way to earn that opinion was to find the model in RigMatch and
   * start its test there. The test itself is RigMatch's own — the same solo run
   * its screens start, with the same prompt, the same judge and the same
   * unload — so what Chat triggers and what Advanced Mode triggers cannot
   * drift apart. Chat hears whether it started; the run itself is watched in
   * RigMatch, where the status bar and Activity already show it.
   */
  useEffect(() => {
    if (!agentArcadeApi.onBridgeTestRequest) return undefined;
    return agentArcadeApi.onBridgeTestRequest(({ id, kind, model }) => {
      void (async () => {
        const answer = (result: { started: boolean; message?: string; error?: string }) =>
          agentArcadeApi.reportBridgeTestResult?.({ id, ...result });
        // One render at a time, as every other path here refuses.
        if (kind !== 'chat' && renderActivity) {
          await answer({ started: false, error: `RigMatch is busy with ${renderActivity.model ?? 'another render'}.` });
          return;
        }
        try {
          if (kind === 'video') {
            const entry = chatVideoEntry(model);
            if (!entry) {
              await answer({ started: false, error: 'RigMatch cannot test that video model here.' });
              return;
            }
            await answer({ started: true, message: `Testing ${entry.name} in RigMatch.` });
            const estimate = estimateLineup([entry], videoMachine, { calibration: readVideoCalibration(), saved: labResults });
            void startVideoLineup({
              entries: [entry],
              // What its time will be read against, as the Video Lab reads it.
              expected: { [entry.key]: { low: estimate.low, high: estimate.high, basis: estimate.basis } },
              promptId: IMAGE_BENCHMARK_PROMPTS[0].id,
              customPrompt: '',
              judgeModel: pictureJudge || undefined,
              ollamaBaseUrl: ollama.baseUrl,
              // Cold, the way every other time on the board was measured.
              unloadBetweenRuns: true,
              gpuName: videoMachine.gpuName,
              balance: pictureJudged ? balances.video : 0,
              solo: true,
            });
            return;
          }
          if (kind === 'audio') {
            const spec = chatAudioEntry(model);
            if (!spec) {
              await answer({ started: false, error: 'RigMatch cannot test that audio model here.' });
              return;
            }
            await answer({ started: true, message: `Testing ${spec.name} in RigMatch.` });
            void startAudioLineup({
              entries: [{ key: spec.key, name: spec.name }],
              promptId: AUDIO_BENCHMARK_PROMPTS[0].id,
              customPrompt: '',
              listenerModel: audioListener || undefined,
              ollamaBaseUrl: ollama.baseUrl,
              unloadBetweenRuns: true,
              balance: balances.audio,
              solo: true,
            });
            return;
          }
          if (kind === 'image') {
            const checkpoint = chatImageGeneration.checkpoint;
            if (!checkpoint) {
              await answer({ started: false, error: 'No checkpoint that can draw is installed in ComfyUI.' });
              return;
            }
            await answer({ started: true, message: `Testing ${checkpoint} in RigMatch.` });
            void runPictureTest(checkpoint);
            return;
          }
          const row = modelRows.find((candidate) => candidate.displayName === model || candidate.id === model);
          const blocker = getModelBenchmarkBlocker(row, selectedHost, ollama);
          if (!row?.installed && !installedModelNames.has(model)) {
            await answer({ started: false, error: `${model} is not installed here.` });
            return;
          }
          if (blocker) {
            await answer({ started: false, error: blocker });
            return;
          }
          // The four skills a chat model is measured on beyond its answers.
          // Each is the same run its own screen starts, on this one model, so a
          // test begun from Chat and one begun in Advanced cannot disagree.
          // A model is never asked to do what it cannot: an eyeless model asked
          // to read a picture would take an F for the question, not the answer.
          if (kind !== 'chat') {
            if (kind === 'reading' && !canReadImages(row ?? { displayName: model })) {
              await answer({ started: false, error: `${model} cannot read pictures, so there is nothing to measure.` });
              return;
            }
            if (kind === 'listening' && !canHearAudio(row ?? { displayName: model })) {
              await answer({ started: false, error: `${model} cannot listen to audio, so there is nothing to measure.` });
              return;
            }
            // One test at a time. These share the graphics card, the run
            // status and the Stop flag with every other run, so a second one
            // started while the first is going measures the contention and
            // leaves two runs writing over each other's progress.
            if (gpuBusy || skillRunStatus.phase === 'running') {
              await answer({ started: false, error: 'RigMatch is already running a test. This can start when that one finishes.' });
              return;
            }
            await answer({ started: true, message: `Testing ${model} in RigMatch.` });
            void runSkillTestsAfterRun([model], SKILL_FOR_TEST[kind]).catch(reportSkillRunFailure);
            return;
          }
          // Not "Testing …": this one opens the resource warning and waits for
          // a person. Chat said a run had begun while RigMatch sat on a dialog
          // nobody had looked at yet.
          await answer({ started: true, message: `RigMatch has ${model} ready — confirm the run there and it starts.` });
          requestBenchmarkForModel(model);
        } catch (error) {
          await answer({ started: false, error: getErrorMessage(error) });
        }
      })();
    });
  }, [
    chatVideoEntry, chatAudioEntry, chatImageGeneration.checkpoint, renderActivity, pictureJudge, pictureJudged,
    ollama, audioListener, videoMachine, labResults, balances.video, balances.audio, modelRows, selectedHost,
    installedModelNames, requestBenchmarkForModel, runPictureTest,
    runSkillTestsAfterRun, reportSkillRunFailure, gpuBusy, skillRunStatus.phase,
  ]);

  // One improve pass: hand the model its previous attempt (plus an optional user
  // hint), stream the rebuild into the live view, and return the new result — or
  // null if the pass errored or produced no usable app. Shared by the single
  // "Try again" retry and the auto-improve loop.
  const runImprovePass = useCallback(async (
    model: string,
    previousHtml: string,
    hint: string | undefined,
    label: string,
    reviewNote?: string,
  ): Promise<{ result: AdvancedLabResult; html: string } | null> => {
    const retryPrompt = buildAppBuilderRetryPrompt(previousHtml, hint, reviewNote);
    const streamId = `retry-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    activeSkillStreamIdRef.current = streamId;
    setSkillRunStatus({ phase: 'running', label, completed: 0, total: 1 });
    setLiveBuildOpen(true);
    setLiveBuild({ model, kind: 'app', text: '', done: false });
    const unsubscribe = agentArcadeApi.onAdvancedGenerateProgress?.((payload) => {
      if (payload.streamId !== streamId) return;
      setLiveBuild({ model: payload.model ?? model, kind: 'app', text: payload.text, done: payload.done, error: payload.error });
    });
    setImproveCounts((current) => ({ ...current, [model]: (current[model] ?? 0) + 1 }));
    let result: AdvancedLabResult;
    try {
      // Break out of the fixed benchmark seed so a pass never regenerates the
      // exact same output, but keep temperature moderate — improve passes refine
      // the existing code, they shouldn't re-roll it wildly.
      const retryOptions = { seed: Math.floor(Math.random() * 1_000_000_000), temperature: 0.4 };
      const retryJudge = effectiveJudge ? { ...effectiveJudge } : undefined;
      result = await runAdvancedAppBuilderChallenge(model, ollama.baseUrl, retryPrompt, streamId, retryOptions, retryJudge);
    } catch (error) {
      setActivity(`Improve pass failed: ${getErrorMessage(error)}.`);
      return null;
    } finally {
      unsubscribe?.();
      activeSkillStreamIdRef.current = null;
    }
    if (result.error) {
      setActivity(`Improve pass failed: ${result.error}.`);
      return null;
    }
    const html = extractHtmlDocument(result.response);
    if (!html) {
      setActivity(`${model}'s new attempt didn't return a usable app.`);
      return null;
    }
    return { result, html };
  }, [ollama.baseUrl, effectiveJudge]);

  // "Second chance" for an App Builder result: one improve pass, optionally
  // steered by a user hint. Restores the previous result if the pass fails, so
  // the user is never left staring at an empty screen.
  const retryAppBuilder = useCallback(async (previousDemo: DemoArtifact, hint?: string) => {
    const { model, html: previousHtml } = previousDemo;
    if (!previousHtml) return;
    setDemoPopup(null);
    setActivity(`Giving ${model} a second chance at the app${hint ? ' with your hint' : ''}...`);
    // If a judge already diagnosed this attempt, hand its finding to the model
    // alongside any user hint — targeted feedback beats "something is wrong".
    const storedReview = extractJudgedProblem(readAdvancedLabResults()[model]?.checks);
    const pass = await runImprovePass(model, previousHtml, hint, `Second chance — ${model}`, storedReview);
    setLiveBuild(null);
    setSkillRunStatus({ phase: 'complete', label: 'Second chance finished', completed: 1, total: 1 });
    if (!pass) {
      setDemoPopup([previousDemo]);
      return;
    }
    writeAdvancedLabResults({ ...readAdvancedLabResults(), [model]: pass.result });
    setDemoPopup([{ model, kind: 'app', html: pass.html, judged: wasJudged(pass.result), grade: pass.result.grade, score: pass.result.score }]);
    setActivity(`${model}'s new attempt scored ${pass.result.score} (${pass.result.grade}).`);
  }, [runImprovePass]);

  // Auto-improve: run up to N improve passes back to back, each feeding the
  // latest code forward, and keep the BEST-scoring attempt (with judge grading on,
  // "best" genuinely means "most working"). Stops early on a strong score or when
  // the user hits Stop. Always ends showing something — the best attempt so far.
  const autoImproveAppBuilder = useCallback(async (previousDemo: DemoArtifact, times: number) => {
    const { model, html: startHtml } = previousDemo;
    if (!startHtml) return;
    const total = Math.max(1, Math.min(10, Math.round(times)));
    // A judge is CONFIGURED — used only for the closing tip. The early-stop below
    // checks whether each pass was ACTUALLY judged (a configured judge can still
    // fail on a pass), so a structural 100 can never end the loop.
    const judgeConfigured = Boolean(effectiveJudge);
    setDemoPopup(null);
    stopSkillRef.current = false;
    let best = previousDemo;
    let latestHtml = startHtml;
    let completed = 0;
    // Each pass refines the latest code, steered by what the judge found wrong
    // with it — a build → review → fix loop, not independent re-rolls. Seed the
    // first pass with the stored diagnosis of the attempt being improved.
    let reviewNote = extractJudgedProblem(readAdvancedLabResults()[model]?.checks);
    for (let pass = 1; pass <= total; pass += 1) {
      if (stopSkillRef.current) break;
      setActivity(`Auto-improve pass ${pass} of ${total} for ${model}...`);
      const attempt = await runImprovePass(model, latestHtml, undefined, `Auto-improve ${pass}/${total} — ${model}`, reviewNote);
      if (!attempt) break;
      completed += 1;
      latestHtml = attempt.html;
      reviewNote = extractJudgedProblem(attempt.result.checks);
      const passJudged = wasJudged(attempt.result);
      if ((attempt.result.score ?? 0) >= (best.score ?? 0)) {
        best = { model, kind: 'app', html: attempt.html, judged: passJudged, grade: attempt.result.grade, score: attempt.result.score };
        writeAdvancedLabResults({ ...readAdvancedLabResults(), [model]: attempt.result });
      }
      // A strong score only ends the loop when the JUDGE actually verified this
      // pass — a structural 100 (or a pass where the judge failed) can't. This is
      // what made ×3 quit after one pass when the structural score read 100.
      if (passJudged && (attempt.result.score ?? 0) >= 85) break;
    }
    setLiveBuild(null);
    setSkillRunStatus({ phase: 'complete', label: 'Auto-improve finished', completed: 1, total: 1 });
    setDemoPopup([best]);
    setActivity(completed > 0
      ? `Auto-improve finished after ${completed} pass${completed === 1 ? '' : 'es'} — best attempt scored ${best.score} (${best.grade}).${judgeConfigured ? '' : ' Tip: turn on Judge grading so auto-improve can tell which attempt actually works.'}`
      : 'Auto-improve could not complete a pass — showing the previous attempt.');
  }, [runImprovePass, effectiveJudge]);

  useEffect(() => {
    if (!pendingRunMode) { setPendingGpuContention(null); return; }
    let canceled = false;
    void agentArcadeApi.getGpuContention()
      .then((result) => { if (!canceled) setPendingGpuContention(result); })
      // A failed probe means the same thing as "could not check", which the
      // assessment already reports as `unknown` — so stay silent rather than
      // surfacing an error the user cannot act on.
      .catch(() => undefined);
    return () => { canceled = true; };
  }, [pendingRunMode]);

  const confirmPendingRun = useCallback(() => {
    const mode = pendingRunMode;
    const model = pendingSingleModel;
    const skillModels = mode === 'single'
      ? [model ?? selectedModel].filter(Boolean)
      : shortlistedRows.filter((row) => row.installed).slice(0, 5).map((row) => row.displayName);
    // Captured before the modal closes: every result from this run carries the
    // contention that was measured when the user chose to start it.
    runGpuContentionRef.current = pendingGpuContention?.level;
    // And where the fader stood when they chose to start.
    runBalanceRef.current = balances[runChannel];
    setPendingRunMode(null);
    setPendingSingleModel(null);

    // Skill-tests-only: skip the Q&A benchmark and run just the selected skills.
    // Forced on for image-only lineups, since image models can't answer questions.
    const selection = skillTestSelection;
    const anySkill = selection.appBuilder || selection.image;
    const imageOnly = skillModels.length > 0 && skillModels.every(isLikelyImageGenerationModel);
    if (anySkill && (selection.skipQuestions || imageOnly)) {
      setActivity('Running skill tests only — the question round was skipped.');
      void runSkillTestsAfterRun(skillModels).catch(reportSkillRunFailure);
      return;
    }

    if (mode === 'single') {
      void startBenchmark(model).then(() => runSkillTestsAfterRun(skillModels)).catch(reportSkillRunFailure);
      return;
    }

    if (mode === 'speed-date') {
      void runListTest().then(() => runSkillTestsAfterRun(skillModels)).catch(reportSkillRunFailure);
    }
  }, [balances, pendingGpuContention, pendingRunMode, pendingSingleModel, runChannel, runListTest, runSkillTestsAfterRun, selectedModel, shortlistedRows, skillTestSelection, startBenchmark, reportSkillRunFailure]);

  const cancelPendingRun = useCallback(() => {
    setPendingRunMode(null);
    setPendingSingleModel(null);
    setActivity('Model test canceled before resources were engaged.');
  }, []);


  // Launch scan: reads this machine, reuses the cached catalog. Not user-initiated,
  // so it performs no version lookups.
  useEffect(() => {
    void runRigRefresh({ userInitiated: false });
  }, [runRigRefresh]);

  // Auto-reconnect: poll every 15s while Ollama is offline so the app self-heals
  // once the user installs or starts Ollama without needing to click "Check Local".
  //
  // This polls ONLY the local provider status. It used to call the full rig
  // refresh, which forced a live ollama.com catalog sync — roughly sixty requests
  // every fifteen seconds, indefinitely, in the exact state a brand-new user
  // starts in. Once Ollama appears, one full refresh runs and the poll stops.
  useEffect(() => {
    if (!isDesktopRuntime) return;
    if (ollama.ready) return;
    const id = setInterval(() => {
      void (async () => {
        try {
          const status = await agentArcadeApi.getOllamaStatus();
          setOllama(status);
          if (status.ready) void runRigRefresh({ userInitiated: false });
        } catch {
          // Offline is the expected case on this path — keep polling quietly.
        }
      })();
    }, 15_000);
    return () => clearInterval(id);
  }, [ollama.ready, runRigRefresh]);

  // While a test is running, poll just the (cheap) system profile every ~1.6s so
  // the live-stage meters actually move. refreshRig is too heavy to poll — it
  // also re-scrapes the Ollama catalog.
  useEffect(() => {
    if (!isDesktopRuntime) return;
    if (runProgress?.phase !== 'running') return;
    let canceled = false;
    const id = setInterval(() => {
      void agentArcadeApi.getSystemProfile()
        .then((profile) => { if (!canceled) setSystem(profile); })
        .catch(() => { /* ignore transient poll errors */ });
    }, 1600);
    return () => { canceled = true; clearInterval(id); };
  }, [runProgress?.phase]);

  useEffect(() => {
    writeLocalJson(TEST_SUITE_STORAGE_KEY, benchmarkQuestions);
  }, [benchmarkQuestions]);

  useEffect(() => {
    writeLocal(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  useEffect(() => {
    writeLocalJson(BALANCE_STORAGE_KEY, balances);
  }, [balances]);

  /**
   * Saved through the same fallback ladder the history uses. Transcripts are
   * the bulky part, so when the browser refuses the write the answers go before
   * the reports do — a list that says "the answers were not kept" is still the
   * list the reader came for.
   */
  useEffect(() => {
    if (runReports.length === 0) return;
    writeLocalJsonWithFallback(RUN_REPORTS_STORAGE_KEY, reportStorageCandidates(runReports));
  }, [runReports]);

  useEffect(() => {
    writeLocal(UI_MODE_STORAGE_KEY, uiMode);
  }, [uiMode]);

  useEffect(() => {
    writeLocalJson(CLEARED_TOP_MATCHES_STORAGE_KEY, [...clearedTopMatches]);
  }, [clearedTopMatches]);

  useEffect(() => {
    // Drop attached image data URLs before persisting — they can be large and
    // would quickly blow the localStorage quota. Transcript text still saves.
    const chatForSave: Record<string, ChatMessage[]> = {};
    for (const [model, msgs] of Object.entries(chatMessagesByModel)) {
      chatForSave[model] = msgs.some((m) => m.images?.length)
        ? msgs.map((m) => (m.images?.length ? { ...m, images: undefined } : m))
        : msgs;
    }
    const history: PersistedHistory = {
      benchmark,
      benchmarkByModel,
      listTestResult,
      // The measurement, not the current view of it.
      modelScores: savedModelScores,
      chatMessagesByModel: chatForSave,
      selectedModel,
      savedAt: new Date().toISOString(),
    };
    // This is the write that fills the quota — it carries every prompt and full
    // response for every tested model. An uncaught throw here kills the render,
    // and once the quota is full every other write fails too. Degrade instead:
    // shed chat, then answer text, keeping scores to the last.
    const written = writeLocalJsonWithFallback(HISTORY_STORAGE_KEY, [
      () => history,
      () => dropChat(history),
      () => dropTranscripts(dropChat(history)),
      () => ({ ...dropChat(history), benchmarkByModel: {}, benchmark: null }),
    ]);
    if (written > 0) {
      setActivity(written >= 3
        ? 'Saved scores, but there was not enough browser storage left for the answer transcripts.'
        : 'Storage is nearly full, so some saved answer text was dropped. Scores were kept.');
    }
  }, [benchmark, benchmarkByModel, chatMessagesByModel, listTestResult, savedModelScores, selectedModel]);

  useEffect(() => {
    if (!isDesktopRuntime) return;
    // Capabilities ride along with the scores.
    //
    // RigMatch Chat lists models by name and score and says nothing about what
    // any of them can do, so "which of these could read a picture?" has no
    // answer on screen. Ollama reports this per model and RigMatch already
    // reads it; the companion polls this bridge every fifteen seconds anyway,
    // so sending it costs nothing and saves the companion asking Ollama itself.
    const capabilities: Record<string, string[]> = {};
    for (const row of modelRows) {
      if (!row.installed) continue;
      const able: string[] = [];
      if (canGenerateText(row)) able.push('text');
      if (canReadImages(row)) able.push('vision');
      if (canHearAudio(row)) able.push('audio');
      if (able.length) capabilities[row.displayName] = able;
    }
    // Which checkpoint a picture would actually be made with, and whether one
    // is there at all.
    //
    // The companion's panel could say picture-making was not a model, but not
    // what it *was*. Someone with SDXL Turbo installed looked for it in the
    // model list, did not find it, and reasonably concluded the companion could
    // not see it — when in truth the companion had never been told. Pressing
    // Make image was a leap of faith either way: ComfyUI answering is not the
    // same as ComfyUI being able to draw.
    const imageMaker = {
      ready: chatImageGeneration.available,
      checkpoint: chatImageGeneration.checkpoint ?? null,
    };

    void agentArcadeApi.syncScores({
      scores: modelScores,
      chosen: selectedModel,
      capabilities,
      imageMaker,
      // Every model a clip or a sound could be made with, tested first, with how
      // long a clip should take here. The first is what Chat uses unless you pick.
      videoMaker: {
        ready: chatVideoChoices.length > 0,
        model: chatVideoChoices[0]?.name ?? null,
        seconds: chatVideoChoices[0]?.seconds ?? null,
        choices: chatVideoChoices,
      },
      audioMaker: {
        ready: chatAudioChoices.length > 0,
        model: chatAudioChoices[0]?.name ?? null,
        choices: chatAudioChoices,
      },
      // The model each chat choice opens on.
      picks: chatModelPicks,
    } as Record<string, unknown>);
  }, [modelScores, selectedModel, modelRows, chatImageGeneration, chatVideoChoices, chatAudioChoices, chatModelPicks]);

  useEffect(() => {
    if (!agentArcadeApi.onBenchmarkProgress) return undefined;

    return agentArcadeApi.onBenchmarkProgress((update) => {
      setRunProgress((current) => {
        if (!current || current.progressId !== update.id || current.phase !== 'running') return current;

        const promptTotal = update.promptTotal || current.questionTotal || benchmarkPromptPlan.length;
        const completedQuestions = update.phase === 'prompt-complete'
          ? Math.min(promptTotal, update.promptIndex + 1)
          : current.completedQuestions ?? 0;
        const runTotal = update.runTotal ?? current.questionRunTotal ?? 1;
        const runIndex = update.runIndex ?? 0;
        const promptFraction = update.phase === 'prompt-complete'
          ? 1
          : update.phase === 'prompt-run'
            ? Math.min(0.9, 0.15 + (runIndex / Math.max(1, runTotal)) * 0.75)
            : update.phase === 'prompt-start'
              ? 0.1
              : 0;
        const currentPromptProgress = promptTotal > 0
          ? Math.min(1, (update.promptIndex + promptFraction) / promptTotal)
          : 0;
        const percent = current.mode === 'speed-date' && current.total > 0
          ? Math.min(99, Math.round(((current.completed + currentPromptProgress) / current.total) * 100))
          : Math.min(96, Math.round(currentPromptProgress * 100));
        const questionKey = update.promptId ?? String(update.promptIndex);

        return {
          ...current,
          percent,
          questionIndex: Math.min(Math.max(0, update.promptIndex), Math.max(0, promptTotal - 1)),
          questionTotal: promptTotal,
          questionLabel: update.promptLabel ?? current.questionLabel,
          // Carried alongside the label, and kept in step with it: a stale type
          // over a fresh label is how a caption ends up describing the previous
          // question, which is the failure this field exists to prevent.
          questionType: update.promptType ?? (update.promptLabel ? undefined : current.questionType),
          questionPrompt: update.prompt ?? current.questionPrompt,
          questionPhase: update.phase,
          questionRunIndex: typeof update.runIndex === 'number' ? update.runIndex : current.questionRunIndex,
          questionRunTotal: update.runTotal ?? current.questionRunTotal,
          completedQuestions,
          message: update.message ?? current.message,
          questionScores: typeof update.sobrietyScore === 'number'
            ? { ...(current.questionScores ?? {}), [questionKey]: update.sobrietyScore }
            : current.questionScores,
        };
      });
    });
  }, [benchmarkPromptPlan.length]);

  // Mirror the main process's authoritative benchmark state so a run is always
  // visible in the UI — even after a renderer reload or a non-UI trigger.
  useEffect(() => {
    if (!agentArcadeApi.getActiveBenchmark) return undefined;
    let canceled = false;
    const apply = (status: BenchmarkStatus | undefined) => {
      if (!canceled) setExternalBenchmark(status?.running ? status : null);
    };
    agentArcadeApi.getActiveBenchmark().then(apply).catch(() => {});
    const off = agentArcadeApi.onBenchmarkStatus?.(apply);
    return () => { canceled = true; off?.(); };
  }, []);

  useEffect(() => {
    if (!agentArcadeApi.onPullProgress) return undefined;

    return agentArcadeApi.onPullProgress((update) => {
      setPullProgressByModel((current) => ({
        ...current,
        [update.model]: {
          ...(current[update.model] ?? {}),
          ...update,
        },
      }));
    });
  }, []);

  useEffect(() => {
    // Not while the Video Lab's own download runs: two file streams would
    // share one Stop, and it would reach only the newer.
    if (queuedRows.length > 0 && !isPullingModels && !isPullPaused && ollama.ready && !labDownloadName) {
      void pullQueuedModels();
    }
  }, [isPullPaused, isPullingModels, ollama.ready, pullQueuedModels, queuedRows.length, labDownloadName]);

  /**
   * The winner's jingle belongs to a result, not to a re-ranking.
   *
   * It fired on any rise in the Top Match's score, and the Balance fader
   * re-ranks what has already been measured: dragging it from speed towards
   * accuracy handed the crown to a different model every few notches, and the
   * app sang each time. Nothing was being measured; the same numbers were
   * being sorted differently. So the jingle now needs a run behind it — during
   * one, or in the moments after it, while the scores settle.
   */
  const runActiveAtRef = useRef(0);
  useEffect(() => {
    if (isBenchmarking || isListTesting) runActiveAtRef.current = Date.now();
  }, [isBenchmarking, isListTesting]);

  const prevTopScoreRef = useRef<number | null>(null);
  useEffect(() => {
    const score = topRigPick?.score?.total ?? null;
    const prev = prevTopScoreRef.current;
    if (score !== null && score !== prev) {
      if (prev !== null && score > prev && Date.now() - runActiveAtRef.current < 10_000) {
        playJingle('new-winner');
      }
      prevTopScoreRef.current = score;
    }
  }, [topRigPick?.score?.total]);

  const visibleNavItems = useMemo(() => {
    const hasScores = scoredModelCount > 0;
    if (uiMode === 'advanced') {
      return navItems.filter((item) => item.id !== 'agent' || hasScores);
    }
    return SIMPLE_NAV_ORDER
      .map((id) => NAV_ITEM_BY_ID.get(id))
      .filter((item): item is NavItem => Boolean(item))
      .filter((item) => item.id !== 'history' || hasScores)
      .filter((item) => item.id !== 'agent' || hasScores);
  }, [scoredModelCount, uiMode]);
  // The Speed Dating lineup means nothing on a channel Speed Dating cannot test.
  const showGlobalLineup = uiMode === 'advanced' && LINEUP_STRIP_SCREENS.includes(activeNavId) && !comparedWorkbench;

  useEffect(() => {
    if (visibleNavItems.some((item) => item.id === activeNavId)) return;
    setActiveNavId(uiMode === 'advanced' ? 'models' : 'lan');
  }, [activeNavId, uiMode, visibleNavItems]);

  return (
    <div
      className={`app-shell ${showGlobalLineup ? 'has-global-lineup' : 'no-global-lineup'}${!isDesktopRuntime ? ' has-demo-banner' : ''}`}
      data-theme={themeId}
      data-ui-mode={uiMode}
    >
      {/* Browser demo only: sample scores are pre-filled so the UI can be explored
          without Ollama. Say so loudly — a visitor who mistakes sample numbers for
          real measurements has every reason to distrust the whole tool. */}
      {!isDesktopRuntime && (
        <div className="demo-data-banner" role="status">
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>Interactive demo — these scores are sample data.</strong>{' '}
            Nothing is being benchmarked here. Download the app to test your own models on your own hardware.
          </span>
          <a
            className="mini-button"
            href="https://github.com/DaveEuson/RigMatch/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get RigMatch
          </a>
        </div>
      )}
      {showModeSplash && <FirstRunSplash vramGb={system.gpu.vramGb || 0} onDone={chooseInterfaceMode} />}
      {/* Upgraded from a version without goals: ask the new question, leave
          the mode they already chose alone. */}
      {showGoalsIntro && (
        <FirstRunSplash
          vramGb={system.gpu.vramGb || 0}
          onDone={chooseInterfaceMode}
          initialGoals={selectedGoals}
          isUpgrade
          onSaveGoals={saveGoalsFromIntro}
          onCancel={dismissGoalsIntro}
        />
      )}
      {!showModeSplash && showGoalsEditor && (
        <FirstRunSplash
          vramGb={system.gpu.vramGb || 0}
          onDone={chooseInterfaceMode}
          initialGoals={selectedGoals}
          onSaveGoals={saveGoalsFromSettings}
          onCancel={() => setShowGoalsEditor(false)}
        />
      )}
      {uiMode === 'beginner' && (
        <SimpleWizard
          // Only when there is one to open — that is what keeps the Compare
          // step disabled rather than dead on a machine that has never run one.
          onOpenRunReport={listTestResult || runReports.length > 0
            ? () => { setOpenReportId(runReports[0]?.id ?? null); setReportOpen(true); }
            : undefined}
          system={system}
          ollamaReady={ollama.ready || lmStudio.ready}
          isScanning={isScanningRig}
          onCheckComputer={refreshRig}
          onGetOllama={openOllamaDownload}
          ollamaInstallProgress={ollamaInstallProgress}
          onStartOllamaInstall={startOllamaInstall}
          onLaunchOllamaInstaller={launchOllamaInstaller}
          wizardModels={wizardModels}
          comfySetup={{
            // Only when a chosen goal actually runs through ComfyUI. Someone
            // who picked "everyday chat" is told nothing about a program they
            // will never install.
            needed: selectedGoals.some((id) => goalById(id)?.runtime === 'comfyui'),
            // Reachable is not enough: the first checkpoint on a real machine
            // was a video model with no text encoder, so "ComfyUI is running"
            // and "ComfyUI can draw" are different claims.
            ready: chatImageGeneration.available,
            checkpoint: chatImageGeneration.checkpoint ?? null,
            onFind: findComfyForDownload,
          }}
          initialDream={dreamForGoal(selectedGoals[0])}
          notice={simpleNotice}
          noticeAction={simpleNoticeAction}
          onDismissNotice={() => { setSimpleNotice(null); setSimpleNoticeAction(null); }}
          modelsLoading={modelRows.length === 0}
          shortlistIds={shortlistIds}
          shortlistedRows={shortlistedRows}
          onTogglePick={toggleShortlist}
          onChooseForMe={chooseShortlistForMe}
          pullProgressByModel={pullProgressByModel}
          onStartDownloads={() => requestThirdPartyModelDownloads(shortlistedRows)}
          onCancelDownloads={cancelDownloadQueue}
          isListTesting={isListTesting}
          benchmarkActive={isListTesting || isBenchmarking || runProgress?.phase === 'running' || skillRunStatus.phase === 'running' || Boolean(externalBenchmark?.running)}
          runProgress={wizardRunProgress}
          onDreamChange={setWizardDream}
          round={wizardRound}
          onStartShow={() => {
            // Every score this show produces records where the fader stood.
            runBalanceRef.current = wizardBalance;
            // Clear the last round's ending before starting this one: the
            // wizard releases its Compare step when the run it is watching goes
            // from running to finished, and a 'complete' left over from the
            // previous show is finished the instant this one begins.
            setSkillRunStatus({ phase: 'idle', label: '', completed: 0, total: 0 });
            if (wizardRound === 'chat') { void runListTest(); return; }
            // The models picked for the show, in the order they were picked.
            const models = shortlistedRows.filter((row) => row.installed).map((row) => row.displayName);
            if (wizardRound === 'code') {
              // A coding buddy is asked and then made to build: the questions
              // measure how it answers, the app measures whether what it writes
              // runs. Either alone crowns a model on half the job.
              void runListTest()
                .then(() => runSkillTestsAfterRun(models, 'app-builder'))
                .catch(reportSkillRunFailure);
              return;
            }
            void runSkillTestsAfterRun(models, wizardSkill as 'app-builder' | 'vision' | 'listening').catch(reportSkillRunFailure);
          }}
          balance={wizardBalance}
          onBalanceChange={(value) => setBalance(wizardChannel === 'app' ? 'code' : wizardChannel, value)}
          onStopShow={requestStopRun}
          winner={wizardWinner}
          lineupResults={wizardLineupResults}
          generation={generationSummary}
          videoLineup={{
            comfyReachable,
            comfyFolders,
            judgeModel: pictureJudge,
            ollamaBaseUrl: ollama.baseUrl,
            onCheckComfy: () => { void refreshComfyStatus(); },
            onDownloadModel: requestLabDownload,
            onStopDownload: stopLabDownload,
            balance: balances.video,
            onBalanceChange: (value) => setBalance('video', value),
          }}
          makerRun={{
            context: {
              comfyReachable,
              comfyFolders,
              judgeModel: pictureJudge,
              listenerModel: audioListener,
              ollamaBaseUrl: ollama.baseUrl,
              machine: videoMachine,
              gpuBusy,
              onCheckComfy: () => { void refreshComfyStatus(); },
              // No Models screen in Simple Mode: this is the trip to Advanced,
              // and the banner there says why the interface changed.
              onOpenModels: () => { setCameFromSimple(true); selectUiMode('advanced'); selectNav('models'); },
            },
            // Ranked where the channel's own fader stands, and flat on speed
            // where nothing installed can judge what came out.
            balances: {
              images: pictureJudged ? balances.images : 0,
              audio: audioListener ? balances.audio : 0,
            },
          }}
          onChatWithWinner={openChatWithWinner}
          onOpenScorecard={() => { setCameFromSimple(true); selectUiMode('advanced'); selectNav('history'); }}
          onRunAgain={() => undefined}
          onSwitchToAdvanced={() => { setCameFromSimple(false); selectUiMode('advanced'); }}
          initialStep={wizardStep}
          onStepChange={(next) => { setWizardStep(next); setSimpleNotice(null); setSimpleNoticeAction(null); }}
          onShareScore={() => setShareWinnerOpen(true)}
        />
      )}
      {shareWinnerOpen && topRigPick?.score && (
        <ShareScorecard
          model={topRigPick.row.displayName}
          score={topRigPick.score}
          system={system}
          onClose={() => setShareWinnerOpen(false)}
        />
      )}
      {uiMode === 'advanced' && (
      <>
      {/* "See the full scorecard" used to switch modes silently — the whole
          interface changed with no explanation and no way back. Say what
          happened and offer the return trip. */}
      {cameFromSimple && (
        <div className="mode-jump-banner" role="status">
          <span>
            The full scorecard lives in <strong>Advanced Mode</strong>, so RigMatch switched you over.
          </span>
          <button
            type="button"
            className="mini-button"
            onClick={() => { setCameFromSimple(false); selectUiMode('beginner'); }}
          >
            <ArrowLeft aria-hidden="true" />
            Back to the guided wizard
          </button>
        </div>
      )}
      <TopDeck isScanning={isScanningRig} onScan={refreshRig}
        system={system}
        ollama={ollama}
        lmStudio={lmStudio}
        uiMode={uiMode}
        onUiModeChange={selectUiMode}
        topPick={topRigPick}
        onUseTopPick={(model) => {
          setSelectedModel(model);
          setChosenModel(model);
        }}
        onTestAgain={requestBenchmarkForModel}
        onClearTopPick={clearTopMatch}
        onRestoreClearedTopPicks={restoreClearedTopMatches}
        clearedTopPickCount={clearedTopMatches.size}
        comfyFolder={comfySettings.folder}
        comfyReachable={comfyReachable}
        deckExpanded={deckExpanded}
        onDeckExpandedChange={(expanded) => { setDeckExpanded(expanded); writeDeckExpanded(expanded); }}
        workbench={workbench}
        channelWinner={channelWinner}
        balance={balances[activeChannel]}
        onBalanceChange={(value) => setBalance(activeChannel, value)}
        balanceLocked={balanceLock(activeChannel)}
        onOpenChannel={() => selectNav(workbenchInfo.home)}
      />

      <SideMenu
        items={visibleNavItems}
        ollamaReady={ollama.ready || lmStudio.ready}
        modelCount={channelModelCount}
        shortlistCount={shortlistedRows.length}
        newModelDropCount={modelNews.latestNewModelIds.length}
        isRunning={isBenchmarking || isListTesting || Boolean(renderActivity)}
        activeId={activeNavId}
        scoredCount={scoredModelCount}
        topPickMeta={topRigPick?.score ? topRigPick.score.grade : (scoredModelCount > 0 ? 'Ready' : 'Wait')}
        comparisonMeta={channelMetas.comparison}
        scorecardMeta={channelMetas.scorecards}
        uiMode={uiMode}
        onSelect={selectNav}
        onOpenTutorial={() => { setTutorialOpen(true); setTutorialStep(0); }}
        onOpenSupport={() => setSupportModalOpen(true)}
        bugReportUrl={buildBugReportUrl(system, ollama, logPath)}
      />

      <main className="stage-content">
        {/* The host narrates Simple Mode. In Advanced he announced which screen
            was open, how many models were installed and how many were picked —
            all of it already in the side menu and the lineup strip — above the
            table that screen exists to show. The channels take that line
            instead: they filter the panel below them, so they belong there and
            not folded inside a header that collapses. */}
        {uiMode === 'advanced'
          ? <ChannelSwitch value={workbench} onChange={chooseWorkbench} />
          : (
            <GameShowHost
              uiMode={uiMode}
              activeNavLabel={getNavLabel(activeNavId)}
              ollamaReady={ollama.ready || lmStudio.ready}
              installedCount={localModels.length}
              modelCount={modelRows.length}
              shortlistedCount={shortlistedRows.length}
              uninstalledShortlistedCount={uninstalledShortlistedCount}
              queuedCount={queuedRows.length}
              scoredCount={scoredModelCount}
              topPick={topRigPick}
              isBusy={isScanningRig || isBenchmarking || isListTesting}
              onSelectNav={selectNav}
              onCheckRig={refreshRig}
              onOpenTutorial={() => { setTutorialOpen(true); setTutorialStep(0); }}
            />
          )}
        {activeNavId === 'lan' && (
          <LanBrowser
            active={true}
            system={system}
            ollama={ollama}
            lmStudio={lmStudio}
            hosts={hosts}
            modelCount={modelRows.length}
            selectedHostId={selectedHostId}
            isScanning={isScanningRig}
            onScan={refreshRig}
            onSelect={setSelectedHostId}
            onInstallOllama={openOllamaDownload}
            ollamaInstallProgress={ollamaInstallProgress}
            onStartOllamaInstall={startOllamaInstall}
            onLaunchOllamaInstaller={launchOllamaInstaller}
            onScanRig={refreshRig}
            onOpenSetupGuide={openSetupGuide}
          />
        )}
        {activeNavId === 'models' && (
          <ModelCabinet
            // Keyed by channel, so switching re-applies the channel's filter and
            // All starts unfiltered instead of keeping the last channel's.
            key={workbenchInfo.id}
            active={true}
            rows={modelRows}
            reveal={revealModel}
            comfyFolderSet={Boolean(comfySettings.folder)}
            goalLens={workbenchInfo.taskFilter ?? undefined}
            generationTest={{
              comfyReachable,
              comfyFolders,
              judgeModel: pictureJudge,
              listenerModel: audioListener,
              ollamaBaseUrl: ollama.baseUrl,
              machine: videoMachine,
              balances,
              onBalanceChange: setBalance,
              lockedReason: balanceLock,
              gpuBusy,
              onCheckComfy: () => { void refreshComfyStatus(); },
              // From the All channel too: comparing pictures is the Images
              // channel's Comparison, not chat's Speed Dating.
              onOpenComparison: (channel) => { chooseWorkbench(channel); selectNav('speedDate'); },
            }}
            channel={workbenchInfo.id}
            renderingModelId={renderActivity?.solo ? renderActivity.key : null}
            skillTest={{
              ollamaBaseUrl: ollama.baseUrl,
              ollamaReady: ollama.ready,
              balances,
              onBalanceChange: setBalance,
              gpuBusy,
              onOpenListeningLab: () => selectNav('activity'),
              onOpenComparison: () => selectNav('speedDate'),
            }}
            // Settings already explains ComfyUI in plain language; window.open
            // was popup-blocked in the browser preview and the review found the
            // button dead. In-app navigation cannot be blocked.
            onOpenComfyHelp={() => selectNav('settings')}
            selectedModel={selectedModel}
            installedModelNames={installedModelNames}
            shortlistIds={shortlistIds}
            queuedModelIds={queuedModelIds}
            pullProgressByModel={pullProgressByModel}
            modelScores={modelScores}
            benchmarkByModel={benchmarkByModel}
            diskGuard={diskGuard}
            vramGb={system.gpu.vramGb}
            platform={system.platform}
            queuedCount={queuedRows.length}
            isBenchmarking={isBenchmarking || isListTesting}
            isListTesting={isListTesting}
            isPulling={isPullingModels}
            isPullCancelRequested={isPullCancelRequested}
            isPullPauseRequested={isPullPauseRequested}
            isPullPaused={isPullPaused}
            isDeletingModel={isDeletingModel}
            pullingModel={pullingModel}
            listTestResult={listTestResult}
            runProgress={runProgress}
            questionCount={benchmarkQuestionCount}
            shortlistedCount={shortlistedRows.length}
            onSelect={setSelectedModel}
            onScoreModel={requestBenchmarkRow}
            onDeleteModel={requestDeleteModel}
            onClearScore={requestClearScore}
            onQueueModel={queueModel}
            onPullQueued={pullQueuedModels}
            onPauseQueue={pauseDownloadQueue}
            onCancelQueue={cancelDownloadQueue}
            onToggleShortlist={toggleShortlist}
            onOpenSuiteEditor={() => setSuiteEditorOpen(true)}
            onOpenSpeedDate={() => selectNav('speedDate')}
            onOpenTopPick={() => selectNav('agent')}
            onRefresh={refreshRig}
            onChooseModel={(model) => { setSelectedModel(model); setChosenModel(model); }}
            onOpenModelChat={(model) => { setSelectedModel(model); setChatOpen(true); }}
            modelNotes={modelNotes}
            onSaveModelNote={saveModelNote}
            scoreTrend={scoreTrend}
            scoreDeltas={scoreDeltas}
            newModelIds={new Set(modelNews.latestNewModelIds)}
            onQuickCheck={requestQuickCheckRow}
          />
        )}
        {activeNavId === 'whatsNew' && (
          <WhatsNewPanel
            active={true}
            catalog={catalog}
            catalogMeta={catalogMeta}
            rows={modelRows}
            modelNews={modelNews}
            notificationsEnabled={modelNewsNotificationsEnabled}
            notificationPermission={notificationPermission}
            isScanning={isScanningRig}
            renderHeader={(meta) => (
              <PanelHeader
                icon={Sparkles}
                title="What's New"
                actionLabel={isScanningRig ? 'Checking' : 'Check Now'}
                onAction={refreshRig}
                meta={meta}
              />
            )}
            renderAvatar={(model) => <AvatarBust model={model} size="tiny" />}
            getModelSpecialties={(model) => getModelProfile(model).specialties}
            formatHistoryTime={formatHistoryTime}
            formatGb={formatGb}
            formatPullCount={formatPullCount}
            onRefresh={refreshRig}
            onToggleNotifications={toggleModelNewsNotifications}
            onOpenModel={openModelRow}
          />
        )}
        {activeNavId === 'speedDate' && comparedWorkbench && (
          <ChannelComparisonPanel
            workbench={comparedWorkbench}
            labResults={labResults}
            // A model tested on its own from the Models screen is not part of the race.
            lineup={{
              record: lineupSession.record,
              running: lineupSession.running && !lineupSession.solo,
              current: lineupSession.solo ? null : lineupSession.current,
            }}
            balance={balances[activeChannel]}
            onBalanceChange={(value) => setBalance(activeChannel, value)}
            lockedReason={balanceLock(activeChannel)}
            onOpenLab={() => selectNav('activity')}
            run={{
              comfyReachable,
              comfyFolders,
              judgeModel: pictureJudge,
              listenerModel: audioListener,
              ollamaBaseUrl: ollama.baseUrl,
              machine: videoMachine,
              gpuBusy,
              onCheckComfy: () => { void refreshComfyStatus(); },
              onOpenModels: () => selectNav('models'),
            }}
          />
        )}
        {activeNavId === 'speedDate' && !comparedWorkbench && (
          <SpeedDatePanel
            active={true}
            host={selectedHost}
            allModelRows={modelRows}
            shortlistedRows={shortlistedRows}
            modelScores={modelScores}
            benchmarkByModel={benchmarkByModel}
            listTestResult={listTestResult}
            runProgress={runProgress}
            isListTesting={isListTesting}
            vramGb={system.gpu.vramGb}
            questionCount={benchmarkQuestionCount}
            questionPlan={benchmarkPromptPlan}
            onQuestionCountChange={setBenchmarkQuestionCount}
            onOpenSuiteEditor={() => setSuiteEditorOpen(true)}
            onOpenLogs={openLogsPanel}
            onOpenModelPool={() => selectNav('models')}
            onOpenHistory={() => selectNav('history')}
            onRemoveCandidate={toggleShortlist}
            onQueueMissingModels={requestThirdPartyModelDownloads}
            onRunListTest={requestListTest}
            workbench={workbenchInfo}
            balance={balances[activeChannel]}
            onBalanceChange={(value) => setBalance(activeChannel, value)}
            labResults={labResults}
          />
        )}
        {activeNavId === 'agent' && (
          <AgentReveal
            active={true}
            agentName={agentName}
            model={selectedModel}
            benchmark={selectedBenchmark}
            selectedScore={selectedModelScore}
            modelScores={modelScores}
            host={selectedHost}
            system={system}
            rows={modelRows}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            onTalk={() => setChatOpen(true)}
            onChoose={() => setChosenModel(selectedModel)}
            onRunTest={requestBenchmark}
            onEditQuestions={() => setSuiteEditorOpen(true)}
            onTalkWithPrompt={(prompt) => { setChatInput(prompt); setChatOpen(true); }}
            topPick={topRigPick}
            onClearTopMatch={clearTopMatch}
            onClearScore={requestClearScore}
            onRestoreClearedTopMatches={restoreClearedTopMatches}
            clearedTopMatchCount={clearedTopMatches.size}
            onExportForHatch={() => setExportHatchOpen(true)}
          />
        )}
        {activeNavId === 'activity' && (
          <ActivityPanel
            runReports={runReports}
            onOpenReport={(id) => { setOpenReportId(id); setReportOpen(true); }}
            runProgress={runProgress}
            skillRunStatus={skillRunStatus}
            pullProgressByModel={pullProgressByModel}
            isListTesting={isListTesting}
            modelScores={modelScores}
            selectedModel={selectedModel}
            ollama={ollama}
            system={system}
            onOpenModels={() => selectNav('models')}
            onOpenScorecards={() => selectNav('history')}
            onRerunTest={requestBenchmarkForModel}
            onStopBenchmark={requestStopRun}
            onStopSkillTests={requestStopSkills}
            onDownloadGenerationModel={requestLabDownload}
            onStopGenerationDownload={stopLabDownload}
            workbench={workbenchInfo}
            balances={balances}
            onBalanceChange={setBalance}
            onOpenComparison={() => selectNav('speedDate')}
            render={renderActivity}
            onOpenRender={openRender}
            lastRender={renderOutcome}
          />
        )}
        {(activeNavId === 'history' || activeNavId === 'settings') && (
          <UtilityPanel
            panel={activeNavId}
            listTestResult={listTestResult}
            selectedHost={selectedHost}
            selectedModel={selectedModel}
            ollama={ollama}
            system={system}
            themeId={themeId}
            appLogs={appLogs}
            modelScores={modelScores}
            chatMessages={chatMessages}
            updateChannel={updateChannel}
            updateCheck={updateCheck}
            isCheckingUpdates={isCheckingUpdates}
            uiMode={uiMode}
            selectedGoals={selectedGoals}
            installedRows={modelRows.filter((row) => row.installed)}
            logPath={logPath}
            isLoadingLogs={isLoadingLogs}
            onThemeChange={selectTheme}
            onUiModeChange={selectUiMode}
            onEditGoals={() => setShowGoalsEditor(true)}
            onDeleteModel={requestDeleteModel}
            onRefreshLogs={loadLogs}
            onCopyLogs={copyLogs}
            onClearLogs={clearLogs}
            onOpenLogsFolder={openLogsFolder}
            onClearScore={requestClearScore}
            onClearAllScores={requestClearAllScores}
            onClearAllData={requestClearData}
            onOpenSetupGuide={openSetupGuide}
            onUpdateChannelChange={selectUpdateChannel}
            onCheckForUpdates={checkForUpdates}
            onOpenUpdatePage={openUpdatePage}
            autoUpdateStatus={autoUpdateStatus}
            onDownloadUpdate={downloadUpdate}
            onInstallUpdate={installUpdate}
            onSelectTopPick={(model) => { setSelectedModel(model); selectNav('agent'); }}
            workbench={workbenchInfo}
            channelBalance={balances[activeChannel]}
            onChannelBalanceChange={(value) => setBalance(activeChannel, value)}
            channelBalanceLock={balanceLock(activeChannel)}
            labResults={labResults}
          />
        )}
      </main>

      {showGlobalLineup && (
        <ModelPoolLineupStrip
          className="speed-date-lineup-builder global-lineup-strip"
          rows={shortlistedRows}
          installedRows={modelRows.filter((row) => row.installed && !shortlistIds.has(row.displayName))}
          modelScores={modelScores}
          disabled={isBenchmarking || isListTesting}
          isListTesting={isListTesting}
          canRunSpeedDate={shortlistedRows.length >= MIN_CONTESTANTS && shortlistedRows.every((row) => row.installed) && !isBenchmarking && !isListTesting}
          onRemove={toggleShortlist}
          onAdd={toggleShortlist}
          onRunListTest={requestListTest}
          onOpenSpeedDate={() => selectNav('speedDate')}
        />
      )}
      </>
      )}

      {uiMode === 'advanced' && (
        <Ticker
        activity={activity}
        isDesktopRuntime={isDesktopRuntime}
        topPick={topRigPick}
        queuedRows={queuedRows}
        pullProgressByModel={pullProgressByModel}
        isPulling={isPullingModels}
        pullingModel={pullingModel}
        isPullCancelRequested={isPullCancelRequested}
        isPullPauseRequested={isPullPauseRequested}
        isPullPaused={isPullPaused}
        onResumeQueue={pullQueuedModels}
        onPauseQueue={pauseDownloadQueue}
        onCancelQueue={cancelDownloadQueue}
        onOpenDownloads={() => selectNav('models')}
        render={renderActivity}
        onOpenRender={openRender}
        onOpenChat={async () => {
          if (isDesktopRuntime) {
            const result = await agentArcadeApi.openChatApp();
            if (!result?.ok) alert('RigMatch Chat was not found in this local build.\n\nFor preview/dev testing, build and copy the companion first:\n\nnpm run build:chat\nnpm run prepare:companions\n\nRelease installers include RigChat when the companion is packaged.');
          } else {
            setChatOpen(true);
          }
        }}
      />
      )}
      {reportReady && !reportOpen && listTestResult && (
        <div className="report-ready-bar" role="status">
          <Trophy aria-hidden="true" />
          <span>
            Report ready — {listTestResult.results.length} model{listTestResult.results.length === 1 ? '' : 's'} compared,
            {' '}{listTestResult.winner} came first
          </span>
          <button type="button" className="primary-button compact" onClick={() => setReportOpen(true)}>
            See the report
          </button>
          <button type="button" className="report-ready-dismiss" onClick={() => setReportReady(false)} aria-label="Dismiss report notice">
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      {reportOpen && (() => {
        // A row in Activity opens that stored run; finishing a run opens the
        // one that just happened. Both render through the same modal.
        const stored = openReportId ? runReports.find((entry) => entry.id === openReportId) : null;
        const result = stored ? { winner: stored.winner, results: stored.results } : listTestResult;
        if (!result) return null;
        const benchmarks = stored?.transcripts ?? benchmarkByModel;
        const rows = stored
          ? result.results
              .map((score) => modelRows.find((row) => row.displayName === score.model))
              .filter((row): row is typeof modelRows[number] => Boolean(row))
          : shortlistedRows;
        return (
        <RunReportModal
          result={result}
          rows={rows}
          benchmarks={benchmarks}
          questionPlan={benchmarkQuestions.slice(0, benchmarkQuestionCount)}
          onClose={() => { setReportOpen(false); setReportReady(false); setOpenReportId(null); }}
          onOpenScorecards={() => { setReportOpen(false); setReportReady(false); setOpenReportId(null); selectNav('history'); }}
        />
        );
      })()}

      {chatOpen && (
        <ChatDock
          agentName={agentName}
          model={selectedModel}
          messages={chatMessages}
          value={chatInput}
          onChange={setChatInput}
          onClose={() => setChatOpen(false)}
          onSend={sendChat}
          liveShowActive={uiMode === 'advanced' && runProgress?.phase === 'running'}
          canSendImages={chatSupportsImages}
          isReplying={isReplying}
          onStopReply={stopReply}
          canSendAudio={chatSupportsAudio}
          pendingAttachment={chatAttachment}
          onAttach={setChatAttachment}
          onRunAction={runChatAction}
          actionRunning={chatImageRunning}
          // canGenerateText, not just "installed": the list offered SDXL Turbo
          // as something to converse with. It is a ComfyUI checkpoint — asking
          // it a question sends a chat request to a model that produces pixels,
          // which fails in a way that reads as the app being broken.
          availableModels={modelRows.filter((row) => row.installed && canGenerateText(row)).map((row) => row.displayName)}
          onModelChange={changeChatModel}
        />
      )}

      {setupGuideOpen && (
        <SetupGuideDock
          system={system}
          onClose={() => setSetupGuideOpen(false)}
          onInstallOllama={openOllamaDownload}
        />
      )}

      {externalBenchmark?.running && runProgress?.phase !== 'running' && (
        <div className="benchmark-running-banner" role="status" aria-live="polite">
          <span className="benchmark-running-dot" aria-hidden="true" />
          <span>{formatBenchmarkBanner(externalBenchmark)}</span>
        </div>
      )}

      {uiMode === 'advanced' && runProgress?.phase === 'running' && (
        <LiveFlirtSpotlight
          progress={runProgress}
          host={selectedHost}
          system={system}
          rows={runProgress.mode === 'speed-date'
            ? shortlistedRows
            : modelRows.filter((row) => row.displayName === runProgress.currentModel)}
          questionPlan={benchmarkQuestions.slice(0, benchmarkQuestionCount)}
          onStop={requestStopRun}
        />
      )}

      {suiteEditorOpen && (
        <TestSuiteEditorDock
          questions={benchmarkQuestions}
          isCustom={currentSuiteName === 'Custom Suite'}
          questionCount={benchmarkQuestionCount}
          onChange={setBenchmarkQuestions}
          onQuestionCountChange={setBenchmarkQuestionCount}
          onReset={() => setBenchmarkQuestions([...DEFAULT_BENCHMARK_QUESTIONS])}
          onClose={() => setSuiteEditorOpen(false)}
        />
      )}

      {pendingRunMode && (
        <RunWarningModal
          mode={pendingRunMode}
          selectedModel={pendingSingleModel ?? selectedModel}
          measuredPerModelMs={(() => {
            const hardware = toRunHardware(system);
            if (pendingRunMode === 'speed-date') {
              const estimate = estimateSpeedDateMs(runHistory, {
                models: shortlistedRows.map((row) => row.displayName),
                questionCount: benchmarkQuestionCount,
                hardware,
              });
              return estimate.source === 'measured'
                ? estimate.ms / Math.max(1, shortlistedRows.length)
                : null;
            }
            const estimate = estimateBenchmarkMs(runHistory, {
              model: pendingSingleModel ?? selectedModel,
              questionCount: benchmarkQuestionCount,
              hardware,
            });
            return estimate.source === 'measured' ? estimate.ms : null;
          })()}
          shortlistedCount={shortlistedRows.length}
          uninstalledContestantCount={shortlistedRows.filter((r) => !r.installed).length}
          questionCount={benchmarkQuestionCount}
          benchmarkQuestions={benchmarkQuestions}
          system={system}
          onCancel={cancelPendingRun}
          onConfirm={confirmPendingRun}
          gpuContention={pendingGpuContention}
          onDownloadMissing={() => requestThirdPartyModelDownloads(shortlistedRows)}
          onChangeQuestionCount={setBenchmarkQuestionCount}
          onLoadPreset={setBenchmarkQuestions}
          autoJudgeModel={autoJudgeModels.find((m) => m !== (pendingSingleModel ?? selectedModel)) ?? ''}
          goalPresetId={presetIdForGoal(runGoal)}
          goalDesire={runGoal ? goalById(runGoal)?.desire.toLowerCase() : undefined}
          onEditQuestions={() => { cancelPendingRun(); setSuiteEditorOpen(true); }}
          qualityMode={qualityMode}
          judgeModel={effectiveJudgeModel}
          judgeModelOptions={judgeModelOptions}
          onChangeQualityMode={setQualityMode}
          onChangeJudgeModel={setJudgeModel}
          judgeSource={judgeSource}
          onChangeJudgeSource={setJudgeSource}
          cloudJudgeModel={cloudJudgeModel}
          onChangeCloudJudgeModel={setCloudJudgeModel}
          openRouterKey={openRouterKey}
          onChangeOpenRouterKey={setOpenRouterKey}
          judgeActive={Boolean(effectiveJudge)}
          lineupModels={pendingRunMode === 'single'
            ? [pendingSingleModel ?? selectedModel].filter(Boolean)
            : shortlistedRows.filter((row) => row.installed).slice(0, 5).map((row) => row.displayName)}
          skillSelection={skillTestSelection}
          onSkillSelectionChange={setSkillTestSelection}
          listenCapable={(pendingRunMode === 'single'
            ? modelRows.filter((row) => row.displayName === (pendingSingleModel ?? selectedModel))
            : shortlistedRows.filter((row) => row.installed).slice(0, 5)
          ).some((row) => canHearAudio(row))}
          comfyCheckpoints={comfyCheckpoints}
          videoLineup={(() => {
            // Worked out only while this dialog is open, which is the one place that asks.
            const calibration = readVideoCalibration();
            const entries = runnableLineup(comfyFolders, videoMachine, { calibration });
            const text = formatVideoEstimate(estimateLineup(entries, videoMachine, { calibration }), { roughNote: false });
            return { count: entries.length, estimate: text.charAt(0).toLowerCase() + text.slice(1) };
          })()}
          balance={{
            value: balances[runChannel],
            onChange: (value) => setBalance(runChannel, value),
            channel: workbenchById(runChannel).label,
            accuracyMeans: workbenchById(runChannel).accuracyMeans,
          }}
        />
      )}

      {pendingQuickCheck && (
        <QuickCheckWarningModal
          row={pendingQuickCheck}
          questionCount={QUICK_CHECK_QUESTIONS.length}
          onCancel={() => { setPendingQuickCheck(null); setActivity('Quick test canceled before resources were engaged.'); }}
          onConfirm={confirmQuickCheck}
        />
      )}

      {liveBuild && liveBuildOpen && (
        <LiveBuildModal build={liveBuild} onClose={() => setLiveBuildOpen(false)} />
      )}

      {skillRunStatus.phase === 'running' && (!liveBuild || !liveBuildOpen) && (
        <SkillRunMiniBar
          status={skillRunStatus}
          canShowLive={Boolean(liveBuild)}
          onShow={() => { if (liveBuild) setLiveBuildOpen(true); else selectNav('activity'); }}
          onStop={requestStopSkills}
        />
      )}

      {demoPopup && demoPopup.length > 0 && (
        <DemoResultModal
          demos={demoPopup}
          onClose={() => setDemoPopup(null)}
          onRetry={(demo, hint) => { if (demo.html) void retryAppBuilder(demo, hint); }}
          onAutoImprove={(demo, times) => { if (demo.html) void autoImproveAppBuilder(demo, times); }}
          improveCounts={improveCounts}
          judgeActive={Boolean(effectiveJudge)}
        />
      )}

      {pendingThirdPartyDownloadRows && (
        <ThirdPartyDownloadConsentModal
          rows={pendingThirdPartyDownloadRows}
          onCancel={() => setPendingThirdPartyDownloadRows(null)}
          onConfirm={confirmThirdPartyModelDownloads}
        />
      )}

      {pendingLabDownload && (
        <ThirdPartyDownloadConsentModal
          rows={[pendingLabDownload]}
          onCancel={() => setPendingLabDownload(null)}
          onConfirm={() => void confirmLabDownload()}
        />
      )}

      {chosenModel && (
        <ChoiceCruiseModal
          model={chosenModel}
          host={selectedHost}
          score={(() => {
            const row = modelRows.find((r) => r.displayName === chosenModel);
            return (row ? getModelScore(row, modelScores) : modelScores[chosenModel]) ?? null;
          })()}
          system={system}
          onClose={() => setChosenModel(null)}
        />
      )}

      {exportHatchOpen && (
        <ExportHatchModal
          result={buildHatchProfile({
            recommendedTag: topRigPick && topRigPick.row.localProvider !== 'lm-studio' ? topRigPick.row.displayName : null,
            // Ollama-pullable chat models only — LM Studio / cloud / image / embedding can't be `ollama pull`-ed.
            candidates: modelRows
              .filter((row) => row.localProvider !== 'lm-studio'
                && !isCloudModel(row.displayName)
                && !isEmbeddingModel(row.displayName)
                && canGenerateText(row))
              .map((row) => ({ tag: row.displayName, sizeGb: row.sizeGb, score: getModelScore(row, modelScores) })),
            device: system.gpu.model && system.gpu.model !== 'Unknown GPU'
              ? [system.gpu.model, system.gpu.vramGb > 0 ? `${Math.round(system.gpu.vramGb)} GB` : null].filter(Boolean).join(' · ')
              : (system.cpu.brand || 'This computer'),
            gpuLabel: system.gpu.model && system.gpu.model !== 'Unknown GPU' ? system.gpu.model : 'this computer',
            vramGb: system.gpu.vramGb,
            ramGb: system.memory.totalGb,
            reason: topRigPick?.reason ?? null,
          })}
          onClose={() => setExportHatchOpen(false)}
        />
      )}

      {updateCheck?.status === 'available' && updateCheck.latestVersion && updateCheck.latestVersion !== dismissedUpdateVersion && (
        <UpdateAvailableToast
          update={updateCheck}
          onGetUpdate={() => { void openUpdatePage(); dismissUpdatePrompt(); }}
          onDismiss={dismissUpdatePrompt}
        />
      )}

      {pendingDeleteModel && (
        <DeleteModelModal
          row={pendingDeleteModel}
          host={selectedHost}
          isDeleting={isDeletingModel}
          onCancel={cancelDeleteModel}
          onConfirm={confirmDeleteModel}
        />
      )}

      {clearDataOpen && (
        <ClearDataModal
          onCancel={() => setClearDataOpen(false)}
          onConfirm={confirmClearData}
        />
      )}
      {closeCleanupOpen && (
        <CloseCleanupModal
          installedRows={installedRowsForCleanup}
          unscoredRows={unscoredRowsForCleanup}
          lowScoredRows={lowScoredRowsForCleanup}
          isDeleting={isCloseCleanupDeleting}
          message={closeCleanupMessage}
          exceptTopPickRows={exceptTopPickRowsForCleanup}
          topPickName={topPickToKeep(modelScores)}
          onDeleteUnscored={() => { void deleteRowsThenClose(unscoredRowsForCleanup, 'unscored'); }}
          onDeleteLowScored={() => { void deleteRowsThenClose(lowScoredRowsForCleanup, 'low-scored'); }}
          onDeleteExceptTopPick={() => { void deleteRowsThenClose(exceptTopPickRowsForCleanup, 'all but your Top Pick'); }}
          onDeleteEverything={() => { void deleteRowsThenClose(installedRowsForCleanup, 'installed'); }}
          onCancel={cancelCloseCleanup}
          onUnderstand={() => { void closeAppAfterCleanup(); }}
          askAgain={closeCleanupAsk}
          onAskAgainChange={(ask) => { setCloseCleanupAsk(ask); writeCloseCleanupAsk(ask); }}
        />
      )}
      {supportModalOpen && (
        <SupportModal onClose={() => setSupportModalOpen(false)} />
      )}
      {pendingScoreClear && (
        <ClearScoresModal
          pending={pendingScoreClear}
          scoreCount={scoredModelCount}
          onCancel={cancelClearScores}
          onConfirm={confirmClearScores}
        />
      )}

      {!tutorialOpen && uiMode === 'advanced' && (
        <button
          type="button"
          className="help-float-btn"
          onClick={() => { setTutorialOpen(true); setTutorialStep(0); }}
          title="Reopen the getting started guide"
          aria-label="Open getting started guide"
        >
          <HelpCircle aria-hidden="true" />
        </button>
      )}

      {/* Never at the same time as the mode splash. Both open on a true first
          run: the splash sits above it at z-index 200, so the tour was invisible
          — but it mounts second, so its focus trap won, and a keyboard user was
          tabbing through a dialog they could not see behind the one they could.
          The tour also walks nav items whose visibility depends on the mode the
          splash has not been answered with yet. */}
      {tutorialOpen && !showModeSplash && (
        <FirstRunTutorial
          stepIndex={tutorialStep}
          installedCount={ollama.models.length}
          modelCount={modelRows.length}
          ollamaReady={ollama.ready}
          ollamaVersion={ollama.version}
          lmStudioReady={lmStudio.ready}
          lmStudioCount={lmStudio.models.length}
          onStepChange={setTutorialStep}
          onClose={closeTutorial}
          onSelectNav={selectNav}
        />
      )}
    </div>
  );
}


/**
 * A Match is the best model for a goal on this hardware — Dave's definition.
 * Picks that map to a goal borrow its match label ("Best for talking");
 * the scored qualities keep their plain names, since "Best for sticking to
 * facts" is a quality of a chat model, not a goal someone arrives with.
 */
/** The wizard dream matching a goal, for opening PICK on the splash answer. */
function dreamForGoal(goalId: string | undefined): 'talk' | 'write' | 'code' | 'image' | 'video' | undefined {
  switch (goalId) {
    case 'talk': return 'talk';
    case 'write': return 'write';
    case 'code': return 'code';
    case 'make-images': return 'image';
    case 'make-video':
    case 'animate-image': return 'video';
    default: return undefined;
  }
}


function getSavedBenchmarkQuestions() {
  try {
    const saved = window.localStorage.getItem(TEST_SUITE_STORAGE_KEY);
    if (!saved) return [...DEFAULT_BENCHMARK_QUESTIONS];
    return normalizeBenchmarkQuestions(JSON.parse(saved));
  } catch {
    return [...DEFAULT_BENCHMARK_QUESTIONS];
  }
}

function getSavedHistory(): PersistedHistory | null {
  try {
    const saved = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved) as Partial<PersistedHistory>;
    const benchmark = isBenchmarkResult(parsed.benchmark) ? parsed.benchmark : null;
    const hasByModel = isBenchmarkByModel(parsed.benchmarkByModel);
    const hasScores = isModelScores(parsed.modelScores);
    // Nothing usable saved (no benchmark, no per-model results, no scores) — ignore.
    if (!benchmark && !hasByModel && !hasScores) return null;

    const benchmarkByModel = hasByModel
      ? upsertBenchmarkResults({}, Object.values(parsed.benchmarkByModel as Record<string, BenchmarkResult>))
      : benchmark ? upsertBenchmarkResults({}, [benchmark]) : {};
    const modelScores = hasScores
      ? (parsed.modelScores as Record<string, TestedModelScore>)
      : upsertModelScores({}, Object.values(benchmarkByModel));

    const firstByModel = Object.values(benchmarkByModel)[0];
    const selectedModel = typeof parsed.selectedModel === 'string'
      ? parsed.selectedModel
      : benchmark?.model ?? firstByModel?.model ?? 'qwen2.5:7b';
    return {
      benchmark,
      benchmarkByModel,
      listTestResult: isListTestResult(parsed.listTestResult) ? parsed.listTestResult : null,
      modelScores,
      chatMessagesByModel: normalizeSavedChatMessagesByModel(parsed.chatMessagesByModel, parsed.chatMessages, selectedModel),
      selectedModel,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : benchmark?.completedAt ?? firstByModel?.completedAt ?? '',
    };
  } catch {
    return null;
  }
}

function getSavedClearedTopMatches(): Set<string> {
  try {
    const saved = window.localStorage.getItem(CLEARED_TOP_MATCHES_STORAGE_KEY);
    if (!saved) return new Set<string>();
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set<string>();
  }
}

function normalizeSavedChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [welcomeChatMessage];

  const messages = value.filter(isChatMessage);
  const conversation = messages.filter((message) => message.id !== welcomeChatMessage.id).slice(-99);
  return [welcomeChatMessage, ...conversation];
}

function normalizeSavedChatMessagesByModel(
  byModel: unknown,
  legacyMessages: unknown,
  legacyModel: string,
): Record<string, ChatMessage[]> {
  if (byModel !== null && typeof byModel === 'object' && !Array.isArray(byModel)) {
    const result: Record<string, ChatMessage[]> = {};
    for (const [key, val] of Object.entries(byModel as Record<string, unknown>)) {
      result[key] = normalizeSavedChatMessages(val);
    }
    return result;
  }
  // Migrate old flat chatMessages → put under the selected model's key
  if (legacyModel && Array.isArray(legacyMessages) && legacyMessages.length > 0) {
    return { [legacyModel]: normalizeSavedChatMessages(legacyMessages) };
  }
  return {};
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'agent') &&
    typeof value.content === 'string'
  );
}


// Its own component so it can hold a hook. Inline in the parent's JSX it was the
// one dialog left claiming aria-modal with nothing behind the claim — no focus
// moved in, no trap, no Escape — while AppBuilderPreviewModal, rendered
// directly above it, had all three.
// The rotating tips, from the one place definitions live. They used to be
// written out here, which meant the explanations existed only in Advanced Mode
// — shown to the people who needed them least. See lib/glossary.ts.


export default App;
