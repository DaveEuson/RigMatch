import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  HelpCircle,
  Lightbulb,
  Sparkles,
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
  ChatAttachment,
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
  compareBenchmarkResults,
  compareTestedModelScores,
  formatMatchScore,
  toTestedModelScore,
  upsertModelScores,
} from './lib/scoring';
import { WhatsNewPanel } from './components/WhatsNewPanel';
import { SideMenu, type NavId, type NavItem } from './components/SideMenu';
import { GameShowHost } from './components/GameShowHost';
import { PanelHeader } from './components/CommonChrome';
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
  hasChosenInterfaceMode,
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
  isLikelyImageGenerationModel,
  isVisionModel,
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
  textJudgeCandidates,
  removePullProgress,
  removePullProgressForModels,
  removeSetValues,
  sumQueuedGb,
  upsertBenchmarkResults,
} from './lib/modelCatalog';
import type {
  ListTestResult,
} from './lib/modelCatalog';
import { dropChat, dropTranscripts, writeLocal, writeLocalJson, writeLocalJsonWithFallback } from './lib/safeStorage';
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
import { AvatarBust } from './components/Avatars';
import { ShareScorecard } from './components/ShareScorecard';
import { ExportHatchModal } from './components/ExportHatchModal';
import { buildHatchProfile } from './lib/hatchProfile';
import { UpdateAvailableToast } from './components/UpdateAvailableToast';
import { SimpleWizard, type StepId as WizardStepId, type WizardModel } from './components/SimpleWizard';
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
import { goalById, presetIdForGoal, type GoalId } from './lib/goals';
import { taskFilterForGoal } from './lib/modelCatalog';
import {
  firstRunStep, hasBeenOfferedGoals, markGoalsOffered, readSelectedGoals, writeSelectedGoals,
  type FirstRunStep,
} from './lib/goalSettings';
import { deletableRows, rowsExceptTopPick, topPickToKeep } from './lib/modelCleanup';
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
  countWithVerb,
  formatGb,
  formatPullCount,
  getErrorMessage,
} from './lib/format';
import { useAppLogs } from './hooks/useAppLogs';
import { useAppUpdates } from './hooks/useAppUpdates';
import { useModelNews } from './hooks/useModelNews';
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

      adoptClearedLogs(result);
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
      resetModelNews();
      setSuiteEditorOpen(false);
      setTutorialStep(0);
      setTutorialOpen(true);
      setPendingDeleteModel(null);
      setClearDataOpen(false);
      setActivity('RigMatch app data cleared. Ollama models were left installed.');
    } catch (error) {
      setActivity(`Could not clear all data: ${getErrorMessage(error)}`);
    }
  }, [ollama.baseUrl, selectedModel, adoptClearedLogs, resetModelNews]);

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
