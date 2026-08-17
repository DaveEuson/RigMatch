import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Boxes,
  CheckCircle,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  Gauge,
  Heart,
  HelpCircle,
  History,
  Lightbulb,
  MessageSquare,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { agentArcadeApi, isDesktopRuntime } from './api';
import {
  BENCHMARK_QUESTION_LEVELS,
  BENCHMARK_PRESETS,
  buildBenchmarkPromptPlan,
  DEFAULT_BENCHMARK_QUESTIONS,
  normalizeBenchmarkQuestions,
  QUICK_CHECK_QUESTIONS,
  type BenchmarkQuestion,
  type BenchmarkQuestionCount,
  type BenchmarkQuestionType,
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
  AppLogEntry,
  BenchmarkResult,
  BenchmarkStatus,
  CatalogModel,
  LocalModelProvider,
  ModelRow,
  NetworkHost,
  OllamaStatus,
  PullProgressUpdate,
  SystemProfile,
  AutoUpdateStatus,
  OllamaInstallProgress,
  TestedModelScore,
  UpdateChannel,
  UpdateCheckResponse,
  ChatAttachment,
  ChatMessage,
  SkillRunStatus,
  GpuContention,
  ScoreRigStamp,
  PendingRunMode,
  SkillTestSelection,
  RunProgress,
} from './types';
import {
  compareBenchmarkResults,
  compareTestedModelScores,
  formatMatchScore,
  toTestedModelScore,
  upsertModelScores,
} from './lib/scoring';
import {
  getEmptyModelNewsState,
  getNotificationPermission,
  getSavedModelNewsNotificationsEnabled,
  getSavedModelNewsState,
  MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY,
  MODEL_NEWS_STORAGE_KEY,
  notifyNewModelDrops,
  reconcileModelNews,
  saveModelNewsState,
  type ModelNewsState,
  type ModelNotificationPermission,
} from './lib/modelNews';
import { WhatsNewPanel } from './components/WhatsNewPanel';
import { SideMenu, type NavId, type NavItem } from './components/SideMenu';
import { GameShowHost } from './components/GameShowHost';
import { BrandMark, PanelHeader } from './components/CommonChrome';
import { licenseLinksForModels } from './lib/modelLicenses';
import { lineupStanding, standingLine } from './lib/lineupStanding';
import { readDeckExpanded, writeDeckExpanded } from './lib/deckSettings';
import { playJingle } from './lib/sound';
import { TopDeck } from './components/TopDeck';
import {
  addSetValues,
  buildBugReportUrl,
  createEmptyBenchmark,
  createQueuedPullProgress,
  createRunProgressId,
  formatBenchmarkBanner,
  formatHistoryTime,
  formatLogsForClipboard,
  getAgentName,
  getBenchmarkForModel,
  getDiskGuard,
  getHardwareFit,
  getLineupBenchmarkBlocker,
  getLocalRigDetailCards,
  getModelAliases,
  getModelBenchmarkBlocker,
  getModelDreamTags,
  getModelEpithet,
  getModelGoodForLine,
  getModelProfile,
  getModelProfileHighlights,
  getModelRuntime,
  getModelScore,
  getNavLabel,
  getPlatformFit,
  getPlatformName,
  getPullProgressDetailLabel,
  getPullProgressPercent,
  getPullTrackPercent,
  getQueueChipModelName,
  getRemoteRigDetailCards,
  getRigPick,
  getSavedThemeId,
  getSavedTutorialSeen,
  getSavedUiMode,
  hasChosenInterfaceMode,
  getFriendlyModelName,
  getShortModelName,
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
  isLikelyImageGenerationModel,
  isVisionModel,
  isListTestResult,
  isModelScores,
  isRecord,
  isVisiblePullProgress,
  mergeModelRows,
  modelMatchesTask,
  normalizeBenchmarkResultModel,
  normalizeModelKey,
  ollamaModelMatchesAliases,
  playDoneJingle,
  removeBenchmarkResults,
  removeListTestScores,
  removeModelScores,
  textJudgeCandidates,
  removePullProgress,
  removePullProgressForModels,
  removeSetValues,
  sumQueuedGb,
  upsertBenchmarkResults,
} from './lib/modelCatalog';
import type {
  ListTestResult,
  ModelProfile,
  ModelTaskFilterId,
  RigPick,
} from './lib/modelCatalog';
import { dropChat, dropTranscripts, writeLocal, writeLocalJson, writeLocalJsonWithFallback } from './lib/safeStorage';
import { collapseModelVariants } from './lib/wizardVariants';
// Same constant the Simple Mode download step gates on, so the wizard cannot
// wave a lineup through that the run then refuses.
import { MIN_CONTESTANTS } from './lib/downloadStatus';
import { useDialog } from './lib/useDialog';
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
  amazonUrl,
  APP_VERSION,
  CLEARED_TOP_MATCHES_STORAGE_KEY,
  QUALITY_MODE_STORAGE_KEY,
  JUDGE_MODEL_STORAGE_KEY,
  JUDGE_SOURCE_STORAGE_KEY,
  CLOUD_JUDGE_MODEL_STORAGE_KEY,
  OPENROUTER_KEY_STORAGE_KEY,
  DEFAULT_CLOUD_JUDGE_MODEL,
  DEFAULT_SHORTLIST_IDS,
  HISTORY_STORAGE_KEY,
  NAV_ITEM_BY_ID,
  SIMPLE_NAV_ORDER,
  TEST_SUITE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TUTORIAL_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
  MODE_SPLASH_STORAGE_KEY,
  navItems,
  type ThemeId,
  type UiMode,
} from './lib/appConfig';
import { getUpdateChannelLabel } from './lib/updateLabels';
import { AvatarBust, MachineAvatar } from './components/Avatars';
import { AppBuilderPreviewModal } from './components/AppBuilderPreview';
import { ShareScorecard } from './components/ShareScorecard';
import { ExportHatchModal } from './components/ExportHatchModal';
import { buildHatchProfile } from './lib/hatchProfile';
import { UpdateAvailableToast } from './components/UpdateAvailableToast';
import { SimpleWizard, type StepId as WizardStepId, type WizardModel } from './components/SimpleWizard';
import { DeleteModelModal, CloseCleanupModal, ClearDataModal, SupportModal, ChoiceCruiseModal } from './components/dialogs';
import { ChatDock } from './components/ChatDock';
import { SkillRunMiniBar, LiveBuildModal, DemoResultModal } from './components/SkillDemoViewers';
import { AdvancedCapabilityLab } from './components/AdvancedCapabilityLab';
import { RunWarningModal } from './components/RunWarningModal';
import { UtilityPanel } from './components/UtilityPanel';
import { ModelCabinet } from './components/ModelCabinet';
import { AgentReveal } from './components/AgentReveal';
import { SpeedDateTranscriptPanel } from './components/SpeedDateTranscriptPanel';
import { LiveFlirtSpotlight } from './components/LiveFlirtSpotlight';
import { extractHtmlDocument } from './lib/labPreview';
import {
  describeLabFailure,
  readAdvancedLabResults,
  writeAdvancedLabResults,
  wasJudged,
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
} from './lib/labChallenges';
import { IMAGE_BENCHMARK_PROMPTS } from './lib/imageGenScoring';
import { judgeCandidates, toLabResult } from './lib/imageGenChallenge';
import { batchSeed, isVideoCheckpoint } from './lib/videoGen';
import { DEFAULT_VIDEO_SIZE_ID, toVideoLabResult, videoReadiness } from './lib/videoGenChallenge';
import { downloadPlan, formatBytesGb, generationCatalogRows, generationModelById } from './lib/generationCatalog';
import { tickerTips } from './lib/glossary';
import { goalById, goalHardwareExpectation, goalsByCategory, leagueLabel, presetIdForGoal, type GoalId } from './lib/goals';
import { taskFilterForGoal } from './lib/modelCatalog';
import {
  firstRunStep, hasBeenOfferedGoals, markGoalsOffered, readSelectedGoals, writeSelectedGoals,
  type FirstRunStep,
} from './lib/goalSettings';
import { deletableRows, rowsExceptTopPick, topPickToKeep } from './lib/modelCleanup';
import { copyText, type CopyState } from './lib/clipboard';
import { runVideoLabChallenge } from './lib/videoGenRunner';
import { runImageLabChallenge } from './lib/imageGenRunner';
import { describeComfyBusy, getComfyStatus } from './lib/comfyTransport';
import { readComfySettings } from './lib/comfySettings';
import {
  CODE_TASK_PRESETS,
  DEFAULT_CODE_LANGUAGE,
  resolveCodeTask,
  extractCodeBlock,
} from './lib/codeChallenge';
import {
  RomanceArtBanner,
} from './components/ScoreVisuals';
import {
  countWithVerb,
  formatGb,
  formatPullCount,
  getErrorMessage,
  getResponseEstimate,
  getScoreTone,
} from './lib/format';
import robotRigGreenroom from './assets/robot-rig-greenroom.webp';
import robotSpeedDateShow from './assets/robot-speed-date-show.webp';
import './App.css';




// Quick TEST resource warning opt-out ('off' = user chose "don't warn again").
const QUICK_CHECK_WARNING_KEY = 'rigmatch:quick-test-warning:v1';
// The app version whose update nudge the user dismissed — so the gentle popup
// shows once per new release, never nags for a version they've already seen.
const UPDATE_PROMPT_DISMISSED_KEY = 'rigmatch:update-prompt-dismissed:v1';

