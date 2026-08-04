import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Bot,
  Boxes,
  Bug,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Code2,
  Coffee,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  FolderOpen,
  Gauge,
  Heart,
  HelpCircle,
  History,
  ImagePlus,
  Lightbulb,
  Maximize2,
  MessageSquare,
  Minimize2,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Share2,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Trophy,
  Upload,
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
  BenchmarkProgressUpdate,
  BenchmarkPromptResult,
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
  ChatMessage,
  SkillRunStatus,
} from './types';
import {
  MATCH_GRADE_BANDS,
  compareBenchmarkResults,
  compareTestedModelScores,
  formatMatchScore,
  isLegacyScore,
  toTestedModelScore,
  upsertModelScores,
} from './lib/scoring';
import {
  getDeveloperFilterOptions,
  getModelDeveloperKey,
  getModelOrigin,
} from './lib/modelOrigins';
import {
  getEmptyModelNewsState,
  getModelNewsId,
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
import { BrandMark, PanelHeader, MetricTile } from './components/CommonChrome';
import { ReleaseNotes, UpdateCenter } from './components/UpdateCenter';
import { releaseNotes } from './data/releaseNotes';
import { playJingle } from './lib/sound';
import { TopDeck } from './components/TopDeck';
import {
  TASK_FILTER_CHIPS,
  addSetValues,
  buildBugReportUrl,
  buildDiagnosticsText,
  buildShareableScorecard,
  createEmptyBenchmark,
  createQueuedPullProgress,
  createRunProgressId,
  formatBenchmarkBanner,
  formatHistoryTime,
  formatLogDetails,
  formatLogTime,
  formatLogsForClipboard,
  getAgentName,
  getBenchmarkForModel,
  getCudaDetail,
  getCudaSummary,
  getDiskGuard,
  getFootprintFit,
  getHardwareFit,
  getLineupBenchmarkBlocker,
  getLocalRigDetailCards,
  getModelAliases,
  getModelBenchmarkBlocker,
  getModelDreamTags,
  getModelEpithet,
  getModelGoodForLine,
  getModelGoodForTags,
  getModelProfile,
  getModelProfileHighlights,
  getModelQuickFilters,
  getModelRuntime,
  getModelScore,
  getModelSearchText,
  getModelSortLabel,
  getModelStatusLabel,
  getNavLabel,
  getPlatformFit,
  getPlatformName,
  getPullProgressDetailLabel,
  getPullProgressPercent,
  getPullProgressStatusLabel,
  getQueueChipModelName,
  getRankedModelScores,
  getRecentModelScores,
  getRemoteRigDetailCards,
  getResultExplanation,
  getRigPick,
  getSavedThemeId,
  getSavedTutorialSeen,
  getSavedUiMode,
  hasChosenInterfaceMode,
  getScoreTimelineNote,
  getSelectedContestantBlurb,
  getFriendlyModelName,
  getShortModelName,
  getSizeRisk,
  getTaskTopPicks,
  getThemeLabel,
  isBenchmarkByModel,
  isBenchmarkForAliases,
  isBenchmarkForModel,
  isBenchmarkResult,
  isCloudModel,
  isEmbeddingModel,
  isHostBenchmarkReady,
  isLikelyImageGenerationModel,
  isVisionModel,
  isListTestResult,
  isModelScores,
  isRecord,
  isUncensoredModel,
  isVisiblePullProgress,
  mergeModelRows,
  modelMatchesQuickFilter,
  modelMatchesTask,
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
  sortModelRows,
  sumQueuedGb,
  upsertBenchmarkResults,
} from './lib/modelCatalog';
import type {
  ListTestResult,
  ModelProfile,
  ModelQuickFilterId,
  ModelSortKey,
  ModelTaskFilterId,
  RigPick,
  SortDirection,
} from './lib/modelCatalog';
import {
  appendRuns,
  emptyRunHistory,
  getAllRunDeltas,
  getScoreTrend,
  readRunHistory,
  removeRuns,
  seedFromBenchmarkResults,
  toRunHistoryEntry,
  writeRunHistory,
  type RunDelta,
  type RunHistory,
} from './lib/runHistory';
import {
  amazonUrl,
  APP_VERSION,
  BUY_ME_A_COFFEE_URL,
  CLEARED_TOP_MATCHES_STORAGE_KEY,
  QUALITY_MODE_STORAGE_KEY,
  JUDGE_MODEL_STORAGE_KEY,
  JUDGE_SOURCE_STORAGE_KEY,
  CLOUD_JUDGE_MODEL_STORAGE_KEY,
  CLOUD_JUDGE_PRESETS,
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
  USE_CASE_CARDS,
  navItems,
  themeOptions,
  type ThemeId,
  type UiMode,
} from './lib/appConfig';
import { getUpdateChannelLabel } from './lib/updateLabels';
import { AvatarBust, MachineAvatar } from './components/Avatars';
import { AppBuilderPreviewModal } from './components/AppBuilderPreview';
import { ShareScorecard } from './components/ShareScorecard';
import { ExportHatchModal } from './components/ExportHatchModal';
import { buildHatchProfile } from './lib/hatchProfile';
import { getAgentDatingProfileSections, getAgentDatingProfileDetails, getMatchNotes } from './lib/datingProfile';
import { UpdateAvailableToast } from './components/UpdateAvailableToast';
import { SimpleWizard, type StepId as WizardStepId, type WizardModel } from './components/SimpleWizard';
import { DeleteModelModal, CloseCleanupModal, ClearDataModal, SupportModal, ChoiceCruiseModal } from './components/dialogs';
import { ChatDock } from './components/ChatDock';
import { SkillRunMiniBar, LiveBuildModal, DemoResultModal, ModelDemoChips } from './components/SkillDemoViewers';
import { AdvancedCapabilityLab } from './components/AdvancedCapabilityLab';
import { extractHtmlDocument } from './lib/labPreview';
import {
  readAdvancedLabResults,
  writeAdvancedLabResults,
  wasJudged,
  type DemoArtifact,
  type AdvancedLabResult,
} from './lib/labResults';
import {
  APP_BUILDER_PRESETS,
  DEFAULT_APP_BUILDER_PRESET_ID,
  resolveAppBuilderPrompt,
  buildAppBuilderRetryPrompt,
  extractJudgedProblem,
  ADVANCED_IMAGE_GENERATION_PROMPT,
  getVisionTestImageDataUrl,
  runAdvancedAppBuilderChallenge,
  runCodeChallenge,
  runAdvancedVisionChallenge,
  runAdvancedImageGenerationChallenge,
  VISION_TEST_IMAGES,
  DEFAULT_VISION_TEST_IMAGE,
} from './lib/labChallenges';
import {
  CODE_LANGUAGES,
  CODE_TASK_PRESETS,
  DEFAULT_CODE_LANGUAGE,
  resolveCodeTask,
  extractCodeBlock,
} from './lib/codeChallenge';
import { getHostBanter, getDateReaction, type HostBanterPhase } from './lib/hostBanter';
import {
  ModelScorePill,
  ModelStatusPill,
  PopularityMeter,
  PromptStatusPill,
  RomanceArtBanner,
  ScoreBars,
  ScoreLegend,
  ScoreRadar,
  ScoreDeltaCell,
  ScoreSparkline,
  ScoreTile,
} from './components/ScoreVisuals';
import {
  compareVersionStrings,
  formatGb,
  formatMs,
  formatPullCount,
  getErrorMessage,
  getResponseEstimate,
  getScoreTone,
  getScoreTooltip,
  gradeFor,
} from './lib/format';
import robotContestantWall from './assets/robot-contestant-wall.webp';
import robotModelTest from './assets/robot-model-test.webp';
import robotRigGreenroom from './assets/robot-rig-greenroom.webp';
import robotRomanceHero from './assets/robot-romance-hero.webp';
import robotScorecardCeremony from './assets/robot-scorecard-ceremony.webp';
import robotSpeedDateShow from './assets/robot-speed-date-show.webp';
import './App.css';


type UtilityPanelId = Extract<NavId, 'history' | 'settings'>;

type PendingRunMode = 'single' | 'speed-date';

// Quick TEST resource warning opt-out ('off' = user chose "don't warn again").
const QUICK_CHECK_WARNING_KEY = 'rigmatch:quick-test-warning:v1';
// The app version whose update nudge the user dismissed — so the gentle popup
// shows once per new release, never nags for a version they've already seen.
const UPDATE_PROMPT_DISMISSED_KEY = 'rigmatch:update-prompt-dismissed:v1';
type SkillTestSelection = { appBuilder: boolean; appPromptId: string; appCustomPrompt: string; image: boolean; imagePrompt: string; recognize: boolean; recognizeImage: string; code: boolean; codeLanguage: string; codeTaskId: string; codeCustomTask: string; skipQuestions: boolean };
type PendingScoreClear = { mode: 'single'; model: string } | { mode: 'all' };

type RunProgress = {
  progressId?: string;
  mode: PendingRunMode;
  phase: 'running' | 'complete' | 'failed';
  label: string;
  currentModel: string;
  completed: number;
  total: number;
  percent: number;
  message: string;
  lastResult?: {
    model: string;
    total: number;
    grade: string;
}
  questionIndex?: number;
  questionTotal?: number;
  questionLabel?: string;
  questionPrompt?: string;
  questionPhase?: BenchmarkProgressUpdate['phase'];
  questionRunIndex?: number;
  questionRunTotal?: number;
  completedQuestions?: number;
  questionScores?: Record<string, number>;
};


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
  const [pendingRunMode, setPendingRunMode] = useState<PendingRunMode | null>(null);
  const [pendingSingleModel, setPendingSingleModel] = useState<string | null>(null);
  const [pendingQuickCheck, setPendingQuickCheck] = useState<ModelRow | null>(null);
  const [skillTestSelection, setSkillTestSelection] = useState<SkillTestSelection>({
    appBuilder: false,
    appPromptId: DEFAULT_APP_BUILDER_PRESET_ID,
    appCustomPrompt: '',
    image: false,
    imagePrompt: ADVANCED_IMAGE_GENERATION_PROMPT,
    recognize: false,
    recognizeImage: DEFAULT_VISION_TEST_IMAGE,
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
  const [showModeSplash, setShowModeSplash] = useState(() => !hasChosenInterfaceMode());
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
  const [chatImage, setChatImage] = useState<string | null>(null);
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
    () => mergeModelRows(catalog, localModels),
    [catalog, localModels],
  );

  const selectedRow = modelRows.find(
    (row) => row.displayName === selectedModel || row.id === selectedModel,
  );
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

  useEffect(() => {
    modelNewsRef.current = modelNews;
  }, [modelNews]);

  useEffect(() => {
    modelNewsNotificationsEnabledRef.current = modelNewsNotificationsEnabled;
  }, [modelNewsNotificationsEnabled]);

  const canBenchmark = Boolean(selectedRow?.installed && selectedHostCanBenchmark);
  const agentName = getAgentName(selectedModel);
  const shortlistedRows = useMemo(
    () => modelRows.filter((row) => shortlistIds.has(row.displayName)).slice(0, 5),
    [modelRows, shortlistIds],
  );
  const uninstalledShortlistedCount = useMemo(
    () => shortlistedRows.filter((row) => !row.installed).length,
    [shortlistedRows],
  );
  const installedRowsForCleanup = useMemo(
    () => modelRows.filter((row) => row.installed && row.localProvider !== 'lm-studio'),
    [modelRows],
  );
  // Installed local (Ollama) models eligible to act as the judge, largest first —
  // a bigger model is the better grader, so it makes the best default.
  const judgeModelOptions = useMemo(
    () => [...installedRowsForCleanup]
      .sort((a, b) => (b.sizeGb ?? 0) - (a.sizeGb ?? 0))
      .map((row) => row.displayName),
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
    return modelRows
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
  }, [modelRows, system.gpu.vramGb, system.platform]);

  const wizardWinner = useMemo(
    () => (topRigPick?.score ? { model: topRigPick.row.displayName, score: topRigPick.score.total, grade: topRigPick.score.grade } : null),
    [topRigPick],
  );

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

  const refreshRig = useCallback(async () => {
    setIsScanningRig(true);
    setActivity('Checking this computer, Ollama, and available models...');

    try {
      const [profile, ollamaStatus, lmStudioStatus, catalogResponse] = await Promise.all([
        agentArcadeApi.getSystemProfile(),
        agentArcadeApi.getOllamaStatus(),
        agentArcadeApi.getLmStudioStatus(),
        agentArcadeApi.getOllamaCatalog({ force: true }),
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

  const toggleModelNewsNotifications = useCallback(async () => {
    const permission = getNotificationPermission();
    setNotificationPermission(permission);

    if (modelNewsNotificationsEnabled) {
      setModelNewsNotificationsEnabled(false);
      modelNewsNotificationsEnabledRef.current = false;
      window.localStorage.setItem(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY, 'false');
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
    window.localStorage.setItem(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY, 'true');
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
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'seen');
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
      setBenchmark(demoBenchmark);
      setBenchmarkByModel(upsertBenchmarkResults({}, [demoBenchmark]));
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
  }, []);

  const requestDeleteModel = useCallback((row: ModelRow) => {
    if (row.localProvider === 'lm-studio') {
      setActivity(`${row.displayName} is managed by LM Studio. Delete it from LM Studio if you want to free disk space.`);
      return;
    }
    setSelectedModel(row.displayName);
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

  const chooseInterfaceMode = useCallback((nextMode: UiMode) => {
    selectUiMode(nextMode);
    // Persist immediately and record that the splash choice was made so it
    // won't reappear next launch. The Simple wizard opens itself at Setup.
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, nextMode);
    window.localStorage.setItem(MODE_SPLASH_STORAGE_KEY, 'chosen');
    setShowModeSplash(false);
  }, [selectUiMode]);

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
      localStorage.setItem('rigmatch:model-notes:v1', JSON.stringify(next));
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
      }), modelToTest);
      setBenchmark(result);
      setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
      setModelScores((current) => upsertModelScores(current, [result], currentSuiteName));
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
      setActivity(`Benchmark failed: ${errorMessage}`);
    } finally {
      activeBenchmarkProgressIdRef.current = null;
      setIsBenchmarking(false);
    }
  }, [benchmarkPromptPlan, benchmarkQuestionCount, currentSuiteName, loadLogs, modelRows, ollama, recordRuns, selectedHost, selectedModel, system.hostname, effectiveJudge]);

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

  const pullQueuedModels = useCallback(async () => {
    if (queuedRows.length === 0) {
      setActivity('Pick a model to download before starting the queue.');
      return;
    }

    if (!ollama.ready) {
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
  }, [ollama.baseUrl, ollama.ready, pullProgressByModel, queuedRows, refreshRig, selectedHost?.hostname]);

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
      setActivity(`No missing Speed Dating contestants were queued. ${blockedReasons[0] ?? 'Check model availability first.'}`);
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
  }, [modelRows, ollama.baseUrl, queuedModelIds, system.gpu.vramGb, system.platform, system.storage.availableGb]);

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
      && !isLikelyImageGenerationModel(row.displayName));

    const ranked = [...eligible].sort((left, right) => {
      if (left.installed !== right.installed) return left.installed ? -1 : 1;
      return (right.sizeGb ?? 0) - (left.sizeGb ?? 0);
    }).slice(0, 5);

    if (ranked.length === 0) {
      setActivity('No models fit this computer yet — check your computer first, or download one.');
      return;
    }

    setShortlistIds(new Set(ranked.map((row) => row.displayName)));
    setActivity(`Picked ${ranked.length} contestant${ranked.length === 1 ? '' : 's'} that fit this computer.`);
  }, [modelRows, system.gpu.vramGb, system.platform]);

  const toggleShortlist = useCallback((row: ModelRow) => {
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
      setActivity(`${missingDownloadCount} Speed Dating contestant${missingDownloadCount === 1 ? '' : 's'} need downloads first. Open setup and use Download All.`);
      return;
    }

    if (runnableRows.length < 2) {
      setActivity('Pick at least 2 installed models for Speed Dating. Five is the sweet spot.');
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
        }), row.displayName);
        results.push(result);
        setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
        setModelScores((current) => upsertModelScores(current, [result], currentSuiteName));
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
      setActivity(`Speed Dating failed: ${errorMessage}`);
    } finally {
      activeBenchmarkProgressIdRef.current = null;
      setIsListTesting(false);
    }
  }, [benchmarkPromptPlan, benchmarkQuestionCount, currentSuiteName, loadLogs, ollama, recordRuns, selectNav, selectedHost, shortlistedRows, system.hostname, system.platform, uiMode, effectiveJudge]);

  const runSkillTestsAfterRun = useCallback(async (models: string[]) => {
    const selection = skillTestSelection;
    const appPrompt = resolveAppBuilderPrompt(selection.appPromptId, selection.appCustomPrompt);
    const codeTask = resolveCodeTask(selection.codeTaskId, selection.codeCustomTask);
    const jobs: Array<{ model: string; kind: 'app-builder' | 'image' | 'vision' | 'code' }> = [];
    for (const model of models) {
      if (selection.appBuilder && !isLikelyImageGenerationModel(model) && !isEmbeddingModel(model)) {
        jobs.push({ model, kind: 'app-builder' });
      }
      if (selection.code && !isLikelyImageGenerationModel(model) && !isEmbeddingModel(model)) {
        jobs.push({ model, kind: 'code' });
      }
      if (selection.image && isLikelyImageGenerationModel(model)) {
        jobs.push({ model, kind: 'image' });
      }
      if (selection.recognize && isVisionModel(model)) {
        jobs.push({ model, kind: 'vision' });
      }
    }
    if (!jobs.length) return;

    // A vision recognition job needs a picture to read; load the bundled test
    // image once up front.
    const visionImage = jobs.some((job) => job.kind === 'vision') ? await getVisionTestImageDataUrl(selection.recognizeImage) : '';

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
      } else {
        // Image generation can't stream tokens — show a "generating" state.
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: false });
        result = await runAdvancedImageGenerationChallenge(job.model, ollama.baseUrl, selection.imagePrompt);
        setLiveBuild({ model: job.model, kind: 'image', text: '', done: true, error: result.error });
      }
      if (!result.error) {
        const key = job.kind === 'image' ? `image:${job.model}`
          : job.kind === 'vision' ? `vision:${job.model}`
          : job.kind === 'code' ? `code:${job.model}`
          : job.model;
        writeAdvancedLabResults({ ...readAdvancedLabResults(), [key]: result });
        if (job.kind === 'app-builder') {
          const html = extractHtmlDocument(result.response);
          if (html) demos.push({ model: job.model, kind: 'app', html, judged: wasJudged(result), grade: result.grade, score: result.score });
        } else if (job.kind === 'code') {
          const code = extractCodeBlock(result.response);
          if (code) demos.push({ model: job.model, kind: 'code', code, language: result.language, note: result.checks[0]?.detail, grade: result.grade, score: result.score });
        } else if (job.kind === 'image' && result.imageDataUrl) {
          demos.push({ model: job.model, kind: 'image', imageDataUrl: result.imageDataUrl, grade: result.grade, score: result.score });
        } else if (job.kind === 'vision') {
          demos.push({ model: job.model, kind: 'vision', imageDataUrl: result.imageDataUrl, description: result.response, grade: result.grade, score: result.score });
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
  }, [ollama.baseUrl, skillTestSelection, effectiveJudge]);

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

  const confirmPendingRun = useCallback(() => {
    const mode = pendingRunMode;
    const model = pendingSingleModel;
    const skillModels = mode === 'single'
      ? [model ?? selectedModel].filter(Boolean)
      : shortlistedRows.filter((row) => row.installed).slice(0, 5).map((row) => row.displayName);
    setPendingRunMode(null);
    setPendingSingleModel(null);

    // Skill-tests-only: skip the Q&A benchmark and run just the selected skills.
    // Forced on for image-only lineups, since image models can't answer questions.
    const selection = skillTestSelection;
    const anySkill = selection.appBuilder || selection.image;
    const imageOnly = skillModels.length > 0 && skillModels.every(isLikelyImageGenerationModel);
    if (anySkill && (selection.skipQuestions || imageOnly)) {
      setActivity('Running skill tests only — the question round was skipped.');
      void runSkillTestsAfterRun(skillModels);
      return;
    }

    if (mode === 'single') {
      void startBenchmark(model).then(() => runSkillTestsAfterRun(skillModels));
      return;
    }

    if (mode === 'speed-date') {
      void runListTest().then(() => runSkillTestsAfterRun(skillModels));
    }
  }, [pendingRunMode, pendingSingleModel, runListTest, runSkillTestsAfterRun, selectedModel, shortlistedRows, skillTestSelection, startBenchmark]);

  const cancelPendingRun = useCallback(() => {
    setPendingRunMode(null);
    setPendingSingleModel(null);
    setActivity('Model test cancelled before resources were engaged.');
  }, []);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    const image = chatImage;
    // Allow an image-only send (e.g. "read this") but keep a default prompt so
    // the model always gets some text to act on.
    if (!message && !image) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message || (image ? 'What is in this image?' : ''),
      ...(image ? { images: [image] } : {}),
    };
    const chatModel = selectedModel;
    setChatMessagesByModel((prev) => ({
      ...prev,
      [chatModel]: [...(prev[chatModel] ?? [welcomeChatMessage]), userMessage],
    }));
    setChatInput('');
    setChatImage(null);

    try {
      const runtime = getModelRuntime(selectedRow, ollama);
      const response = await agentArcadeApi.sendChat({
        model: chatModel,
        message: userMessage.content,
        baseUrl: runtime.baseUrl,
        provider: runtime.provider,
        ...(image ? { images: [image] } : {}),
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
  }, [chatImage, chatInput, ollama, selectedModel, selectedRow]);

  useEffect(() => {
    void refreshRig();
  }, [refreshRig]);

  // Auto-reconnect: poll every 15s while Ollama is offline so the app self-heals
  // once the user installs or starts Ollama without needing to click "Check Local".
  useEffect(() => {
    if (!isDesktopRuntime) return;
    if (ollama.ready) return;
    const id = setInterval(() => { void refreshRig(); }, 15_000);
    return () => clearInterval(id);
  }, [ollama.ready, refreshRig]);

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
    window.localStorage.setItem(TEST_SUITE_STORAGE_KEY, JSON.stringify(benchmarkQuestions));
  }, [benchmarkQuestions]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  useEffect(() => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, uiMode);
  }, [uiMode]);

  useEffect(() => {
    window.localStorage.setItem(CLEARED_TOP_MATCHES_STORAGE_KEY, JSON.stringify([...clearedTopMatches]));
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
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
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
      {showModeSplash && <ModeSplash onPick={chooseInterfaceMode} />}
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
          modelsLoading={modelRows.length === 0}
          shortlistIds={shortlistIds}
          shortlistedRows={shortlistedRows}
          onTogglePick={toggleShortlist}
          onChooseForMe={chooseShortlistForMe}
          pullProgressByModel={pullProgressByModel}
          onStartDownloads={() => requestThirdPartyModelDownloads(shortlistedRows)}
          isListTesting={isListTesting}
          benchmarkActive={isListTesting || isBenchmarking || runProgress?.phase === 'running' || Boolean(externalBenchmark?.running)}
          runProgress={runProgress}
          onStartShow={() => { void runListTest(); }}
          onStopShow={requestStopRun}
          winner={wizardWinner}
          onChatWithWinner={openChatWithWinner}
          onOpenScorecard={() => { setCameFromSimple(true); selectUiMode('advanced'); selectNav('history'); }}
          onRunAgain={() => undefined}
          onSwitchToAdvanced={() => { setCameFromSimple(false); selectUiMode('advanced'); }}
          initialStep={wizardStep}
          onStepChange={setWizardStep}
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
        {activeNavId === 'bench' && (
          <BenchmarkRun
            active={true}
            model={selectedModel}
            benchmarkForModel={selectedBenchmark}
            selectedScore={selectedModelScore}
            isRunning={isBenchmarking}
            canBenchmark={canBenchmark}
            hostReady={selectedHostCanBenchmark}
            system={system}
            host={selectedHost}
            selectedRow={selectedRow}
            runProgress={runProgress}
            questionCount={benchmarkQuestionCount}
            onOpenSuiteEditor={() => setSuiteEditorOpen(true)}
            onOpenLogs={openLogsPanel}
            onStart={requestBenchmark}
            onStop={requestStopRun}
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
            logPath={logPath}
            isLoadingLogs={isLoadingLogs}
            onThemeChange={selectTheme}
            onUiModeChange={selectUiMode}
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
          canRunSpeedDate={shortlistedRows.length >= 2 && shortlistedRows.every((row) => row.installed) && !isBenchmarking && !isListTesting}
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
          pendingImage={chatImage}
          onAttachImage={setChatImage}
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
          shortlistedCount={shortlistedRows.length}
          uninstalledContestantCount={shortlistedRows.filter((r) => !r.installed).length}
          questionCount={benchmarkQuestionCount}
          benchmarkQuestions={benchmarkQuestions}
          system={system}
          onCancel={cancelPendingRun}
          onConfirm={confirmPendingRun}
          onDownloadMissing={() => requestThirdPartyModelDownloads(shortlistedRows)}
          onChangeQuestionCount={setBenchmarkQuestionCount}
          onLoadPreset={setBenchmarkQuestions}
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
                && !isLikelyImageGenerationModel(row.displayName))
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
          onDeleteUnscored={() => { void deleteRowsThenClose(unscoredRowsForCleanup, 'unscored'); }}
          onDeleteLowScored={() => { void deleteRowsThenClose(lowScoredRowsForCleanup, 'low-scored'); }}
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

      {tutorialOpen && (
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
  const steps: Array<{ round: string; title: string; body: ReactNode; prize: string; navId: NavId }> = [
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
          <div className="tutorial-how-it-works">
            <div className="tutorial-how-card">
              <Boxes aria-hidden="true" />
              <strong>Pick models</strong>
              <em>We flag which ones your PC can handle based on VRAM.</em>
            </div>
            <div className="tutorial-how-card">
              <Gauge aria-hidden="true" />
              <strong>Same test, every model</strong>
              <em>Same questions, timed and scored fairly on this hardware.</em>
            </div>
            <div className="tutorial-how-card">
              <Trophy aria-hidden="true" />
              <strong>Get your top match</strong>
              <em>Scorecards rank each model by answer quality, speed, finish rate, and computer fit.</em>
            </div>
          </div>
        </div>
      ),
      prize: 'Everything runs on this computer. No cloud, no account, no subscription.',
      navId: 'models' as NavId,
    },
    {
      round: '🔧 Setup',
      title: localProviderReady ? 'Local AI is running — you\'re set up!' : 'Connect a local AI provider to test models',
      body: localProviderReady ? (
        <div className="tutorial-intro-body">
          <div className="tutorial-ollama-status ready">
            <CheckCircle aria-hidden="true" />
            {providerSummary}
          </div>
          <p className="tutorial-intro-lead">RigMatch can benchmark through the local Ollama API or LM Studio's OpenAI-compatible local server. Everything stays on this computer.</p>
          <p>You're all set. Hit <strong>Next</strong> to see how the show works.</p>
        </div>
      ) : (
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
      prize: localProviderReady ? 'Engine ready — let\'s meet the contestants.' : 'Connect Ollama or start LM Studio local server, then check again.',
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
  const currentIndex = Math.min(Math.max(stepIndex, 0), steps.length - 1);
  const step = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;

  const goToStep = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), steps.length - 1);
    onStepChange(boundedIndex);
    onSelectNav(steps[boundedIndex].navId);
  };

  return (
    <div className="tutorial-backdrop" role="presentation">
      <section className="tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
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
            {steps.map((tutorialStep, index) => (
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

  // Ready state — compact success strip
  if (ready || !isDesktopRuntime) {
    const prepTitle = isDesktopRuntime ? `${platformName} ready` : 'Preview sample data';
    const prepMessage = isDesktopRuntime
      ? 'This computer is ready. RigMatch 0.2.x tests through local Ollama on this machine.'
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
            onClick={() => navigator.clipboard.writeText(ip.command)}
          >
            Copy
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

function RunWarningModal({
  mode,
  selectedModel,
  shortlistedCount,
  uninstalledContestantCount,
  questionCount,
  benchmarkQuestions,
  system,
  onCancel,
  onConfirm,
  onDownloadMissing,
  onChangeQuestionCount,
  onLoadPreset,
  onEditQuestions,
  lineupModels,
  skillSelection,
  onSkillSelectionChange,
  qualityMode,
  judgeModel,
  judgeModelOptions,
  onChangeQualityMode,
  onChangeJudgeModel,
  judgeSource,
  onChangeJudgeSource,
  cloudJudgeModel,
  onChangeCloudJudgeModel,
  openRouterKey,
  onChangeOpenRouterKey,
  judgeActive,
}: {
  mode: PendingRunMode;
  selectedModel: string;
  shortlistedCount: number;
  uninstalledContestantCount: number;
  questionCount: BenchmarkQuestionCount;
  benchmarkQuestions: BenchmarkQuestion[];
  system: SystemProfile;
  onCancel: () => void;
  onConfirm: () => void;
  onDownloadMissing?: () => void;
  onChangeQuestionCount: (count: BenchmarkQuestionCount) => void;
  onLoadPreset?: (questions: BenchmarkQuestion[]) => void;
  onEditQuestions?: () => void;
  lineupModels: string[];
  skillSelection: SkillTestSelection;
  onSkillSelectionChange: (selection: SkillTestSelection) => void;
  qualityMode: 'heuristic' | 'judge';
  judgeModel: string;
  judgeModelOptions: string[];
  onChangeQualityMode: (mode: 'heuristic' | 'judge') => void;
  onChangeJudgeModel: (model: string) => void;
  judgeSource: 'local' | 'openrouter';
  onChangeJudgeSource: (source: 'local' | 'openrouter') => void;
  cloudJudgeModel: string;
  onChangeCloudJudgeModel: (model: string) => void;
  openRouterKey: string;
  onChangeOpenRouterKey: (key: string) => void;
  judgeActive: boolean;
}) {
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const recognizeUploadRef = useRef<HTMLInputElement>(null);
  const activePreset = BENCHMARK_PRESETS.find(
    (p) => p.questions.length === benchmarkQuestions.length &&
      p.questions.every((q, i) => q.id === benchmarkQuestions[i]?.id),
  ) ?? null;
  const title = mode === 'single' ? 'Test One Selected Model?' : 'Start Speed Dating?';
  const subject = mode === 'single' ? selectedModel : `${shortlistedCount} picked models`;
  const totalQuestions = mode === 'single' ? questionCount : questionCount * shortlistedCount;
  const runScope = mode === 'single'
    ? 'This tests only the model you selected in Contestants. Use Speed Dating when you want to compare a full lineup.'
    : 'This compares every picked model with the same questions and ranks the final Match scores.';

  // Skill-test capability + skip-questions state, hoisted so both the question
  // and skill sections (and the footer) can react to it.
  const appBuilderCapable = lineupModels.some((m) => !isLikelyImageGenerationModel(m) && !isEmbeddingModel(m));
  const hasImageModel = lineupModels.some((m) => isLikelyImageGenerationModel(m));
  const visionCapable = lineupModels.some((m) => isVisionModel(m));
  const isMac = system.platform === 'darwin';
  const imageCapable = hasImageModel;
  // Code Challenge needs a code-capable model AND a judge — it's the only way to
  // grade arbitrary-language code (nothing to run/preview).
  const codeCapable = appBuilderCapable && judgeActive;
  // Every model in the lineup is image-only → the Q&A round can't run at all.
  const imageOnlyLineup = lineupModels.length > 0 && lineupModels.every(isLikelyImageGenerationModel);
  const anySkillSelected = (skillSelection.appBuilder && appBuilderCapable) || (skillSelection.code && codeCapable) || (skillSelection.image && imageCapable) || (skillSelection.recognize && visionCapable);
  const skipQuestions = anySkillSelected && (skillSelection.skipQuestions || imageOnlyLineup);
  // Block the doomed case: an image-only model with no skill selected would just
  // fail the questions. Require a skill (the image one) first.
  const startBlocked = imageOnlyLineup && !anySkillSelected;

  const questionLabels: Record<BenchmarkQuestionCount, string> = {
    10:  '10 — Quick (~3 min per model)',
    20:  '20 — Standard (~5 min per model)',
    50:  '50 — Deep (~15 min per model)',
    100: '100 — Full suite (30+ min per model)',
  };

  // Rough minutes per model at each suite size (matches the labels above), scaled
  // by lineup size. Not knowing how long a run takes is the biggest hesitation
  // before the app's main action, so state it up front on the button.
  const minutesPerModel: Record<BenchmarkQuestionCount, number> = { 10: 3, 20: 5, 50: 15, 100: 30 };
  const runModelCount = mode === 'single' ? 1 : Math.max(1, shortlistedCount);
  const estimatedMinutes = skipQuestions ? 0 : minutesPerModel[questionCount] * runModelCount;
  const estimateLabel = estimatedMinutes > 0
    ? `~${estimatedMinutes} min${runModelCount > 1 ? ` total · ${runModelCount} models` : ''}`
    : null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal" role="dialog" aria-modal="true" aria-labelledby="run-warning-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>{mode === 'single' ? 'One-model test' : 'Resource Warning'}</span>
            <strong id="run-warning-title">{title}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            {skipQuestions ? (
              <>RigMatch will run the selected <strong>skill test{skillSelection.appBuilder && skillSelection.image ? 's' : ''}</strong> on <strong>{subject}</strong> and skip the question round.</>
            ) : (
              <>RigMatch will test <strong>{subject}</strong> with <strong>{totalQuestions}</strong> total question{totalQuestions === 1 ? '' : 's'}.</>
            )} This can heavily use CPU, GPU, VRAM, RAM,
            storage bandwidth, fans, and battery until the run finishes.
          </p>
          <p>{runScope}</p>

          {onLoadPreset && (
            <div className="run-focus-picker">
              <span className="run-focus-label">Test Focus</span>
              <div className="run-focus-chips">
                <button
                  type="button"
                  className={!activePreset ? 'active' : ''}
                  onClick={() => onLoadPreset(DEFAULT_BENCHMARK_QUESTIONS)}
                  aria-pressed={!activePreset ? 'true' : 'false'}
                >
                  General
                </button>
                {BENCHMARK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={activePreset?.id === preset.id ? 'active' : ''}
                    onClick={() => onLoadPreset(preset.questions)}
                    aria-pressed={activePreset?.id === preset.id ? 'true' : 'false'}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <em className="run-focus-hint">
                {activePreset ? activePreset.description : 'Mixed general-purpose questions covering JSON output, instruction following, and daily tasks.'}
              </em>
            </div>
          )}

          <div className="run-question-picker">
            <div className="run-question-picker-head">
              <span>Questions per model</span>
              <div className="run-question-picker-actions">
                <button
                  type="button"
                  className="run-question-preview-toggle"
                  onClick={() => setQuestionsExpanded((v) => !v)}
                  aria-expanded={questionsExpanded}
                >
                  {questionsExpanded ? 'Hide questions' : 'Preview questions'}
                </button>
                {onEditQuestions && (
                  <button type="button" className="run-question-edit-link advanced-only" onClick={onEditQuestions}>
                    Edit suite ↗
                  </button>
                )}
              </div>
            </div>
            {skipQuestions && (
              <div className="run-question-skipped-note">
                Questions are skipped — this run does the selected skill test{anySkillSelected && (skillSelection.appBuilder && skillSelection.image) ? 's' : ''} only.
              </div>
            )}
            <div className={`run-question-options${skipQuestions ? ' is-muted' : ''}`} role="group" aria-label="Questions per model">
              {([10, 20, 50, 100] as BenchmarkQuestionCount[]).map((count) => (
                <button
                  key={count}
                  type="button"
                  className={count === questionCount ? 'active' : ''}
                  onClick={() => onChangeQuestionCount(count)}
                  aria-pressed={count === questionCount}
                >
                  {questionLabels[count]}
                </button>
              ))}
            </div>
            {questionsExpanded && (
              <ol className="run-question-preview-list">
                {benchmarkQuestions.slice(0, questionCount).map((q) => (
                  <li key={q.id}>
                    <span className="run-q-label">{q.label}</span>
                    <em className="run-q-prompt">{q.prompt}</em>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="run-question-picker">
            <div className="run-question-picker-head">
              <span>Answer grading</span>
              <em>How answer quality — and whether a built app actually works — is scored.</em>
            </div>
            <div className="run-question-options" role="group" aria-label="Answer grading mode">
              <button
                type="button"
                className={qualityMode === 'heuristic' ? 'active' : ''}
                onClick={() => onChangeQualityMode('heuristic')}
                aria-pressed={qualityMode === 'heuristic'}
              >
                Fast (built-in)
              </button>
              <button
                type="button"
                className={qualityMode === 'judge' ? 'active' : ''}
                onClick={() => onChangeQualityMode('judge')}
                aria-pressed={qualityMode === 'judge'}
              >
                Judge model
              </button>
            </div>
            {qualityMode === 'judge' && (
              <>
                <div className="run-question-options run-judge-source" role="group" aria-label="Judge source">
                  <button
                    type="button"
                    className={judgeSource === 'local' ? 'active' : ''}
                    onClick={() => onChangeJudgeSource('local')}
                    aria-pressed={judgeSource === 'local'}
                  >
                    Local model
                  </button>
                  <button
                    type="button"
                    className={judgeSource === 'openrouter' ? 'active' : ''}
                    onClick={() => onChangeJudgeSource('openrouter')}
                    aria-pressed={judgeSource === 'openrouter'}
                  >
                    Cloud (OpenRouter)
                  </button>
                </div>
                {judgeSource === 'local' ? (
                  judgeModelOptions.length === 0 ? (
                    <div className="run-question-skipped-note">
                      No local models installed to grade with — install one first, use the cloud judge, or use Fast grading.
                    </div>
                  ) : (
                    <>
                      <label className="run-judge-model">
                        <span>Graded by</span>
                        <select value={judgeModel} onChange={(e) => onChangeJudgeModel(e.target.value)}>
                          {judgeModelOptions.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      {lineupModels.includes(judgeModel) ? (
                        <div className="run-question-skipped-note">
                          Heads up: {judgeModel} is also being tested. A model grading itself can inflate its own score — pick a different judge if you can.
                        </div>
                      ) : (
                        <div className="run-question-skipped-note">
                          {judgeModel} grades every answer — and reads any app built in a skill test to judge whether it actually runs. Slower, but far more accurate than the built-in checks. Everything stays on this computer.
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <details className="run-judge-explainer">
                      <summary>What's OpenRouter, and why would I want this?</summary>
                      <p>
                        Grading answers well is a <em>reading</em> task, and the frontier cloud models are far
                        better graders than anything that fits on a home GPU — a small local judge can miss bugs
                        or grade a broken app as working. <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a> is
                        one account and one API key that gives pay-per-use access to all of them (Claude, GPT,
                        Gemini and more) — no subscription. Judging is tiny: each verdict reads a short rubric and
                        writes a one-line score, so grading a whole run costs pennies. Sign up at openrouter.ai,
                        add a few dollars of credit, create a key, and paste it below. Trade-off to know:
                        graded content leaves this computer, which is why this is opt-in and never the default.
                      </p>
                    </details>
                    <label className="run-judge-model">
                      <span>Guest judge</span>
                      <select
                        value={CLOUD_JUDGE_PRESETS.some((preset) => preset.id === cloudJudgeModel) ? cloudJudgeModel : '__custom__'}
                        onChange={(e) => onChangeCloudJudgeModel(e.target.value === '__custom__' ? '' : e.target.value)}
                      >
                        {CLOUD_JUDGE_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                        <option value="__custom__">Custom OpenRouter model…</option>
                      </select>
                    </label>
                    {!CLOUD_JUDGE_PRESETS.some((preset) => preset.id === cloudJudgeModel) && (
                      <label className="run-judge-model">
                        <span>Model id</span>
                        <input
                          type="text"
                          value={cloudJudgeModel}
                          onChange={(e) => onChangeCloudJudgeModel(e.target.value)}
                          placeholder="vendor/model — any OpenRouter id"
                          spellCheck={false}
                        />
                      </label>
                    )}
                    <label className="run-judge-model">
                      <span>API key</span>
                      <input
                        type="password"
                        value={openRouterKey}
                        onChange={(e) => onChangeOpenRouterKey(e.target.value)}
                        placeholder="sk-or-…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    {openRouterKey.trim() ? (
                      <div className="run-question-skipped-note">
                        Cloud judging sends each question, the model's answer, and any built-app code to OpenRouter for grading, and uses your OpenRouter credits. Your key stays on this computer. If the cloud judge fails, scoring falls back to the built-in checks.
                      </div>
                    ) : (
                      <div className="run-question-skipped-note">
                        Enter your OpenRouter API key to enable cloud grading — without it, this run uses the built-in checks. Cloud judging is never on by default: it sends graded content to OpenRouter and costs credits.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="run-skill-tests">
            <div className="run-skill-tests-head">
              <span>Skill Tests (optional)</span>
              <em>Extra Lab Grades — run them after the questions, or on their own. Models that cannot do a skill are grayed out.</em>
            </div>
            {(() => {
              // Capability flags are hoisted to the component body above. Image
              // generation is allowed on any platform (mirrors the Image Lab's
              // "try anyway"); MLX-only models fail with a clear message.
              return (
                <>
                  <label className={`run-skill-test-option${appBuilderCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.appBuilder && appBuilderCapable}
                      disabled={!appBuilderCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, appBuilder: event.target.checked })}
                    />
                    <span>
                      <strong>Build an app</strong>
                      <em>{appBuilderCapable
                        ? `Adds roughly 1–3 minutes per model. The finished app pops up to play when it's done.`
                        : 'No model in this run can write code — image and embedding models sit this one out.'}</em>
                    </span>
                  </label>
                  {appBuilderCapable && skillSelection.appBuilder && (
                    <div className="run-skill-app-picker">
                      <select
                        className="run-skill-app-select"
                        value={skillSelection.appPromptId}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, appPromptId: event.target.value })}
                        aria-label="App to build"
                      >
                        {APP_BUILDER_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                        <option value="custom">Custom prompt…</option>
                      </select>
                      {skillSelection.appPromptId === 'custom' && (
                        <input
                          type="text"
                          className="run-skill-image-prompt"
                          value={skillSelection.appCustomPrompt}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, appCustomPrompt: event.target.value })}
                          placeholder="Describe the app to build (e.g. a memory card game)"
                          aria-label="Custom app prompt"
                        />
                      )}
                    </div>
                  )}
                  <label className={`run-skill-test-option${codeCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.code && codeCapable}
                      disabled={!codeCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, code: event.target.checked })}
                    />
                    <span>
                      <strong>Code Challenge</strong>
                      <em>{!appBuilderCapable
                        ? 'No model in this run can write code — image and embedding models sit this one out.'
                        : !judgeActive
                          ? 'Turn on Judge grading above — code can only be graded by a model that reads it.'
                          : 'Solve a coding task in a language you pick. Graded by the judge (no run/preview). Adds ~1–2 min per model.'}</em>
                    </span>
                  </label>
                  {codeCapable && skillSelection.code && (
                    <div className="run-skill-app-picker">
                      <select
                        className="run-skill-app-select"
                        value={skillSelection.codeLanguage}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeLanguage: event.target.value })}
                        aria-label="Programming language"
                      >
                        {CODE_LANGUAGES.map((lang) => (
                          <option key={lang.id} value={lang.id}>{lang.label}</option>
                        ))}
                      </select>
                      <select
                        className="run-skill-app-select"
                        value={skillSelection.codeTaskId}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeTaskId: event.target.value })}
                        aria-label="Coding task"
                      >
                        {CODE_TASK_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                        <option value="custom">Custom task…</option>
                      </select>
                      {skillSelection.codeTaskId === 'custom' && (
                        <input
                          type="text"
                          className="run-skill-image-prompt"
                          value={skillSelection.codeCustomTask}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeCustomTask: event.target.value })}
                          placeholder="Describe the coding task (e.g. merge two sorted lists)"
                          aria-label="Custom coding task"
                        />
                      )}
                    </div>
                  )}
                  <label className={`run-skill-test-option${imageCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.image && imageCapable}
                      disabled={!imageCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, image: event.target.checked })}
                    />
                    <span>
                      <strong>Create an image</strong>
                      <em>{!hasImageModel
                        ? 'No image-generation model in this run. Install one (like x/flux2-klein) to unlock.'
                        : isMac
                          ? 'Adds roughly 1–4 minutes per image model. Uses the prompt below.'
                          : 'Adds roughly 1–4 minutes. RigMatch will try on this PC — some image models are macOS-only (MLX) and will report why if they can\'t load.'}</em>
                    </span>
                  </label>
                  {imageCapable && skillSelection.image && (
                    <input
                      type="text"
                      className="run-skill-image-prompt"
                      value={skillSelection.imagePrompt}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, imagePrompt: event.target.value })}
                      placeholder="Describe the image to generate"
                      aria-label="Image generation prompt"
                    />
                  )}
                  <label className={`run-skill-test-option${visionCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.recognize && visionCapable}
                      disabled={!visionCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, recognize: event.target.checked })}
                    />
                    <span>
                      <strong>Recognize an image</strong>
                      <em>{visionCapable
                        ? 'Shows a vision model a picture and streams its live description. Pick one below or upload your own. Adds about a minute per model.'
                        : 'No vision/OCR model in this run. Add one (like llava or a -vl model) to unlock.'}</em>
                    </span>
                  </label>
                  {visionCapable && skillSelection.recognize && (
                    <div className="run-recognize-picker" role="group" aria-label="Choose the image the model should read">
                      {VISION_TEST_IMAGES.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          className={`run-recognize-thumb${skillSelection.recognizeImage === img.src ? ' active' : ''}`}
                          onClick={() => onSkillSelectionChange({ ...skillSelection, recognizeImage: img.src })}
                          title={img.label}
                          aria-label={img.label}
                          aria-pressed={skillSelection.recognizeImage === img.src}
                        >
                          <img src={img.src} alt={img.label} />
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`run-recognize-thumb upload${skillSelection.recognizeImage.startsWith('data:') ? ' active' : ''}`}
                        onClick={() => recognizeUploadRef.current?.click()}
                        title="Upload your own image"
                        aria-label="Upload your own image"
                      >
                        {skillSelection.recognizeImage.startsWith('data:')
                          ? <img src={skillSelection.recognizeImage} alt="Uploaded" />
                          : <><ImagePlus aria-hidden="true" /><span>Upload</span></>}
                      </button>
                      <input
                        ref={recognizeUploadRef}
                        type="file"
                        accept="image/*"
                        className="chat-file-input"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (!file || !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') onSkillSelectionChange({ ...skillSelection, recognizeImage: reader.result });
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </div>
                  )}
                  {/* Run only the skills, skipping the Q&A round. Placed right
                      under the skill choices (before the coming-soon video row)
                      so a "coding job, no questions" run is easy to find. Forced
                      on for image-only lineups, which can't answer questions. */}
                  <label className={`run-skill-test-option skip-questions${anySkillSelected ? ' is-active' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skipQuestions}
                      disabled={!anySkillSelected || imageOnlyLineup}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, skipQuestions: event.target.checked })}
                    />
                    <span>
                      <strong>Skip the questions — run the skill test only</strong>
                      <em>{imageOnlyLineup
                        ? 'This is an image model — it can\'t answer text questions, so RigMatch runs only the image skill.'
                        : anySkillSelected
                          ? 'Jump straight to the selected skill test (e.g. a coding job) — no question round, no Match score.'
                          : 'Tick a skill test above to enable a skill-only run.'}</em>
                    </span>
                  </label>

                  <label className="run-skill-test-option disabled">
                    <input type="checkbox" checked={false} disabled />
                    <span>
                      <strong>Create a video</strong>
                      <em>No local backend can generate video yet — this unlocks when one ships.</em>
                    </span>
                  </label>
                </>
              );
            })()}
          </div>

          {startBlocked && (
            <div className="run-download-warning">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>This is an image model and can't answer the questions. Tick <strong>Create an image</strong> above to test it.</span>
            </div>
          )}

          <div className="modal-warning-grid">
            <div>
              <span>GPU</span>
              <strong>{system.gpu.model}</strong>
              <em>{system.gpu.vramGb ? `${system.gpu.vramGb} GB VRAM` : 'VRAM unknown'}</em>
            </div>
            <div>
              <span>CUDA</span>
              <strong>{getCudaSummary(system.cuda)}</strong>
              <em>{getCudaDetail(system.cuda)}</em>
            </div>
            <div>
              <span>Battery</span>
              <strong>{system.battery.hasBattery ? `${system.battery.percent ?? '?'}%` : 'AC desktop'}</strong>
              <em>{system.battery.hasBattery ? 'Plug in before long runs.' : 'No battery detected.'}</em>
            </div>
          </div>
        </div>
        {uninstalledContestantCount > 0 && mode === 'speed-date' && (
          <div className="run-download-warning">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>
              {uninstalledContestantCount === 1
                ? "1 contestant in your lineup isn’t downloaded yet."
                : `${uninstalledContestantCount} contestants in your lineup aren’t downloaded yet.`}
              {' '}Download them before starting. Downloads run through your local Ollama install and may be subject to third-party model terms.
            </span>
            {onDownloadMissing && (
              <button type="button" className="mini-button outline" onClick={onDownloadMissing}>
                <Download aria-hidden="true" />
                Download All
              </button>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            className="primary-button compact"
            onClick={onConfirm}
            disabled={(uninstalledContestantCount > 0 && mode === 'speed-date') || startBlocked}
          >
            <Zap aria-hidden="true" />
            {skipQuestions ? 'Run Skill Test' : mode === 'single' ? 'Start Test' : 'Start Speed Dating'}
            {estimateLabel && <em className="run-estimate">{estimateLabel}</em>}
          </button>
        </div>
      </section>
    </div>
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
  const [dontWarnAgain, setDontWarnAgain] = useState(false);
  const sizeLabel = row.sizeGb ? `${formatGb(row.sizeGb)}` : 'its full weights';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal" role="dialog" aria-modal="true" aria-labelledby="quick-check-warning-title">
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
  const isAll = pending.mode === 'all';
  const title = isAll ? 'Clear All Scores?' : `Clear ${pending.model} Score?`;
  const actionLabel = isAll ? 'Clear All Scores' : 'Clear Score';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="clear-scores-title">
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

const SCORE_WEIGHTS = [
  { label: 'Quality', pct: 34, detail: 'Average per-prompt answer quality score (0–100). Measured by rule-based heuristics: does JSON parse? Does the truth-trap get a humble answer? Does the format match? No cloud AI judge — entirely local.' },
  { label: 'Speed', pct: 32, detail: 'Median tokens/sec across 3 timed runs on your hardware × 1.5, plus a bonus for responses under ~6 s. This reflects your machine, not some cloud baseline.' },
  { label: 'Reliability', pct: 18, detail: 'Percentage of prompts that returned a non-empty response. A model that crashes or stalls hurts here.' },
  { label: 'Computer Fit', pct: 16, detail: 'How well the model size matches a typical home rig. Tiny 1–3B models score highest (96); 70B+ models score lowest (38) unless you have 48 GB+ VRAM.' },
];

// Grade rows derived from the single canonical band list, so every table in the
// UI shows exactly the grades the engine assigns. Two hand-written tables used
// to disagree with each other and with gradeFor(), which let the app display a
// grade ("A-") that appeared in neither.
const GRADE_TONES: Record<string, string> = { S: 'elite', A: 'good', 'B+': 'good', B: 'good', C: 'ok', D: 'low' };
const MATCH_GRADE_BAND_ROWS = MATCH_GRADE_BANDS.map((band, index) => {
  const upper = index === 0 ? 100 : MATCH_GRADE_BANDS[index - 1].min - 1;
  return {
    grade: band.grade,
    range: `${band.min}–${upper}`,
    tone: GRADE_TONES[band.grade] ?? 'ok',
  };
});
const GRADE_ROWS = MATCH_GRADE_BAND_ROWS;

function HowWeScoreSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="how-we-score-section">
      <button
        type="button"
        className="how-we-score-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? 'true' : 'false'}
      >
        <span>How We Score</span>
        <ChevronDown className={open ? 'rotated' : ''} aria-hidden="true" />
      </button>
      {open && (
        <div className="how-we-score-body">
          <p className="how-we-score-intro">
            All scoring is deterministic rule-based heuristics running locally. No cloud AI judge, no telemetry.
            Results reflect <em>your</em> hardware.
          </p>

          <div className="score-weight-list">
            {SCORE_WEIGHTS.map(({ label, pct, detail }) => (
              <div key={label} className="score-weight-row">
                <div className="score-weight-head">
                  <strong>{label}</strong>
                  <span className="score-weight-pct">{pct}%</span>
                </div>
                <div className="score-weight-bar">
                  <div className="score-weight-fill" style={{ width: `${pct * 2}%` }} />
                </div>
                <p>{detail}</p>
              </div>
            ))}
          </div>

          <div className="score-grade-table">
            <span className="score-grade-label">Grade scale</span>
            <div className="score-grade-rows">
              {GRADE_ROWS.map(({ grade, range }) => (
                <div key={grade} className="score-grade-row">
                  <strong>{grade}</strong>
                  <em>{range}</em>
                </div>
              ))}
            </div>
          </div>

          <p className="how-we-score-footer">
            Scores are <em>relative to your rig</em>. A model that scores 88 on a 12 GB GPU will score differently
            on a Mac Studio with 64 GB unified memory.
          </p>
          <p className="how-we-score-footer">
            <strong>Answer quality is a heuristic proxy, not a verdict.</strong> The rule-based checks catch obvious
            wins and failures, but they can misjudge a good answer written in an unexpected way. When a quality score
            looks off, open the scorecard and read the saved answer transcript — that is the source of truth.
          </p>
        </div>
      )}
    </section>
  );
}

function UiModePicker({
  uiMode,
  onUiModeChange,
}: {
  uiMode: UiMode;
  onUiModeChange: (mode: UiMode) => void;
}) {
  const modes: Array<{ id: UiMode; label: string; description: string }> = [
    { id: 'beginner', label: 'Simple', description: 'Free guided path: check, pick, compare, use the winner.' },
    { id: 'advanced', label: 'Advanced', description: 'Power tools for deeper testing, diagnostics, and supporter experiments.' },
  ];

  return (
    <section className="ui-mode-picker" aria-label="Interface mode">
      <div>
        <span>Interface Mode</span>
        <strong>{uiMode === 'beginner' ? 'Simple Mode is on' : 'Advanced Mode is on'}</strong>
      </div>
      <div className="mode-toggle" role="group" aria-label="Choose interface mode">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={uiMode === mode.id ? 'active' : ''}
            onClick={() => onUiModeChange(mode.id)}
            aria-pressed={uiMode === mode.id}
          >
            <strong>{mode.label}</strong>
            <span>{mode.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}


function ThemePicker({
  themeId,
  onThemeChange,
}: {
  themeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
}) {
  return (
    <section className="theme-picker" aria-label="Theme selector">
      <div>
        <span>Theme</span>
        <strong>{getThemeLabel(themeId)}</strong>
      </div>
      <div className="theme-grid">
        {themeOptions.map((theme) => {
          const selected = theme.id === themeId;
          return (
            <button
              key={theme.id}
              type="button"
              className={selected ? 'theme-card active' : 'theme-card'}
              onClick={() => onThemeChange(theme.id)}
              aria-pressed={selected}
            >
              <span className="theme-swatches" aria-hidden="true">
                {theme.swatches.map((swatch) => (
                  <i key={swatch} style={{ background: swatch }} />
                ))}
              </span>
              <strong>{theme.label}</strong>
              <em>{theme.description}</em>
            </button>
          );
        })}
      </div>
    </section>
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
  const [accepted, setAccepted] = useState(false);
  const visibleRows = rows.slice(0, 5);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal third-party-download-modal" role="dialog" aria-modal="true" aria-labelledby="third-party-download-title">
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

          <div className="third-party-download-links" aria-label="Model provider terms">
            {THIRD_PARTY_MODEL_LINKS.map((link) => (
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


function UtilityPanel({
  panel,
  listTestResult,
  selectedHost,
  selectedModel,
  ollama,
  system,
  themeId,
  uiMode,
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
  const recentModelScores = useMemo(() => getRecentModelScores(modelScores), [modelScores]);
  const rankedModelScores = useMemo(() => getRankedModelScores(modelScores), [modelScores]);
  const taskPicks = useMemo(() => getTaskTopPicks(modelScores), [modelScores]);
  const topRankedScore = rankedModelScores[0];
  const savedChatMessageCount = Math.max(0, chatMessages.length - 1);
  const [scoreExplainerOpen, setScoreExplainerOpen] = useState(false);
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="How we score" onClick={() => setScoreExplainerOpen(false)}>
          <div className="run-warning-modal score-explainer-modal" onClick={(e) => e.stopPropagation()}>
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
          {taskPicks.length > 0 && (
            <div className="task-picks-section" aria-label="Category picks">
              <span>Category picks</span>
              <div className="task-picks-grid">
                {taskPicks.map((pick) => (
                  <div key={pick.id} className="task-pick-card">
                    <em>{pick.label}</em>
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
                return (
                  <li
                    key={`${score.model}-${score.completedAt}`}
                    className={`${isTied ? 'score-row-tied' : ''}${onSelectTopPick ? ' score-row-clickable' : ''}`}
                    onClick={() => onSelectTopPick?.(score.model)}
                    title={onSelectTopPick ? `View ${score.model} in Top Pick` : undefined}
                    role={onSelectTopPick ? 'button' : undefined}
                    tabIndex={onSelectTopPick ? 0 : undefined}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTopPick?.(score.model); }}
                  >
                    <b>{isTied ? '=' : index + 1}</b>
                    <div className="score-row-name">
                      <span>
                        {score.model}
                        {isLegacyScore(score) && <span className="legacy-score-badge">Retest recommended</span>}
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
                <button type="button" className="mini-button outline icon-only" onClick={onCopyLogs} disabled={!appLogs.length} title="Copy logs" aria-label="Copy logs">
                  <Copy aria-hidden="true" />
                </button>
                <button type="button" className="mini-button outline icon-only" onClick={onOpenLogsFolder} title="Open log folder" aria-label="Open log folder">
                  <FolderOpen aria-hidden="true" />
                </button>
                <button type="button" className="mini-button outline" onClick={onClearLogs} disabled={!appLogs.length}>
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
        <div className="utility-body">
          <div className="utility-logo">
            <BrandMark />
            <strong>RigMatch</strong>
            <em>v{APP_VERSION}</em>
          </div>
          <SettingsSection eyebrow="Interface" title="Preferences" summary="Mode, theme, and the Simple Mode path." defaultOpen>
          <UiModePicker uiMode={uiMode} onUiModeChange={onUiModeChange} />
          <ThemePicker themeId={themeId} onThemeChange={onThemeChange} />
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
                onClick={() => void navigator.clipboard?.writeText(buildDiagnosticsText(system, ollama, logPath)).catch(() => undefined)}
                title="Copy hardware + version info to clipboard"
              >
                <Copy aria-hidden="true" />
                Copy Diagnostics
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
              <em>Clears RigMatch logs, scores, comparison results, chat, saved theme, and custom question suite. Installed Ollama models stay put.</em>
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

function SettingsSection({
  eyebrow,
  title,
  summary,
  defaultOpen = false,
  advancedOnly = false,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  advancedOnly?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`settings-section${isOpen ? ' open' : ''}${advancedOnly ? ' advanced-only' : ''}`}>
      <button
        type="button"
        className="settings-section-toggle"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
      >
        <div>
          <span>{eyebrow}</span>
          <strong>{title}</strong>
          <em>{summary}</em>
        </div>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen && <div className="settings-section-body">{children}</div>}
    </section>
  );
}

function HistoryTimeline({
  scores,
  onClearScore,
}: {
  scores: TestedModelScore[];
  onClearScore: (model: string) => void;
}) {
  if (!scores.length) {
    return (
      <div className="history-timeline empty" aria-label="Test history timeline">
        <strong>No test timeline yet</strong>
        <span>Run a compatibility test and RigMatch will keep the local score story here.</span>
      </div>
    );
  }

  return (
    <section className="history-timeline" aria-label="Test history timeline">
      <div className="history-timeline-head">
        <span>Test History Timeline</span>
        <strong>{scores.length} saved result{scores.length === 1 ? '' : 's'}</strong>
      </div>
      <ol>
        {scores.slice(0, 6).map((score) => (
          <li key={`${score.model}-${score.completedAt}`}>
            <time>{formatHistoryTime(score.completedAt)}</time>
            <div>
              <strong>{score.model}</strong>
              <span>{getScoreTimelineNote(score)}</span>
            </div>
            <em>{score.total} · {score.grade}</em>
            <button
              type="button"
              className="icon-action score-clear-button"
              onClick={() => onClearScore(score.model)}
              title={`Clear ${score.model} score`}
              aria-label={`Clear ${score.model} score`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LogEntry({ entry }: { entry: AppLogEntry }) {
  const details = formatLogDetails(entry.details);

  return (
    <article className={`log-entry ${entry.level}`}>
      <div className="log-entry-meta">
        <span>{formatLogTime(entry.timestamp)}</span>
        <strong>{entry.level}</strong>
        <em>{entry.source}</em>
      </div>
      <p>{entry.message}</p>
      {details && (
        <details>
          <summary>Details</summary>
          <pre>{details}</pre>
        </details>
      )}
    </article>
  );
}

type FirstModelUseCase = 'chat' | 'code' | 'writing' | 'reasoning' | 'speed';

const USE_CASES: Array<{ id: FirstModelUseCase; emoji: string; label: string; description: string }> = [
  { id: 'chat',      emoji: '💬', label: 'Chat & Daily Help',   description: 'Ask questions, get summaries, brainstorm ideas' },
  { id: 'code',      emoji: '💻', label: 'Coding',              description: 'Write code, debug, explain errors' },
  { id: 'writing',   emoji: '✍️',  label: 'Writing',            description: 'Drafts, emails, creative content' },
  { id: 'reasoning', emoji: '🧠', label: 'Research & Analysis', description: 'Deep thinking, comparisons, long documents' },
  { id: 'speed',     emoji: '⚡', label: 'Just the Fastest',    description: 'Quick answers, low-latency, lightweight' },
];

type FirstModelPick = { id: string; name: string; size: string; why: string; vramNote: string };

function getFirstModelPicks(useCase: FirstModelUseCase, vramGb: number): FirstModelPick[] {
  const tier = vramGb >= 16 ? 'large' : vramGb >= 10 ? 'medium' : vramGb >= 6 ? 'small' : 'tiny';

  const picks: Record<FirstModelUseCase, Record<string, FirstModelPick[]>> = {
    chat: {
      large:  [
        { id: 'llama3.1:8b',   name: 'Llama 3.1 8B',   size: '4.9 GB', why: 'Meta\'s flagship chat model — balanced, articulate, great for everyday conversation', vramNote: 'Runs fully in VRAM' },
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Google\'s compact model — fast, friendly, surprisingly capable for its size', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Google\'s compact model — fast, friendly, great for daily chat', vramNote: 'Runs fully in VRAM' },
        { id: 'llama3.2:3b',   name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Meta\'s small but sharp chat model — snappy and reliable', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'llama3.2:3b',   name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Meta\'s small but sharp chat model — snappy and reliable', vramNote: 'Runs fully in VRAM' },
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Microsoft\'s tiny powerhouse — efficient and surprisingly good at conversation', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Microsoft\'s tiny powerhouse — the best chat you\'ll get on limited hardware', vramNote: 'May use system RAM' },
        { id: 'llama3.2:1b',   name: 'Llama 3.2 1B',   size: '1.3 GB', why: 'Ultra-light — runs anywhere, answers quickly', vramNote: 'Runs on CPU too' },
      ],
    },
    code: {
      large:  [
        { id: 'qwen2.5-coder:7b',  name: 'Qwen 2.5 Coder 7B',  size: '4.7 GB', why: 'Best-in-class local coding model — great at completions, explanations, and debugging', vramNote: 'Runs fully in VRAM' },
        { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder 7B', size: '3.8 GB', why: 'Built specifically for code — strong on Python, JS, and TypeScript', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'qwen2.5-coder:7b',  name: 'Qwen 2.5 Coder 7B',  size: '4.7 GB', why: 'Best-in-class local coding model — completions, debugging, and explanations', vramNote: 'Runs fully in VRAM' },
        { id: 'qwen2.5-coder:3b',  name: 'Qwen 2.5 Coder 3B',  size: '2.0 GB', why: 'Smaller but still very capable — good fallback if 7B is too slow', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'qwen2.5-coder:3b',  name: 'Qwen 2.5 Coder 3B',  size: '2.0 GB', why: 'Compact coding model — better at code than most general models twice its size', vramNote: 'Runs fully in VRAM' },
        { id: 'qwen2.5-coder:1.5b',name: 'Qwen 2.5 Coder 1.5B',size: '1.0 GB', why: 'Tiny but surprisingly good at short code tasks and explaining errors', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'qwen2.5-coder:1.5b',name: 'Qwen 2.5 Coder 1.5B',size: '1.0 GB', why: 'The best coding help you can get on minimal hardware', vramNote: 'Runs on CPU too' },
      ],
    },
    writing: {
      large:  [
        { id: 'llama3.1:8b',   name: 'Llama 3.1 8B',   size: '4.9 GB', why: 'Excellent writer — handles tone, structure, and style with ease', vramNote: 'Runs fully in VRAM' },
        { id: 'mistral:7b',    name: 'Mistral 7B',     size: '4.1 GB', why: 'Strong prose model — clean, confident writing output', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'mistral:7b',    name: 'Mistral 7B',     size: '4.1 GB', why: 'Strong prose model — clean, confident writing output', vramNote: 'Runs fully in VRAM' },
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Great at summaries, emails, and short-form creative writing', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Great at summaries, emails, and short-form creative writing', vramNote: 'Runs fully in VRAM' },
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Compact and surprisingly good at structured writing tasks', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Best writing quality available on limited hardware', vramNote: 'May use system RAM' },
      ],
    },
    reasoning: {
      large:  [
        { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', size: '4.7 GB', why: 'Built for step-by-step reasoning — explains its thinking, great for analysis', vramNote: 'Runs fully in VRAM' },
        { id: 'qwen2.5:7b',     name: 'Qwen 2.5 7B',    size: '4.7 GB', why: 'Excellent at following complex instructions and multi-step tasks', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', size: '4.7 GB', why: 'Built for step-by-step reasoning — explains its thinking, great for analysis', vramNote: 'Runs fully in VRAM' },
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Solid reasoning for its size — good for structured Q&A and comparisons', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Best reasoning option at this VRAM level — follows instructions well', vramNote: 'Runs fully in VRAM' },
        { id: 'phi3:mini',      name: 'Phi-3 Mini',      size: '2.3 GB', why: 'Microsoft trained it specifically for logical tasks — punches above its weight', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'phi3:mini',      name: 'Phi-3 Mini',      size: '2.3 GB', why: 'The reasoning standout at this size — Microsoft\'s focus was logic and instruction-following', vramNote: 'May use system RAM' },
      ],
    },
    speed: {
      large:  [
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Tiny model on a capable GPU = instant responses. Best speed/quality ratio for quick answers', vramNote: 'Flies in VRAM' },
        { id: 'gemma3:1b',      name: 'Gemma 3 1B',     size: '0.8 GB', why: 'Google\'s smallest model — basically instant on modern hardware', vramNote: 'Flies in VRAM' },
      ],
      medium: [
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Fast and capable — the sweet spot for quick, reliable responses', vramNote: 'Flies in VRAM' },
        { id: 'phi3:mini',      name: 'Phi-3 Mini',      size: '2.3 GB', why: 'Snappy and smart — responds quickly without sacrificing too much quality', vramNote: 'Flies in VRAM' },
      ],
      small:  [
        { id: 'llama3.2:1b',    name: 'Llama 3.2 1B',   size: '1.3 GB', why: 'Ultra-light — the fastest responses you\'ll get on any hardware', vramNote: 'Very fast even on CPU' },
        { id: 'gemma3:1b',      name: 'Gemma 3 1B',     size: '0.8 GB', why: 'Google\'s smallest — basically instant responses', vramNote: 'Runs on CPU too' },
      ],
      tiny:   [
        { id: 'llama3.2:1b',    name: 'Llama 3.2 1B',   size: '1.3 GB', why: 'The speed king at any VRAM level — downloads fast, responds fast', vramNote: 'Runs on CPU' },
        { id: 'gemma3:1b',      name: 'Gemma 3 1B',     size: '0.8 GB', why: 'Tiny but functional — a good first download just to see it work', vramNote: 'Runs on CPU' },
      ],
    },
  };

  return picks[useCase][tier] ?? picks[useCase].small ?? [];
}

function FirstModelWizard({ vramGb, onQueueModel }: { vramGb: number; onQueueModel: (modelId: string) => void }) {
  const [useCase, setUseCase] = useState<FirstModelUseCase | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const picks = useCase ? getFirstModelPicks(useCase, vramGb) : [];

  return (
    <div className="first-model-wizard">
      <div className="fmw-header">
        <div className="fmw-title">
          <span>🎬 Start here</span>
          <strong>Yeah, a lot of models. Let's narrow it down.</strong>
          <em>Answer one question and we'll pick your first contestant.</em>
        </div>
        <button type="button" className="icon-action" onClick={() => setDismissed(true)} aria-label="Dismiss" title="Show me the full list instead">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="fmw-use-cases" role="group" aria-label="What do you mainly want to use AI for?">
        <p className="fmw-question">What do you mainly want to use AI for?</p>
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            type="button"
            className={`fmw-use-case-btn${useCase === uc.id ? ' active' : ''}`}
            onClick={() => setUseCase(useCase === uc.id ? null : uc.id)}
            aria-pressed={useCase === uc.id}
          >
            <span className="fmw-emoji">{uc.emoji}</span>
            <span className="fmw-label">{uc.label}</span>
            <span className="fmw-desc">{uc.description}</span>
          </button>
        ))}
      </div>

      {useCase && picks.length > 0 && (
        <div className="fmw-picks">
          <p className="fmw-picks-label">
            Perfect picks for your rig{vramGb > 0 ? ` (${vramGb} GB VRAM)` : ''} →
          </p>
          {picks.map((pick, i) => (
            <div key={pick.id} className={`fmw-pick-card${i === 0 ? ' recommended' : ''}`}>
              {i === 0 && <span className="fmw-pick-badge">⭐ Best match</span>}
              <div className="fmw-pick-info">
                <strong>{pick.name}</strong>
                <em>{pick.size} · {pick.vramNote}</em>
                <p>{pick.why}</p>
              </div>
              <button
                type="button"
                className={i === 0 ? 'primary-button compact' : 'mini-button'}
                onClick={() => { onQueueModel(pick.id); setDismissed(true); }}
              >
                <Download aria-hidden="true" />
                {i === 0 ? 'Download & Queue' : 'Queue'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCabinet({
  active,
  rows,
  selectedModel,
  installedModelNames,
  shortlistIds,
  queuedModelIds,
  pullProgressByModel,
  modelScores,
  benchmarkByModel,
  diskGuard,
  vramGb,
  platform,
  queuedCount,
  isBenchmarking,
  isPulling,
  isPullCancelRequested,
  isPullPauseRequested,
  isPullPaused,
  isDeletingModel,
  pullingModel,
  shortlistedCount,
  onSelect,
  onScoreModel,
  onDeleteModel,
  onClearScore,
  onQueueModel,
  onPullQueued,
  onPauseQueue,
  onCancelQueue,
  onToggleShortlist,
  onOpenSpeedDate,
  onOpenTopPick,
  onRefresh,
  onChooseModel,
  onOpenModelChat,
  modelNotes,
  onSaveModelNote,
  scoreTrend,
  scoreDeltas,
  newModelIds,
  onQuickCheck,
}: {
  active: boolean;
  rows: ModelRow[];
  selectedModel: string;
  installedModelNames: Set<string>;
  shortlistIds: Set<string>;
  queuedModelIds: Set<string>;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  modelScores: Record<string, TestedModelScore>;
  benchmarkByModel: Record<string, BenchmarkResult>;
  diskGuard: ReturnType<typeof getDiskGuard>;
  vramGb: number;
  platform: string;
  queuedCount: number;
  isBenchmarking: boolean;
  isListTesting: boolean;
  isPulling: boolean;
  isPullCancelRequested: boolean;
  isPullPauseRequested: boolean;
  isPullPaused: boolean;
  isDeletingModel: boolean;
  pullingModel: string | null;
  listTestResult: ListTestResult | null;
  runProgress: RunProgress | null;
  questionCount: BenchmarkQuestionCount;
  shortlistedCount: number;
  onSelect: (model: string) => void;
  onScoreModel: (row: ModelRow) => void;
  onDeleteModel: (row: ModelRow) => void;
  onClearScore: (model: string) => void;
  onQueueModel: (row: ModelRow) => void;
  onPullQueued: () => void;
  onPauseQueue: () => void;
  onCancelQueue: () => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSuiteEditor: () => void;
  onOpenSpeedDate: () => void;
  onOpenTopPick: () => void;
  onRefresh: () => void;
  onChooseModel: (model: string) => void;
  onOpenModelChat: (model: string) => void;
  modelNotes: Record<string, string>;
  onSaveModelNote: (model: string, note: string) => void;
  scoreTrend: Record<string, number[]>;
  scoreDeltas: Record<string, RunDelta>;
  newModelIds: Set<string>;
  onQuickCheck: (row: ModelRow) => void;
}) {
  const [modelQuery, setModelQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<ModelQuickFilterId>('fits-vram');
  const [taskFilter, setTaskFilter] = useState<ModelTaskFilterId | null>(null);
  const [developerFilter, setDeveloperFilter] = useState('all');
  const [sortKey, setSortKey] = useState<ModelSortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Column widths: Model, Size, Good For, Origin, Status, Match, Popularity (Actions fills remainder)
  // Size fits "Sweet spot", Status fits "Not Installed" (its pill needs ~81px +
  // cell padding), Match fits its header — the previous 62/80/66 defaults
  // ellipsized all three.
  const [colWidths, setColWidths] = useState([156, 92, 126, 86, 110, 76, 96]);
  // Popularity is the least essential column (the local Ollama API exposes no
  // pull counts), so it yields first on narrower windows instead of forcing
  // horizontal scrolling. Handled in JS because the <col> track would keep
  // its width even if the cells were hidden with CSS.
  const [hidePopularity, setHidePopularity] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1600px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1600px)');
    const update = () => setHidePopularity(media.matches);
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  // ollama.com removed public pull counts from its library pages (July 2026), so
  // live scrapes now return pulls: null for every model. When no row has pull
  // data, the Popularity column would be a wall of "No pull data" — repurpose it
  // as a measured-speed column instead. If Ollama ever restores the stats, the
  // column flips back to Popularity automatically.
  const hasAnyPullData = useMemo(() => rows.some((row) => row.pulls != null), [rows]);
  const colWidthsRef = useRef(colWidths);
  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  const handleColResizeStart = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidthsRef.current[colIndex];
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(40, startWidth + ev.clientX - startX);
      setColWidths(prev => { const next = [...prev]; next[colIndex] = newWidth; return next; });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);
  const selectedRow = rows.find((row) => row.displayName === selectedModel || row.id === selectedModel);
  const selectedProfile = getModelProfile(selectedRow?.displayName ?? selectedModel);
  const selectedScore = selectedRow ? getModelScore(selectedRow, modelScores) : modelScores[selectedModel];
  const selectedQueued = selectedRow ? queuedModelIds.has(selectedRow.displayName) : false;
  const selectedShortlisted = selectedRow ? shortlistIds.has(selectedRow.displayName) : false;
  const selectedInstalled = selectedRow ? installedModelNames.has(selectedRow.displayName) || selectedRow.installed : false;
  const selectedPullProgress = selectedRow ? pullProgressByModel[selectedRow.displayName] : undefined;
  const selectedPulling = Boolean(selectedRow && pullingModel === selectedRow.displayName);
  const query = modelQuery.trim().toLowerCase();
  const quickFilters = useMemo(
    () => getModelQuickFilters(rows, modelScores, vramGb),
    [modelScores, rows, vramGb],
  );
  const vramSafeCount = quickFilters.find((filter) => filter.id === 'fits-vram')?.count ?? 0;
  const taskFilterCounts = useMemo(
    () => Object.fromEntries(TASK_FILTER_CHIPS.map((chip) => [chip.id, rows.filter((row) => modelMatchesTask(row, chip.id)).length])),
    [rows],
  );
  const developerFilterOptions = useMemo(() => getDeveloperFilterOptions(rows), [rows]);
  const activeDeveloperFilter = developerFilterOptions.some((option) => option.id === developerFilter) ? developerFilter : 'all';
  const shortlistedRows = useMemo(
    () => rows.filter((row) => shortlistIds.has(row.displayName)).slice(0, 5),
    [rows, shortlistIds],
  );
  const speedDateLineupFull = shortlistedRows.length >= 5;
  const queuedRows = useMemo(
    () => rows.filter((row) => queuedModelIds.has(row.displayName)),
    [queuedModelIds, rows],
  );
  const queuedPreviewRows = queuedRows.filter((row) => row.displayName !== pullingModel);
  const queuePreviewLimit = isPulling ? 2 : 3;
  const visibleQueuePreview = queuedPreviewRows.slice(0, queuePreviewLimit);
  const hiddenQueueCount = Math.max(0, queuedPreviewRows.length - visibleQueuePreview.length);
  const queueStatusLabel = isPullCancelRequested
    ? 'Canceling download'
    : isPullPauseRequested
      ? 'Pausing download'
      : isPullPaused
        ? 'Paused'
        : isPulling
          ? 'Downloading now'
          : queuedCount > 0
            ? `${queuedCount} queued · ${formatGb(diskGuard.queuedGb)}`
            : 'No downloads queued';
  const queuePreviewText = visibleQueuePreview.map((row) => row.displayName).join(', ');
  const queueHelperText = isPullCancelRequested
    ? `Stopping ${pullingModel ?? 'the current Ollama pull'} and clearing the queue.`
    : isPullPauseRequested
      ? `Pausing ${pullingModel ?? 'the current model'} and keeping it queued.`
      : isPullPaused
        ? 'Paused downloads stay queued. Start Download resumes through Ollama cached layers when possible.'
        : isPulling
          ? `Pulling ${pullingModel ?? 'the current model'} through Ollama. Pause keeps it queued; Cancel clears the queue.`
          : queuedCount > 0
            ? `Ready to download ${queuePreviewText || 'queued models'}${hiddenQueueCount > 0 ? ` and ${hiddenQueueCount} more` : ''}.`
            : 'Use Get Model on a contestant to stage a download.';
  const visibleRows = useMemo(() => {
    const filteredRows = rows.filter((row) => {
      const score = getModelScore(row, modelScores);
      const queued = queuedModelIds.has(row.displayName);
      const matchesQuery = !query || getModelSearchText(row, queued, score).includes(query);
      const matchesDeveloper = activeDeveloperFilter === 'all' || getModelDeveloperKey(row.displayName) === activeDeveloperFilter;
      return matchesQuery
        && matchesDeveloper
        && modelMatchesQuickFilter(row, quickFilter, score, vramGb)
        && (!taskFilter || modelMatchesTask(row, taskFilter));
    });

    return sortModelRows(filteredRows, sortKey, sortDirection, queuedModelIds, modelScores, benchmarkByModel);
  }, [activeDeveloperFilter, benchmarkByModel, modelScores, query, quickFilter, taskFilter, queuedModelIds, rows, sortDirection, sortKey, vramGb]);
  // Say what each number counts — the catalog total, the installed count, and the
  // VRAM-fit count are different measures and read as contradictory when all three
  // are just "N models".
  const modelCountLabel = query || quickFilter !== 'all' || taskFilter || activeDeveloperFilter !== 'all'
    ? `${visibleRows.length} of ${rows.length} shown`
    : `${rows.length} in catalog`;
  const vramLabel = vramGb > 0 ? `${formatGb(vramGb)} VRAM` : 'detected VRAM';
  const activeQuickFilter = quickFilters.find((filter) => filter.id === quickFilter);
  const activeDeveloperLabel = activeDeveloperFilter === 'all'
    ? null
    : developerFilterOptions.find((option) => option.id === activeDeveloperFilter)?.label ?? activeDeveloperFilter;
  const activeTaskLabel = taskFilter ? TASK_FILTER_CHIPS.find((chip) => chip.id === taskFilter)?.label ?? taskFilter : null;
  const activeFilterSummary = [
    quickFilter !== 'all' ? activeQuickFilter?.label : null,
    activeDeveloperLabel,
    activeTaskLabel,
  ].filter(Boolean).join(' · ');
  const activeFilterCount = [
    quickFilter !== 'all',
    activeDeveloperFilter !== 'all',
    Boolean(taskFilter),
  ].filter(Boolean).length;

  const changeSort = (nextKey: ModelSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === 'name' ? 'asc' : 'desc');
  };

  return (
    <section className={active ? 'panel model-panel panel-focused' : 'panel model-panel'}>
      <header
        className="model-hub-header"
        style={{ backgroundImage: `url(${robotContestantWall})` }}
        aria-label="Models"
      >
        <div className="model-hub-header-copy">
          <h2>Models</h2>
          <em>{vramSafeCount} models look realistic for {vramLabel}. Test one model or run Speed Dating from here.</em>
        </div>
        <div className="model-hub-header-side">
          <span>{modelCountLabel}</span>
          <button type="button" className="mini-button" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>
      <div className="cabinet-body">
      <div className="cabinet-main">
      {installedModelNames.size === 0 && isDesktopRuntime && (
        <FirstModelWizard vramGb={vramGb} onQueueModel={(modelId) => {
          const row = rows.find((r) => r.id === modelId || r.displayName === modelId);
          if (row) onQueueModel(row);
        }} />
      )}
      <div className="model-tools">
        <label className="model-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search models</span>
          <input
            type="search"
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
            placeholder="Search models by name, strength, size, or status..."
            aria-label="Search models"
          />
          {modelQuery && (
            <button type="button" onClick={() => setModelQuery('')} aria-label="Clear model search">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <span className="model-sort-status advanced-only">
          Sort: {getModelSortLabel(sortKey)} / {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </span>
        <details className="model-filter-menu">
          <summary aria-label="Open model filters">
            <SlidersHorizontal aria-hidden="true" />
            <span>Filters</span>
            <em>{activeFilterCount > 0 ? `${activeFilterCount} active` : 'Default'}</em>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="model-filter-tray">
            <div className="model-filter-tray-head">
              <span>{activeFilterSummary || 'All model filters are available here.'}</span>
              <button
                type="button"
                className="model-filter-reset"
                onClick={() => {
                  setQuickFilter('all');
                  setDeveloperFilter('all');
                  setTaskFilter(null);
                }}
                disabled={activeFilterCount === 0}
              >
                Reset
              </button>
            </div>
            <div className="model-quick-filters" aria-label="Model quick filters">
              {quickFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={quickFilter === filter.id ? 'active' : ''}
                  onClick={() => setQuickFilter(filter.id)}
                  aria-pressed={quickFilter === filter.id}
                >
                  <span>{filter.label}</span>
                  <em>{filter.count}</em>
                </button>
              ))}
            </div>
            <div className="model-task-filters model-developer-filters" aria-label="Filter by developer">
              <span className="model-task-filters-label">By:</span>
              <button
                type="button"
                className={activeDeveloperFilter === 'all' ? 'active' : ''}
                onClick={() => setDeveloperFilter('all')}
                aria-pressed={activeDeveloperFilter === 'all' ? 'true' : 'false'}
              >
                All
                <em>{rows.length}</em>
              </button>
              {developerFilterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={activeDeveloperFilter === option.id ? 'active' : ''}
                  onClick={() => setDeveloperFilter(activeDeveloperFilter === option.id ? 'all' : option.id)}
                  aria-pressed={activeDeveloperFilter === option.id ? 'true' : 'false'}
                  title={`Show models by ${option.label}`}
                >
                  {option.label}
                  <em>{option.count}</em>
                </button>
              ))}
            </div>
            <div className="model-task-filters advanced-only" aria-label="Filter by use case">
              <span className="model-task-filters-label">For:</span>
              {TASK_FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={taskFilter === chip.id ? 'active' : ''}
                  onClick={() => setTaskFilter(taskFilter === chip.id ? null : chip.id)}
                  aria-pressed={taskFilter === chip.id ? 'true' : 'false'}
                >
                  {chip.label}
                  <em>{taskFilterCounts[chip.id] ?? 0}</em>
                </button>
              ))}
            </div>
            {quickFilter === 'fits-vram' && (
              <div className="model-filter-note">
                <ShieldCheck aria-hidden="true" />
                <span>Showing {vramSafeCount} rig picks for {vramLabel}, including close fits. Models too big for your VRAM stay hidden unless you show all.</span>
                <button type="button" onClick={() => setQuickFilter('all')}>Show all</button>
              </div>
            )}
          </div>
        </details>
      </div>
      <ScoreLegend />
      {shortlistedCount >= 5 && (
        <div className="lineup-full-banner" role="status">
          <span>⚡ Speed Dating lineup is full — 5/5 contestants selected. Remove one to swap in another.</span>
        </div>
      )}
      <div className="table-wrap model-table">
        <table>
          <colgroup>
            {colWidths.map((w, i) => (hidePopularity && i === 6 ? null : <col key={i} style={{ width: w }} />))}
            <col />
          </colgroup>
          <thead>
            <tr>
              <SortableModelHeader label="Model" sortName="name" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(0, e)} />
              <SortableModelHeader label="Size" sortName="size" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(1, e)} />
              <SortableModelHeader label="Good For" sortName="skill" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(2, e)} />
              <SortableModelHeader label="By" sortName="origin" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(3, e)} />
              <SortableModelHeader label="Status" sortName="status" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(4, e)} />
              <SortableModelHeader label="Match" sortName="score" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(5, e)} />
              {!hidePopularity && (
                <SortableModelHeader
                  label={hasAnyPullData ? 'Popularity' : 'Speed'}
                  sortName={hasAnyPullData ? 'pulls' : 'speed'}
                  sortKey={sortKey}
                  direction={sortDirection}
                  onSort={changeSort}
                  onResizeStart={(e) => handleColResizeStart(6, e)}
                />
              )}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedModel === row.displayName || selectedModel === row.id;
              const installed = installedModelNames.has(row.displayName) || row.installed;
              const queued = queuedModelIds.has(row.displayName);
              const rowPullProgress = pullProgressByModel[row.displayName];
              const isPullingRow = pullingModel === row.displayName;
              const shortlisted = shortlistIds.has(row.displayName);
              const origin = getModelOrigin(row.displayName);
              const sizeRisk = getSizeRisk(row.sizeGb);
              const statusLabel = getModelStatusLabel(row, queued);
              const score = getModelScore(row, modelScores);
              // Look up with the normalized-key helper: benchmarkByModel is keyed
              // by normalizeModelKey, so a raw displayName misses on any non-lowercase name.
              const rowBenchmark = getBenchmarkForModel(benchmarkByModel, row.displayName, row);
              const isNewModel = newModelIds.has(getModelNewsId(row));
              const goodForTags = getModelGoodForTags(row);
              const hardwareFit = getHardwareFit(row, vramGb);
              const platformFit = getPlatformFit(row.displayName, platform);
              const speedDateLineupFullForRow = shortlistedCount >= 5;
              const canJoinSpeedDate = platformFit.compatible && hardwareFit.recommend;
              const canChangeSpeedDateSlot = canJoinSpeedDate && (shortlisted || !speedDateLineupFullForRow);
              const speedDateSlotLabel = shortlisted
                ? 'Selected'
                : !platformFit.compatible
                  ? 'OS Only'
                  : !hardwareFit.recommend
                  // Unknown-size models aren't "too big" — we just can't verify the
                  // footprint yet. Say so instead of falsely calling them too big.
                  ? (hardwareFit.tone === 'unknown' ? 'Size unknown' : 'Too Big')
                  : speedDateLineupFullForRow
                    ? '+ Speed Date'
                    : 'Add to Speed Dating';
              const speedDateSlotTitle = !platformFit.compatible
                ? platformFit.reason
                : !hardwareFit.recommend
                ? hardwareFit.detail
                : shortlisted
                  ? installed
                    ? `Remove ${row.displayName} from Speed Dating`
                    : `In lineup — download ${row.displayName} before running the test. Click to remove.`
                  : speedDateLineupFullForRow
                    ? 'Speed Dating lineup is full. Remove one contestant from the lineup first.'
                    : installed
                      ? `Add ${row.displayName} to Speed Dating`
                      : `Add ${row.displayName} to lineup — download it before starting the test`;
              const speedDateSlotAriaLabel = shortlisted
                ? `Remove ${row.displayName} from Speed Dating`
                : canJoinSpeedDate
                  ? `Add ${row.displayName} to Speed Dating`
                  : !platformFit.compatible
                    ? `${row.displayName} is not available for Speed Dating on this operating system`
                    : `${row.displayName} is too large for Speed Dating on this computer`;
              const rowClassName = [
                selected ? 'selected' : '',
                hardwareFit.tone === 'out-of-league' ? 'out-of-league' : '',
              ].filter(Boolean).join(' ');
              const showDownloadProgress = !installed && (queued || isPullingRow || isVisiblePullProgress(rowPullProgress));
              return (
                <tr
                  key={row.id}
                  className={rowClassName}
                  onDoubleClick={() => { onSelect(row.displayName); onOpenTopPick(); }}
                  title="Double-click to open profile"
                >
                  <td>
                    <button type="button" className="model-name-button" onClick={() => onSelect(row.displayName)}>
                      <AvatarBust model={row.displayName} size="tiny" />
                      <span>
                        {row.displayName}
                        {isNewModel && <em className="model-new-sub">New</em>}
                        {row.params && <em className="model-params-sub">{row.params}</em>}
                        {row.localProviderLabel && <em className="model-provider-sub">{row.localProviderLabel}</em>}
                        {row.pulls != null && (
                          <em className="model-pulls-sub" title={`${row.pulls.toLocaleString()} pulls on Ollama`}>{formatPullCount(row.pulls)} pulls</em>
                        )}
                      </span>
                    </button>
                    {isCloudModel(row.displayName) && (
                      <span className="model-warning-tag" title="This model runs on remote servers — prompts leave your computer">☁ Cloud</span>
                    )}
                    {isEmbeddingModel(row.displayName) && (
                      <span className="model-warning-tag" title="Embedding model — not for chat or text generation">Embed only</span>
                    )}
                    {!platformFit.compatible && (
                      <span className="platform-tag" title={platformFit.reason}>macOS only</span>
                    )}
                  </td>
                  <td title={platformFit.compatible ? `${sizeRisk.message} ${hardwareFit.detail}` : platformFit.reason}>
                    <div className="size-fit-cell">
                      <span className={`size-pill ${sizeRisk.tone}`}>
                        {row.sizeGb ? `${row.sizeGb} GB` : '?'}
                      </span>
                      {platformFit.compatible
                        // Strip the "· X GB" suffix — the size pill above already
                        // shows it, and the duplicate forced an ellipsis.
                        ? <span className={`fit-pill ${hardwareFit.tone}`}>{hardwareFit.label.replace(/\s*·.*$/, '')}</span>
                        : <span className="fit-pill out-of-league">macOS Only</span>
                      }
                    </div>
                  </td>
                  <td className="good-for-cell" title={goodForTags.join(', ')}>
                    <div className="good-for-tags">
                      {goodForTags.map((tag) => (
                        <span key={tag} className="good-for-chip">{tag}</span>
                      ))}
                    </div>
                    {isUncensoredModel(row.displayName) && (
                      <span className="uncensored-badge" title="Uncensored / unrestricted model">unrestricted</span>
                    )}
                  </td>
                  <td title={`${origin.organization} · ${origin.country}`}>
                    <span className={`origin-pill origin-${origin.family}`}>{origin.organization}</span>
                  </td>
                  <td>
                    <ModelStatusPill installed={installed} queued={queued} label={statusLabel} />
                  </td>
                  <td>
                    <ModelScorePill score={score} />
                  </td>
                  {!hidePopularity && (
                    <td className="speed-cell">
                      <div className="speed-pop-cell">
                        {rowBenchmark?.avgTokensPerSecond != null && (
                          <span className="speed-pill tested">{Math.round(rowBenchmark.avgTokensPerSecond)} tok/s</span>
                        )}
                        {hasAnyPullData ? (
                          <PopularityMeter pulls={row.pulls} />
                        ) : rowBenchmark?.avgTokensPerSecond == null && (
                          <span className="speed-untested" title="Run a test to measure this model's speed on this computer">Not tested</span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className={showDownloadProgress ? 'action-cell has-download-progress' : 'action-cell'}>
                    <div className="row-actions">
                      <button
                        type="button"
                        className={shortlisted ? 'slot-button speed-date-row-button active' : 'slot-button speed-date-row-button'}
                        onClick={() => onToggleShortlist(row)}
                        disabled={!canChangeSpeedDateSlot}
                        title={speedDateSlotTitle}
                        aria-label={speedDateSlotAriaLabel}
                      >
                        <span>{speedDateSlotLabel}</span>
                      </button>
                      {installed ? (
                        <>
                          {/* "Pick as top model" lives in the detail panel, not on every
                              row — seven repeated bright buttons out-shouted the actual
                              primary actions while being the least-used one. */}
                          <button
                            type="button"
                            className={`mini-button score-row-button${!hardwareFit.recommend ? ' warn' : ''}`}
                            onClick={() => onScoreModel(row)}
                            disabled={isBenchmarking}
                            title={hardwareFit.recommend ? `Test ${row.displayName} on this computer` : hardwareFit.tone === 'unknown' ? `⚠ Size unknown — RigMatch can't gauge fit yet, test anyway?` : `⚠ Too big for your VRAM — will be slow, test anyway?`}
                          >
                            <Gauge aria-hidden="true" />
                            Test
                          </button>
                          <button
                            type="button"
                            className="icon-action chat-model-button"
                            onClick={() => onOpenModelChat(row.displayName)}
                            title={`Chat with ${row.displayName}`}
                            aria-label={`Chat with ${row.displayName}`}
                          >
                            <MessageSquare aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-action delete-model-button"
                            onClick={() => onDeleteModel(row)}
                            disabled={isBenchmarking || isDeletingModel || row.localProvider === 'lm-studio'}
                            title={row.localProvider === 'lm-studio' ? 'Manage LM Studio models in LM Studio' : `Delete ${row.displayName} from Ollama`}
                            aria-label={row.localProvider === 'lm-studio' ? `${row.displayName} is managed in LM Studio` : `Delete ${row.displayName} from Ollama`}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                          {score && (
                            <button
                              type="button"
                              className="icon-action score-clear-button"
                              onClick={() => onClearScore(row.displayName)}
                              title={`Clear ${row.displayName}'s saved score — the model stays installed`}
                              aria-label={`Clear ${row.displayName}'s saved score`}
                            >
                              <Eraser aria-hidden="true" />
                            </button>
                          )}
                          <ModelDemoChips model={row.displayName} label="" className="inline" />
                        </>
                      ) : (
                        <button
                          type="button"
                          className={queued ? 'mini-button queued download-row-button' : `mini-button outline download-row-button${!hardwareFit.recommend ? ' warn' : ''}`}
                          onClick={() => onQueueModel(row)}
                          disabled={!queued && !platformFit.compatible}
                          title={!platformFit.compatible ? platformFit.reason : !hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? `Size unknown — download to find out the footprint?` : `⚠ Too big for your VRAM — download anyway?`) : `${queued ? 'Remove from queue' : `Get ${row.displayName}`}: ${row.sizeGb ? formatGb(row.sizeGb) : 'unknown size'}`}
                          aria-label={!platformFit.compatible ? platformFit.reason : queued ? `Remove ${row.displayName} from the download queue` : `Get ${row.displayName}`}
                        >
                          <span>{!platformFit.compatible ? 'macOS Only' : queued ? 'Remove' : `Get ${getQueueChipModelName(row.displayName)}`}</span>
                        </button>
                      )}
                    </div>
                    {showDownloadProgress && (
                      <DownloadProgressInline
                        model={row.displayName}
                        queued={queued}
                        isActive={isPullingRow}
                        isStopping={isPullCancelRequested && isPullingRow}
                        progress={rowPullProgress}
                        onCancel={() => (isPullingRow ? onCancelQueue() : onQueueModel(row))}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={hidePopularity ? 7 : 8}>
                  <div className="table-empty-state">
                    <strong>No contestants match these filters</strong>
                    <span>Clear the search or show the full model pool.</span>
                    <button
                      type="button"
                      className="mini-button outline"
                      onClick={() => {
                        setModelQuery('');
                        setQuickFilter('all');
                      }}
                    >
                      Show All
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="model-footer">
        <DiskGuard guard={diskGuard} />
        <div className="pull-queue" aria-live="polite">
          <div className="queue-status-copy">
            <span>Download Queue</span>
            <strong>{queueStatusLabel}</strong>
            <em>{queueHelperText}</em>
          </div>
          <div className="queue-chip-list" aria-label="Queued downloads">
            {isPulling && pullingModel && (
              <span
                className={isPullCancelRequested ? 'queue-chip stopping' : isPullPauseRequested ? 'queue-chip paused' : 'queue-chip active'}
                title={pullingModel}
              >
                <RefreshCw aria-hidden="true" />
                {getQueueChipModelName(pullingModel)}
              </span>
            )}
            {visibleQueuePreview.map((row) => (
              <span key={row.displayName} className="queue-chip" title={row.displayName}>
                {getQueueChipModelName(row.displayName)}
              </span>
            ))}
            {hiddenQueueCount > 0 && (
              <span className="queue-chip muted">+{hiddenQueueCount} more</span>
            )}
            {queuedCount === 0 && !isPulling && (
              <span className="queue-chip muted">Empty</span>
            )}
          </div>
          <div className="queue-actions">
            <button
              type="button"
              className={queuedCount > 0 || isPulling ? 'primary-button compact' : 'mini-button outline'}
              onClick={onPullQueued}
              disabled={queuedCount === 0 || isPulling}
            >
              <Download aria-hidden="true" />
              {isPulling ? 'Downloading' : isPullPaused ? 'Resume Download' : queuedCount > 0 ? 'Start Download' : 'Download'}
            </button>
            {isPulling && (
              <button
                type="button"
                className="mini-button outline queue-pause-button"
                onClick={onPauseQueue}
                disabled={isPullPauseRequested || isPullCancelRequested}
                title="Pause the active Ollama pull and keep it in the queue"
              >
                <Pause aria-hidden="true" />
                {isPullPauseRequested ? 'Pausing' : 'Pause'}
              </button>
            )}
            {(queuedCount > 0 || isPulling) && (
              <button
                type="button"
                className="mini-button outline queue-cancel-button"
                onClick={onCancelQueue}
                disabled={isPullCancelRequested}
                title={isPulling ? 'Cancel the active Ollama pull and clear queued downloads' : 'Cancel all queued downloads'}
              >
                <X aria-hidden="true" />
                {isPullCancelRequested ? 'Canceling' : isPulling ? 'Cancel Queue' : 'Cancel Queue'}
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
      <div className="cabinet-sidebar">
        <SelectedContestantCard
          row={selectedRow}
          profile={selectedProfile}
          score={selectedScore}
          vramGb={vramGb}
          installed={selectedInstalled}
          queued={selectedQueued}
          shortlisted={selectedShortlisted}
          speedDateLineupFull={speedDateLineupFull}
          pullProgress={selectedPullProgress}
          isPulling={selectedPulling}
          isPullStopping={Boolean(isPullCancelRequested && selectedPulling)}
          isBenchmarking={isBenchmarking}
          onChooseModel={onChooseModel}
          onScoreModel={onScoreModel}
          onQueueModel={onQueueModel}
          onCancelQueue={onCancelQueue}
          onToggleShortlist={onToggleShortlist}
          onOpenSpeedDate={onOpenSpeedDate}
          modelNotes={modelNotes}
          onSaveModelNote={onSaveModelNote}
          scoreTrend={scoreTrend}
          scoreDeltas={scoreDeltas}
          onQuickCheck={onQuickCheck}
        />
      </div>
      </div>
    </section>
  );
}

function DownloadProgressInline({
  model,
  queued,
  isActive,
  isStopping,
  progress,
  onCancel,
}: {
  model: string;
  queued: boolean;
  isActive: boolean;
  isStopping: boolean;
  progress?: PullProgressUpdate;
  onCancel?: () => void;
}) {
  const phase = progress?.phase ?? (queued ? 'queued' : 'started');
  const percent = getPullProgressPercent(progress, queued);
  const hasMeasuredPercent = typeof progress?.percent === 'number';
  const trackPercent = hasMeasuredPercent
    ? Math.max(3, Math.min(100, percent))
    : queued
      ? 6
      : 28;
  const percentLabel = hasMeasuredPercent || phase === 'complete'
    ? `${Math.round(percent)}%`
    : queued
      ? '0%'
      : '--%';
  const statusLabel = getPullProgressStatusLabel(model, phase, queued, isActive, isStopping, progress);
  const detailLabel = getPullProgressDetailLabel(phase, queued, progress);
  const className = [
    'download-progress-inline',
    phase,
    isActive ? 'active' : '',
    isStopping ? 'stopping' : '',
    !hasMeasuredPercent && phase !== 'queued' ? 'indeterminate' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} aria-label={`${model} download status`}>
      <div className="download-progress-copy">
        <span>{statusLabel}</span>
        <div className="download-progress-copy-end">
          <strong>{percentLabel}</strong>
          {onCancel && phase !== 'complete' && (
            <button
              type="button"
              className="icon-action download-progress-cancel-button"
              onClick={onCancel}
              disabled={isStopping}
              title={isActive ? `Cancel the ${model} download and clear the queue` : `Remove ${model} from the download queue`}
              aria-label={isActive ? `Cancel the ${model} download` : `Remove ${model} from the download queue`}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="download-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i style={{ width: `${trackPercent}%` }} />
      </div>
      <em>{detailLabel}</em>
    </div>
  );
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
        ? `${selectedScore.total} Match · ${selectedScore.grade}. Retest when you want fresh proof.`
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
      : shortlistedRows.length >= 2
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
  const canUsePrimaryAction = rows.length >= 2 && !disabled;
  const classNames = ['model-pool-lineup', full ? 'full' : '', className].filter(Boolean).join(' ');
  const startLabel = isListTesting
    ? 'Testing...'
    : rows.length < 2
      ? `Pick ${Math.max(0, 2 - rows.length)} more`
      : missingDownloadCount > 0
        ? 'Open Setup'
        : 'Start Speed Dating';
  const lineupStatus = rows.length < 2
    ? 'Pick at least two contestants before the show starts.'
    : missingDownloadCount > 0
      ? `${missingDownloadCount} contestant${missingDownloadCount === 1 ? '' : 's'} need downloads. Open setup to download the selected lineup.`
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
              <AvatarBust model={row.displayName} size="tiny" />
              <div>
                <span>Contestant {index + 1}</span>
                <strong>{row.displayName}</strong>
                <em>{score ? `${score.total} Match · ${score.grade}` : 'Not tested yet'}</em>
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


function SelectedContestantCard({
  row,
  profile,
  score,
  vramGb,
  installed,
  queued,
  shortlisted,
  speedDateLineupFull,
  pullProgress,
  isPulling,
  isPullStopping,
  isBenchmarking,
  onScoreModel,
  onQueueModel,
  onCancelQueue,
  onToggleShortlist,
  onOpenSpeedDate,
  modelNotes,
  onSaveModelNote,
  scoreTrend,
  scoreDeltas,
  onQuickCheck,
  onChooseModel,
}: {
  row?: ModelRow;
  profile: ModelProfile;
  score?: TestedModelScore;
  vramGb: number;
  installed: boolean;
  queued: boolean;
  shortlisted: boolean;
  speedDateLineupFull: boolean;
  pullProgress?: PullProgressUpdate;
  isPulling: boolean;
  isPullStopping: boolean;
  isBenchmarking: boolean;
  onChooseModel: (model: string) => void;
  onScoreModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onCancelQueue: () => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSpeedDate: () => void;
  modelNotes: Record<string, string>;
  onSaveModelNote: (model: string, note: string) => void;
  scoreTrend: Record<string, number[]>;
  scoreDeltas: Record<string, RunDelta>;
  onQuickCheck: (row: ModelRow) => void;
}) {
  if (!row) {
    return (
      <section className="contestant-spotlight empty" aria-label="Selected contestant">
        <div>
          <span>Selected Model</span>
          <strong>No model selected</strong>
          <em>Pick a model from the table to inspect its profile, fit, and next action.</em>
        </div>
      </section>
    );
  }

  const hardwareFit = getHardwareFit(row, vramGb);
  const noteValue = modelNotes[row.displayName] ?? '';
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'Size unknown';
  const matchLabel = score ? `${score.total} Match · ${score.grade}` : 'No score yet';
  const statusLabel = installed
    ? 'Installed locally'
    : queued
      ? 'In download queue'
      : row.live
        ? 'Available to download'
        : 'Catalog pick';
  const canJoinSpeedDate = installed && hardwareFit.recommend;
  const canChangeSpeedDateSlot = shortlisted || (canJoinSpeedDate && !speedDateLineupFull);
  const origin = getModelOrigin(row.displayName);
  const showDownloadProgress = !installed && (queued || isPulling || isVisiblePullProgress(pullProgress));
  const trend = scoreTrend[row.displayName] ?? [];
  const delta = scoreDeltas[row.displayName] ?? null;

  const vramNeeded = row.sizeGb ?? 0;
  const vramHint = !hardwareFit.recommend && vramNeeded > 0
    ? vramNeeded <= 8
      ? `A GPU with 8 GB VRAM (e.g. RTX 3060) would run this model.`
      : vramNeeded <= 16
        ? `A GPU with 16 GB VRAM (e.g. RTX 4080) would unlock this model.`
        : vramNeeded <= 24
          ? `A GPU with 24 GB VRAM (e.g. RTX 3090 or 4090) is needed.`
          : `This model needs high-end hardware (48 GB+ VRAM or Apple M-series with unified memory).`
    : null;

  return (
    <section className="contestant-spotlight" aria-label={`Selected contestant is ${row.displayName}`}>
      <AvatarBust model={row.displayName} size="small" />
      <div className="contestant-spotlight-copy">
        <span>Selected model</span>
        <strong>{row.displayName}</strong>
        <em>{row.params} · {profile.archetype}</em>
        <p>{getSelectedContestantBlurb(row, profile, score, hardwareFit)}</p>
      </div>
      <div className="contestant-spotlight-stats" aria-label="Selected model details">
        <div>
          <span>Match</span>
          <strong>{matchLabel}</strong>
        </div>
        <div>
          <span>Fit</span>
          <strong>{hardwareFit.label}</strong>
        </div>
        <div title={`${origin.organization} · ${origin.country}`}>
          <span>By</span>
          <strong>{origin.organization}</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>{sizeLabel}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>
      {score && (
        <div className="contestant-radar-row">
          <ScoreRadar speed={score.speed} sobriety={score.sobriety} fit={score.fit} />
          <div className="contestant-radar-scores">
            {/* These are 0–100 sub-scores, not measurements. "Speed score" keeps it
                from being read as the tokens/sec figure shown in the models table. */}
            <div title="0–100 speed sub-score (not tokens/sec)"><span>Speed score</span><strong>{score.speed}</strong></div>
            <div title="0–100 answer-quality sub-score"><span>Accuracy</span><strong>{score.sobriety}</strong></div>
            <div title="0–100 hardware-fit sub-score"><span>Fit</span><strong>{score.fit}</strong></div>
            {trend.length >= 2 && (
              <div className="contestant-sparkline-cell">
                <span>Trend</span>
                <ScoreSparkline values={trend} />
              </div>
            )}
            {delta && <ScoreDeltaCell delta={delta} />}
          </div>
        </div>
      )}
      {vramHint && (
        <div className="contestant-vram-hint">
          <span>Upgrade path</span>
          <p>{vramHint}</p>
        </div>
      )}
      <div className="contestant-spotlight-actions">
        <span>{hardwareFit.detail}</span>
        <div>
          {installed ? (
            <button
              type="button"
              className={`primary-button compact${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onScoreModel(row)}
              disabled={isBenchmarking}
              title={!hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? '⚠ Size unknown — RigMatch can\'t gauge fit yet, test anyway?' : '⚠ Too big for your VRAM — will be slow, test anyway?') : undefined}
            >
              <Gauge aria-hidden="true" />
              Test Model
            </button>
          ) : (
            <button
              type="button"
              className={queued ? 'primary-button compact queued' : `primary-button compact${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onQueueModel(row)}
              title={!hardwareFit.recommend && !queued ? (hardwareFit.tone === 'unknown' ? 'Size unknown — download to find out the footprint?' : '⚠ Too big for your VRAM — download anyway?') : queued ? 'Remove this model from the download queue' : 'Add this model to the download queue'}
            >
              {queued ? <X aria-hidden="true" /> : <Download aria-hidden="true" />}
              {queued ? 'Remove from Queue' : 'Get Model'}
            </button>
          )}
          {installed && (
            <button
              type="button"
              className={`mini-button outline${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onQuickCheck(row)}
              disabled={isBenchmarking}
              title={!hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? '⚠ Size unknown — quick check anyway?' : '⚠ Too big for your VRAM — quick check anyway?') : 'Run a 3-question sanity check (coding, accuracy, format)'}
            >
              <Zap aria-hidden="true" />
              Quick Check
            </button>
          )}
          {(!speedDateLineupFull || shortlisted) && (
            <button
              type="button"
              className={shortlisted ? 'mini-button contestant-date-button active' : 'mini-button contestant-date-button'}
              onClick={() => onToggleShortlist(row)}
              disabled={isBenchmarking || !canChangeSpeedDateSlot}
              title={shortlisted ? 'Remove this model from Speed Dating' : 'Add this model to Speed Dating'}
            >
              <Heart aria-hidden="true" />
              {shortlisted ? 'Selected' : 'Add to Speed Dating'}
            </button>
          )}
          <button type="button" className="mini-button outline" onClick={onOpenSpeedDate}>
            <Trophy aria-hidden="true" />
            Lineup
          </button>
          {installed && (
            <button
              type="button"
              className="mini-button outline"
              onClick={() => onChooseModel(row.displayName)}
              title={`Set ${row.displayName} as your Top Match`}
            >
              <Heart aria-hidden="true" />
              Set as Top Match
            </button>
          )}
        </div>
        {showDownloadProgress && (
          <DownloadProgressInline
            model={row.displayName}
            queued={queued}
            isActive={isPulling}
            isStopping={isPullStopping}
            progress={pullProgress}
            onCancel={() => (isPulling ? onCancelQueue() : onQueueModel(row))}
          />
        )}
      </div>
      <div className="contestant-notes">
        <label htmlFor={`note-${row.displayName}`}>
          <span>Notes</span>
        </label>
        <textarea
          id={`note-${row.displayName}`}
          className="contestant-notes-area"
          placeholder="Add private notes about this model..."
          value={noteValue}
          onChange={(e) => onSaveModelNote(row.displayName, e.target.value)}
          rows={2}
        />
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

function SortableModelHeader({
  label,
  sortName,
  sortKey,
  direction,
  onSort,
  onResizeStart,
}: {
  label: string;
  sortName: ModelSortKey;
  sortKey: ModelSortKey;
  direction: SortDirection;
  onSort: (sortName: ModelSortKey) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}) {
  const active = sortName === sortKey;

  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={active ? 'sort-header active' : 'sort-header'}
        onClick={() => onSort(sortName)}
      >
        <span>{label}</span>
        <ArrowUpDown aria-hidden="true" />
      </button>
      {onResizeStart && (
        <span
          className="col-resize-handle"
          onMouseDown={onResizeStart}
          onClick={(e) => e.stopPropagation()}
          role="separator"
          aria-label={`Resize ${label} column`}
        />
      )}
    </th>
  );
}


function BenchmarkRun({
  active,
  model,
  benchmarkForModel,
  selectedScore,
  isRunning,
  canBenchmark,
  hostReady,
  system,
  host,
  selectedRow,
  runProgress,
  questionCount,
  onOpenSuiteEditor,
  onOpenLogs,
  onStart,
  onStop,
}: {
  active: boolean;
  model: string;
  benchmarkForModel: BenchmarkResult | null;
  selectedScore?: TestedModelScore;
  isRunning: boolean;
  canBenchmark: boolean;
  hostReady: boolean;
  system: SystemProfile;
  host?: NetworkHost;
  selectedRow?: ModelRow;
  runProgress: RunProgress | null;
  questionCount: BenchmarkQuestionCount;
  onOpenSuiteEditor: () => void;
  onOpenLogs: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const scoreStatus = isRunning
    ? 'Model test in progress'
    : selectedScore
      ? `Last test grade ${selectedScore.grade}`
      : 'Not tested yet';
  const runActionLabel = isRunning ? 'Running' : selectedScore ? 'Run Again' : 'Start Test';

  return (
    <section className={active ? 'panel benchmark-panel panel-focused' : 'panel benchmark-panel'}>
      <PanelHeader
        icon={Gauge}
        title="Single Model Test"
        actionLabel={runActionLabel}
        onAction={onStart}
        busy={isRunning}
        meta={isRunning ? 'Running' : canBenchmark ? 'Ready' : hostReady ? 'Pick a model' : 'Computer not ready'}
      />

      <CompatibilityIntroCard
        model={model}
        host={host}
        score={selectedScore}
        benchmark={benchmarkForModel}
        questionCount={questionCount}
        canBenchmark={canBenchmark}
        hostReady={hostReady}
        isRunning={isRunning}
        onStart={onStart}
        onOpenSuiteEditor={onOpenSuiteEditor}
      />

      {runProgress?.mode === 'single' && (
        <RunProgressPanel
          progress={runProgress}
          host={host}
          showAnimation={false}
          onOpenLogs={onOpenLogs}
        />
      )}

      <div className="run-title">
        <strong>{model}</strong>
        <span>{scoreStatus}</span>
      </div>

      <div className="test-suite-strip">
        <div>
          <span>Test Questions</span>
          <strong>{questionCount} questions</strong>
        </div>
        <button type="button" className="mini-button outline advanced-only" onClick={onOpenSuiteEditor}>
          <Settings aria-hidden="true" />
          Edit Questions
        </button>
      </div>

      <TestProcessCard mode="single" questionCount={questionCount} />

      <MatchDetails
        benchmark={benchmarkForModel}
        score={selectedScore}
        host={host}
        model={model}
        row={selectedRow}
        system={system}
      />

      <ScoreBars benchmark={benchmarkForModel} score={selectedScore} active={isRunning} />

      <ResourceWarning cuda={system.cuda} />

      <button
        type="button"
        className="danger-button"
        disabled={!isRunning}
        onClick={onStop}
        title="Stop after the current question finishes"
      >
        <Zap aria-hidden="true" />
        Stop Run
      </button>
    </section>
  );
}

function CompatibilityIntroCard({
  model,
  host,
  score,
  benchmark,
  questionCount,
  canBenchmark,
  hostReady,
  isRunning,
  onStart,
  onOpenSuiteEditor,
}: {
  model: string;
  host?: NetworkHost;
  score?: TestedModelScore;
  benchmark: BenchmarkResult | null;
  questionCount: BenchmarkQuestionCount;
  canBenchmark: boolean;
  hostReady: boolean;
  isRunning: boolean;
  onStart: () => void;
  onOpenSuiteEditor: () => void;
}) {
  const hostName = host?.hostname ?? 'this computer';
  const statusLabel = isRunning
    ? 'One-model test in progress'
    : score
      ? `${score.total} Match · ${score.grade}`
      : canBenchmark
        ? 'Ready to test'
        : hostReady
          ? 'Pick an installed model'
          : 'Ollama is not ready';
  const actionLabel = isRunning ? 'Testing' : score ? 'Run Again' : 'Start Model Test';

  return (
    <section
      className="compatibility-intro-card"
      style={{ backgroundImage: `url(${robotModelTest})` }}
      aria-label="What the model test does"
    >
      <div className="compatibility-intro-copy">
        <span>What this window does</span>
        <strong>Test one AI model against this computer</strong>
        <p>
          RigMatch asks <b>{model}</b> the selected questions, times the answers, checks answer quality,
          and turns that into a Match score for <b>{hostName}</b>.
        </p>
      </div>

      <div className="compatibility-next-step" aria-label="Model test status">
        <span>{statusLabel}</span>
        <strong>{benchmark ? `${benchmark.prompts.length} answers saved` : `${questionCount} questions queued`}</strong>
        <em>Scores and question transcripts appear on the Top Pick profile.</em>
        <div>
          <button type="button" className="primary-button compact" onClick={onStart} disabled={isRunning || !canBenchmark}>
            <Gauge aria-hidden="true" />
            {actionLabel}
          </button>
          <button type="button" className="mini-button outline advanced-only" onClick={onOpenSuiteEditor} disabled={isRunning}>
            <Settings aria-hidden="true" />
            Edit Questions
          </button>
        </div>
      </div>

      <ol className="compatibility-steps" aria-label="Model test steps">
        <li>
          <MessageSquare aria-hidden="true" />
          <div>
            <span>1. Ask</span>
            <strong>{questionCount} test questions</strong>
          </div>
        </li>
        <li>
          <Gauge aria-hidden="true" />
          <div>
            <span>2. Score</span>
            <strong>quality, speed, finish rate, fit</strong>
          </div>
        </li>
        <li>
          <Trophy aria-hidden="true" />
          <div>
            <span>3. Crown</span>
            <strong>{score ? `current score ${score.total}` : 'a match score'}</strong>
          </div>
        </li>
      </ol>
    </section>
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

function MatchDetails({
  benchmark,
  score,
  host,
  model,
  row,
  system,
}: {
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  host?: NetworkHost;
  model: string;
  row?: ModelRow;
  system: SystemProfile;
}) {
  const profile = getModelProfile(model);
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const footprint = getFootprintFit(sizeGb, system);
  const topPrompt = benchmark?.prompts
    .slice()
    .sort((a, b) => b.sobrietyScore - a.sobrietyScore)[0];
  const matchScoreRows = [
    {
      label: 'Computer Fit',
      value: score ? `${score.fit}%` : 'N/A',
      detail: 'How well this model fits the computer based on model size, VRAM, RAM, and the latest test.',
    },
    {
      // This row has always shown score.total. Labelling it "Chemistry" gave the
      // Match score a second name — and a different panel used that same name for
      // a different number. Theme words stay in headings and prose, not on metrics.
      label: 'Match score',
      value: score ? String(score.total) : 'N/A',
      detail: 'Overall Match score: 34% answer quality, 32% speed, 18% finish rate, 16% computer fit.',
    },
    {
      label: 'Best Proof',
      value: score ? String(topPrompt ? topPrompt.sobrietyScore : score.sobriety) : 'N/A',
      detail: 'Highest prompt reliability score from the latest compatibility test.',
    },
  ];
  const matchRows = [
    {
      label: 'Computer',
      value: host?.hostname ?? system.hostname,
      detail: `${system.gpu.model} · ${system.gpu.vramGb || '?'} GB VRAM`,
    },
    {
      label: 'Agent Style',
      value: profile.archetype,
      detail: profile.specialties.join(' · '),
    },
    {
      label: 'Footprint',
      value: sizeGb ? formatGb(sizeGb) : 'Size unknown',
      detail: footprint,
    },
    {
      label: 'Acceleration',
      value: getCudaSummary(system.cuda),
      detail: getCudaDetail(system.cuda),
    },
  ];

  return (
    <div className="match-details" aria-label="System and model match details">
      <div className="match-details-head">
        <span>Why this pairing?</span>
        <strong>{profile.agentName} + {host?.hostname ?? system.hostname}</strong>
      </div>

      <div className="match-score-strip">
        {matchScoreRows.map((item) => (
          <div key={item.label} title={item.detail} aria-label={`${item.label}: ${item.value}. ${item.detail}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="match-detail-grid">
        {matchRows.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.detail}</em>
          </div>
        ))}
      </div>

      {benchmark?.prompts.length ? (
        <div className="prompt-list compact" aria-label="Prompt proof points">
          {benchmark.prompts.slice(0, 3).map((prompt) => (
            <div className="prompt-row" key={prompt.id}>
              <span>{prompt.label}</span>
              <strong>{prompt.sobrietyScore}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="prompt-proof-empty">
          <strong>{score ? 'Summary saved' : 'No test yet'}</strong>
          <span>{score ? 'Run this model again to refresh the proof.' : 'Run a test to grade this model on this computer.'}</span>
        </div>
      )}
    </div>
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
  const canRunListTest = shortlistedRows.length >= 2 && uninstalledLineupRows.length === 0 && !isListTesting;
  const questionLabel = `${questionCount} questions per model`;
  const runReadiness = shortlistedRows.length >= 2
    ? uninstalledLineupRows.length > 0
      ? `${uninstalledLineupRows.length} contestant${uninstalledLineupRows.length === 1 ? '' : 's'} need downloads before the show starts.`
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
        body={winnerResult ? `${listTestResult?.winner} is leading with ${winnerResult.total} Match.` : 'Run the show to crown your Top Match for this computer.'}
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
              {isListTesting ? 'Testing' : shortlistedRows.length >= 2 ? uninstalledLineupRows.length > 0 ? 'Download First' : 'Start Speed Dating' : 'Pick 2+'}
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
            <strong>No ranking yet</strong>
            <span>Start Speed Dating to crown the best match for this rig.</span>
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
  const activeModel = runProgress?.phase === 'running'
    ? runProgress.currentModel
    : winner ?? rows[0]?.displayName ?? '';
  const stageStatus = runProgress?.phase === 'running'
    ? `Now testing ${getShortModelName(runProgress.currentModel)}`
    : winner
      ? `${getShortModelName(winner)} is holding the top score`
      : rows.length >= 2
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
                  <AvatarBust model={row.displayName} size="tiny" />
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
        <AvatarBust model={row.displayName} size="tiny" />
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

type TranscriptViewMode = 'by-model' | 'by-question';

function SpeedDateTranscriptPanel({
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


function getPromptDiagnosticText(prompt: BenchmarkPromptResult) {
  if (prompt.diagnostic) return prompt.diagnostic;
  if (prompt.status === 'no-response' && /length/i.test(prompt.doneReason || '')) {
    return 'No visible answer; Ollama hit the output limit before returning text.';
  }
  if (prompt.status === 'truncated') {
    return `Answer may be incomplete; Ollama finished with ${prompt.doneReason || 'unknown reason'}.`;
  }
  return '';
}

const BENCHMARK_QUESTION_TYPES: BenchmarkQuestionType[] = ['assistant', 'json', 'truth', 'format', 'coding'];

const BENCHMARK_TYPE_LABELS: Record<BenchmarkQuestionType, string> = {
  assistant: 'Assistant response',
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

  return (
    <aside className="suite-editor-dock" role="dialog" aria-modal="true" aria-label="Test Suite Editor">
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

function ResourceWarning({ cuda }: { cuda: SystemProfile['cuda'] }) {
  const cudaSummary = getCudaSummary(cuda);
  const cudaDetail = getCudaDetail(cuda);

  return (
    <div className={`resource-warning ${cuda.status}`}>
      <AlertTriangle aria-hidden="true" />
      <div className="resource-copy">
        <span>Resource Warning</span>
        <strong>Tests can max CPU, GPU, VRAM, fans, and battery.</strong>
        <em>Close games, renders, and heavy apps before a long run.</em>
      </div>
      <div className="cuda-status">
        <span>CUDA Check</span>
        <strong>{cudaSummary}</strong>
        <em>{cudaDetail}</em>
      </div>
    </div>
  );
}

function AgentReveal({
  active,
  agentName,
  model,
  benchmark,
  selectedScore,
  modelScores,
  host,
  system,
  rows,
  selectedModel,
  onSelect,
  onTalk,
  onChoose,
  onRunTest,
  onEditQuestions,
  onTalkWithPrompt,
  topPick,
  onClearTopMatch,
  onClearScore,
  onRestoreClearedTopMatches,
  clearedTopMatchCount,
  onExportForHatch,
}: {
  active: boolean;
  agentName: string;
  model: string;
  benchmark: BenchmarkResult | null;
  selectedScore?: TestedModelScore;
  modelScores: Record<string, TestedModelScore>;
  host?: NetworkHost;
  system: SystemProfile;
  rows: ModelRow[];
  selectedModel: string;
  onSelect: (model: string) => void;
  onTalk: () => void;
  onChoose: () => void;
  onRunTest: () => void;
  onEditQuestions: () => void;
  onTalkWithPrompt: (prompt: string) => void;
  topPick?: RigPick | null;
  onClearTopMatch: () => void;
  onClearScore: (model: string) => void;
  onRestoreClearedTopMatches: () => void;
  clearedTopMatchCount: number;
  onExportForHatch: () => void;
}) {
  const activeProfile = getModelProfile(model);
  const matchNotes = getMatchNotes(activeProfile, selectedScore, host);
  const [dismissedModels, setDismissedModels] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);

  const dismissRosterModel = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedModels((prev) => new Set([...prev, name]));
  }, []);

  // Top 6 by score; unscored sort to the bottom; currently-viewed model always visible
  const validRows = rows.filter(Boolean);
  const selectedRow = validRows.find((r) => r.displayName === selectedModel || r.id === selectedModel);
  const sortedByScore = [...validRows].sort((a, b) => {
    const sA = getModelScore(a, modelScores)?.total ?? -1;
    const sB = getModelScore(b, modelScores)?.total ?? -1;
    return sB - sA;
  });
  const topModel = sortedByScore[0]?.displayName;
  const isTopPick = Boolean(selectedScore && model === topModel);
  const isCurrentTopMatch = Boolean(topPick?.row.displayName === model);
  const top6 = sortedByScore.filter((r) => !dismissedModels.has(r.displayName) || r.displayName === selectedModel || r.id === selectedModel).slice(0, 6);
  const inStrip = top6.some((r) => r.displayName === selectedModel || r.id === selectedModel);
  if (!inStrip && top6.length > 0) {
    const selRow = validRows.find((r) => r.displayName === selectedModel || r.id === selectedModel);
    if (selRow) top6[Math.min(5, top6.length - 1)] = selRow;
  }
  const rosterRows = top6;

  return (
    <section className={active ? 'panel agent-panel panel-focused' : 'panel agent-panel'}>
      <div className="agent-heading">
        <Bot aria-hidden="true" />
        <h2>Top Pick</h2>
      </div>

      <div
        className="agent-romance-banner"
        style={{ backgroundImage: `url(${robotRomanceHero})` }}
        aria-label="Robot matchmaking artwork"
      >
        <div>
          <span>RigMatch personals</span>
          <strong>{host?.hostname ?? 'This computer'} wants one good local model</strong>
          <em>
            {selectedScore
              ? `${agentName} has ${selectedScore.grade} chemistry with this rig.`
              : 'Run a model test to crown your Top Match.'}
          </em>
        </div>
      </div>

      <div className={selectedScore ? 'top-pick-hero scored' : 'top-pick-hero'} aria-label="Top pick result">
        <div className="top-pick-hero-left">
          <AvatarBust model={model} size="large" extraClass={isTopPick ? 'is-top-pick' : undefined} />
          <span className="avatar-frame-name">{getShortModelName(model)}</span>
        </div>
        <div className="top-pick-hero-right">
          <span>{selectedScore ? `Compatibility result · ${selectedScore.grade}` : 'No saved test for this model'}</span>
          <strong style={{ color: 'var(--text-strong)', fontSize: '20px', lineHeight: 1.1 }}>{agentName}</strong>
          <em style={{ color: 'var(--text)', fontSize: '12px', fontStyle: 'normal' }}>
            {selectedScore ? `${selectedScore.total} Match · ${selectedScore.grade} · ${getResponseEstimate(selectedScore.speed)}` : 'Run a compatibility test to crown the winner.'}
          </em>
          {selectedScore && (
            <div className="top-pick-ribbon-actions" style={{ justifyContent: 'flex-start', marginTop: '6px' }}>
              <button type="button" className="pick-this-one-btn" onClick={onChoose} title="Set as your active model">
                🌹 Use This Model
              </button>
              <button type="button" className="test-again-btn" onClick={() => setShareOpen(true)} title="Share this result as an image">
                <Share2 aria-hidden="true" />
                Share
              </button>
              {isCurrentTopMatch && (
                <button type="button" className="test-again-btn" onClick={onClearTopMatch} title="Clear this Top Match without deleting its scorecard">
                  <X aria-hidden="true" />
                  Clear Top Match
                </button>
              )}
              <button type="button" className="test-again-btn" onClick={onRunTest}>
                <RefreshCw aria-hidden="true" />
                Test Again
              </button>
              <button
                type="button"
                className="test-again-btn remove-score-btn"
                onClick={() => onClearScore(model)}
                title="Remove this saved scorecard and transcript"
              >
                <Trash2 aria-hidden="true" />
                Remove Score
              </button>
            </div>
          )}
          <div className="top-pick-ribbon-actions" style={{ justifyContent: 'flex-start', marginTop: '8px' }}>
            <button
              type="button"
              className="test-again-btn"
              onClick={onExportForHatch}
              // The label says what it does; "Hatch" is a third-party app most
              // users have never heard of, so it belongs in the explanation
              // rather than on the button itself.
              title="Save a small JSON profile of this match. Companion apps that accept it — such as Hatch — can set their local model from it without you typing model names."
            >
              <Upload aria-hidden="true" />
              Export model profile
            </button>
          </div>
          {!isCurrentTopMatch && clearedTopMatchCount > 0 && (
            <button type="button" className="test-again-btn top-pick-restore-action" onClick={onRestoreClearedTopMatches}>
              <RefreshCw aria-hidden="true" />
              Restore cleared Top Matches
            </button>
          )}
          <ModelDemoChips model={model} label="Made by this model" />
        </div>
      </div>

      {shareOpen && selectedScore && (
        <ShareScorecard model={model} score={selectedScore} system={system} onClose={() => setShareOpen(false)} />
      )}

      <div className="character-roster" aria-label="Model shortlist">
        {rosterRows.map((row) => {
          const rowScore = row.displayName === selectedModel
            ? selectedScore ?? getModelScore(row, modelScores)
            : getModelScore(row, modelScores);
          const scoreLabel = rowScore ? `${rowScore.total} · ${rowScore.grade}` : 'Not tested';
          const title = rowScore
            ? `${row.displayName}: Match ${rowScore.total}, grade ${rowScore.grade}.`
            : `${row.displayName}: not tested yet.`;
          const isActive = row.displayName === selectedModel;

          return (
            <div
              key={row.displayName}
              className={isActive ? 'roster-card active' : 'roster-card'}
              title={title}
            >
              <button
                type="button"
                className="roster-remove-btn"
                onClick={(e) => dismissRosterModel(row.displayName, e)}
                title={`Remove ${row.displayName} from comparison`}
                aria-label={`Remove ${row.displayName}`}
              >
                <X aria-hidden="true" />
              </button>
              <button
                type="button"
                className="roster-select-btn"
                onClick={() => onSelect(row.displayName)}
                aria-label={`View ${row.displayName}`}
              >
                <AvatarBust model={row.displayName} size="tiny" />
                <span className="roster-name">{getShortModelName(row.displayName)}</span>
                <span className={rowScore ? `roster-score ${getScoreTone(rowScore.total)}` : 'roster-score empty'}>
                  {scoreLabel}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="match-tagline">
        <span>Matchmaker note</span>
        <strong>{host?.hostname ?? 'Local machine'} + {model}</strong>
      </div>

      <AgentDatingProfile
        model={model}
        profile={activeProfile}
        benchmark={benchmark}
        score={selectedScore}
        row={selectedRow}
        host={host}
        system={system}
        onTalk={onTalk}
        onEditQuestions={onEditQuestions}
        onTalkWithPrompt={onTalkWithPrompt}
      />

      <div className="match-hero">
        <div className="agent-nameplate">
          <strong>{agentName}</strong>
          <span>Ollama model</span>
          <span>{activeProfile.archetype}</span>
          <span>{host?.hostname ?? 'Local machine'}</span>
        </div>

        <div className="score-grid">
          <ScoreTile label="Answer Quality" value={selectedScore?.sobriety} grade={selectedScore ? gradeFor(selectedScore.sobriety) : undefined} tone="pink" />
          <ScoreTile label="Speed" value={selectedScore?.speed} grade={selectedScore ? gradeFor(selectedScore.speed) : undefined} tone="gold" />
          <ScoreTile label="Match" value={selectedScore?.total} grade={selectedScore?.grade} tone="green" />
        </div>

        <div className="score-glossary" aria-label="Score glossary">
          <span title={getScoreTooltip('Answer Quality')}>Quality</span>
          <span title={getScoreTooltip('Speed')}>Pace</span>
          <span title={getScoreTooltip('Match')}>Fit</span>
        </div>

        <ResultExplanationCard
          model={model}
          profile={activeProfile}
          score={selectedScore}
          host={host}
          benchmark={benchmark}
          system={system}
        />

        <button type="button" className="talk-button" onClick={async () => {
          const result = await agentArcadeApi.openChatApp();
          if (!result?.ok) alert('RigMatch Chat companion not found.\n\nDownload it from the Releases page or build it from source:\n  cd rigmatch-chat && npx tauri build');
        }}>
          <MessageSquare aria-hidden="true" />
          Chat With Match
        </button>
      </div>

      <div
        className={selectedScore ? 'grade-track' : 'grade-track empty'}
        aria-label="Grade track"
        title={selectedScore ? 'D to S grade band for the match score.' : 'Run a test to place this model on the grade track.'}
      >
        <span>D</span>
        <span>C</span>
        <span>B</span>
        <span>A</span>
        <span>S</span>
        {selectedScore && <i style={{ left: `${Math.min(96, Math.max(6, selectedScore.total))}%` }} />}
      </div>

      <div className="pairing-link" aria-label="Selected setup and model match">
        <div>
          <MachineAvatar host={host} size="small" />
          <span>Computer</span>
          <strong>{host?.hostname ?? 'Local machine'}</strong>
        </div>
        <i aria-hidden="true" />
        <div>
          <AvatarBust model={model} size="small" />
          <span>Model Match</span>
          <strong>{agentName}</strong>
        </div>
      </div>

      <div className="matchmaker-notes" aria-label="Why this match">
        <div>
          <span>Why this match?</span>
          <strong>{matchNotes.summary}</strong>
        </div>
        <ul>
          {matchNotes.reasons.map((reason) => (
            <li key={reason.label}>
              <span>{reason.label}</span>
              <strong>{reason.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AgentDatingProfile({
  model,
  profile,
  benchmark,
  score,
  row,
  host,
  system,
  onTalk,
  onEditQuestions,
  onTalkWithPrompt,
}: {
  model: string;
  profile: ModelProfile;
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  row?: ModelRow;
  host?: NetworkHost;
  system: SystemProfile;
  onTalk: () => void;
  onEditQuestions: () => void;
  onTalkWithPrompt: (prompt: string) => void;
}) {
  const sections = getAgentDatingProfileSections(model, profile, score, row, host, system);
  const details = getAgentDatingProfileDetails(model, profile, score, row, host, system);
  const [activeProfileTab, setActiveProfileTab] = useState<'about' | 'scores' | 'questions' | 'try-it'>('about');
  const locationLabel = host?.hostname ?? system.hostname;
  const matchLine = score
    ? `${score.total} Match score · ${score.grade} grade · ${getResponseEstimate(score.speed)}`
    : 'Waiting for a first compatibility test';
  const questionCount = benchmark?.prompts.length ?? 0;
  const profileTabs: Array<{ id: typeof activeProfileTab; label: string; badge: string; title: string }> = [
    { id: 'about', label: 'About', badge: 'Profile', title: 'Show the model dating profile.' },
    {
      id: 'scores',
      label: 'Scores',
      badge: score ? `${score.total} ${score.grade}` : 'No score',
      title: score ? `Show RigMatch score ${score.total}, grade ${score.grade}.` : 'Show score details after a test.',
    },
    {
      id: 'questions',
      label: 'Questions',
      badge: questionCount ? `${questionCount} asked` : 'No transcript',
      title: questionCount ? `Show ${questionCount} questions asked during the test.` : 'Show test questions after a run.',
    },
    { id: 'try-it', label: 'Try It', badge: 'starter prompts', title: 'See example prompts to get started.' },
  ];

  return (
    <section className="dating-profile-card" aria-label={`${profile.agentName} dating profile`}>
      <div className="dating-profile-head dating-profile-head-slim">
        <div className="dating-profile-intro">
          <span>AI dating profile</span>
          <strong>{profile.agentName}</strong>
          <em>{profile.archetype}</em>
          <p>{matchLine} for {locationLabel}.</p>
          <div className="profile-action-row" aria-label="Model profile actions">
            <button type="button" className="primary-button compact" onClick={onTalk}>
              <MessageSquare aria-hidden="true" />
              Talk to Model
            </button>
          </div>
        </div>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {profileTabs.map((tab) => (
          <button
            key={tab.id}
            id={`profile-tab-${tab.id}`}
            type="button"
            className={activeProfileTab === tab.id ? 'active' : ''}
            onClick={() => setActiveProfileTab(tab.id)}
            role="tab"
            aria-selected={activeProfileTab === tab.id}
            aria-controls={`profile-panel-${tab.id}`}
            title={tab.title}
          >
            <span>{tab.label}</span>
            <em>{tab.badge}</em>
          </button>
        ))}
      </div>

      {activeProfileTab === 'about' && (
        <div
          id="profile-panel-about"
          className="dating-profile-body"
          role="tabpanel"
          aria-labelledby="profile-tab-about"
        >
          <div className="profile-answers">
            {sections.map((section) => (
              <section key={section.title} className="profile-answer">
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </section>
            ))}
          </div>

          <aside className="profile-details-table" aria-label={`${profile.agentName} profile details`}>
            <div className="profile-details-title">
              <span>My Details</span>
              <strong>{profile.agentName}</strong>
            </div>
            <dl>
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}

      {activeProfileTab === 'scores' && (
        <ProfileScoreDetails
          model={model}
          profile={profile}
          benchmark={benchmark}
          score={score}
          details={details}
        />
      )}

      {activeProfileTab === 'questions' && (
        <ProfileQuestionTranscript
          model={model}
          benchmark={benchmark}
          onEditQuestions={onEditQuestions}
        />
      )}

      {activeProfileTab === 'try-it' && (
        <div
          id="profile-panel-try-it"
          className="dating-profile-body"
          role="tabpanel"
          aria-labelledby="profile-tab-try-it"
        >
          <p className="try-it-intro">Pick a prompt to open chat with a real example. Works with any installed model.</p>
          <div className="use-case-grid">
            {USE_CASE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="use-case-card">
                  <Icon className="use-case-icon" aria-hidden="true" />
                  <strong>{card.title}</strong>
                  <span>{card.description}</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => onTalkWithPrompt(card.prompt)}
                  >
                    <MessageSquare aria-hidden="true" />
                    Try It
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function ProfileScoreDetails({
  model,
  profile,
  benchmark,
  score,
  details,
}: {
  model: string;
  profile: ModelProfile;
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  details: Array<{ label: string; value: string }>;
}) {
  const bestPrompt = benchmark?.prompts
    ?.slice()
    .sort((left, right) => right.sobrietyScore - left.sobrietyScore)[0];
  const exactScores = benchmark?.scores;
  const scoreCards = [
    {
      label: 'Match',
      value: exactScores ? formatMatchScore(exactScores) : score ? formatMatchScore(score) : 'N/A',
      note: exactScores?.grade ?? score?.grade ?? 'Run a test',
    },
    {
      label: 'Answer Quality',
      value: exactScores ? `${exactScores.sobriety}%` : score ? `${score.sobriety}%` : 'N/A',
      note: '34% weight',
    },
    {
      label: 'Speed',
      value: exactScores ? `${exactScores.speed}%` : score ? `${score.speed}%` : 'N/A',
      note: '32% weight',
    },
    {
      label: 'Finish Rate',
      value: exactScores ? `${exactScores.stability}%` : 'N/A',
      note: '18% weight',
    },
    {
      label: 'Computer Fit',
      value: exactScores ? `${exactScores.fit}%` : score ? `${score.fit}%` : 'N/A',
      note: '16% weight',
    },
  ];

  return (
    <div
      id="profile-panel-scores"
      className="dating-profile-score-body"
      role="tabpanel"
      aria-labelledby="profile-tab-scores"
    >
      <div className="profile-scoreboard" aria-label={`${profile.agentName} scorecard`}>
        <div className="profile-scoreboard-title">
          <span>Judge Card</span>
          <strong>{model}</strong>
          <em>{score ? `RigMatch scored this model ${formatMatchScore(score)} with ${score.grade} chemistry.${isLegacyScore(score) ? ' Retest recommended for current scoring.' : ''}` : 'No scored compatibility test yet.'}</em>
        </div>
        <div className="profile-score-grid">
          {scoreCards.map((card) => (
            <div key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <em>{card.note}</em>
            </div>
          ))}
        </div>
        <div className="profile-score-formula">
          <span>Scoring recipe</span>
          <strong>34% answer quality + 32% speed + 18% finish rate + 16% computer fit</strong>
          <em>{benchmark ? `${benchmark.prompts.length} question${benchmark.prompts.length === 1 ? '' : 's'} scored in this transcript.` : 'Run a test to save the full score recipe.'}</em>
        </div>
        {bestPrompt ? (
          <div className="profile-best-prompt">
            <span>Best answer quality</span>
            <strong>{bestPrompt.label} · {bestPrompt.sobrietyScore}</strong>
            <em>{bestPrompt.tokensPerSecond} tok/s · {formatMs(bestPrompt.elapsedMs)}</em>
          </div>
        ) : (
          <div className="profile-empty-note">
            <strong>No prompt proof yet</strong>
            <span>Use Test in Contestants or run Speed Dating to save prompt-level proof.</span>
          </div>
        )}
      </div>

      <aside className="profile-details-table" aria-label={`${profile.agentName} score details`}>
        <div className="profile-details-title">
          <span>Score Details</span>
          <strong>{profile.agentName}</strong>
        </div>
        <dl>
          {details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

function ProfileQuestionTranscript({
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
          <em>{formatHistoryTime(benchmark.completedAt)} · {benchmark.scores.total} Match · {benchmark.scores.grade}</em>
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
                <span>{prompt.label}</span>
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

function ModeSplash({ onPick }: { onPick: (mode: UiMode) => void }) {
  return (
    <div className="mode-splash" role="dialog" aria-modal="true" aria-label="Choose how to use RigMatch">
      <div className="mode-splash-card">
        <div className="mode-splash-brand">
          <BrandMark />
          <div>
            <strong>RigMatch</strong>
            <span>Find the best AI your PC can run — nothing leaves this computer.</span>
          </div>
        </div>
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
      </div>
    </div>
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
      } else if (result.challenge === 'image-generation') {
        jobs.push({ key: `img:${result.model}`, model: result.model, kind: 'image', label: 'Image Lab', grade: result.grade, score: result.score, completedAt: result.completedAt, imageDataUrl: result.imageDataUrl });
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
        <div className="modal-backdrop" role="presentation" onClick={() => setPreviewImage(null)}>
          <section
            className="run-warning-modal advanced-lab-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Image generated by ${previewImage.model}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title">
              <Lightbulb aria-hidden="true" />
              <div>
                <span>Image Lab result</span>
                <strong>{previewImage.model}</strong>
              </div>
              <button type="button" className="mini-button outline" onClick={() => setPreviewImage(null)}>
                <X aria-hidden="true" />
                Close
              </button>
            </div>
            <img className="advanced-lab-generated-image" src={previewImage.src} alt={`Generated by ${previewImage.model}`} />
          </section>
        </div>
      )}
    </section>
  );
}

const LEARNING_TIPS: { term: string; tip: string }[] = [
  { term: 'Match Score', tip: 'A 0–100 rating combining speed, quality, reliability, and hardware fit.' },
  { term: 'Speed Dating', tip: 'Test multiple models with the same questions side-by-side to find your best fit.' },
  { term: 'VRAM', tip: "Video RAM on your GPU. Models must fit here to run fast — too big means slow or won't load." },
  { term: 'Rig Picks', tip: 'Models our algorithm recommends specifically for your GPU and hardware.' },
  { term: 'Ollama', tip: 'The local server that downloads and runs AI models privately on your machine.' },
  { term: 'Tokens/s', tip: 'Roughly how many words a model produces per second. Higher = faster responses.' },
  { term: 'Parameters (3B, 7B…)', tip: 'Billions of values the model learned. Bigger = more capable but slower and heavier.' },
  { term: 'Quantization (Q4/Q8)', tip: 'Compression that shrinks model size. Q4 = smaller and faster, Q8 = more accurate.' },
  { term: 'Accuracy', tip: 'Whether a model follows instructions and avoids making things up (hallucinating).' },
  { term: 'Grade (S/A/B/C)', tip: 'Overall rating: S is exceptional, A is great, B is solid, C needs improvement.' },
  { term: 'Embedding model', tip: 'Converts text into search vectors — not for chat or generation, so filtered out here.' },
  { term: 'Contestants', tip: 'Your shortlist of up to 5 models competing in Speed Dating. Add them from the model table.' },
  { term: 'Context window', tip: 'How much text a model can hold in memory at once. Bigger = longer conversations without forgetting.' },
];

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
          {pickName
            ? `${pickName} · ${pickScore} Match · ${pickGrade}`
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
  const trackPercent = hasMeasuredPercent || phase === 'complete'
    ? Math.max(3, Math.min(100, percent))
    : isPaused
      ? 12
      : queued
      ? 6
      : 28;
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

function LiveFlirtSpotlight({
  progress,
  host,
  system,
  rows,
  questionPlan,
  onStop,
}: {
  progress: RunProgress;
  host?: NetworkHost;
  system?: SystemProfile;
  rows?: ModelRow[];
  questionPlan?: BenchmarkQuestion[];
  onStop?: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  // Live rig meters while the model works the hardware. Unified-memory Macs
  // report one shared pool instead of separate VRAM.
  const liveMeters = system ? (() => {
    const gpu = system.gpu;
    const memPct = system.memory.totalGb ? (system.memory.usedGb / system.memory.totalGb) * 100 : 0;
    const meters: Array<{ label: string; value: string; level: number }> = [
      { label: 'CPU', value: `${system.cpu.loadPercent}%`, level: system.cpu.loadPercent },
      { label: 'RAM', value: `${system.memory.usedGb} / ${system.memory.totalGb} GB`, level: memPct },
    ];
    if (gpu.isUnifiedMemory) {
      meters.push({ label: 'Memory', value: `${system.memory.totalGb} GB unified`, level: memPct });
    } else if (gpu.vramGb) {
      meters.push({
        label: 'VRAM',
        value: gpu.vramUsedGb != null ? `${gpu.vramUsedGb} / ${gpu.vramGb} GB` : `${gpu.vramGb} GB`,
        level: gpu.vramUsedGb != null ? (gpu.vramUsedGb / gpu.vramGb) * 100 : 0,
      });
    }
    if (gpu.gpuLoadPercent != null) {
      meters.push({ label: 'GPU', value: `${gpu.gpuLoadPercent}%`, level: gpu.gpuLoadPercent });
    }
    return meters;
  })() : [];
  const stageRows = rows?.length
    ? rows
    : [{ displayName: progress.currentModel } as ModelRow];
  const activeModel = progress.currentModel;
  const modelCounter = progress.total > 1
    ? `model ${progress.completed + 1}/${progress.total}`
    : null;
  const questionCounter = progress.questionTotal
    ? `q ${(progress.questionIndex ?? 0) + 1}/${progress.questionTotal}`
    : null;
  const counterLabel = [modelCounter, questionCounter].filter(Boolean).join(' · ');
  const currentQuestionIndex = Math.max(0, progress.questionIndex ?? 0);
  const currentQuestion = questionPlan?.[currentQuestionIndex];
  const currentLabel = progress.questionLabel ?? currentQuestion?.label ?? 'Question';
  const currentPrompt = progress.questionPrompt ?? currentQuestion?.prompt ?? 'The host is about to ask the next prompt.';
  const runLabel = progress.questionRunTotal && progress.questionRunTotal > 1
    ? `Run ${Math.min(progress.questionRunTotal, (progress.questionRunIndex ?? 0) + 1)}/${progress.questionRunTotal}`
    : null;
  const phaseLabel = progress.questionPhase === 'prompt-run'
    ? (runLabel ?? 'Timing run')
    : progress.questionPhase === 'prompt-token'
      ? 'Answering live'
      : progress.questionPhase === 'prompt-start'
        ? 'Host is asking'
        : progress.questionPhase === 'prompt-complete'
          ? 'Answer scored'
          : progress.questionPhase === 'failed'
            ? 'Needs attention'
            : 'Warming up';
  const activeShortName = getShortModelName(activeModel);
  // Which stool the model on stage is sitting in — so the host can address it by
  // number, like "Contestant #1".
  const activeContestantNumber = stageRows.findIndex((row) => row?.displayName === activeModel) + 1;
  const banterPhase: HostBanterPhase = progress.questionPhase === 'prompt-start'
    ? 'asking'
    : progress.questionPhase === 'prompt-complete'
      ? 'scored'
      : (progress.questionPhase === 'prompt-run' || progress.questionPhase === 'prompt-token')
        ? 'answering'
        : 'warming';
  const banterCtx = {
    contestantNumber: activeContestantNumber,
    model: activeShortName,
    questionLabel: currentLabel,
    phase: banterPhase,
    index: currentQuestionIndex,
  };
  // Two voices on stage: the HOST asks the questions (question card), while the
  // computer is TONIGHT'S DATE — the one the contestants are trying to win.
  const hostLine = getHostBanter(banterCtx);
  const dateLine = getDateReaction(banterCtx);
  const totalQuestions = progress.questionTotal ?? questionPlan?.length ?? 0;
  const completedQuestions = progress.completedQuestions ?? 0;
  const stageSlots = Array.from({ length: Math.max(5, stageRows.length) }, (_item, index) => stageRows[index]);

  if (minimized) {
    const miniStatus = [counterLabel, phaseLabel].filter(Boolean).join(' · ');
    return (
      <aside className="live-mini-bar" role="status" aria-live="polite" aria-label="Speed Dating running (minimized)">
        <span className="live-mini-dot" aria-hidden="true" />
        <div className="live-mini-info">
          <strong>{activeShortName} on stage</strong>
          <em>{miniStatus || 'Warming up'}</em>
          <div className="live-mini-track" aria-hidden="true"><i style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <span className="live-mini-percent">{progress.percent}%</span>
        <button type="button" className="mini-button" onClick={() => setMinimized(false)} title="Expand the live show">
          <Maximize2 aria-hidden="true" />
          Expand
        </button>
        {onStop && (
          <button type="button" className="live-show-stop compact" onClick={onStop} title="Stop after the current question finishes">
            <X aria-hidden="true" />
            Stop
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="live-flirt-spotlight live-game-show" aria-label="Live Speed Dating game show stage">
      <div className="live-show-bg" style={{ backgroundImage: `url(${robotSpeedDateShow})` }} aria-hidden="true" />
      <div className="live-show-marquee" aria-hidden="true">
        {Array.from({ length: 22 }).map((_item, index) => <i key={index} />)}
      </div>

      <div className="live-show-shell">
        <header className="live-show-header">
          <div>
            <span>{progress.mode === 'speed-date' ? 'Live Speed Dating' : 'Live Model Test'}</span>
            <strong>{activeShortName} is on stage</strong>
          </div>
          <div className="live-show-counters">
            {counterLabel && <em>{counterLabel}</em>}
            <b>{phaseLabel}</b>
          </div>
          {liveMeters.length > 0 && (
            <div className="live-show-meters" aria-label="Live system load">
              {liveMeters.map((meter) => (
                <MetricTile key={meter.label} label={meter.label} value={meter.value} level={meter.level} />
              ))}
            </div>
          )}
          <div className="live-show-header-actions">
            <button type="button" className="live-show-minimize" onClick={() => setMinimized(true)} title="Minimize — keep the run going and use the rest of RigMatch">
              <Minimize2 aria-hidden="true" />
              Minimize
            </button>
            {onStop && (
              <button type="button" className="live-show-stop" onClick={onStop} title="Stop after the current question finishes">
                <X aria-hidden="true" />
                Stop
              </button>
            )}
          </div>
        </header>

        <section className="live-show-main">
          <div className="live-show-host-card">
            <div className="live-show-host-spotlight" aria-hidden="true" />
            <MachineAvatar host={host} size="medium" />
            <div>
              <span>Tonight's date</span>
              <strong>{host?.hostname ?? 'This computer'}</strong>
              <p>{dateLine}</p>
            </div>
            <div className="live-show-mic" aria-hidden="true">
              <MessageSquare />
            </div>
          </div>

          <div className="live-show-stage">
            <div className="live-show-sign" aria-hidden="true">
              <span>The</span>
              <strong>Dating Game</strong>
              <em>for local AI</em>
            </div>
            <ol className="live-show-contestants" aria-label="Contestants sitting on stage">
              {stageSlots.map((row, index) => {
                const displayName = row?.displayName ?? '';
                const isActive = displayName === activeModel;
                const score = displayName ? progress.questionScores?.[displayName] : undefined;
                return (
                  <li
                    key={displayName || `empty-live-stool-${index}`}
                    className={[isActive ? 'active' : '', row ? 'filled' : 'empty'].filter(Boolean).join(' ')}
                  >
                    <span className="live-show-seat-number">{index + 1}</span>
                    <div className="live-show-stool">
                      {row ? <AvatarBust model={displayName} size="large" /> : <Plus aria-hidden="true" />}
                    </div>
                    <div className="live-show-nameplate">
                      <span>{row ? `Contestant ${index + 1}` : 'Open stool'}</span>
                      <strong>{row ? getShortModelName(displayName) : 'Waiting'}</strong>
                      <em>{isActive ? 'Answering now' : score ? `${score} scored` : row ? 'On deck' : 'Empty'}</em>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="live-show-question-card" aria-label="Current question">
          <div>
            <span>
              {activeContestantNumber > 0 ? `Host → Contestant #${activeContestantNumber}` : 'Host'}
              {totalQuestions ? ` · Question ${Math.min(totalQuestions, currentQuestionIndex + 1)} of ${totalQuestions}` : ''}
            </span>
            <strong>{hostLine}</strong>
            <p>{currentPrompt}</p>
          </div>
          <div className="live-show-progress">
            <span>{progress.percent}%</span>
            <div aria-label={`${progress.percent}% complete`}>
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <em>{completedQuestions} answered · {progress.message}</em>
            {/* No affiliate CTA here. This overlay is the surface actively
                measuring the user's hardware; selling them a GPU beside the
                progress bar makes a low fit score look like a sales pitch.
                Hardware upgrade links live in Your Rig only. */}
          </div>
        </section>
      </div>
    </aside>
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


function ResultExplanationCard({
  model,
  profile,
  score,
  host,
  benchmark,
  system,
}: {
  model: string;
  profile: ModelProfile;
  score?: TestedModelScore;
  host?: NetworkHost;
  benchmark?: BenchmarkResult | null;
  system?: SystemProfile;
}) {
  const explanation = getResultExplanation(model, profile, score, host, benchmark, system);

  return (
    <div className={`result-explainer ${score ? getScoreTone(score.total) : 'empty'}`}>
      <span>{score ? 'Judge Card' : 'Judge Card Pending'}</span>
      <strong>{explanation.title}</strong>
      <p>{explanation.body}</p>
      {explanation.bottleneck && (
        <p className="result-explainer-bottleneck">
          <AlertTriangle aria-hidden="true" />
          {explanation.bottleneck}
        </p>
      )}
    </div>
  );
}


function DiskGuard({ guard }: { guard: ReturnType<typeof getDiskGuard> }) {
  return (
    <div className={`disk-guard ${guard.tone}`}>
      <div>
        <span>Storage</span>
        <strong>{guard.summary}</strong>
      </div>
      <div className="disk-bar" aria-label={guard.summary}>
        <i style={{ width: `${guard.percent}%` }} />
      </div>
      <em>{guard.message}</em>
    </div>
  );
}


export default App;