type PendingScoreClear = { mode: 'single'; model: string } | { mode: 'all' };



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
  // as done before the user chose anything, showed the alternatives greyed out
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
  const [isPullCancelRequested, setIsPullCancelRequested] = useState(false);
  const [isPullPauseRequested, setIsPullPauseRequested] = useState(false);
  const [isPullPaused, setIsPullPaused] = useState(false);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgressByModel, setPullProgressByModel] = useState<Record<string, PullProgressUpdate>>({});
  const pullQueueCancelRef = useRef(false);
  const pullQueuePauseRef = useRef(false);
  const activePullProgressIdRef = useRef<string | null>(null);
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
  const [modelScores, setModelScores] = useState<Record<string, TestedModelScore>>(() =>
    savedHistory?.modelScores ?? (isDesktopRuntime ? {} : upsertModelScores({}, [demoBenchmark])),
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
    videoSizeId: DEFAULT_VIDEO_SIZE_ID,
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
  // Checkpoints ComfyUI has loaded. Image generation is the one skill that does
  // not run on an Ollama model, so its candidates come from here.
  const [comfyCheckpoints, setComfyCheckpoints] = useState<string[]>([]);
  // Tracked separately: a video model without a T5 encoder cannot render, and
  // the two are fixed by fetching two different files.
  const [comfyTextEncoders, setComfyTextEncoders] = useState<string[]>([]);
  // Re-read whenever the utility panel closes, so a folder chosen in Settings
  // reaches the Models screen without a restart.
  const [comfySettings, setComfySettings] = useState(() => readComfySettings());
  /** The generation download in flight, so Stop can abort the right stream. */
  const activeComfyDownloadRef = useRef<string | null>(null);
  const [closeCleanupOpen, setCloseCleanupOpen] = useState(false);
  const [isCloseCleanupDeleting, setIsCloseCleanupDeleting] = useState(false);
  const [closeCleanupMessage, setCloseCleanupMessage] = useState<string | null>(null);
  const [benchmarkQuestionCount, setBenchmarkQuestionCount] = useState<BenchmarkQuestionCount>(10);
  // Answer-grading mode: 'heuristic' (built-in, fast, offline) or 'judge' (grade
  // answers with a local model). Off by default so existing scores don't move.
  const [qualityMode, setQualityMode] = useState<'heuristic' | 'judge'>(() => {
    try { return localStorage.getItem(QUALITY_MODE_STORAGE_KEY) === 'judge' ? 'judge' : 'heuristic'; }
    catch { return 'heuristic'; }
  });
  const [judgeModel, setJudgeModel] = useState<string>(() => {
    try { return localStorage.getItem(JUDGE_MODEL_STORAGE_KEY) ?? ''; }
    catch { return ''; }
  });
  // Judge source: 'local' grades with an installed Ollama model (default, 100% on-
  // device); 'openrouter' grades with a cloud model — strictly opt-in because it
  // sends graded content off this computer and costs API credits.
  const [judgeSource, setJudgeSource] = useState<'local' | 'openrouter'>(() => {
    try { return localStorage.getItem(JUDGE_SOURCE_STORAGE_KEY) === 'openrouter' ? 'openrouter' : 'local'; }
    catch { return 'local'; }
  });
  const [cloudJudgeModel, setCloudJudgeModel] = useState<string>(() => {
    try { return localStorage.getItem(CLOUD_JUDGE_MODEL_STORAGE_KEY) ?? DEFAULT_CLOUD_JUDGE_MODEL; }
    catch { return DEFAULT_CLOUD_JUDGE_MODEL; }
  });
  const [openRouterKey, setOpenRouterKey] = useState<string>(() => {
    try { return localStorage.getItem(OPENROUTER_KEY_STORAGE_KEY) ?? ''; }
    catch { return ''; }
  });
  // How many improve passes each model has had this session (App Builder retries).
  const [improveCounts, setImproveCounts] = useState<Record<string, number>>({});
  const [benchmarkQuestions, setBenchmarkQuestions] = useState<BenchmarkQuestion[]>(() => getSavedBenchmarkQuestions());
  const [suiteEditorOpen, setSuiteEditorOpen] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [activity, setActivity] = useState('Contestants is your hub: browse models, run tests, manage downloads, and start Speed Dating.');
  const [activeNavId, setActiveNavId] = useState<NavId>('models');
  useEffect(() => {
    // Cheap re-read on navigation: choosing a folder in Settings then going to
    // Models should not need a restart, and localStorage has no change event
    // for same-document writes.
    setComfySettings(readComfySettings());
  }, [activeNavId]);
  const [modelNews, setModelNews] = useState<ModelNewsState>(() => getSavedModelNewsState());
  const [modelNewsNotificationsEnabled, setModelNewsNotificationsEnabled] = useState(() => getSavedModelNewsNotificationsEnabled());
  const [notificationPermission, setNotificationPermission] = useState<ModelNotificationPermission>(() => getNotificationPermission());
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [logPath, setLogPath] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('release');
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResponse | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<AutoUpdateStatus>({ phase: 'idle' });
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(UPDATE_PROMPT_DISMISSED_KEY); } catch { return null; }
  });
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
  const [firstRun, setFirstRun] = useState<FirstRunStep>(() => firstRunStep({
    modeChosen: hasChosenInterfaceMode(),
    goalsOffered: hasBeenOfferedGoals(),
  }));
  const showModeSplash = firstRun === 'goals-and-mode';
  const showGoalsIntro = firstRun === 'goals-only';
  // Settings can reopen the goals step of the splash on its own — mistakes at
  // first run must not be permanent, and localStorage is not a settings UI.
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  // The message Simple Mode is currently showing, if any. Advanced reads the
  // same text off the Ticker and does not need it.
  const [simpleNotice, setSimpleNotice] = useState<string | null>(null);
  // What the person said they want to do, first pick foremost. Drives the
  // Models lens and the wizard's opening dream — a lens, never a lock.
  const [selectedGoals, setSelectedGoals] = useState<GoalId[]>(() => readSelectedGoals());
  const [chatOpen, setChatOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [pendingThirdPartyDownloadRows, setPendingThirdPartyDownloadRows] = useState<ModelRow[] | null>(null);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [exportHatchOpen, setExportHatchOpen] = useState(false);
  const [clearedTopMatches, setClearedTopMatches] = useState<Set<string>>(() => getSavedClearedTopMatches());
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [pendingScoreClear, setPendingScoreClear] = useState<PendingScoreClear | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => !getSavedTutorialSeen());
  const [tutorialStep, setTutorialStep] = useState(0);
  const [chatInput, setChatInput] = useState('');
  // Pending image (data URL) the user attached for the next vision-model message.
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(null);
  const [chatMessagesByModel, setChatMessagesByModel] = useState<Record<string, ChatMessage[]>>(
    savedHistory?.chatMessagesByModel ?? {},
  );
  const chatMessages = chatMessagesByModel[selectedModel] ?? [welcomeChatMessage];
  const chatSupportsImages = isVisionModel(selectedModel);
  const modelNewsRef = useRef(modelNews);
  const modelNewsNotificationsEnabledRef = useRef(modelNewsNotificationsEnabled);

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

  const modelRows = useMemo(
    () => {
      const rows = mergeModelRows(catalog, localModels);
      // Generation models join the same list rather than living on a screen of
      // their own. Someone who wants to make a video searches for "makes
      // video"; that video comes from Hugging Face and runs on ComfyUI is our
      // problem, not a category they should have to learn.
      const generation: ModelRow[] = generationCatalogRows([...comfyCheckpoints, ...comfyTextEncoders])
        .map((entry) => ({
          ...entry,
          displayName: entry.name,
          installed: entry.installedFile,
          ready: entry.installedFile,
          installLabel: entry.installedFile ? 'Installed' : 'Download',
          canDownload: !entry.installedFile,
          pulls: null,
        }));
      return [...generation, ...rows];
    },
    [catalog, localModels, comfyCheckpoints, comfyTextEncoders],
  );

  const selectedRow = modelRows.find(
    (row) => row.displayName === selectedModel || row.id === selectedModel,
  );
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

  // ComfyUI is a separate program the user starts themselves, so this is a
  // look rather than a subscription. It drops its answer if the app closed
  // while the probe was in flight.
  useEffect(() => {
    let live = true;
    void getComfyStatus().then((status) => {
      if (!live) return;
      setComfyCheckpoints(status.checkpoints);
      setComfyTextEncoders(status.textEncoders ?? []);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    modelNewsRef.current = modelNews;
  }, [modelNews]);

  useEffect(() => {
    modelNewsNotificationsEnabledRef.current = modelNewsNotificationsEnabled;
  }, [modelNewsNotificationsEnabled]);

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
  // Installed local (Ollama) models fit to judge, most capable first. Not
  // simply the biggest file: an embedding or OCR model is often the largest
  // thing installed and grades prose as confident nonsense.
  const judgeModelOptions = useMemo(
    () => textJudgeCandidates(installedRowsForCleanup),
    [installedRowsForCleanup],
  );
  // The judge model actually sent with a run: the user's pick if it's still
  // installed, otherwise the largest installed model. Empty when judging is off
  // or nothing is installed (backend then falls back to the heuristic).
  const effectiveJudgeModel = useMemo(() => {
    if (qualityMode !== 'judge') return '';
    if (judgeModel && judgeModelOptions.includes(judgeModel)) return judgeModel;
    return judgeModelOptions[0] ?? '';
  }, [qualityMode, judgeModel, judgeModelOptions]);
  // The judge configuration a run actually uses, or null when judging is off /
  // not usable (cloud without a key falls back to heuristic — never silently to
  // a different judge the user didn't pick).
  /**
   * A local model to mark the answers the rules cannot, when judging is off.
   *
   * Chat and writing questions have no shape for the heuristic to match, so
   * 0.6 stopped them crowning anyone — which left those goals graded but
   * uncrownable unless the user found the judge setting. This hands the main
   * process a local judge for exactly those questions. Never the cloud judge:
   * auto-engaging something that costs money and leaves the machine would be
   * wrong however useful the score.
   */
  const autoJudgeModels = useMemo(() => {
    if (qualityMode === 'judge') return [];
    // The whole ordered list, not just the best one: the main process drops
    // the model it is testing and takes the next, because a model marking its
    // own answers grades itself generously and that score then crowns a Match.
    // A lineup makes this certain rather than unlikely — every contestant is
    // the model under test in turn.
    return judgeModelOptions;
  }, [qualityMode, judgeModelOptions]);

  const effectiveJudge = useMemo<{ provider: 'local' | 'openrouter'; model: string; apiKey?: string } | null>(() => {
    if (qualityMode !== 'judge') return null;
    if (judgeSource === 'openrouter') {
      const model = cloudJudgeModel.trim();
      const apiKey = openRouterKey.trim();
      return model && apiKey ? { provider: 'openrouter', model, apiKey } : null;
    }
    return effectiveJudgeModel ? { provider: 'local', model: effectiveJudgeModel } : null;
  }, [qualityMode, judgeSource, cloudJudgeModel, openRouterKey, effectiveJudgeModel]);
  useEffect(() => {
    try { localStorage.setItem(QUALITY_MODE_STORAGE_KEY, qualityMode); } catch { /* ignore */ }
  }, [qualityMode]);
  useEffect(() => {
    try { localStorage.setItem(JUDGE_MODEL_STORAGE_KEY, judgeModel); } catch { /* ignore */ }
  }, [judgeModel]);
  useEffect(() => {
    try { localStorage.setItem(JUDGE_SOURCE_STORAGE_KEY, judgeSource); } catch { /* ignore */ }
  }, [judgeSource]);
  useEffect(() => {
    try { localStorage.setItem(CLOUD_JUDGE_MODEL_STORAGE_KEY, cloudJudgeModel); } catch { /* ignore */ }
  }, [cloudJudgeModel]);
  useEffect(() => {
    try { localStorage.setItem(OPENROUTER_KEY_STORAGE_KEY, openRouterKey); } catch { /* ignore */ }
  }, [openRouterKey]);
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

  const wizardWinner = useMemo(
    () => (topRigPick?.score
      ? {
        model: topRigPick.row.displayName,
        score: topRigPick.score.total,
        // The winner screen was printing the raw integer, so the app's most-seen
        // score was the one surface still disagreeing with the decimal policy.
        scoreLabel: formatMatchScore(topRigPick.score),
        grade: topRigPick.score.grade,
      }
      : null),
    [topRigPick],
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
    () => shortlistedRows
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
      })),
    [shortlistedRows, modelScores],
  );

  // Advanced's stats strip. Read once from the stored choice, falling back to
  // a rule based on how much height this screen actually has — see
  // scripts/measure-shell.mjs for the numbers that set the threshold.
  const [deckExpanded, setDeckExpanded] = useState(
    () => readDeckExpanded(typeof window === 'undefined' ? 1080 : window.innerHeight),
  );

  /**
   * What this PC can actually generate.
   *
   * The Pick screen filters generation models out of the Speed Dating lineup —
   * correctly, they cannot be benchmarked — and then had to describe the empty
   * grid. It said "No contestants can make video on this PC", which is not
   * true: LTX-Video and WAN both ship in the catalogue and run here. Handing
   * the wizard the real figures lets it say something true instead of
   * discouraging someone away from a feature that works.
   */
  const generationSummary = useMemo(() => {
    const summarize = (kind: 'image' | 'video') => {
      const rows = modelRows.filter((row) => row.generationKind === kind);
      return {
        total: rows.length,
        installed: rows.filter((row) => row.installed).length,
        names: rows.map((row) => row.displayName),
      };
    };
    return { image: summarize('image'), video: summarize('video') };
  }, [modelRows]);

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
  }, [topRigPick]);

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

      const newsUpdate = reconcileModelNews(catalogResponse.models, modelNewsRef.current);
      const shouldNotifyAboutModels = newsUpdate.state.latestNewModelIds.length > 0
        && modelNewsNotificationsEnabledRef.current
        && getNotificationPermission() === 'granted';
      const nextNewsState = shouldNotifyAboutModels
        ? { ...newsUpdate.state, lastNotifiedAt: new Date().toISOString() }
        : newsUpdate.state;
      modelNewsRef.current = nextNewsState;
      setModelNews(nextNewsState);
      saveModelNewsState(nextNewsState);

      if (shouldNotifyAboutModels) {
        notifyNewModelDrops(catalogResponse.models, nextNewsState.latestNewModelIds);
      }

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
      const modelNewsNote = newsUpdate.state.latestNewModelIds.length > 0
        ? ` ${newsUpdate.state.latestNewModelIds.length} new model${newsUpdate.state.latestNewModelIds.length === 1 ? '' : 's'} found.`
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
  }, []);

  // Every control that says "check my computer" is the user asking for it, so
  // these may sync. Takes no arguments so wiring it straight to onClick cannot
  // smuggle a MouseEvent in as options.
  const refreshRig = useCallback(() => runRigRefresh({ userInitiated: true }), [runRigRefresh]);

  const toggleModelNewsNotifications = useCallback(async () => {
    const permission = getNotificationPermission();
    setNotificationPermission(permission);

    if (modelNewsNotificationsEnabled) {
      setModelNewsNotificationsEnabled(false);
      modelNewsNotificationsEnabledRef.current = false;
      writeLocal(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY, 'false');
      setActivity('Model drop notifications are off. What\'s New will still update when RigMatch scans.');
      return;
    }

    if (permission === 'unsupported') {
      setActivity('This runtime does not support desktop notifications, but What\'s New will still track model drops.');
      return;
    }

    let nextPermission = permission;
    if (permission === 'default') {
      nextPermission = await Notification.requestPermission();
      setNotificationPermission(nextPermission);
    }

    if (nextPermission !== 'granted') {
      setActivity('Notifications were not enabled. You can still check What\'s New inside RigMatch.');
      return;
    }

    setModelNewsNotificationsEnabled(true);
    modelNewsNotificationsEnabledRef.current = true;
    writeLocal(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY, 'true');
    setActivity('Model drop notifications are on. RigMatch will alert you when a scan finds new Ollama models.');
  }, [modelNewsNotificationsEnabled]);

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

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);

    try {
      const result = await agentArcadeApi.getLogs(200);
      setAppLogs(result.entries);
      setLogPath(result.logPath);
      setActivity(`Loaded ${result.entries.length} log entr${result.entries.length === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
      setActivity(`Log load failed: ${getErrorMessage(error)}`);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  const openLogsPanel = useCallback(() => {
    setActiveNavId('history');
    void loadLogs();
  }, [loadLogs]);

  const clearLogs = useCallback(async () => {
    try {
      const result = await agentArcadeApi.clearLogs();
      setAppLogs(result.entries);
      setLogPath(result.logPath);
      setActivity('Run logs cleared.');
    } catch (error) {
      setActivity(`Could not clear logs: ${getErrorMessage(error)}`);
    }
  }, []);

  const openLogsFolder = useCallback(async () => {
    try {
      const result = await agentArcadeApi.openLogsFolder();
      setLogPath(result.logPath);
      setActivity('Log folder opened.');
    } catch (error) {
      setActivity(`Could not open log folder: ${getErrorMessage(error)}`);
    }
  }, []);

  const copyLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatLogsForClipboard(appLogs));
      setActivity(`Copied ${appLogs.length} log entr${appLogs.length === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
      setActivity(`Could not copy logs: ${getErrorMessage(error)}`);
    }
  }, [appLogs]);

  useEffect(() => {
    return agentArcadeApi.onUpdaterStatus?.((status) => setAutoUpdateStatus(status));
  }, []);

  const downloadUpdate = useCallback(async () => {
    setAutoUpdateStatus({ phase: 'downloading', percent: 0 });
    try { await agentArcadeApi.downloadUpdate(); } catch { /* events handle feedback */ }
  }, []);

  const installUpdate = useCallback(() => {
    void agentArcadeApi.installUpdate();
  }, []);

  const selectUpdateChannel = useCallback((channel: UpdateChannel) => {
    setUpdateChannel(channel);
    setUpdateCheck(null);
    setActivity(`${getUpdateChannelLabel(channel)} channel selected.`);
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    setActivity(`Checking ${getUpdateChannelLabel(updateChannel).toLowerCase()} upgrades...`);
    if (updateChannel === 'release') void agentArcadeApi.checkAutoUpdate();

    try {
      const result = await agentArcadeApi.checkForUpdates(updateChannel);
      setUpdateCheck(result);

      if (result.error) {
        setActivity(`Update check finished with a note: ${result.error}`);
      } else if (result.hasUpdate) {
        setActivity(`${result.latestName ?? 'A newer RigMatch build'} is available on the ${getUpdateChannelLabel(result.channel)} channel.`);
      } else {
        setActivity(`You are on the latest ${getUpdateChannelLabel(result.channel).toLowerCase()} build RigMatch found.`);
      }
    } catch (error) {
      setActivity(`Could not check for RigMatch upgrades: ${getErrorMessage(error)}`);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [updateChannel]);

  const openUpdatePage = useCallback(async () => {
    try {
      const preferredUrl = updateCheck?.downloadKind === 'installer' ? updateCheck.downloadUrl : updateCheck?.releaseUrl;
      const opened = await agentArcadeApi.openUpdatePage(updateChannel, preferredUrl);
      const openedDirectInstaller = updateCheck?.downloadKind === 'installer' && opened.url === updateCheck.downloadUrl;
      setActivity(
        openedDirectInstaller
          ? `Opened ${updateCheck.downloadName ?? 'the matching RigMatch installer'} for download.`
          : `Opened RigMatch ${getUpdateChannelLabel(updateChannel).toLowerCase()} downloads.`,
      );
    } catch (error) {
      setActivity(`Could not open RigMatch downloads: ${getErrorMessage(error)}`);
    }
  }, [updateChannel, updateCheck]);

  // Quietly check for a newer release once on launch so the gentle update nudge
  // can appear. Silent — no activity spam; if it fails, the popup just won't show.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await agentArcadeApi.checkForUpdates(updateChannel);
        if (!cancelled) setUpdateCheck(result);
      } catch { /* ignore — the popup just won't show */ }
    })();
    return () => { cancelled = true; };
    // Once on mount; the default release channel is the right nudge at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissUpdatePrompt = useCallback(() => {
    const version = updateCheck?.latestVersion;
    if (!version) return;
    setDismissedUpdateVersion(version);
    try { localStorage.setItem(UPDATE_PROMPT_DISMISSED_KEY, version); } catch { /* ignore */ }
  }, [updateCheck]);

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

  const confirmClearData = useCallback(async () => {
    try {
      const result = await agentArcadeApi.clearLogs();
      window.localStorage.removeItem(TEST_SUITE_STORAGE_KEY);
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      window.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
      window.localStorage.removeItem(UI_MODE_STORAGE_KEY);
      window.localStorage.removeItem(CLEARED_TOP_MATCHES_STORAGE_KEY);
      window.localStorage.removeItem(MODEL_NEWS_STORAGE_KEY);
      window.localStorage.removeItem(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY);

      setAppLogs(result.entries);
      setLogPath(result.logPath);
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
      setQueuedModelIds(new Set<string>());
      setShortlistIds(new Set(DEFAULT_SHORTLIST_IDS));
      setPendingRunMode(null);
      setPendingSingleModel(null);
      setBenchmarkQuestionCount(10);
      setBenchmarkQuestions([...DEFAULT_BENCHMARK_QUESTIONS]);
      setRunProgress(null);
      setThemeId('orange');
      setUiMode('beginner');
      setChatInput('');
      setChatMessagesByModel({});
      setChosenModel(null);
      setClearedTopMatches(new Set<string>());
      const nextModelNews = getEmptyModelNewsState();
      modelNewsRef.current = nextModelNews;
      setModelNews(nextModelNews);
      modelNewsNotificationsEnabledRef.current = false;
      setModelNewsNotificationsEnabled(false);
      setSuiteEditorOpen(false);
      setTutorialStep(0);
      setTutorialOpen(true);
      setPendingDeleteModel(null);
      setClearDataOpen(false);
      setActivity('RigMatch app data cleared. Ollama models were left installed.');
    } catch (error) {
      setActivity(`Could not clear all data: ${getErrorMessage(error)}`);
    }
  }, [ollama.baseUrl, selectedModel]);

  const requestDeleteModel = useCallback((row: ModelRow) => {
    if (row.localProvider === 'lm-studio') {
      setActivity(`${row.displayName} is managed by LM Studio. Delete it from LM Studio if you want to free disk space.`);
      return;
    }
    // Deliberately does NOT touch selectedModel. It used to, which was fine on
    // the Models screen but wrong from the Closet in Settings: clicking Evict
    // reassigned the app's selected model, and cancelling the confirmation left
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
      if (installedRowsForCleanup.length === 0) {
        void agentArcadeApi.closeApp();
        return;
      }

      setCloseCleanupMessage(null);
      setCloseCleanupOpen(true);
    });
  }, [installedRowsForCleanup.length]);

  const selectNav = useCallback((id: NavId) => {
    setActiveNavId(id);

    if (id === 'history') {
      void loadLogs();
      setActivity(`${getNavLabel(id)} selected.`);
      return;
    }

    setActivity(`${getNavLabel(id)} selected.`);
  }, [loadLogs]);

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

  const selectUiMode = useCallback((nextMode: UiMode) => {
    setUiMode(nextMode);
    setActivity(nextMode === 'beginner'
      ? 'Simple mode selected. RigMatch will keep the interface focused on the next useful step.'
      : 'Advanced mode selected. RigMatch will show more setup details, commands, and diagnostics.');
  }, []);

  /**
   * Say something the user genuinely needs to read, in whichever mode they are in.
   *
   * setActivity alone was not enough: it renders only inside <Ticker>, which is
   * gated to Advanced, so in Simple Mode — the default — every refusal and
   * failure was written to state nobody paints. Use this for anything a user
   * must act on; plain setActivity remains right for running commentary.
   */
  const tellUser = useCallback((message: string) => {
    setActivity(message);
    setSimpleNotice(message);
  }, []);

  // Stamped onto every score at scoring time. Scores are relative to a rig,
  // and Ollama tags mutate — the digest is the only durable identity for the
  // weights that actually earned the number.
  const rigStampForModel = useCallback((model: string): ScoreRigStamp => {
    const installed = ollama.models.find((m) => m.name === model || m.model === model);
    return {
      gpu: system.gpu.model,
      vramGb: system.gpu.vramGb,
      driverVersion: system.gpu.driverVersion || undefined,
      appVersion: APP_VERSION,
      modelDigest: installed?.digest,
      quantization: installed?.quantization,
    };
  }, [ollama.models, system.gpu.model, system.gpu.vramGb, system.gpu.driverVersion]);

  const chooseInterfaceMode = useCallback((nextMode: UiMode, goals: GoalId[] = []) => {
    selectUiMode(nextMode);
    // Persist immediately and record that the splash choice was made so it
    // won't reappear next launch. The Simple wizard opens itself at Setup.
    writeLocal(UI_MODE_STORAGE_KEY, nextMode);
    writeLocal(MODE_SPLASH_STORAGE_KEY, 'chosen');
    writeSelectedGoals(goals);
    setSelectedGoals(goals);
    markGoalsOffered();
    setFirstRun('none');
  }, [selectUiMode]);

  const saveGoalsFromSettings = useCallback((goals: GoalId[]) => {
    writeSelectedGoals(goals);
    setSelectedGoals(goals);
    setShowGoalsEditor(false);
    const primary = goals[0] ? goalById(goals[0]) : undefined;
    setActivity(primary
      ? `Goals updated. ${primary.matchLabel} now leads Models and Simple Mode.`
      : 'Goals cleared. Models and Simple Mode show everything again.');
  }, []);

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
      setModelScores((current) => upsertModelScores(current, [result], currentSuiteName, rigStampForModel));
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

      pullQueueCancelRef.current = true;
      pullQueuePauseRef.current = false;
      setIsPullCancelRequested(true);
      setIsPullPauseRequested(false);
      setIsPullPaused(false);
      void agentArcadeApi.abortPull(activePullProgressIdRef.current ?? undefined, 'cancel');
      // A generation download is a file stream, not an Ollama pull, and
      // abortPull cannot touch it — without this the multi-gigabyte fetch
      // carried on writing after Stop and the UI said it had stopped.
      if (activeComfyDownloadRef.current) {
        void agentArcadeApi.comfyAbortDownload?.(activeComfyDownloadRef.current);
      }
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
  }, [isPullCancelRequested, isPullingModels, modelRows, ollama.baseUrl, pullingModel, queuedModelIds]);

  const pauseDownloadQueue = useCallback(() => {
    if (!isPullingModels || !pullingModel) {
      setActivity('No active download to pause.');
      return;
    }

    if (isPullPauseRequested || isPullCancelRequested) {
      setActivity('Download pause/stop is already requested.');
      return;
    }

    pullQueuePauseRef.current = true;
    pullQueueCancelRef.current = false;
    setIsPullPauseRequested(true);
    void agentArcadeApi.abortPull(activePullProgressIdRef.current ?? undefined, 'pause');
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
  }, [isPullCancelRequested, isPullPauseRequested, isPullingModels, ollama.baseUrl, pullingModel]);

  /**
   * Fetch a generation model into ComfyUI's own folders.
   *
   * Needs somewhere to write, and ComfyUI never says where it lives — so
   * without a verified folder this stops and says so rather than failing
   * somewhere less obvious. The encoder rides along: a video checkpoint on its
   * own renders nothing.
   */
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
    const refuse = (why: string): false => {
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
      tellUser(why);
      return false;
    };

    const model = row.generationId ? generationModelById(row.generationId) : undefined;
    if (!model) {
      return refuse(`${row.displayName} is not in RigMatch's download list, so there is nothing to fetch.`);
    }

    const { folder: comfyRoot } = readComfySettings();
    if (!comfyRoot) {
      return refuse(
        `${row.displayName} installs into ComfyUI, and RigMatch does not know where ComfyUI is yet. `
        + 'Open Settings → Generation and point it at your ComfyUI folder, then try again.',
      );
    }

    const { needed, totalBytes } = downloadPlan(model, [...comfyCheckpoints, ...comfyTextEncoders]);
    if (needed.length === 0) return true;

    setActivity(`Downloading ${needed.map((m) => m.label).join(' + ')} — ${formatBytesGb(totalBytes)} in total.`);
    for (const item of needed) {
      // A video model and its encoder are two files; Stop during the first
      // must not be followed by the second starting anyway.
      if (pullQueueCancelRef.current) return false;
      const progressId = createRunProgressId('comfy');
      activeComfyDownloadRef.current = progressId;
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
        });
      } catch (error) {
        // A cancelled stream lands here too; say stopped rather than failed,
        // since the user asked for it.
        const message = getErrorMessage(error);
        if (pullQueueCancelRef.current) {
          setActivity(`${item.label} download stopped.`);
          return false;
        }
        return refuse(`${item.label} could not be downloaded. ${message}`);
      } finally {
        activeComfyDownloadRef.current = null;
        unsubscribe?.();
      }
    }
    // ComfyUI only rescans its folders at startup, so a fresh file is invisible
    // until it does. Better said now than discovered as a missing model later.
    setActivity(`${row.displayName} downloaded. Restart ComfyUI so it picks up the new file.`);
    void getComfyStatus().then((status) => {
      setComfyCheckpoints(status.checkpoints);
      setComfyTextEncoders(status.textEncoders ?? []);
    });
    return true;
  }, [comfyCheckpoints, comfyTextEncoders, tellUser]);

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

    pullQueueCancelRef.current = false;
    pullQueuePauseRef.current = false;
    setIsPullCancelRequested(false);
    setIsPullPauseRequested(false);
    setIsPullPaused(false);
    setIsPullingModels(true);
    let completedCount = 0;
    let wasCancelled = false;
    let activePullModel: string | null = null;
    const startingCount = queuedRows.length;

    try {
      for (const row of queuedRows) {
        if (pullQueueCancelRef.current) {
          wasCancelled = true;
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
        activePullProgressIdRef.current = progressId;
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

      if (pullQueueCancelRef.current) {
        wasCancelled = true;
      }

      if (wasCancelled) {
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
      if (pullQueuePauseRef.current && activePullModel) {
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

      if (pullQueueCancelRef.current) {
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
        // error forever, and no way out but cancelling the whole queue. The
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
      activePullProgressIdRef.current = null;
      setPullingModel(null);
      setIsPullingModels(false);
      setIsPullCancelRequested(false);
      setIsPullPauseRequested(false);
      pullQueueCancelRef.current = false;
      pullQueuePauseRef.current = false;
    }
    // downloadGenerationModel closes over the ComfyUI file lists; without it
    // here a queue would write against whatever they were when this callback
    // was last built, and re-download a file already fetched.
  }, [ollama.baseUrl, ollama.ready, pullProgressByModel, queuedRows, refreshRig, selectedHost?.hostname, downloadGenerationModel]);

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
        setModelScores((current) => upsertModelScores(current, [result], currentSuiteName, rigStampForModel));
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

  const runSkillTestsAfterRun = useCallback(async (models: string[]) => {
    const selection = skillTestSelection;
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
    for (const model of models) {
      if (selection.appBuilder && !isLikelyImageGenerationModel(model) && !isEmbeddingModel(model)) {
        jobs.push({ model, kind: 'app-builder' });
      }
      if (selection.code && !isLikelyImageGenerationModel(model) && !isEmbeddingModel(model)) {
        jobs.push({ model, kind: 'code' });
      }
      if (selection.recognize && isVisionModel(model)) {
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
    let videoEncoder = '';
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
        // A video checkpoint in a still-image graph fails deep in the sampler
        // with a shape error, so it is never offered one.
        for (const name of comfy.checkpoints.filter((n) => !isVideoCheckpoint(n))) {
          jobs.push({ model: name, kind: 'image' });
        }
      }
      if (selection.video) {
        const ready = videoReadiness(comfy.checkpoints, comfy.textEncoders ?? []);
        if (ready.kind === 'ready') {
          videoEncoder = ready.encoders[0];
          for (const name of ready.checkpoints) jobs.push({ model: name, kind: 'video' });
        }
      }
    }

    if (!jobs.length) return;

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
        : job.kind === 'video' ? `Video skill test — ${job.model}`
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
          result = await runAdvancedVisionChallenge(job.model, ollama.baseUrl, visionImage, streamId);
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
        // job.model is a ComfyUI video checkpoint. Every model in this batch
        // gets the same seed, so what differs between them is the model.
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: false });
        const run = await runVideoLabChallenge({
          checkpoint: job.model,
          textEncoder: videoEncoder,
          sizeId: selection.videoSizeId,
          promptId: selection.imagePrompt,
          judgeModel: judgeCandidates(modelRows)[0],
          ollamaBaseUrl: ollama.baseUrl,
          seed: videoSeed,
        });
        result = toVideoLabResult(run, selection.imagePrompt);
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: true, error: result.error });
      } else {
        // Image generation can't stream tokens — show a "generating" state.
        // job.model is a ComfyUI checkpoint here, not an Ollama model.
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: false });
        const run = await runImageLabChallenge({
          checkpoint: job.model,
          promptId: selection.imagePrompt,
          judgeModel: judgeCandidates(modelRows)[0],
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
            failedChecks: (result.checks ?? []).filter((check) => !check.passed).map((check) => `${check.label}: ${check.detail}`),
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
          demos.push({ model: job.model, kind: 'image', imageDataUrl: result.imageDataUrl, note: describeLabFailure(result), grade: result.grade, score: result.score });
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
    // modelRows is read to pick a vision model to judge the generated image;
    // without it here the run would judge with whatever was installed when this
    // callback was last built.
  }, [ollama.baseUrl, skillTestSelection, effectiveJudge, modelRows]);

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
    let cancelled = false;
    void agentArcadeApi.getGpuContention()
      .then((result) => { if (!cancelled) setPendingGpuContention(result); })
      // A failed probe means the same thing as "could not check", which the
      // assessment already reports as `unknown` — so stay silent rather than
      // surfacing an error the user cannot act on.
      .catch(() => undefined);
    return () => { cancelled = true; };
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
  }, [pendingGpuContention, pendingRunMode, pendingSingleModel, runListTest, runSkillTestsAfterRun, selectedModel, shortlistedRows, skillTestSelection, startBenchmark, reportSkillRunFailure]);

  const cancelPendingRun = useCallback(() => {
    setPendingRunMode(null);
    setPendingSingleModel(null);
    setActivity('Model test cancelled before resources were engaged.');
  }, []);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    const attachment = chatAttachment;
    // Allow an attachment-only send (e.g. "read this") but keep a default
    // prompt so the model always gets some text to act on.
    if (!message && !attachment) return;

    // Audio and images both travel in `images` — that is how Ollama takes a
    // recording, verified against gemma4:e2b, which transcribed a WAV sent
    // this way.
    const attached = attachment ? [attachment.dataUrl] : undefined;
    const defaultPrompt = attachment?.kind === 'audio'
      ? 'What is said in this recording?'
      : 'What is in this image?';

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message || (attachment ? defaultPrompt : ''),
      ...(attached ? { images: attached } : {}),
      ...(attachment ? { attachmentKind: attachment.kind } : {}),
    };
    const chatModel = selectedModel;
    setChatMessagesByModel((prev) => ({
      ...prev,
      [chatModel]: [...(prev[chatModel] ?? [welcomeChatMessage]), userMessage],
    }));
    setChatInput('');
    setChatAttachment(null);

    try {
      const runtime = getModelRuntime(selectedRow, ollama);
      const response = await agentArcadeApi.sendChat({
        model: chatModel,
        message: userMessage.content,
        baseUrl: runtime.baseUrl,
        provider: runtime.provider,
        ...(attached ? { images: attached } : {}),
      });
      setChatMessagesByModel((prev) => ({
        ...prev,
        [chatModel]: [
          ...(prev[chatModel] ?? [welcomeChatMessage]),
          { id: `${Date.now()}-agent`, role: 'agent', content: response.message },
        ],
      }));
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setActivity(`Chat failed: ${errMsg}`);
      setChatMessagesByModel((prev) => ({
        ...prev,
        [chatModel]: [
          ...(prev[chatModel] ?? [welcomeChatMessage]),
          { id: `${Date.now()}-error`, role: 'agent', content: `I could not reach the selected model: ${errMsg}` },
        ],
      }));
    }
  }, [chatAttachment, chatInput, ollama, selectedModel, selectedRow]);

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
    let cancelled = false;
    const id = setInterval(() => {
      void agentArcadeApi.getSystemProfile()
        .then((profile) => { if (!cancelled) setSystem(profile); })
        .catch(() => { /* ignore transient poll errors */ });
    }, 1600);
    return () => { cancelled = true; clearInterval(id); };
  }, [runProgress?.phase]);

  useEffect(() => {
    writeLocalJson(TEST_SUITE_STORAGE_KEY, benchmarkQuestions);
  }, [benchmarkQuestions]);

  useEffect(() => {
    writeLocal(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

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
      modelScores,
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
  }, [benchmark, benchmarkByModel, chatMessagesByModel, listTestResult, modelScores, selectedModel]);

  useEffect(() => {
    if (!isDesktopRuntime) return;
    void agentArcadeApi.syncScores({ scores: modelScores, chosen: selectedModel } as Record<string, unknown>);
  }, [modelScores, selectedModel]);

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
    let cancelled = false;
    const apply = (status: BenchmarkStatus | undefined) => {
      if (!cancelled) setExternalBenchmark(status?.running ? status : null);
    };
    agentArcadeApi.getActiveBenchmark().then(apply).catch(() => {});
    const off = agentArcadeApi.onBenchmarkStatus?.(apply);
    return () => { cancelled = true; off?.(); };
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
    if (queuedRows.length > 0 && !isPullingModels && !isPullPaused && ollama.ready) {
      void pullQueuedModels();
    }
  }, [isPullPaused, isPullingModels, ollama.ready, pullQueuedModels, queuedRows.length]);

  const prevTopScoreRef = useRef<number | null>(null);
  useEffect(() => {
    const score = topRigPick?.score?.total ?? null;
    const prev = prevTopScoreRef.current;
    if (score !== null && score !== prev) {
      if (prev !== null && score > prev) {
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
  const showGlobalLineup = uiMode === 'advanced' && activeNavId !== 'speedDate';

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
          onSaveGoals={(goals) => {
            writeSelectedGoals(goals);
            setSelectedGoals(goals);
            markGoalsOffered();
            setFirstRun('none');
          }}
          onCancel={() => { markGoalsOffered(); setFirstRun('none'); }}
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
          system={system}
          ollamaReady={ollama.ready || lmStudio.ready}
          isScanning={isScanningRig}
          onCheckComputer={refreshRig}
          onGetOllama={openOllamaDownload}
          ollamaInstallProgress={ollamaInstallProgress}
          onStartOllamaInstall={startOllamaInstall}
          onLaunchOllamaInstaller={launchOllamaInstaller}
          wizardModels={wizardModels}
          initialDream={dreamForGoal(selectedGoals[0])}
          notice={simpleNotice}
          onDismissNotice={() => setSimpleNotice(null)}
          modelsLoading={modelRows.length === 0}
          shortlistIds={shortlistIds}
          shortlistedRows={shortlistedRows}
          onTogglePick={toggleShortlist}
          onChooseForMe={chooseShortlistForMe}
          pullProgressByModel={pullProgressByModel}
          onStartDownloads={() => requestThirdPartyModelDownloads(shortlistedRows)}
          onCancelDownloads={cancelDownloadQueue}
          isListTesting={isListTesting}
          benchmarkActive={isListTesting || isBenchmarking || runProgress?.phase === 'running' || Boolean(externalBenchmark?.running)}
          runProgress={runProgress}
          onStartShow={() => { void runListTest(); }}
          onStopShow={requestStopRun}
          winner={wizardWinner}
          lineupResults={wizardLineupResults}
          generation={generationSummary}
          onChatWithWinner={openChatWithWinner}
          onOpenScorecard={() => { setCameFromSimple(true); selectUiMode('advanced'); selectNav('history'); }}
          onRunAgain={() => undefined}
          onSwitchToAdvanced={() => { setCameFromSimple(false); selectUiMode('advanced'); }}
          initialStep={wizardStep}
          onStepChange={(next) => { setWizardStep(next); setSimpleNotice(null); }}
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
        deckExpanded={deckExpanded}
        onDeckExpandedChange={(expanded) => { setDeckExpanded(expanded); writeDeckExpanded(expanded); }}
      />

      <SideMenu
        items={visibleNavItems}
        ollamaReady={ollama.ready || lmStudio.ready}
        modelCount={modelRows.length}
        shortlistCount={shortlistedRows.length}
        newModelDropCount={modelNews.latestNewModelIds.length}
        isRunning={isBenchmarking || isListTesting}
        activeId={activeNavId}
        scoredCount={scoredModelCount}
        topPickMeta={topRigPick?.score ? topRigPick.score.grade : (scoredModelCount > 0 ? 'Ready' : 'Wait')}
        uiMode={uiMode}
        onSelect={selectNav}
        onOpenTutorial={() => { setTutorialOpen(true); setTutorialStep(0); }}
        onOpenSupport={() => setSupportModalOpen(true)}
        bugReportUrl={buildBugReportUrl(system, ollama, logPath)}
      />

      <main className="stage-content">
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
            active={true}
            rows={modelRows}
            comfyFolderSet={Boolean(comfySettings.folder)}
            goalLens={taskFilterForGoal(selectedGoals[0])}
            onOpenLab={() => selectNav('activity')}
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
            onOpenModel={(model) => { setSelectedModel(model); selectNav('models'); }}
          />
        )}
        {activeNavId === 'speedDate' && (
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
          canSendAudio={chatSupportsAudio}
          pendingAttachment={chatAttachment}
          onAttach={setChatAttachment}
          availableModels={modelRows.filter((row) => row.installed).map((row) => row.displayName)}
          onModelChange={setSelectedModel}
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
          goalPresetId={presetIdForGoal(selectedGoals[0])}
          goalDesire={selectedGoals[0] ? goalById(selectedGoals[0])?.desire.toLowerCase() : undefined}
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
          comfyTextEncoders={comfyTextEncoders}
        />
      )}

      {pendingQuickCheck && (
        <QuickCheckWarningModal
          row={pendingQuickCheck}
          questionCount={QUICK_CHECK_QUESTIONS.length}
          onCancel={() => { setPendingQuickCheck(null); setActivity('Quick test cancelled before resources were engaged.'); }}
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

function FirstRunTutorial({
  stepIndex,
  installedCount,
  modelCount,
  ollamaReady,
  ollamaVersion,
  lmStudioReady,
  lmStudioCount,
  onStepChange,
  onClose,
  onSelectNav,
}: {
  stepIndex: number;
  installedCount: number;
  modelCount: number;
  ollamaReady: boolean;
  ollamaVersion: string | null;
  lmStudioReady: boolean;
  lmStudioCount: number;
  onStepChange: (stepIndex: number) => void;
  onClose: () => void;
  onSelectNav: (id: NavId) => void;
}) {
  const localProviderReady = ollamaReady || lmStudioReady;
  const providerSummary = ollamaReady && lmStudioReady
    ? `Ollama + LM Studio ready · ${installedCount} local models`
    : lmStudioReady
      ? `LM Studio ready · ${lmStudioCount} local model${lmStudioCount === 1 ? '' : 's'}`
      : ollamaReady
        ? `Ollama ready${ollamaVersion ? ` · v${ollamaVersion}` : ''}${installedCount > 0 ? ` · ${installedCount} installed` : ''}`
        : 'No local AI provider detected yet';
  const steps: Array<{ round: string; title: string; body: ReactNode; prize: string; navId: NavId; hidden?: boolean }> = [
    {
      round: '👋 Welcome',
      title: 'Find the best local AI for this computer',
      body: (
        <div className="tutorial-welcome-screen">
          <p className="tutorial-intro-lead">
            RigMatch tests local models through Ollama or LM Studio, measures speed and answer quality on this computer, then recommends the best fit for your hardware.
          </p>
          <div className={`tutorial-status-strip ${localProviderReady ? 'ready' : 'offline'}`}>
            {localProviderReady ? (
              <><CheckCircle aria-hidden="true" /> {providerSummary}{modelCount > 0 ? ` · ${modelCount} in catalog` : ''}</>
            ) : (
              <><AlertCircle aria-hidden="true" /> No local test engine detected — start Ollama or LM Studio local server.</>
            )}
          </div>
          {/* No how-it-works cards here: "The Show" panel explains the same
              three beats in the show's own voice. Saying it twice in one
              tutorial was reviewer feedback #1 — every panel earns its text. */}
        </div>
      ),
      prize: 'Everything runs on this computer. No cloud, no account, no subscription.',
      navId: 'models' as NavId,
    },
    {
      round: '🔧 Setup',
      // When a provider is already running there is nothing to set up: the panel
      // only repeated the readiness strip from Welcome in a second layout
      // (reviewer feedback — "saying Ollama is ready, repeated on multiple
      // tabs"). It now only exists when there is actual setup to do.
      hidden: localProviderReady,
      title: 'Connect a local AI provider to test models',
      body: (
        <div className="tutorial-intro-body">
          <div className="tutorial-ollama-status offline">
            <AlertCircle aria-hidden="true" />
            Ollama not detected
          </div>
          <p className="tutorial-intro-lead">RigMatch can test through Ollama or LM Studio's local server. Ollama is still required for one-click catalog downloads.</p>
          <p>If your models are only in LM Studio, start LM Studio's local server and click <strong>Check Local</strong>. RigMatch will list those local models for testing and chat.</p>
          <div className="tutorial-install-steps">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.open('https://ollama.ai', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink aria-hidden="true" />
              Download Ollama free at ollama.ai
            </button>
            <p>After installing, <strong>start Ollama</strong>, then re-open RigMatch. The status above will turn green.</p>
          </div>
        </div>
      ),
      prize: 'Connect Ollama or start LM Studio local server, then check again.',
      navId: 'lan' as NavId,
    },
    {
      round: '🎬 The Show',
      title: 'The AI Dating Show — on your PC',
      body: (
        <div className="tutorial-intro-body">
          <div className="tutorial-welcome-hero">
            <p className="tutorial-intro-lead">
              There are hundreds of AI models out there — and the one that feels <em>magical</em> on someone else's computer might crawl on yours.<br /><br />
              RigMatch helps you find <strong>your</strong> perfect match. And it does it like a <strong>gameshow</strong>. 🎬
            </p>
          </div>
          <div className="tutorial-show-format">
            <div className="show-format-step">
              <span>🎤</span>
              <div><strong>Auditions</strong><em>Browse hundreds of AI models. We flag which ones your rig can actually handle.</em></div>
            </div>
            <div className="show-format-step">
              <span>⚡</span>
              <div><strong>Speed Dating</strong><em>Pick up to 5 contestants. We run them through the same questions and time every answer.</em></div>
            </div>
            <div className="show-format-step">
              <span>🏆</span>
              <div><strong>The Final Rose</strong><em>Scorecards rank every model by answer quality, speed, finish rate, and computer fit — one walks away as your Top Match.</em></div>
            </div>
          </div>
          <div className="tutorial-intro-callout">
            🎯 Everything runs <strong>on this computer</strong>. No cloud, no subscription, no data leaving your machine.
          </div>
        </div>
      ),
      prize: "Let's find your perfect local AI match.",
      navId: 'models' as NavId,
    },
    {
      round: '🤔 Meet AI',
      title: 'Meet your AI',
      body: (
        <div className="tutorial-intro-body">
          <p className="tutorial-intro-lead">You know how ChatGPT seems to <em>"just know"</em> almost everything? That's an <strong>LLM</strong> — a Large Language Model.</p>
          <p>It's a program trained on billions of pages of text — books, code, articles, conversations. It learned patterns in language so it can write, explain, translate, code, and brainstorm.</p>
          <div className="tutorial-intro-callout">
            💡 Think of it like a really well-read friend who never gets tired of your questions — and never judges you for asking the same thing twice.
          </div>
        </div>
      ),
      prize: 'LLM = Large Language Model. The brain behind the chat.',
      navId: 'models' as NavId,
    },
  ];
  // Drop panels with nothing to say (e.g. Setup when a provider is already
  // running) instead of rendering them as filler. The rail renumbers itself.
  const visibleSteps = steps.filter((entry) => !entry.hidden);
  const currentIndex = Math.min(Math.max(stepIndex, 0), visibleSteps.length - 1);
  const step = visibleSteps[currentIndex];
  const isLastStep = currentIndex === visibleSteps.length - 1;

  // The only role="dialog" in the app that did not do this. It is the FIRST
  // thing on screen at first run, behind a full-viewport scrim: focus stayed on
  // <body>, Escape did nothing, and reaching its own Next button meant tabbing
  // through the entire dimmed app behind it.
  const tutorialRef = useDialog<HTMLElement>(onClose);

  const goToStep = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), visibleSteps.length - 1);
    onStepChange(boundedIndex);
    onSelectNav(visibleSteps[boundedIndex].navId);
  };

  return (
    <div className="tutorial-backdrop" role="presentation">
      <section
        ref={tutorialRef}
        className="tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
      >
        <div className="tutorial-title">
          <div className="tutorial-badge" aria-hidden="true">
            <Trophy />
          </div>
          <div>
            <span>{step.round}</span>
            <strong id="tutorial-title">{step.title}</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="tutorial-body">
          {typeof step.body === 'string' ? <p>{step.body}</p> : step.body}
          <div className="tutorial-prize">
            <span>Quick Note</span>
            <strong>{step.prize}</strong>
          </div>
          <ol className="tutorial-steps" aria-label="Tutorial progress">
            {visibleSteps.map((tutorialStep, index) => (
              <li key={tutorialStep.round} className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''}>
                <button type="button" onClick={() => goToStep(index)}>
                  <span>{index + 1}</span>
                  <strong>{tutorialStep.title}</strong>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="tutorial-actions">
          <button type="button" className="mini-button outline" onClick={() => goToStep(currentIndex - 1)} disabled={currentIndex === 0}>
            Back
          </button>
          {isLastStep ? (
            <button type="button" className="primary-button compact" onClick={() => { onSelectNav('models'); onClose(); }}>
              <Trophy aria-hidden="true" />
              Start Matching
            </button>
          ) : (
            <button type="button" className="primary-button compact" onClick={() => goToStep(currentIndex + 1)}>
              Next
            </button>
          )}
          <button type="button" className="quiet-link" onClick={onClose}>
            Skip tour
          </button>
        </div>
      </section>
    </div>
  );
}

type UpgradeCard = {
  name: string;
  category: 'GPU' | 'RAM' | 'System';
  spec: string;
  priceRange: string;
  benefit: string;
  searchQuery: string;
};

function getUpgradeRecommendations(system: SystemProfile): UpgradeCard[] {
  const vram = system.gpu.vramGb ?? 0;
  const vendor = (system.gpu.vendor ?? '').toLowerCase();
  const totalRamGb = system.memory.totalGb ?? 0;
  const isAppleSilicon = vendor.includes('apple') || (system.platform === 'darwin' && vram === 0);

  if (isAppleSilicon) {
    if (totalRamGb < 18) {
      return [{
        name: 'MacBook Pro M3 Pro / M4 Pro',
        category: 'System',
        spec: '18–36 GB unified',
        priceRange: 'from ~$1,999',
        benefit: 'Unified memory architecture runs 13B models smoothly without a discrete GPU',
        searchQuery: 'MacBook Pro M3 Pro 18GB',
      }];
    }
    return [];
  }

  const cards: UpgradeCard[] = [];

  if (vram <= 2) {
    cards.push(
      {
        name: 'NVIDIA RTX 4060',
        category: 'GPU',
        spec: '8 GB VRAM',
        priceRange: '~$300',
        benefit: 'Run 7B models on the GPU — dramatically faster than CPU-only inference',
        searchQuery: 'NVIDIA GeForce RTX 4060 graphics card',
      },
      {
        name: 'NVIDIA RTX 4060 Ti',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$450',
        benefit: 'Run 7B–13B models comfortably, plus quantized 30B variants',
        searchQuery: 'NVIDIA GeForce RTX 4060 Ti 16GB graphics card',
      },
    );
  } else if (vram <= 6) {
    cards.push(
      {
        name: 'NVIDIA RTX 4060',
        category: 'GPU',
        spec: '8 GB VRAM',
        priceRange: '~$300',
        benefit: 'Full 7B model support — the entry point for comfortable local AI',
        searchQuery: 'NVIDIA GeForce RTX 4060 graphics card',
      },
      {
        name: 'NVIDIA RTX 4060 Ti',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$450',
        benefit: 'Run 13B models and larger quantized variants without breaking a sweat',
        searchQuery: 'NVIDIA GeForce RTX 4060 Ti 16GB graphics card',
      },
    );
  } else if (vram <= 10) {
    cards.push(
      {
        name: 'NVIDIA RTX 4060 Ti',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$450',
        benefit: 'Doubles your VRAM — unlocks 13B models and quantized 30B variants',
        searchQuery: 'NVIDIA GeForce RTX 4060 Ti 16GB graphics card',
      },
      {
        name: 'NVIDIA RTX 4090',
        category: 'GPU',
        spec: '24 GB VRAM',
        priceRange: '~$1,800',
        benefit: 'Top consumer GPU — runs 70B models with full quantization support',
        searchQuery: 'NVIDIA GeForce RTX 4090 graphics card',
      },
    );
  } else if (vram <= 14) {
    cards.push(
      {
        name: 'NVIDIA RTX 4070 Ti Super',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$800',
        benefit: 'Adds 4 GB VRAM — opens larger 13B variants and quantized 30B models',
        searchQuery: 'NVIDIA GeForce RTX 4070 Ti Super graphics card',
      },
      {
        name: 'NVIDIA RTX 4090',
        category: 'GPU',
        spec: '24 GB VRAM',
        priceRange: '~$1,800',
        benefit: 'Doubles your VRAM — full 70B model access on consumer hardware',
        searchQuery: 'NVIDIA GeForce RTX 4090 graphics card',
      },
    );
  } else if (vram <= 20) {
    cards.push({
      name: 'NVIDIA RTX 4090',
      category: 'GPU',
      spec: '24 GB VRAM',
      priceRange: '~$1,800',
      benefit: 'Unlocks 70B models — the biggest single jump on consumer hardware',
      searchQuery: 'NVIDIA GeForce RTX 4090 graphics card',
    });
  }

  if (cards.length === 0 && totalRamGb < 32) {
    cards.push({
      name: '32 GB DDR5 RAM Kit',
      category: 'RAM',
      spec: '32 GB system RAM',
      priceRange: '~$80–120',
      benefit: 'More RAM helps CPU-offloaded model layers and keeps the system stable under load',
      searchQuery: '32GB DDR5 RAM desktop kit',
    });
  }

  return cards;
}

type TurnkeySystem = {
  name: string;
  spec: string;
  priceRange: string;
  benefit: string;
  searchQuery: string;
};

const TURNKEY_SYSTEMS: TurnkeySystem[] = [
  {
    name: 'Apple Mac Studio (M4 Max)',
    spec: '36–128 GB unified memory',
    priceRange: 'from ~$1,999',
    benefit: 'Unified memory means every GB counts for AI — a 36 GB M4 Max runs 30B models with headroom to spare, silently, without a separate GPU',
    searchQuery: 'Apple Mac Studio M4 Max',
  },
  {
    name: 'CyberpowerPC Gamer Xtreme',
    spec: 'RTX 4070 Ti · 16 GB VRAM',
    priceRange: 'from ~$1,499',
    benefit: 'Pre-built Windows AI rig — 16 GB VRAM handles 13B models comfortably, plug-and-play, ready for Ollama out of the box',
    searchQuery: 'CyberpowerPC gaming desktop RTX 4070 Ti 16GB',
  },
];

function UpgradeRig({ system }: { system: SystemProfile }) {
  const cards = getUpgradeRecommendations(system);
  const vendor = (system.gpu.vendor ?? '').toLowerCase();
  const isAppleSilicon = vendor.includes('apple') || (system.platform === 'darwin' && (system.gpu.vramGb ?? 0) === 0);
  const showTurnkey = !isAppleSilicon;

  if (cards.length === 0 && !showTurnkey) return null;

  const currentSpec = system.gpu.vramGb
    ? `${system.gpu.vramGb} GB VRAM · ${system.gpu.model}`
    : `${Math.round(system.memory.totalGb)} GB RAM · No discrete GPU`;

  return (
    <div className="upgrade-rig-panel">
      <div className="upgrade-rig-heading">
        <Zap aria-hidden="true" />
        <div>
          <span>Upgrade path</span>
          <strong>Unlock more models</strong>
        </div>
      </div>
      {/* Disclosure sits ABOVE the offers, not after them — a reader should know
          these are affiliate links before they read the recommendations, not
          after. Especially here, where the app has just scored their hardware. */}
      <p className="upgrade-disclosure">
        Affiliate links — purchases support RigMatch at no extra cost to you. Your hardware
        score is calculated from your specs alone and is not affected by these.
      </p>
      {cards.length > 0 && (
        <>
          <p className="upgrade-rig-intro">
            Your rig: <strong>{currentSpec}</strong>. Here {cards.length === 1 ? 'is the next upgrade' : `are ${cards.length} upgrades`} that open more models.
          </p>
          <div className="upgrade-cards">
            {cards.map((card) => (
              <div key={card.name} className="upgrade-card">
                <div className="upgrade-card-head">
                  <span className={`upgrade-card-category category-${card.category.toLowerCase()}`}>{card.category}</span>
                  <strong>{card.name}</strong>
                  <div className="upgrade-card-meta">
                    <span className="upgrade-card-spec">{card.spec}</span>
                    <span className="upgrade-card-price">{card.priceRange}</span>
                  </div>
                </div>
                <p className="upgrade-card-benefit">{card.benefit}</p>
                <a
                  href={amazonUrl(card.searchQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="amazon-buy-btn"
                  aria-label={`Search for ${card.name} on Amazon`}
                >
                  <ShoppingCart aria-hidden="true" />
                  View on Amazon
                  <ExternalLink aria-hidden="true" className="amazon-ext-icon" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
      {showTurnkey && (
        <>
          <p className="upgrade-rig-intro upgrade-turnkey-intro">
            Or skip the upgrade path — these turnkey systems are built for local AI from day one:
          </p>
          <div className="upgrade-cards">
            {TURNKEY_SYSTEMS.map((sys) => (
              <div key={sys.name} className="upgrade-card upgrade-card-turnkey">
                <div className="upgrade-card-head">
                  <span className="upgrade-card-category category-system">System</span>
                  <strong>{sys.name}</strong>
                  <div className="upgrade-card-meta">
                    <span className="upgrade-card-spec">{sys.spec}</span>
                    <span className="upgrade-card-price">{sys.priceRange}</span>
                  </div>
                </div>
                <p className="upgrade-card-benefit">{sys.benefit}</p>
                <a
                  href={amazonUrl(sys.searchQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="amazon-buy-btn"
                  aria-label={`Search for ${sys.name} on Amazon`}
                >
                  <ShoppingCart aria-hidden="true" />
                  View on Amazon
                  <ExternalLink aria-hidden="true" className="amazon-ext-icon" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LanBrowser({
  active,
  system,
  ollama,
  lmStudio,
  hosts,
  modelCount,
  selectedHostId,
  isScanning,
  onScan,
  onSelect,
  onInstallOllama,
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
  onScanRig,
  onOpenSetupGuide,
}: {
  active: boolean;
  system: SystemProfile;
  ollama: OllamaStatus;
  lmStudio: OllamaStatus;
  hosts: NetworkHost[];
  modelCount: number;
  selectedHostId: string;
  isScanning: boolean;
  onScan: () => void;
  onSelect: (id: string) => void;
  onInstallOllama: () => void;
  ollamaInstallProgress: OllamaInstallProgress;
  onStartOllamaInstall: () => void;
  onLaunchOllamaInstaller: (path: string) => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const hostMeta = ollama.ready || lmStudio.ready ? 'Local AI ready' : 'Local AI offline';
  const localFallbackHost: NetworkHost = {
    id: 'localhost-preview',
    hostname: `${system.hostname} (This Machine)`,
    ip: system.networks[0]?.address ?? '127.0.0.1',
    provider: 'Ollama',
    version: ollama.version ?? undefined,
    models: ollama.models.length,
    status: ollama.ready ? 'Ready' : 'Offline',
    pingMs: ollama.pingMs,
    baseUrl: ollama.baseUrl,
    isLocal: true,
    isDemo: !isDesktopRuntime,
  };
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0] ?? localFallbackHost;
  const singleHost = hosts.length <= 1;
  const panelClassName = [
    'panel',
    'lan-panel',
    active ? 'panel-focused' : '',
    singleHost ? 'single-host' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className={panelClassName}>
      <PanelHeader
        icon={Network}
        title="Your Rig"
        actionLabel={isScanning ? 'Checking' : 'Check Local'}
        onAction={onScan}
        busy={isScanning}
        meta={hostMeta}
      />
      <RomanceArtBanner
        image={robotRigGreenroom}
        className="rig-art-banner"
        kicker="Rig profile"
        title="This computer is getting ready for a match"
        body={`${system.gpu.vramGb ? `${formatGb(system.gpu.vramGb)} VRAM` : `${formatGb(system.memory.totalGb)} RAM`} helps RigMatch keep model suggestions realistic.`}
      />
      <OllamaPrep
        system={system}
        ollama={ollama}
        onInstallOllama={onInstallOllama}
        ollamaInstallProgress={ollamaInstallProgress}
        onStartOllamaInstall={onStartOllamaInstall}
        onLaunchOllamaInstaller={onLaunchOllamaInstaller}
        onScanRig={onScanRig}
        onOpenSetupGuide={onOpenSetupGuide}
      />
      <SetupDoctor
        ollama={ollama}
        hosts={hosts}
        modelCount={modelCount}
        system={system}
        onCheckComputer={onScanRig}
        onOpenSetupGuide={onOpenSetupGuide}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>IP Address</th>
              <th>Provider</th>
              <th>Models</th>
              <th>Status</th>
              <th>Ping</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((host) => (
              <tr
                key={host.id}
                className={`${host.id === selectedHostId ? 'selected' : ''}${host.isDemo ? ' sample-row' : ''}${host.discovery === 'computer' ? ' computer-row' : ''}`}
                onClick={() => onSelect(host.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(host.id);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <div className="host-name-cell">
                    <MachineAvatar host={host} size="tiny" />
                    <span>{host.hostname}</span>
                    {host.isDemo && <em>Sample</em>}
                  </div>
                </td>
                <td>{host.ip}</td>
                <td>{host.isDemo ? 'Preview' : host.provider}</td>
                <td>{host.discovery === 'computer' ? '--' : host.models}</td>
                <td className={host.isDemo || host.discovery === 'computer' ? 'status-gold' : 'status-good'}>
                  {host.isDemo ? 'Sample' : host.status}
                </td>
                <td>{host.isDemo ? 'demo' : `${host.pingMs ?? '?'} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RigDetailsPanel
        host={selectedHost}
        system={system}
        ollama={ollama}
      />
      <div className="utility-stat">
        <span>Provider support</span>
        <strong>Ollama downloads; LM Studio tests</strong>
        <em>RigMatch detects LM Studio's local server for testing and chat. Catalog downloads still go through Ollama.</em>
      </div>
      <ThirdPartyModelNotice compact />
      <UpgradeRig system={system} />
    </section>
  );
}

function SetupDoctor({
  ollama,
  hosts,
  modelCount,
  system,
  onCheckComputer,
  onOpenSetupGuide,
}: {
  ollama: OllamaStatus;
  hosts: NetworkHost[];
  modelCount: number;
  system: SystemProfile;
  onCheckComputer: () => void;
  onOpenSetupGuide: () => void;
}) {
  const localHostCount = hosts.filter((host) => host.isLocal || host.ip === '127.0.0.1').length;
  const doctorRows = [
    {
      label: 'Desktop App',
      value: isDesktopRuntime ? 'Ready' : 'Preview',
      detail: isDesktopRuntime ? 'The Electron bridge can check local Ollama and hardware.' : 'Sample data is loaded in browser preview.',
      tone: isDesktopRuntime ? 'ready' : 'info',
      action: null,
    },
    {
      label: 'Ollama Service',
      value: ollama.ready ? 'Running' : 'Needs setup',
      detail: ollama.ready ? `${ollama.models.length} installed model${ollama.models.length === 1 ? '' : 's'} visible.` : 'Install or start Ollama, then check again.',
      tone: ollama.ready ? 'ready' : 'warn',
      action: ollama.ready ? null : { label: 'Setup', onClick: onOpenSetupGuide },
    },
    {
      label: 'Model Pool',
      value: ollama.models.length > 0 ? 'Contestants ready' : 'No local models',
      detail: ollama.models.length > 0 ? `${modelCount} model${modelCount === 1 ? '' : 's'} in the model pool.` : 'Download one model before the first compatibility test.',
      tone: ollama.models.length > 0 ? 'ready' : 'warn',
      action: ollama.models.length > 0 ? null : { label: 'Check', onClick: onCheckComputer },
    },
    {
      label: 'Computer Fit',
      value: system.gpu.vramGb ? `${system.gpu.vramGb} GB VRAM` : `${system.memory.totalGb} GB RAM`,
      detail: system.gpu.vramGb ? 'RigMatch can estimate VRAM-safe matches.' : 'RigMatch will favor smaller local models.',
      tone: 'ready',
      action: null,
    },
    {
      label: 'Scope',
      value: localHostCount > 0 ? 'Local only' : 'Local setup',
      detail: 'Remote systems are parked for RigMatch 2.0 so v1 stays simple and reliable.',
      tone: 'info',
      action: null,
    },
  ];

  return (
    <section className="setup-doctor" aria-label="Setup Doctor">
      <div className="setup-doctor-head">
        <div>
          <span>Setup Doctor</span>
          <strong>{ollama.ready ? 'Ready for local model tests' : 'One setup step before the show starts'}</strong>
        </div>
        <button type="button" className="mini-button outline" onClick={onOpenSetupGuide}>
          <ExternalLink aria-hidden="true" />
          Guide
        </button>
      </div>
      <div className="setup-doctor-grid">
        {doctorRows.map((row) => (
          <div key={row.label} className={`doctor-card ${row.tone}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <em>{row.detail}</em>
            {row.action && (
              <button type="button" className="mini-button outline" onClick={row.action.onClick}>
                {row.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RigDetailsPanel({
  host,
  system,
  ollama,
}: {
  host?: NetworkHost;
  system: SystemProfile;
  ollama: OllamaStatus;
}) {
  if (!host) {
    return (
      <div className="rig-details-panel empty">
        <strong>No computer selected</strong>
        <span>Check this computer to inspect the local Ollama setup.</span>
      </div>
    );
  }

  const cards = host.isLocal || host.ip === '127.0.0.1'
    ? getLocalRigDetailCards(host, system, ollama)
    : getRemoteRigDetailCards(host);

  return (
    <div className="rig-details-panel" aria-label="Selected computer details">
      <div className="rig-details-head">
        <MachineAvatar host={host} size="small" />
        <div>
          <span>Selected Computer</span>
          <strong>{host.hostname}</strong>
        </div>
        <em>
          {host.isLocal
            ? 'Full local profile'
            : host.discovery === 'computer'
              ? 'Remote systems are planned for RigMatch 2.0'
              : 'Remote systems are planned for RigMatch 2.0'}
        </em>
      </div>
      <div className="rig-details-grid">
        {cards.map((card) => (
          <div key={card.label} title={`${card.label}: ${card.value}. ${card.detail}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <em>{card.detail}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function OllamaPrep({
  system,
  ollama,
  onInstallOllama,
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
  onScanRig,
  onOpenSetupGuide,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  onInstallOllama: () => void;
  ollamaInstallProgress: OllamaInstallProgress;
  onStartOllamaInstall: () => void;
  onLaunchOllamaInstaller: (path: string) => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const platformName = getPlatformName(system.platform);
  const ready = ollama.ready;
  // A copy button that silently does nothing is worse than no button.
  const [commandCopy, setCommandCopy] = useState<CopyState>('idle');

  // Ready state — compact success strip
  if (ready || !isDesktopRuntime) {
    const prepTitle = isDesktopRuntime ? `${platformName} ready` : 'Preview sample data';
    const prepMessage = isDesktopRuntime
      ? 'This computer is ready. Tests run through local Ollama on this machine.'
      : 'Preview sample data is local-only. The desktop app checks your real Ollama install.';
    return (
      <div className="ollama-prep ready">
        <div className="prep-badge" aria-hidden="true"><ShieldCheck /></div>
        <div className="prep-copy">
          <span>Local AI Setup</span>
          <strong>{prepTitle}</strong>
          <em>{prepMessage}</em>
        </div>
        <div className="prep-actions">
          <button type="button" className="mini-button outline" onClick={onScanRig}>
            <RefreshCw aria-hidden="true" />
            Check Again
          </button>
        </div>
      </div>
    );
  }

  // Not-ready state — full install hero for first-timers
  const ip = ollamaInstallProgress;
  const isLinux = system.platform === 'linux';
  const isDownloading = ip.phase === 'downloading';
  const isReady = ip.phase === 'ready';
  const isScript = ip.phase === 'script';
  const hasError = ip.phase === 'error';

  return (
    <div className="ollama-install-hero">
      <div className="install-hero-top">
        <div className="install-hero-icon" aria-hidden="true"><Download /></div>
        <div className="install-hero-copy">
          <span>Current test engine</span>
          <strong>Connect a local engine to test models</strong>
          <p>
            RigMatch can benchmark through <strong>Ollama</strong> or <strong>LM Studio</strong> when its local server is running. Ollama is still the download path for catalog models.
            {isLinux
              ? ' If Ollama is not installed, run the one-line install command below.'
              : ' If Ollama is not installed, download and run the installer below.'}
          </p>
        </div>
      </div>

      {isScript && 'command' in ip ? (
        <div className="install-script-block">
          <code className="install-script-cmd">{ip.command}</code>
          <button
            type="button"
            className="mini-button outline"
            onClick={() => void copyText(ip.command).then((ok) => {
              setCommandCopy(ok ? 'copied' : 'failed');
              window.setTimeout(() => setCommandCopy('idle'), 2400);
            })}
          >
            {commandCopy === 'copied' ? 'Copied' : commandCopy === 'failed' ? 'Select it above' : 'Copy'}
          </button>
          <p className="install-script-hint">Open a terminal, paste, and press Enter. Then click Check Again below.</p>
        </div>
      ) : isReady && 'installerPath' in ip ? (
        <button type="button" className="install-ollama-btn ready" onClick={() => onLaunchOllamaInstaller(ip.installerPath)}>
          <Download aria-hidden="true" />
          Launch Installer
        </button>
      ) : isDownloading && 'percent' in ip ? (
        <div className="install-progress-bar">
          <div className="install-progress-fill" style={{ width: `${ip.percent}%` }} />
          <span>Downloading Ollama… {ip.percent}%</span>
        </div>
      ) : hasError && 'error' in ip ? (
        <div className="install-error-row">
          <span className="install-error-msg">{ip.error}</span>
          <button type="button" className="install-ollama-btn" onClick={isLinux ? onStartOllamaInstall : onStartOllamaInstall}>
            <Download aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : (
        <button type="button" className="install-ollama-btn" onClick={isDesktopRuntime ? onStartOllamaInstall : onInstallOllama}>
          <Download aria-hidden="true" />
          {isLinux ? 'Show Install Command' : `Download Ollama for ${platformName} — Free`}
          {!isDesktopRuntime && <ExternalLink aria-hidden="true" />}
        </button>
      )}

      {!isScript && !isDownloading && !isReady && (
        <ol className="install-steps-flow">
          <li className="install-step"><b>1</b>
            <span>{isLinux ? 'Click to reveal the install command' : 'Click above to download the Ollama installer'}</span>
          </li>
          <li className="install-step"><b>2</b>
            <span>{isLinux ? 'Open a terminal, paste the command, and press Enter' : 'Run the installer — Ollama starts automatically in the background'}</span>
          </li>
          <li className="install-step"><b>3</b>
            <span>Come back here and click <strong>Check Again</strong></span>
          </li>
        </ol>
      )}

      <div className="install-hero-footer">
        <button type="button" className="mini-button outline" onClick={onScanRig}>
          <RefreshCw aria-hidden="true" />
          Check Again
        </button>
        <button type="button" className="mini-button outline" onClick={onOpenSetupGuide}>
          <ExternalLink aria-hidden="true" />
          Full Setup Guide
        </button>
        <span className="install-hero-note">No account needed · Free forever · Works offline</span>
      </div>
    </div>
  );
}

function SetupGuideDock({
  system,
  onClose,
  onInstallOllama,
}: {
  system: SystemProfile;
  onClose: () => void;
  onInstallOllama: () => void;
}) {
  return (
    <aside className="setup-dock" aria-label="Ollama setup guide">
      <div className="setup-title">
        <div>
          <span>Setup Guide</span>
          <strong>Prepare this computer</strong>
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </button>
      </div>

      <div className="setup-grid">
        <section className="setup-card">
          <Download aria-hidden="true" />
          <div>
            <span>This machine</span>
            <strong>{getPlatformName(system.platform)} installer</strong>
            <p>Open Ollama, install it, then use Check Again. RigMatch looks for the local API on port 11434.</p>
            <button type="button" className="primary-button compact" onClick={onInstallOllama}>
              Official Download
            </button>
          </div>
        </section>

        <section className="setup-card">
          <Bot aria-hidden="true" />
          <div>
            <span>Local-only v1</span>
            <strong>Use the Ollama app on this computer</strong>
            <p>Remote machines are intentionally paused for RigMatch 2.0. For now, install models locally and test them against this hardware.</p>
            <code>http://127.0.0.1:11434</code>
          </div>
        </section>

        <section className="setup-card command-card">
          <Terminal aria-hidden="true" />
          <div>
            <span>Windows</span>
            <strong>Installer path</strong>
            <p>Install Ollama for Windows, keep it running in the tray, then Check Again.</p>
          </div>
        </section>

        <section className="setup-card command-card">
          <Terminal aria-hidden="true" />
          <div>
            <span>macOS</span>
            <strong>Apple Silicon ready</strong>
            <p>Install Ollama for macOS. Apple Silicon acceleration is handled by Ollama/Metal when the model supports it.</p>
          </div>
        </section>

        <section className="setup-card command-card">
          <Terminal aria-hidden="true" />
          <div>
            <span>Ubuntu/Linux</span>
            <strong>Official script</strong>
            <code>curl -fsSL https://ollama.com/install.sh | sh</code>
          </div>
        </section>
      </div>
    </aside>
  );
}

function QuickCheckWarningModal({
  row,
  questionCount,
  onCancel,
  onConfirm,
}: {
  row: ModelRow;
  questionCount: number;
  onCancel: () => void;
  onConfirm: (dontWarnAgain: boolean) => void;
}) {
  const quickCheckRef = useDialog<HTMLElement>(onCancel);
  const [dontWarnAgain, setDontWarnAgain] = useState(false);
  const sizeLabel = row.sizeGb ? `${formatGb(row.sizeGb)}` : 'its full weights';

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={quickCheckRef} className="run-warning-modal" role="dialog" aria-modal="true" aria-labelledby="quick-check-warning-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>Resource Warning</span>
            <strong id="quick-check-warning-title">Quick test {row.displayName}?</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            This loads <strong>{row.displayName}</strong> ({sizeLabel}) into VRAM and runs{' '}
            <strong>{questionCount} quick question{questionCount === 1 ? '' : 's'}</strong>. While it runs,
            your GPU, CPU, RAM, fans, and battery will work hard and other apps may slow down.
          </p>
          <p>A quick test takes about a minute. Use Speed Dating for the full comparison.</p>
          <label className="quick-check-optout">
            <input
              type="checkbox"
              checked={dontWarnAgain}
              onChange={(event) => setDontWarnAgain(event.target.checked)}
            />
            <span>Don't warn me before quick tests again</span>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="primary-button compact" onClick={() => onConfirm(dontWarnAgain)}>
            <Zap aria-hidden="true" />
            Start Quick Test
          </button>
        </div>
      </section>
    </div>
  );
}

function ClearScoresModal({
  pending,
  scoreCount,
  onCancel,
  onConfirm,
}: {
  pending: PendingScoreClear;
  scoreCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const clearScoresRef = useDialog<HTMLElement>(onCancel);
  const isAll = pending.mode === 'all';
  const title = isAll ? 'Clear All Scores?' : `Clear ${pending.model} Score?`;
  const actionLabel = isAll ? 'Clear All Scores' : 'Clear Score';

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={clearScoresRef} className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="clear-scores-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Score Cleanup</span>
            <strong id="clear-scores-title">{title}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            {isAll ? (
              <>
                This clears <strong>{scoreCount}</strong> saved score{scoreCount === 1 ? '' : 's'}, Speed Dating rankings,
                and test transcripts.
              </>
            ) : (
              <>
                This clears the saved scorecard and test transcript for <strong>{pending.model}</strong>.
              </>
            )}{' '}
            It does <strong>not</strong> delete any installed Ollama model.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Clears</span>
              <strong>{isAll ? 'Scores + transcripts' : 'One scorecard'}</strong>
              <em>{isAll ? 'All model match scores and comparison results reset.' : 'This model returns to an untested state.'}</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Ollama models</strong>
              <em>Downloaded model files are left alone.</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Questions + theme</strong>
              <em>Your test suite, UI settings, chat, and queue stay as-is.</em>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="danger-button compact" onClick={onConfirm}>
            <Trash2 aria-hidden="true" />
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}



const THIRD_PARTY_MODEL_LINKS = [
  { label: 'Ollama model library', href: 'https://ollama.com/library' },
  { label: 'Ollama terms', href: 'https://ollama.com/terms' },
  { label: 'Gemma terms', href: 'https://ai.google.dev/gemma/terms' },
  { label: 'Gemma prohibited use', href: 'https://ai.google.dev/gemma/prohibited_use_policy' },
  { label: 'Gemma 3 license', href: 'https://ai.google.dev/gemma/apache_2' },
] as const;

function ThirdPartyModelNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'third-party-model-notice compact' : 'third-party-model-notice'} aria-label="Third-party model notice">
      <div>
        <span>Third-party model notice</span>
        <strong>Models have their own terms</strong>
        <em>
          RigMatch benchmarks models through the user's configured local provider. Ollama handles catalog downloads, and LM Studio models can be tested when its local server is running.
          RigMatch does not bundle model weights, sell model access, or claim endorsement from model providers.
        </em>
      </div>
      {!compact && (
        <ul>
          <li>Review each provider's model license or terms before downloading, using, sharing, or redistributing model weights.</li>
          <li>Benchmark prompts and outputs are test artifacts. They may be inaccurate and are not legal, medical, financial, or safety advice.</li>
          <li>If RigMatch ever ships model weights directly, add the provider's required license, notice, and use-restriction files before release.</li>
        </ul>
      )}
      <div className="third-party-model-links">
        {THIRD_PARTY_MODEL_LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
            <ExternalLink aria-hidden="true" />
          </a>
        ))}
      </div>
    </section>
  );
}

function ThirdPartyDownloadConsentModal({
  rows,
  onCancel,
  onConfirm,
}: {
  rows: ModelRow[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const consentRef = useDialog<HTMLElement>(onCancel);
  const [accepted, setAccepted] = useState(false);
  const visibleRows = rows.slice(0, 5);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={consentRef} className="run-warning-modal third-party-download-modal" role="dialog" aria-modal="true" aria-labelledby="third-party-download-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>Third-party model download</span>
            <strong id="third-party-download-title">Review model terms first</strong>
          </div>
        </div>

        <div className="modal-body">
          <p>
            RigMatch will ask your local Ollama install to download <strong>{rows.length}</strong> third-party model
            {rows.length === 1 ? '' : 's'}. RigMatch does not bundle these model weights or control their provider terms.
          </p>

          <ol className="third-party-download-list" aria-label="Models queued for download">
            {visibleRows.map((row) => (
              <li key={row.id}>
                <span>{row.displayName}</span>
                <em>{row.sizeGb != null ? `${formatGb(row.sizeGb)} download` : 'Size unknown'}</em>
              </li>
            ))}
            {hiddenCount > 0 && (
              <li>
                <span>+{hiddenCount} more</span>
                <em>Review each model's provider terms if needed.</em>
              </li>
            )}
          </ol>

          {/* The terms for the models actually queued, not a fixed list. This
              dialog asks for informed consent; linking Gemma's prohibited-use
              policy while downloading DeepSeek is the opposite of informing. */}
          <div className="third-party-download-links" aria-label="Model provider terms">
            {licenseLinksForModels(rows.map((row) => row.displayName)).map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
                <ExternalLink aria-hidden="true" />
              </a>
            ))}
          </div>

          <label className="third-party-download-consent">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.currentTarget.checked)}
            />
            <span>I understand these models are provided by third parties and may be subject to separate licenses and use policies.</span>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="primary-button compact" onClick={onConfirm} disabled={!accepted}>
            <Download aria-hidden="true" />
            Download All
          </button>
        </div>
      </section>
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

// @ts-expect-error Retained prototype command deck is intentionally not mounted in the 0.1.x UI.
function _ContestantsCommandDeck({
  selectedRow,
  selectedScore,
  selectedInstalled,
  selectedQueued,
  selectedShortlisted,
  speedDateLineupFull,
  shortlistedRows,
  rigPick,
  diskGuard,
  queuedCount,
  isBenchmarking,
  isListTesting,
  isPulling,
  isPullCancelRequested,
  listTestResult,
  runProgress,
  questionCount,
  vramGb,
  onScoreModel,
  onQueueModel,
  onToggleShortlist,
  onOpenSuiteEditor,
  onOpenSpeedDate,
  onPullQueued,
  onCancelQueue,
  onOpenTopPick,
}: {
  selectedRow?: ModelRow;
  selectedScore?: TestedModelScore;
  selectedInstalled: boolean;
  selectedQueued: boolean;
  selectedShortlisted: boolean;
  speedDateLineupFull: boolean;
  shortlistedRows: ModelRow[];
  rigPick?: RigPick | null;
  diskGuard: ReturnType<typeof getDiskGuard>;
  queuedCount: number;
  isBenchmarking: boolean;
  isListTesting: boolean;
  isPulling: boolean;
  isPullCancelRequested: boolean;
  listTestResult: ListTestResult | null;
  runProgress: RunProgress | null;
  questionCount: BenchmarkQuestionCount;
  vramGb: number;
  onScoreModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSuiteEditor: () => void;
  onOpenSpeedDate: () => void;
  onPullQueued: () => void;
  onCancelQueue: () => void;
  onOpenTopPick: () => void;
}) {
  const selectedFit = selectedRow ? getHardwareFit(selectedRow, vramGb) : null;
  const canUseSelected = Boolean(selectedRow && selectedFit?.recommend);
  const canRunSelectedAction = Boolean(
    selectedRow
    && !isBenchmarking
    && !isListTesting
    && (selectedInstalled ? canUseSelected : selectedQueued || canUseSelected),
  );
  const selectedActionLabel = selectedInstalled
    ? 'Test Selected'
    : selectedQueued
      ? 'Remove Queue'
      : 'Get Model';
  const selectedStatus = selectedRow
    ? selectedInstalled
      ? selectedScore
        ? `${formatMatchScore(selectedScore)} Match · ${selectedScore.grade}. Retest when you want fresh proof.`
        : 'Installed and ready for a one-model test.'
      : selectedQueued
        ? 'Queued for download. Remove it here or clear the queue.'
        : selectedFit?.detail ?? 'Check this model before downloading.'
    : 'Pick a contestant from the table to test, download, or compare.';
  const speedProgress = runProgress?.mode === 'speed-date' ? runProgress : null;
  const speedWinner = listTestResult?.winner;
  const speedWinnerScore = speedWinner
    ? listTestResult?.results.find((result) => result.model === speedWinner)
    : null;
  const speedStatus = isListTesting && speedProgress
    ? `${speedProgress.percent}% · testing ${getQueueChipModelName(speedProgress.currentModel)}.`
    : speedWinner && speedWinnerScore
      ? `${speedWinner} leads with ${speedWinnerScore.total} Match.`
      : shortlistedRows.length >= MIN_CONTESTANTS
        ? `${shortlistedRows.length} contestants ready for ${questionCount} questions each.`
        : 'Pick at least two installed contestants for a fair comparison.';
  const downloadStatus = isPullCancelRequested
    ? 'Stopping after the current Ollama pull.'
    : isPulling
      ? 'Ollama pull is running. Stop Queue skips anything not started.'
      : queuedCount > 0
        ? `${queuedCount} queued · ${formatGb(diskGuard.queuedGb)} · ${formatGb(diskGuard.availableAfterQueue)} free after queue.`
        : 'Queue empty. Use Get Model on a contestant to stage a download.';
  const topPickStatus = rigPick
    ? rigPick.score
      ? `${rigPick.score.total} Match · ${rigPick.score.grade}.`
      : rigPick.reason
    : 'Run a test or Speed Dating to crown the best match.';

  const runSelectedAction = () => {
    if (!selectedRow) return;
    if (selectedInstalled) {
      onScoreModel(selectedRow);
      return;
    }

    onQueueModel(selectedRow);
  };

  return (
    <section className="contestants-command-deck" aria-label="Contestants command menu">
      <article className="contestants-command-card featured">
        <div className="command-card-head">
          <Gauge aria-hidden="true" />
          <span>Selected Test</span>
        </div>
        <strong>{selectedRow?.displayName ?? 'No contestant selected'}</strong>
        <em>{selectedStatus}</em>
        <div className="command-card-actions">
          <button
            type="button"
            className="primary-button compact"
            onClick={runSelectedAction}
            disabled={!canRunSelectedAction}
          >
            {selectedInstalled ? <Gauge aria-hidden="true" /> : selectedQueued ? <X aria-hidden="true" /> : <Download aria-hidden="true" />}
            {selectedActionLabel}
          </button>
          {(!speedDateLineupFull || selectedShortlisted) && (
            <button
              type="button"
              className={selectedShortlisted ? 'mini-button active-soft' : 'mini-button outline'}
              onClick={() => selectedRow && onToggleShortlist(selectedRow)}
              disabled={!selectedRow || isBenchmarking || isListTesting || (!selectedShortlisted && (!selectedInstalled || !canUseSelected))}
            >
              <Heart aria-hidden="true" />
              {selectedShortlisted ? 'Selected' : 'Add to Speed Dating'}
            </button>
          )}
        </div>
      </article>

      <article className="contestants-command-card">
        <div className="command-card-head">
          <Trophy aria-hidden="true" />
          <span>Speed Dating</span>
        </div>
        <strong>{shortlistedRows.length}/5 picked</strong>
        <em>{speedStatus}</em>
        <div className="command-card-actions">
          <button type="button" className="primary-button compact" onClick={onOpenSpeedDate}>
            <Trophy aria-hidden="true" />
            Open comparison
          </button>
          <button type="button" className="mini-button outline advanced-only" onClick={onOpenSuiteEditor} disabled={isListTesting}>
            <Settings aria-hidden="true" />
            Questions
          </button>
        </div>
      </article>

      <article className="contestants-command-card">
        <div className="command-card-head">
          <Download aria-hidden="true" />
          <span>Downloads</span>
        </div>
        <strong>{isPulling ? 'Downloading' : queuedCount > 0 ? `${queuedCount} queued` : 'Queue clear'}</strong>
        <em>{downloadStatus}</em>
        <div className="command-card-actions">
          <button
            type="button"
            className="primary-button compact"
            onClick={onPullQueued}
            disabled={queuedCount === 0 || isPulling}
          >
            <Download aria-hidden="true" />
            {queuedCount > 0 ? 'Start Download' : 'Download'}
          </button>
          <button
            type="button"
            className="mini-button outline queue-cancel-button"
            onClick={onCancelQueue}
            disabled={(queuedCount === 0 && !isPulling) || isPullCancelRequested}
          >
            <X aria-hidden="true" />
            {isPulling ? 'Stop Queue' : 'Cancel Queue'}
          </button>
        </div>
      </article>

      <article className="contestants-command-card">
        <div className="command-card-head">
          <Bot aria-hidden="true" />
          <span>Current Pick</span>
        </div>
        <strong>{rigPick?.row.displayName ?? 'No winner yet'}</strong>
        <em>{topPickStatus}</em>
        <div className="command-card-actions">
          <button type="button" className="mini-button outline" onClick={onOpenTopPick}>
            <Bot aria-hidden="true" />
            Top Pick
          </button>
        </div>
      </article>
    </section>
  );
}

function ModelPoolLineupStrip({
  className = '',
  rows,
  installedRows,
  modelScores,
  disabled,
  isListTesting,
  canRunSpeedDate,
  onRemove,
  onAdd,
  onRunListTest,
  onOpenSpeedDate,
}: {
  className?: string;
  rows: ModelRow[];
  installedRows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  disabled: boolean;
  isListTesting: boolean;
  canRunSpeedDate: boolean;
  onRemove: (row: ModelRow) => void;
  onAdd: (row: ModelRow) => void;
  onRunListTest: () => void;
  onOpenSpeedDate: () => void;
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const slots = Array.from({ length: 5 }, (_item, index) => rows[index]);
  const full = rows.length >= 5;
  const missingDownloadCount = rows.filter((row) => !row.installed).length;
  const canUsePrimaryAction = rows.length >= MIN_CONTESTANTS && !disabled;
  const classNames = ['model-pool-lineup', full ? 'full' : '', className].filter(Boolean).join(' ');
  const startLabel = isListTesting
    ? 'Testing...'
    : rows.length < MIN_CONTESTANTS
      ? `Pick ${Math.max(0, MIN_CONTESTANTS - rows.length)} more`
      : missingDownloadCount > 0
        ? 'Open Setup'
        : 'Start Speed Dating';
  const lineupStatus = rows.length < MIN_CONTESTANTS
    ? `Pick at least ${MIN_CONTESTANTS} contestants before the show starts.`
    : missingDownloadCount > 0
      ? `${countWithVerb(missingDownloadCount, 'contestant', 'needs', 'need')} downloading. Open setup to download the selected lineup.`
      : full
        ? 'Lineup full. Remove a contestant to swap.'
        : 'Ready. Add more or start the show.';

  return (
    <section className={classNames} aria-label="Speed Dating lineup">
      <div className="model-pool-lineup-head">
        <div>
          <span>Dating Game Setup</span>
          <strong>{rows.length}/5 contestants picked</strong>
          <em>{lineupStatus}</em>
        </div>
        <div className="lineup-head-actions">
          <button
            type="button"
            className="primary-button compact"
            onClick={canRunSpeedDate ? onRunListTest : onOpenSpeedDate}
            disabled={!canUsePrimaryAction}
            title={missingDownloadCount > 0 ? 'Open Speed Dating setup to download the selected lineup' : undefined}
          >
            <Trophy aria-hidden="true" />
            {startLabel}
          </button>
          <button type="button" className="mini-button outline" onClick={onOpenSpeedDate} title="Open the full Speed Dating setup">
            <ExternalLink aria-hidden="true" />
            Open
          </button>
        </div>
      </div>
      <div className="model-pool-lineup-slots">
        {slots.map((row, index) => {
          if (!row) {
            const isPickerOpen = pickerSlot === index;
            return (
              <div key={`empty-${index}`} className="model-pool-empty-slot-wrapper">
                <button
                  type="button"
                  className={`model-pool-empty-slot interactive${isPickerOpen ? ' picker-open' : ''}`}
                  onClick={() => setPickerSlot(isPickerOpen ? null : index)}
                  disabled={disabled || full}
                  aria-label="Add contestant to Speed Dating lineup"
                  aria-expanded={isPickerOpen}
                >
                  <Plus aria-hidden="true" />
                  <strong>Add</strong>
                </button>
                {isPickerOpen && (
                  <>
                    <div
                      className="picker-backdrop"
                      role="presentation"
                      onClick={() => setPickerSlot(null)}
                    />
                    <div className="model-picker-popover" role="listbox" aria-label="Choose a model">
                      <div className="picker-header">
                        <span>Pick a model</span>
                      </div>
                      {installedRows.length === 0 ? (
                        <p className="picker-empty">No installed models left. Download one from the list below.</p>
                      ) : (
                        installedRows.slice(0, 8).map((candidate) => {
                          const score = getModelScore(candidate, modelScores);
                          return (
                            <button
                              key={candidate.displayName}
                              type="button"
                              role="option"
                              aria-selected={false}
                              className="picker-model-row"
                              onClick={() => { onAdd(candidate); setPickerSlot(null); }}
                            >
                              <AvatarBust model={candidate.displayName} size="tiny" />
                              <span className="picker-model-name">{candidate.displayName}</span>
                              <span className="picker-model-meta">
                                {score ? `${score.grade}` : formatGb(candidate.sizeGb ?? 0)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          }

          const score = getModelScore(row, modelScores);
          return (
            <article key={row.displayName} className="model-pool-lineup-card">
              <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
              <div>
                <span>Contestant {index + 1}</span>
                <strong>{row.displayName}</strong>
                <em>{score ? `${formatMatchScore(score)} Match · ${score.grade}` : 'Not tested yet'}</em>
              </div>
              <button
                type="button"
                className="icon-action"
                onClick={() => onRemove(row)}
                disabled={disabled}
                title={`Remove ${row.displayName} from Speed Dating`}
                aria-label={`Remove ${row.displayName} from Speed Dating`}
              >
                <X aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}


// @ts-expect-error Retained prototype winner card is intentionally not mounted in the 0.1.x UI.
function _CurrentWinnerCard({
  pick,
  onSelect,
  onOpenTopPick,
}: {
  pick: RigPick;
  onSelect: (model: string) => void;
  onOpenTopPick: () => void;
}) {
  const { row, score } = pick;

  return (
    <aside className="current-winner-card" aria-label={`Top Match: ${row.displayName}`}>
      <div className="current-winner-badge">
        <Trophy aria-hidden="true" />
        <span>Top Match</span>
      </div>
      <div>
        <span>Your Top Match</span>
        <strong>{row.displayName}</strong>
        <em>{score ? `${score.total} Match · ${score.grade}` : pick.fitLabel}</em>
      </div>
      <p>{score ? `${row.displayName} has the highest saved score that still fits this computer.` : pick.reason}</p>
      {/* The two most honest statements in the product were buried three levels
          deep in Settings > Advanced > How We Score. They belong next to the
          number they qualify, not behind it. */}
      {score && (
        <p className="score-caveat">
          Measured on this computer, so scores are relative to your rig. Answer quality is a heuristic proxy, not a verdict —
          open the scorecard to read the saved answers.
        </p>
      )}
      <div className="current-winner-actions">
        <button type="button" className="mini-button outline" onClick={() => onSelect(row.displayName)}>
          View Here
        </button>
        <button type="button" className="mini-button" onClick={onOpenTopPick}>
          <Bot aria-hidden="true" />
          Top Pick
        </button>
      </div>
    </aside>
  );
}

// @ts-expect-error Retained prototype profile mini-card is intentionally not mounted in the 0.1.x UI.
function _ModelProfileMini({
  row,
  profile,
  score,
  vramGb,
}: {
  row?: ModelRow;
  profile: ModelProfile;
  score?: TestedModelScore;
  vramGb: number;
}) {
  const highlights = getModelProfileHighlights(row, profile, score, vramGb);

  return (
    <div className="model-profile-mini" aria-label="Selected model dating profile">
      {highlights.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}




function TestProcessCard({ mode, questionCount }: { mode: PendingRunMode; questionCount: BenchmarkQuestionCount }) {
  const isSpeedDate = mode === 'speed-date';
  const scoreParts = [
    {
      label: 'Same Questions',
      value: `${questionCount}`,
      detail: isSpeedDate
        ? 'Every picked model answers this exact set.'
        : 'The selected model answers this exact set.',
    },
    {
      label: 'Answer Quality',
      value: '34%',
      detail: 'Follows instructions, handles traps, and gives usable answers.',
    },
    {
      label: 'Speed',
      value: '32%',
      detail: 'Uses tokens per second and response delay.',
    },
    {
      label: 'Finish Rate',
      value: '18%',
      detail: 'Rewards completed, non-empty answers.',
    },
    {
      label: 'Computer Fit',
      value: '16%',
      detail: 'Checks model size against VRAM, RAM, and local setup.',
    },
  ];

  return (
    <section className="test-process-card" aria-label={isSpeedDate ? 'Speed Dating scoring rules' : 'Model test scoring rules'}>
      <div className="test-process-head">
        <div>
          <span>{isSpeedDate ? 'Speed Dating Rules' : 'Model Test Rules'}</span>
          <strong>Same questions. Same computer. Fair match.</strong>
        </div>
        <em>{isSpeedDate ? 'Highest final Match score wins.' : 'The final Match score grades this model here.'}</em>
      </div>
      <div className="test-process-grid">
        {scoreParts.map((part) => (
          <div key={part.label}>
            <span>{part.label}</span>
            <strong>{part.value}</strong>
            <em>{part.detail}</em>
          </div>
        ))}
      </div>
    </section>
  );
}


function SpeedDatePanel({
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
  const [setupCollapsed, setSetupCollapsed] = useState(false);
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
      <div className="speed-date-title">
        <div>
          <span>Round 3</span>
          <strong>Speed Dating</strong>
        </div>
        <em>Compare up to five picked models with the same questions.</em>
      </div>

      <RomanceArtBanner
        image={robotSpeedDateShow}
        className="speed-date-art-banner"
        kicker="Tonight's lineup"
        title="Five contestants, one rig, same questions"
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
            <span>Dating Game Setup</span>
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
            <button
              type="button"
              className="mini-button outline"
              onClick={() => setSetupCollapsed((c) => !c)}
              aria-label={setupCollapsed ? 'Expand lineup' : 'Collapse lineup'}
              title={setupCollapsed ? 'Show lineup' : 'Hide lineup'}
            >
              {setupCollapsed ? '▲' : '▼'}
            </button>
          </div>
        </div>

        <SpeedDateShowAnimation
          rows={shortlistedRows}
          runProgress={runProgress?.mode === 'speed-date' ? runProgress : null}
          winner={listTestResult?.winner}
          host={host}
        />

        <SpeedDateTranscriptPanel
          rows={shortlistedRows}
          benchmarks={benchmarkByModel}
          questionPlan={questionPlan}
          runProgress={runProgress?.mode === 'speed-date' ? runProgress : null}
        />

        {!setupCollapsed && <section className="speed-date-lineup-card" aria-label="Selected models for Speed Dating">
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

        {runProgress?.mode === 'speed-date' && (
          <RunProgressPanel
            progress={runProgress}
            host={host}
            questionPlan={questionPlan}
            onOpenLogs={onOpenLogs}
          />
        )}

        <QuestionSuitePreview
          questionCount={questionCount}
          questions={questionPlan}
          disabled={isListTesting}
          onQuestionCountChange={onQuestionCountChange}
          onOpenSuiteEditor={onOpenSuiteEditor}
        />

        <TestProcessCard mode="speed-date" questionCount={questionCount} />

        {listTestResult ? (
          <div className="speed-date-results">
            <div className="list-winner">
              <span>Best Match</span>
              <strong>{listTestResult.winner}</strong>
              <em>{winnerResult ? `${winnerResult.total} · ${winnerResult.grade}` : 'Ranked'}</em>
            </div>
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
        )}
      </div>
    </section>
  );
}

function SpeedDateShowAnimation({
  rows,
  runProgress,
  winner,
  host,
}: {
  rows: ModelRow[];
  runProgress: RunProgress | null;
  winner?: string;
  host?: NetworkHost;
}) {
  // The saved winner only counts as the current one if it is actually on this
  // stage; otherwise the podium highlights a model the lineup does not contain.
  const standing = lineupStanding(winner, rows.map((row) => row.displayName));
  const activeModel = runProgress?.phase === 'running'
    ? runProgress.currentModel
    : (standing.kind === 'leading' ? standing.model : rows[0]?.displayName ?? '');
  const stageStatus = runProgress?.phase === 'running'
    ? `Now testing ${getShortModelName(runProgress.currentModel)}`
    : standing.kind === 'leading'
      ? `${getShortModelName(standing.model)} is holding the top score`
      : rows.length >= MIN_CONTESTANTS
        ? `${rows.length} contestants ready for the same questions`
        : 'Pick at least two contestants to start the show';
  const cue = runProgress?.questionLabel
    ? `Question: ${runProgress.questionLabel}`
    : runProgress?.phase === 'running'
      ? 'Same questions, one model at a time.'
      : 'When the show starts, each model gets the same prompt set.';
  const slots = Array.from({ length: 5 }, (_item, index) => rows[index]);

  return (
    <section
      className={runProgress?.phase === 'running' ? 'speed-date-show-stage running' : 'speed-date-show-stage'}
      aria-label="Speed Dating stage animation"
    >
      <div className="speed-date-host">
        <MachineAvatar host={host} size="small" />
        <div>
          <span>This computer</span>
          <strong>{host?.hostname ?? 'Local rig'}</strong>
        </div>
      </div>
      <ol className="speed-date-stage-lineup" aria-label="Speed Dating contestants on stage">
        {slots.map((row, index) => {
          const isActive = Boolean(row && row.displayName === activeModel);
          return (
            <li
              key={row?.displayName ?? `empty-stage-${index}`}
              className={isActive ? 'active' : row ? 'filled' : 'empty'}
            >
              {row ? (
                <>
                  <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
                  <span>{index + 1}</span>
                </>
              ) : (
                <Plus aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="speed-date-stage-cue">
        <span>{runProgress?.phase === 'running' ? 'Live Speed Dating' : winner ? 'Current Winner' : 'Ready Check'}</span>
        <strong>{stageStatus}</strong>
        <em>{cue}</em>
      </div>
    </section>
  );
}

function SpeedDateContestantCard({
  row,
  index,
  score,
  vramGb,
  disabled,
  onRemove,
}: {
  row: ModelRow;
  index: number;
  score?: TestedModelScore;
  vramGb: number;
  disabled: boolean;
  onRemove: (row: ModelRow) => void;
}) {
  const profile = getModelProfile(row.displayName);
  const hardwareFit = getHardwareFit(row, vramGb);
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'Size unknown';

  return (
    <article className="speed-date-contestant-card">
      <button
        type="button"
        className="speed-date-remove"
        onClick={() => onRemove(row)}
        disabled={disabled}
        title={`Remove ${row.displayName} from Speed Dating`}
        aria-label={`Remove ${row.displayName} from Speed Dating`}
      >
        <X aria-hidden="true" />
      </button>
      <div className="speed-date-contestant-head">
        <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
        <div>
          <span>Contestant {index + 1}</span>
          <strong>{row.displayName}</strong>
          <em>{profile.archetype}</em>
        </div>
      </div>
      <div className="speed-date-contestant-facts">
        <span>{score ? `${formatMatchScore(score)} Match · ${score.grade}` : 'Not tested yet'}</span>
        <span>{score ? getResponseEstimate(score.speed) : sizeLabel}</span>
        <span>{hardwareFit.label}</span>
      </div>
      <p>{profile.specialties.join(' · ')}</p>
    </article>
  );
}


function QuestionSuitePreview({
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


const BENCHMARK_QUESTION_TYPES: BenchmarkQuestionType[] = ['assistant', 'writing', 'json', 'truth', 'format', 'coding'];

const BENCHMARK_TYPE_LABELS: Record<BenchmarkQuestionType, string> = {
  assistant: 'Assistant response',
  writing: 'Writing task',
  json: 'JSON output',
  truth: 'Truthfulness',
  format: 'Format following',
  coding: 'Coding task',
};

function TestSuiteEditorDock({
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


function FirstRunSplash({ vramGb, onDone, initialGoals, onSaveGoals, onCancel, isUpgrade }: {
  vramGb: number;
  onDone: (mode: UiMode, goals: GoalId[]) => void;
  /** Set when reopened from Settings: pre-checks the saved picks. */
  initialGoals?: GoalId[];
  /** Set when this is an existing user meeting the goal question for the
   *  first time — the copy should welcome them back, not greet a stranger. */
  isUpgrade?: boolean;
  /** Set when reopened from Settings: save picks and close, no mode step. */
  onSaveGoals?: (goals: GoalId[]) => void;
  onCancel?: () => void;
}) {
  // On first run there is no onClose: the choice is required, so Escape must
  // not dismiss it. Reopened from Settings it is an ordinary dialog and
  // Escape cancels. Focus is trapped either way — it previously left focus on
  // <body> behind a full-viewport overlay.
  const splashRef = useDialog<HTMLDivElement>(onCancel);
  // The desire comes before the mode: "what do you want to do?" is a question
  // about the person, "Simple or Advanced?" is a question about our UI, and
  // the person's question goes first.
  const [step, setStep] = useState<'goals' | 'mode'>('goals');
  const [picked, setPicked] = useState<GoalId[]>(initialGoals ?? []);

  const toggle = (id: GoalId) => {
    setPicked((current) => (current.includes(id)
      ? current.filter((g) => g !== id)
      : [...current, id]));
  };

  return (
    <div ref={splashRef} className="mode-splash" role="dialog" aria-modal="true" aria-label="Choose how to use RigMatch">
      <div className="mode-splash-card">
        <div className="mode-splash-brand">
          <BrandMark />
          <div>
            <strong>RigMatch</strong>
            <span>Find the best AI your PC can run — nothing leaves this computer.</span>
          </div>
        </div>
        {step === 'goals' ? (
          <>
            <h2 className="mode-splash-title">
              {isUpgrade ? 'New in this version: what would you like to do?' : 'What would you like to do?'}
            </h2>
            <p className="mode-splash-sub">
              {isUpgrade
                ? 'RigMatch can now point itself at what you actually want. Pick one and the model list, the tests and the winners all follow it. Your saved scores and settings are untouched.'
                : 'Pick what matters most — you can add more anytime.'}
            </p>
            <div className="goal-splash-groups">
              {goalsByCategory().map(({ category, goals }) => (
                <section key={category.id} aria-label={category.label}>
                  <h3 className="goal-splash-category">{category.label}</h3>
                  <div className="goal-splash-grid">
                    {goals.map((goal) => {
                      const expectation = goalHardwareExpectation(goal, vramGb);
                      const selected = picked.includes(goal.id);
                      const pickOrder = picked.indexOf(goal.id) + 1;
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          className={`goal-splash-option${selected ? ' selected' : ''} tone-${expectation.tone}`}
                          onClick={() => toggle(goal.id)}
                          aria-pressed={selected}
                        >
                          <strong>{goal.desire}</strong>
                          {goal.runtime === 'none' ? (
                            // A missing backend is nobody's hardware's fault.
                            <em title={goal.unsupportedReason}>Not possible locally yet</em>
                          ) : (
                            <em title={expectation.note}>
                              {leagueLabel(expectation.tone)}
                              {goal.grading === 'none' ? " · can't be graded yet" : ''}
                            </em>
                          )}
                          {selected && <span className="goal-splash-order">{pickOrder === 1 ? 'Main goal' : `#${pickOrder}`}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {picked.length > 1 && (
              <p className="goal-splash-nudge">
                One goal gets you one clear answer. The best model for coding is rarely the best
                for chatting, so each goal you add means more testing time before RigMatch can
                crown anyone. Your first pick leads.
              </p>
            )}
            <div className="goal-splash-actions">
              {onSaveGoals ? (
                <>
                  {onCancel && (
                    <button type="button" className="mini-button" onClick={onCancel}>
                      {isUpgrade ? 'Not now' : 'Cancel'}
                    </button>
                  )}
                  <button type="button" className="primary-button" onClick={() => onSaveGoals(picked)}>
                    {isUpgrade
                      ? (picked.length === 0 ? 'Skip for now' : 'Use these goals')
                      : (picked.length === 0 ? 'Clear goals' : 'Save goals')}
                  </button>
                </>
              ) : (
                <button type="button" className="primary-button" onClick={() => setStep('mode')}>
                  {picked.length === 0 ? 'Skip for now' : 'Continue'}
                </button>
              )}
            </div>
          </>
        ) : (
          <ModeStep onPick={(mode) => onDone(mode, picked)} />
        )}
      </div>
    </div>
  );
}

function ModeStep({ onPick }: { onPick: (mode: UiMode) => void }) {
  return (
    <>
        <h2 className="mode-splash-title">How would you like to start?</h2>
        <p className="mode-splash-sub">You can switch anytime from the header.</p>
        <div className="mode-splash-options">
          <button type="button" className="mode-splash-option simple" onClick={() => onPick('beginner')}>
            <Sparkles aria-hidden="true" />
            <strong>Simple Mode</strong>
            <em>A guided path: check your PC, pick models, download what's missing, compare, and use the winner.</em>
            <span className="mode-splash-cta">Start guided setup</span>
          </button>
          <button type="button" className="mode-splash-option advanced" onClick={() => onPick('advanced')}>
            <SlidersHorizontal aria-hidden="true" />
            <strong>Advanced Mode</strong>
            <em>The full control room: every model, custom test suites, skill tests, diagnostics, and logs.</em>
            <span className="mode-splash-cta">Open the control room</span>
          </button>
        </div>
    </>
  );
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


type ActivityJob = {
  key: string;
  model: string;
  kind: 'benchmark' | 'app' | 'image';
  label: string;
  grade: string;
  score: number;
  completedAt: string;
  html?: string | null;
  imageDataUrl?: string;
};

function ActivityPanel({
  runProgress,
  skillRunStatus,
  pullProgressByModel,
  isListTesting,
  modelScores,
  selectedModel,
  ollama,
  system,
  onOpenModels,
  onOpenScorecards,
  onRerunTest,
  onStopBenchmark,
  onStopSkillTests,
}: {
  runProgress: RunProgress | null;
  skillRunStatus: SkillRunStatus;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isListTesting: boolean;
  modelScores: Record<string, TestedModelScore>;
  selectedModel: string;
  ollama: OllamaStatus;
  system: SystemProfile;
  onOpenModels: () => void;
  onOpenScorecards: () => void;
  onRerunTest: (model: string) => void;
  onStopBenchmark: () => void;
  onStopSkillTests: () => void;
}) {
  const [previewApp, setPreviewApp] = useState<{ html: string; model: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; model: string } | null>(null);
  const activePulls = Object.values(pullProgressByModel)
    .filter((update) => update && !['complete', 'failed', 'cancelled'].includes(update.phase));
  const benchmarkActive = runProgress?.phase === 'running';
  const skillActive = skillRunStatus.phase === 'running';
  const anythingRunning = benchmarkActive || skillActive || activePulls.length > 0 || isListTesting;

  // Re-read saved lab results whenever a skill run advances so freshly
  // finished App Builder / image jobs appear in the monitor.
  const labResults = useMemo(
    () => readAdvancedLabResults(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skillRunStatus.phase, skillRunStatus.completed],
  );

  const recentJobs = useMemo<ActivityJob[]>(() => {
    const jobs: ActivityJob[] = [];
    for (const score of Object.values(modelScores)) {
      if (!score?.completedAt) continue;
      jobs.push({ key: `bench:${score.model}`, model: score.model, kind: 'benchmark', label: 'Compatibility test', grade: score.grade, score: score.total, completedAt: score.completedAt });
    }
    for (const result of Object.values(labResults)) {
      if (!result || result.error || !result.completedAt) continue;
      if (result.challenge === 'app-builder') {
        jobs.push({ key: `app:${result.model}`, model: result.model, kind: 'app', label: 'App Builder', grade: result.grade, score: result.score, completedAt: result.completedAt, html: extractHtmlDocument(result.response) });
      } else if (result.challenge === 'image-generation' || result.challenge === 'video-generation') {
        jobs.push({ key: `img:${result.model}`, model: result.model, kind: 'image', label: result.challenge === 'video-generation' ? 'Video Lab' : 'Image Lab', grade: result.grade, score: result.score, completedAt: result.completedAt, imageDataUrl: result.imageDataUrl });
      }
    }
    return jobs.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, 10);
  }, [modelScores, labResults]);

  return (
    <section className="activity-panel" aria-label="Running tests and downloads">
      <div className="activity-panel-head">
        <div>
          <span>Activity</span>
          <strong>{anythingRunning ? 'Work in progress on this computer' : 'Job monitor'}</strong>
          <em>Live jobs report here as they run, and recent results stay below — open the app or image a test produced.</em>
        </div>
      </div>

      <article className="activity-card">
        <div className="activity-card-head">
          <Gauge aria-hidden="true" />
          <strong>Benchmark</strong>
          <b className={benchmarkActive ? 'activity-state running' : 'activity-state idle'}>
            {benchmarkActive ? 'Running' : runProgress?.phase === 'failed' ? 'Failed' : runProgress?.phase === 'complete' ? 'Finished' : 'Idle'}
          </b>
        </div>
        {runProgress ? (
          <>
            <p>
              <strong>{runProgress.label}</strong> — {runProgress.currentModel}
              {runProgress.questionLabel ? ` · ${runProgress.questionLabel}` : ''}
              {typeof runProgress.questionRunIndex === 'number' && typeof runProgress.questionRunTotal === 'number' && runProgress.questionRunTotal > 1
                ? ` · run ${runProgress.questionRunIndex + 1}/${runProgress.questionRunTotal}`
                : ''}
            </p>
            <div className="popularity-track" aria-hidden="true">
              <i style={{ width: `${Math.max(2, Math.min(100, runProgress.percent))}%` }} />
            </div>
            <em>{runProgress.message}</em>
            {benchmarkActive && (
              <button type="button" className="mini-button outline activity-stop-btn" onClick={onStopBenchmark} title="Stop after the current question finishes">
                <X aria-hidden="true" />
                Stop after current question
              </button>
            )}
          </>
        ) : (
          <em>No benchmark has run in this session yet.</em>
        )}
      </article>

      <article className="activity-card">
        <div className="activity-card-head">
          <Code2 aria-hidden="true" />
          <strong>Skill Tests</strong>
          <b className={skillActive ? 'activity-state running' : 'activity-state idle'}>
            {skillActive ? `Running ${skillRunStatus.completed + 1}/${skillRunStatus.total}` : skillRunStatus.phase === 'complete' ? 'Finished' : 'Idle'}
          </b>
        </div>
        {skillRunStatus.phase === 'idle' ? (
          <em>Optional App Builder and image runs appear here when you include them in a test.</em>
        ) : (
          <>
            <p><strong>{skillRunStatus.label}</strong></p>
            {skillRunStatus.total > 0 && (
              <div className="popularity-track" aria-hidden="true">
                <i style={{ width: `${Math.max(4, Math.round(((skillRunStatus.completed + (skillActive ? 0.5 : 0)) / skillRunStatus.total) * 100))}%` }} />
              </div>
            )}
            {skillActive && (
              <button type="button" className="mini-button outline activity-stop-btn" onClick={onStopSkillTests} title="The current skill test finishes; remaining ones are skipped">
                <X aria-hidden="true" />
                Stop after current test
              </button>
            )}
          </>
        )}
      </article>

      <article className="activity-card">
        <div className="activity-card-head">
          <Download aria-hidden="true" />
          <strong>Downloads</strong>
          <b className={activePulls.length ? 'activity-state running' : 'activity-state idle'}>
            {activePulls.length ? `${activePulls.length} active` : 'Idle'}
          </b>
        </div>
        {activePulls.length ? (
          activePulls.map((update) => (
            <div key={update.id ?? update.model} className="activity-download-row">
              <span>{update.model}</span>
              <div className="popularity-track" aria-hidden="true">
                <i style={{ width: `${Math.max(2, Math.min(100, update.percent ?? 5))}%` }} />
              </div>
              <em>{update.status || 'Downloading...'}</em>
            </div>
          ))
        ) : (
          <em>No model downloads in flight. Queue one from the Models hub.</em>
        )}
        <button type="button" className="mini-button outline" onClick={onOpenModels}>
          Open Models
        </button>
      </article>

      <article className="activity-card">
        <div className="activity-card-head">
          <History aria-hidden="true" />
          <strong>Recent results</strong>
          <b className="activity-state idle">{recentJobs.length}</b>
        </div>
        {recentJobs.length === 0 ? (
          <em>Run a test and its result lands here — with a viewer for the app or image it produced.</em>
        ) : (
          <ul className="activity-results-list">
            {recentJobs.map((job) => (
              <li key={job.key}>
                <AvatarBust model={job.model} size="tiny" />
                <div className="activity-result-info">
                  <strong>{job.model}</strong>
                  <em>{job.label} · {formatHistoryTime(job.completedAt)}</em>
                </div>
                <span className={`score-row-grade ${getScoreTone(job.score)}`}>{job.score} · {job.grade}</span>
                {job.kind === 'app' && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => job.html && setPreviewApp({ html: job.html, model: job.model })}
                    disabled={!job.html}
                    title={job.html ? 'Play the generated app in a sandbox' : 'This answer had no runnable app to preview'}
                  >
                    <Play aria-hidden="true" />
                    Play It
                  </button>
                )}
                {job.kind === 'image' && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => job.imageDataUrl && setPreviewImage({ src: job.imageDataUrl, model: job.model })}
                    disabled={!job.imageDataUrl}
                    title={job.imageDataUrl ? 'View the generated image' : 'No image was saved for this run'}
                  >
                    <Lightbulb aria-hidden="true" />
                    View
                  </button>
                )}
                {job.kind === 'benchmark' && (
                  <>
                    <button type="button" className="mini-button outline" onClick={onOpenScorecards}>
                      Scorecard
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => onRerunTest(job.model)}
                      title={`Run the compatibility test on ${job.model} again`}
                    >
                      <RefreshCw aria-hidden="true" />
                      Rerun
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </article>

      <AdvancedCapabilityLab
        selectedModel={selectedModel}
        ollama={ollama}
        system={system}
      />

      {previewApp && (
        <AppBuilderPreviewModal html={previewApp.html} model={previewApp.model} onClose={() => setPreviewApp(null)} />
      )}
      {previewImage && (
        <ImageResultModal
          src={previewImage.src}
          model={previewImage.model}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </section>
  );
}

// Its own component so it can hold a hook. Inline in the parent's JSX it was the
// one dialog left claiming aria-modal with nothing behind the claim — no focus
// moved in, no trap, no Escape — while AppBuilderPreviewModal, rendered
// directly above it, had all three.
function ImageResultModal({ src, model, onClose }: {
  src: string;
  model: string;
  onClose: () => void;
}) {
  const dialogRef = useDialog<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="run-warning-modal advanced-lab-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Image generated by ${model}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-title">
          <Lightbulb aria-hidden="true" />
          <div>
            <span>Image Lab result</span>
            <strong>{model}</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>
        <img className="advanced-lab-generated-image" src={src} alt={`Generated by ${model}`} />
      </section>
    </div>
  );
}

// The rotating tips, from the one place definitions live. They used to be
// written out here, which meant the explanations existed only in Advanced Mode
// — shown to the people who needed them least. See lib/glossary.ts.
const LEARNING_TIPS: { term: string; tip: string }[] = tickerTips();

function Ticker({
  activity,
  isDesktopRuntime,
  topPick,
  queuedRows,
  pullProgressByModel,
  isPulling,
  pullingModel,
  isPullCancelRequested,
  isPullPauseRequested,
  isPullPaused,
  onResumeQueue,
  onPauseQueue,
  onCancelQueue,
  onOpenDownloads,
  onOpenChat,
}: {
  activity: string;
  isDesktopRuntime: boolean;
  topPick?: RigPick | null;
  queuedRows: ModelRow[];
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isPulling: boolean;
  pullingModel: string | null;
  isPullCancelRequested: boolean;
  isPullPauseRequested: boolean;
  isPullPaused: boolean;
  onResumeQueue: () => void;
  onPauseQueue: () => void;
  onCancelQueue: () => void;
  onOpenDownloads: () => void;
  onOpenChat: () => void;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activity) return;
    const showTimer = setTimeout(() => setShowActivity(true), 0);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => setShowActivity(false), 5000);
    return () => {
      clearTimeout(showTimer);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, [activity]);

  useEffect(() => {
    if (showActivity) return;
    const id = setInterval(() => setTipIndex((i) => (i + 1) % LEARNING_TIPS.length), 8000);
    return () => clearInterval(id);
  }, [showActivity]);

  const tip = LEARNING_TIPS[tipIndex];
  const pickScore = topPick?.score?.total ?? 0;
  const pickGrade = topPick?.score?.grade;
  const pickName = topPick?.row.displayName ?? null;
  // One decimal, same as every other Match score in the app.
  const pickScoreLabel = topPick?.score ? formatMatchScore(topPick.score) : null;
  const showDownloadDock = Boolean(
    queuedRows.length > 0 ||
    pullingModel ||
    Object.values(pullProgressByModel).some((progress) => isVisiblePullProgress(progress)),
  );

  return (
    <footer className={showDownloadDock ? 'ticker has-download-dock' : 'ticker'}>
      <button type="button" className="ticker-chat-link" onClick={onOpenChat} title="Open RigMatch Chat">
        <MessageSquare size={13} aria-hidden="true" />
        <span>Chat</span>
      </button>
      <div className="ticker-learn">
        {showActivity ? (
          <>
            <span className="ticker-label ticker-label-activity">Activity</span>
            <strong className="ticker-activity-text">{activity}</strong>
          </>
        ) : (
          <>
            <span className="ticker-label ticker-label-learn">Learn</span>
            <strong className="ticker-term">{tip.term}</strong>
            <span className="ticker-tip">{tip.tip}</span>
          </>
        )}
      </div>
      {showDownloadDock && (
        <DownloadTickerDock
          queuedRows={queuedRows}
          pullProgressByModel={pullProgressByModel}
          isPulling={isPulling}
          pullingModel={pullingModel}
          isPullCancelRequested={isPullCancelRequested}
          isPullPauseRequested={isPullPauseRequested}
          isPullPaused={isPullPaused}
          onResumeQueue={onResumeQueue}
          onPauseQueue={onPauseQueue}
          onCancelQueue={onCancelQueue}
          onOpenDownloads={onOpenDownloads}
        />
      )}
      <div className="ticker-right">
        <span>{isDesktopRuntime ? 'Desktop bridge online' : 'Preview mode'}</span>
        <strong>
          {/* A top pick can exist before it has ever been scored, in which case
              there is no grade — this used to print the literal word
              "undefined" next to "0 Match". Say what is true instead. */}
          {pickName
            ? pickGrade && pickScoreLabel
              ? `${pickName} · ${pickScoreLabel} Match · ${pickGrade}`
              : `${pickName} · not tested yet`
            : 'No model tested yet'}
        </strong>
      </div>
      <div className="queue-meter" aria-label="Top pick score">
        {Array.from({ length: 12 }).map((_, index) => (
          <i key={index} className={pickName && index < Math.round(pickScore / 10) ? 'lit' : ''} />
        ))}
      </div>
    </footer>
  );
}

function DownloadTickerDock({
  queuedRows,
  pullProgressByModel,
  isPulling,
  pullingModel,
  isPullCancelRequested,
  isPullPauseRequested,
  isPullPaused,
  onResumeQueue,
  onPauseQueue,
  onCancelQueue,
  onOpenDownloads,
}: {
  queuedRows: ModelRow[];
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isPulling: boolean;
  pullingModel: string | null;
  isPullCancelRequested: boolean;
  isPullPauseRequested: boolean;
  isPullPaused: boolean;
  onResumeQueue: () => void;
  onPauseQueue: () => void;
  onCancelQueue: () => void;
  onOpenDownloads: () => void;
}) {
  const visibleProgress = Object.values(pullProgressByModel).filter((progress) => isVisiblePullProgress(progress));
  const activeProgress = pullingModel ? pullProgressByModel[pullingModel] : visibleProgress[0];
  const activeModel = pullingModel ?? activeProgress?.model ?? queuedRows[0]?.displayName ?? null;
  const phase = activeProgress?.phase ?? (activeModel ? 'queued' : 'queued');
  const isPaused = phase === 'paused' || isPullPaused;
  const dockPhase = isPaused ? 'paused' : phase;
  const queuedBehindCount = queuedRows.filter((row) => row.displayName !== activeModel).length;
  const queued = phase === 'queued' || (!isPulling && !isPaused && queuedRows.some((row) => row.displayName === activeModel));
  const percent = getPullProgressPercent(activeProgress, queued);
  const hasMeasuredPercent = typeof activeProgress?.percent === 'number';
  const trackPercent = getPullTrackPercent(activeProgress, { queued, paused: isPaused });
  const percentLabel = isPaused
    ? hasMeasuredPercent ? `${Math.round(percent)}%` : 'Paused'
    : hasMeasuredPercent || phase === 'complete'
      ? `${Math.round(percent)}%`
      : queued
        ? 'Queued'
        : '--%';
  const detailLabel = activeProgress
    ? getPullProgressDetailLabel(phase, queued, activeProgress)
    : queuedRows.length > 0
      ? `${queuedRows.length} model${queuedRows.length === 1 ? '' : 's'} waiting to download.`
      : 'Waiting for download status.';
  const statusLabel = phase === 'failed'
    ? 'Download failed'
    : phase === 'complete'
      ? 'Download complete'
      : isPaused
        ? 'Download paused'
      : isPullCancelRequested
        ? 'Stopping download'
        : isPullPauseRequested
          ? 'Pausing download'
        : isPulling
          ? 'Downloading'
          : queuedRows.length > 0
            ? 'Download queued'
            : 'Download status';

  return (
    <section className={`ticker-download-dock ${dockPhase}`} aria-label="Download status">
      <button type="button" className="ticker-download-main" onClick={onOpenDownloads} title="Open model downloads">
        <Download aria-hidden="true" />
        <div className="ticker-download-copy">
          <div>
            <span>{statusLabel}</span>
            <strong title={activeModel ?? undefined}>{activeModel ? getQueueChipModelName(activeModel) : 'Ollama queue'}</strong>
          </div>
          <em>
            {detailLabel}
            {queuedBehindCount > 0 ? ` · ${queuedBehindCount} waiting` : ''}
          </em>
        </div>
        <b>{percentLabel}</b>
      </button>
      <div className="ticker-download-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i style={{ width: `${trackPercent}%` }} />
      </div>
      {isPaused ? (
        <button
          type="button"
          className="ticker-download-resume"
          onClick={onResumeQueue}
          disabled={isPullCancelRequested || isPulling}
          title="Resume the paused Ollama download through cached layers"
        >
          <Play aria-hidden="true" />
          Resume
        </button>
      ) : isPulling && (
        <button
          type="button"
          className="ticker-download-pause"
          onClick={onPauseQueue}
          disabled={isPullPauseRequested || isPullCancelRequested}
          title="Pause the active Ollama pull and keep it queued"
        >
          <Pause aria-hidden="true" />
          {isPullPauseRequested ? 'Pausing' : 'Pause'}
        </button>
      )}
      {(queuedRows.length > 0 || isPulling) && (
        <button
          type="button"
          className="ticker-download-stop"
          onClick={onCancelQueue}
          disabled={isPullCancelRequested}
          title={isPulling ? 'Cancel the active Ollama pull and clear queued downloads' : 'Cancel all queued downloads'}
        >
          <X aria-hidden="true" />
          {isPullCancelRequested ? 'Canceling' : 'Cancel'}
        </button>
      )}
    </section>
  );
}

function QuestionStatusBar({
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

function RunProgressPanel({
  progress,
  host,
  questionPlan,
  showAnimation = true,
  onOpenLogs,
}: {
  progress: RunProgress;
  host?: NetworkHost;
  questionPlan?: BenchmarkQuestion[];
  showAnimation?: boolean;
  onOpenLogs?: () => void;
}) {
  const phaseLabel = progress.phase === 'complete'
    ? 'Complete'
    : progress.phase === 'failed'
      ? 'Failed'
      : 'Running';
  const completedLabel = `${progress.completed}/${progress.total}`;
  const processLabel = progress.mode === 'speed-date'
    ? 'Testing one contestant at a time with the same questions. Best final Match score wins.'
    : 'Running the selected question set, then scoring speed, answer quality, finish rate, and computer fit.';

  return (
    <div className={`run-progress-card ${progress.phase}`} aria-live="polite">
      <div className="run-progress-head">
        <span>{progress.label}</span>
        <strong>{phaseLabel}</strong>
      </div>
      <p className="run-progress-explainer">{processLabel}</p>
      {showAnimation && progress.phase === 'running' && (
        <FlirtTestAnimation
          model={progress.currentModel}
          host={host}
          mode={progress.mode}
          questionLabel={progress.questionLabel}
        />
      )}
      <div className="run-progress-main">
        <div>
          <span>{progress.phase === 'complete' ? 'Best match' : 'Current model'}</span>
          <strong>{progress.currentModel}</strong>
        </div>
        <div>
          <span>Progress</span>
          <strong>{completedLabel}</strong>
        </div>
      </div>
      <div className="run-progress-bar" aria-label={`${progress.percent}% complete`}>
        <i style={{ width: `${progress.percent}%` }} />
      </div>
      {questionPlan?.length ? <QuestionStatusBar progress={progress} questions={questionPlan} /> : null}
      <div className="run-progress-foot">
        <span>{progress.message}</span>
        {progress.phase === 'failed' && onOpenLogs ? (
          <button type="button" className="mini-button outline log-button" onClick={onOpenLogs}>
            <History aria-hidden="true" />
            Logs
          </button>
        ) : progress.lastResult ? (
          <strong>{progress.lastResult.model}: {progress.lastResult.total} / {progress.lastResult.grade}</strong>
        ) : null}
      </div>
    </div>
  );
}

function FlirtTestAnimation({
  model,
  host,
  mode,
  questionLabel,
}: {
  model: string;
  host?: NetworkHost;
  mode: PendingRunMode;
  questionLabel?: string;
}) {
  const modelName = getShortModelName(model);
  const computerLine = questionLabel
    ? `Question: ${questionLabel}`
    : mode === 'speed-date'
    ? 'Same questions, no favorites.'
    : 'Show me your best answer.';
  const modelLine = questionLabel
    ? 'Answering this prompt live.'
    : mode === 'speed-date'
    ? 'I love a fair contest.'
    : 'You had me at prompt.';

  return (
    <div className="flirt-link" aria-label={`${host?.hostname ?? 'Computer'} is testing ${model}`}>
      <div className="flirt-node computer">
        <MachineAvatar host={host} size="small" />
        <div className="flirt-bubble">
          <span>{host?.isLocal ? 'This Computer' : 'Computer'}</span>
          <strong>{computerLine}</strong>
        </div>
      </div>

      <div className="flirt-chemistry" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>

      <div className="flirt-node model">
        <AvatarBust model={model} size="small" />
        <div className="flirt-bubble">
          <span>{modelName}</span>
          <strong>{modelLine}</strong>
        </div>
      </div>
    </div>
  );
}




export default App;
