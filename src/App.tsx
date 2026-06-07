import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Bot,
  Boxes,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  Heart,
  History,
  Info,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Search,
  ScanLine,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { agentArcadeApi, isDesktopRuntime } from './api';
import {
  BENCHMARK_QUESTION_LEVELS,
  buildBenchmarkPromptPlan,
  DEFAULT_BENCHMARK_QUESTIONS,
  normalizeBenchmarkQuestions,
  type BenchmarkQuestion,
  type BenchmarkQuestionCount,
  type BenchmarkQuestionType,
} from './benchmarkSuite';
import {
  demoBenchmark,
  demoCatalog,
  demoHosts,
  demoOllama,
  demoSystem,
} from './sampleData';
import type {
  AppLogEntry,
  BenchmarkResult,
  BenchmarkProgressUpdate,
  CatalogModel,
  ModelRow,
  NetworkHost,
  OllamaModel,
  OllamaStatus,
  SystemProfile,
  UpdateChannel,
  UpdateCheckResponse,
} from './types';
import machineAvatarLocal from './assets/machine-avatar-local.png';
import modelAvatarDeepSeek from './assets/model-avatar-deepseek.png';
import modelAvatarGemma from './assets/model-avatar-gemma.png';
import modelAvatarGeneric from './assets/model-avatar-generic.png';
import modelAvatarLlama from './assets/model-avatar-llama.png';
import modelAvatarMistral from './assets/model-avatar-mistral.png';
import modelAvatarPhi from './assets/model-avatar-phi.png';
import modelAvatarQwen from './assets/model-avatar-qwen.png';
import rigmatchBrandIcon from './assets/rigmatch-brand-icon.png';
import robotContestantWall from './assets/robot-contestant-wall.png';
import robotModelTest from './assets/robot-model-test.png';
import robotRigGreenroom from './assets/robot-rig-greenroom.png';
import robotRomanceHero from './assets/robot-romance-hero.png';
import robotScorecardCeremony from './assets/robot-scorecard-ceremony.png';
import robotSpeedDateShow from './assets/robot-speed-date-show.png';
import statusLocalScan from './assets/status-local-scan.png';
import statusOllamaService from './assets/status-ollama-service.png';
import './App.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
};

type NavItem = {
  id: NavId;
  label: string;
  description: string;
  icon: LucideIcon;
};

type NavId = 'lan' | 'models' | 'speedDate' | 'bench' | 'agent' | 'history' | 'settings' | 'about';

type UtilityPanelId = Extract<NavId, 'history' | 'settings' | 'about'>;

type ThemeId = 'orange' | 'avocado' | 'mustard' | 'teal' | 'chocolate';
type UiMode = 'beginner' | 'advanced';
type PendingRunMode = 'single' | 'speed-date';
type PendingScoreClear = { mode: 'single'; model: string } | { mode: 'all' };
type ModelSortKey = 'name' | 'params' | 'size' | 'skill' | 'origin' | 'source' | 'status' | 'score';
type SortDirection = 'asc' | 'desc';
type ModelQuickFilterId = 'all' | 'installed' | 'fits-vram' | 'scored' | 'unscored' | 'huge';
type ModelFamilyId = 'deepseek' | 'llama' | 'qwen' | 'mistral' | 'gemma' | 'phi' | 'generic';

const MODEL_AVATAR_ASSETS: Record<ModelFamilyId, string> = {
  deepseek: modelAvatarDeepSeek,
  llama: modelAvatarLlama,
  qwen: modelAvatarQwen,
  mistral: modelAvatarMistral,
  gemma: modelAvatarGemma,
  phi: modelAvatarPhi,
  generic: modelAvatarGeneric,
};

type TestedModelScore = {
  model: string;
  total: number;
  grade: string;
  speed: number;
  sobriety: number;
  fit: number;
  completedAt: string;
};

type ListTestResult = {
  winner: string;
  results: TestedModelScore[];
};

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
  completedQuestions?: number;
  questionScores?: Record<string, number>;
};

type ModelProfile = {
  agentName: string;
  archetype: string;
  specialties: string[];
  hue: number;
  accentHue: number;
  variant: 'visor' | 'helmet' | 'chrome' | 'arcade' | 'pilot' | 'nova';
};

type RigPick = {
  row: ModelRow;
  score?: TestedModelScore;
  profile: ModelProfile;
  tone: 'scored' | 'installed' | 'download';
  fitLabel: string;
  reason: string;
};

type HardwareFit = {
  tone: 'sweet-spot' | 'good' | 'tight' | 'unknown' | 'out-of-league';
  label: string;
  detail: string;
  recommend: boolean;
};

const navItems: NavItem[] = [
  { id: 'lan', label: 'Your Rig', description: 'Check this computer', icon: Network },
  { id: 'models', label: 'Contestants', description: 'Browse local models', icon: Boxes },
  { id: 'speedDate', label: 'Speed Dating', description: 'Compare up to 5 models', icon: Trophy },
  { id: 'bench', label: 'Test One Model', description: 'Ask questions, get score', icon: Gauge },
  { id: 'agent', label: 'Top Pick', description: 'Best match profile', icon: Bot },
  { id: 'history', label: 'Scorecards', description: 'Past test results', icon: History },
  { id: 'settings', label: 'Settings', description: 'Theme and app prefs', icon: Settings },
  { id: 'about', label: 'About', description: 'Version and support', icon: Info },
];

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/daveeuson';
const APP_VERSION = '0.1.0';
const TEST_SUITE_STORAGE_KEY = 'rigmatch:test-suite:v1';
const HISTORY_STORAGE_KEY = 'rigmatch:history:v1';
const THEME_STORAGE_KEY = 'agentArcadeTheme';
const TUTORIAL_STORAGE_KEY = 'rigmatch:first-run-tutorial:v1';
const UI_MODE_STORAGE_KEY = 'rigmatch:ui-mode:v1';

const releaseNotes: Array<{
  version: string;
  label: string;
  date: string;
  notes: string[];
}> = [
  {
    version: '0.1.0',
    label: 'Local Matchmaker Preview',
    date: 'Current build',
    notes: [
      'Local-only v1 flow focused on this computer and local Ollama.',
      'Dating profile, Top Pick, Speed Dating, scorecards, and editable test questions.',
      'Hardware-aware model filters so out-of-league models stay out of the default lineup.',
      'About now includes release notes and Release/Nightly upgrade checks.',
    ],
  },
  {
    version: '0.0.x',
    label: 'Prototype Lab',
    date: 'Earlier builds',
    notes: [
      'Initial rig scan, Ollama model pool, compatibility scoring, and desktop bridge logging.',
    ],
  },
];

const themeOptions: Array<{
  id: ThemeId;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  { id: 'orange', label: 'Studio Orange', description: 'Classic burnt orange', swatches: ['#d95a27', '#e8a838', '#5b7c53'] },
  { id: 'avocado', label: 'Avocado Green', description: 'Earthy 70s green', swatches: ['#5b7c53', '#e8a838', '#386377'] },
  { id: 'mustard', label: 'Mustard Yellow', description: 'Warm studio yellow', swatches: ['#e8a838', '#d95a27', '#4a3f35'] },
  { id: 'teal', label: 'Retro Teal', description: 'Groovy cool teal', swatches: ['#386377', '#d95a27', '#e8a838'] },
  { id: 'chocolate', label: 'Velvet Chocolate', description: 'Deep rich brown', swatches: ['#4a3f35', '#e8a838', '#d95a27'] },
];

const initialHosts = isDesktopRuntime ? [] : demoHosts.filter((host) => host.isLocal);
const initialSelectedHostId = initialHosts[0]?.id ?? 'localhost';
const DEFAULT_SHORTLIST_IDS = ['qwen2.5:7b', 'llama3.2:3b', 'mistral:7b', 'gemma3:4b', 'phi3:mini'];
const welcomeChatMessage: ChatMessage = {
  id: 'welcome',
  role: 'agent',
  content: 'I am your local AI matchmaker. Run a model test, then I can introduce you to the model that fits this computer best.',
};

type PersistedHistory = {
  benchmark: BenchmarkResult;
  benchmarkByModel?: Record<string, BenchmarkResult>;
  listTestResult: ListTestResult | null;
  modelScores: Record<string, TestedModelScore>;
  chatMessages: ChatMessage[];
  selectedModel?: string;
  savedAt: string;
};

function App() {
  const savedHistory = useMemo(() => getSavedHistory(), []);
  const initialBenchmark = savedHistory?.benchmark ?? demoBenchmark;
  const [system, setSystem] = useState<SystemProfile>(demoSystem);
  const [ollama, setOllama] = useState<OllamaStatus>(demoOllama);
  const [catalog, setCatalog] = useState<CatalogModel[]>(demoCatalog.models);
  const [hosts, setHosts] = useState<NetworkHost[]>(initialHosts);
  const [selectedHostId, setSelectedHostId] = useState(initialSelectedHostId);
  const [selectedModel, setSelectedModel] = useState(savedHistory?.selectedModel ?? 'qwen2.5:7b');
  const [benchmark, setBenchmark] = useState<BenchmarkResult>(initialBenchmark);
  const [benchmarkByModel, setBenchmarkByModel] = useState<Record<string, BenchmarkResult>>(
    () => savedHistory?.benchmarkByModel ?? upsertBenchmarkResults({}, [initialBenchmark]),
  );
  const [queuedModelIds, setQueuedModelIds] = useState<Set<string>>(() => new Set());
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(
    () => new Set(DEFAULT_SHORTLIST_IDS),
  );
  const [isScanningRig, setIsScanningRig] = useState(false);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [isListTesting, setIsListTesting] = useState(false);
  const [isPullingModels, setIsPullingModels] = useState(false);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pendingDeleteModel, setPendingDeleteModel] = useState<ModelRow | null>(null);
  const [listTestResult, setListTestResult] = useState<ListTestResult | null>(savedHistory?.listTestResult ?? null);
  const [modelScores, setModelScores] = useState<Record<string, TestedModelScore>>(() =>
    savedHistory?.modelScores ?? (isDesktopRuntime ? {} : upsertModelScores({}, [demoBenchmark])),
  );
  const [pendingRunMode, setPendingRunMode] = useState<PendingRunMode | null>(null);
  const [pendingSingleModel, setPendingSingleModel] = useState<string | null>(null);
  const [benchmarkQuestionCount, setBenchmarkQuestionCount] = useState<BenchmarkQuestionCount>(10);
  const [benchmarkQuestions, setBenchmarkQuestions] = useState<BenchmarkQuestion[]>(() => getSavedBenchmarkQuestions());
  const [suiteEditorOpen, setSuiteEditorOpen] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [activity, setActivity] = useState('Ready to check this computer and find a local AI match.');
  const [activeNavId, setActiveNavId] = useState<NavId>('lan');
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [logPath, setLogPath] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('release');
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResponse | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(() => getSavedThemeId());
  const [uiMode, setUiMode] = useState<UiMode>(() => getSavedUiMode());
  const [chatOpen, setChatOpen] = useState(false);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [pendingScoreClear, setPendingScoreClear] = useState<PendingScoreClear | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => !getSavedTutorialSeen());
  const [tutorialStep, setTutorialStep] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    savedHistory?.chatMessages ?? [welcomeChatMessage],
  );

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0];

  const modelRows = useMemo(
    () => mergeModelRows(catalog, ollama.models),
    [catalog, ollama.models],
  );

  const selectedRow = modelRows.find(
    (row) => row.displayName === selectedModel || row.id === selectedModel,
  );
  const selectedModelScore = selectedRow
    ? getModelScore(selectedRow, modelScores)
    : modelScores[selectedModel];
  const selectedBenchmark = getBenchmarkForModel(benchmarkByModel, selectedModel, selectedRow)
    ?? (isBenchmarkForModel(benchmark, selectedModel, selectedRow) ? benchmark : null);
  const selectedHostCanBenchmark = isHostBenchmarkReady(selectedHost, ollama);

  const installedModelNames = useMemo(
    () => new Set(ollama.models.map((model) => model.model || model.name)),
    [ollama.models],
  );

  const canBenchmark = Boolean(selectedRow?.installed && selectedHostCanBenchmark);
  const agentName = getAgentName(selectedModel);
  const shortlistedRows = useMemo(
    () => modelRows.filter((row) => shortlistIds.has(row.displayName)).slice(0, 5),
    [modelRows, shortlistIds],
  );
  const scoredModelCount = Object.keys(modelScores).length;
  const benchmarkPromptPlan = useMemo(
    () => buildBenchmarkPromptPlan(benchmarkQuestionCount, benchmarkQuestions),
    [benchmarkQuestionCount, benchmarkQuestions],
  );
  const queuedRows = useMemo(
    () => modelRows.filter((row) => queuedModelIds.has(row.displayName)),
    [modelRows, queuedModelIds],
  );
  const diskGuard = useMemo(
    () => getDiskGuard(modelRows, queuedRows, system.storage.availableGb),
    [modelRows, queuedRows, system.storage.availableGb],
  );
  const topRigPick = useMemo(
    () => getRigPick(modelRows, modelScores, system.gpu.vramGb),
    [modelRows, modelScores, system.gpu.vramGb],
  );

  const refreshRig = useCallback(async () => {
    setIsScanningRig(true);
    setActivity('Checking this computer, Ollama, and available models...');

    try {
      const [profile, ollamaStatus, catalogResponse] = await Promise.all([
        agentArcadeApi.getSystemProfile(),
        agentArcadeApi.getOllamaStatus(),
        agentArcadeApi.getOllamaCatalog({ force: true }),
      ]);

      setSystem(profile);
      setOllama(ollamaStatus);
      setCatalog(catalogResponse.models);

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

      setHosts([localHost]);
      setSelectedHostId(localHost.id);

      if (ollamaStatus.models.length > 0) {
        setSelectedModel((current) =>
          ollamaStatus.models.some((model) => model.model === current) ? current : ollamaStatus.models[0].model,
        );
      }

      const mode = isDesktopRuntime ? 'desktop bridge' : 'preview fallback';
      const catalogNote = catalogResponse.error ? ` Catalog fallback: ${catalogResponse.error}` : '';
      const catalogSyncNote = !catalogResponse.error && catalogResponse.models.length > 0
        ? ` Synced ${catalogResponse.models.length} library contestants from ${catalogResponse.source}.`
        : '';
      setActivity(
        isDesktopRuntime
          ? `Computer check complete via ${mode}.${catalogNote}${catalogSyncNote}`
          : `Preview sample data loaded via ${mode}.${catalogNote}${catalogSyncNote}`,
      );
    } catch (error) {
      setActivity(`Computer check failed: ${getErrorMessage(error)}`);
    } finally {
      setIsScanningRig(false);
    }
  }, []);

  const openOllamaDownload = useCallback(async () => {
    setActivity('Opening Ollama official download page...');

    try {
      await agentArcadeApi.openOllamaDownload();
      setActivity('Ollama download page opened. Install it, then check this computer again.');
    } catch (error) {
      setActivity(`Could not open Ollama download page: ${getErrorMessage(error)}`);
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

  const selectUpdateChannel = useCallback((channel: UpdateChannel) => {
    setUpdateChannel(channel);
    setUpdateCheck(null);
    setActivity(`${getUpdateChannelLabel(channel)} channel selected.`);
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    setActivity(`Checking ${getUpdateChannelLabel(updateChannel).toLowerCase()} upgrades...`);

    try {
      const result = await agentArcadeApi.checkForUpdates(updateChannel);
      setUpdateCheck(result);

      if (result.error) {
        setActivity(`Update check finished with a note: ${result.error}`);
      } else if (result.hasUpdate) {
        setActivity(`${result.latestName ?? 'A newer RigMatch.AI build'} is available on the ${getUpdateChannelLabel(result.channel)} channel.`);
      } else {
        setActivity(`You are on the latest ${getUpdateChannelLabel(result.channel).toLowerCase()} build RigMatch found.`);
      }
    } catch (error) {
      setActivity(`Could not check for RigMatch.AI upgrades: ${getErrorMessage(error)}`);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [updateChannel]);

  const openUpdatePage = useCallback(async () => {
    try {
      await agentArcadeApi.openUpdatePage(updateChannel);
      setActivity(`Opened RigMatch.AI ${getUpdateChannelLabel(updateChannel).toLowerCase()} downloads.`);
    } catch (error) {
      setActivity(`Could not open RigMatch.AI downloads: ${getErrorMessage(error)}`);
    }
  }, [updateChannel]);

  const requestClearData = useCallback(() => {
    setClearDataOpen(true);
  }, []);

  const requestClearScore = useCallback((model: string) => {
    setPendingScoreClear({ mode: 'single', model });
  }, []);

  const requestClearAllScores = useCallback(() => {
    setPendingScoreClear({ mode: 'all' });
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
      setBenchmark(createEmptyBenchmark(selectedModel, ollama.baseUrl));
      setRunProgress(null);
      setPendingScoreClear(null);
      setActivity('All saved match scores and date transcripts were cleared. Ollama models stayed installed.');
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
    setBenchmark((current) =>
      isBenchmarkForAliases(current, aliases)
        ? createEmptyBenchmark(selectedModel, ollama.baseUrl)
        : current,
    );
    setRunProgress(null);
    setPendingScoreClear(null);
    setActivity(`${pendingScoreClear.model} score and date transcript cleared. The model is still installed.`);
  }, [modelRows, ollama.baseUrl, pendingScoreClear, selectedModel]);


  const closeTutorial = useCallback(() => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'seen');
    setTutorialOpen(false);
    setActivity('Tutorial closed. Use Start Tour whenever you want the host back.');
  }, []);

  const confirmClearData = useCallback(async () => {
    try {
      window.localStorage.removeItem(TEST_SUITE_STORAGE_KEY);
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      window.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
      window.localStorage.removeItem(UI_MODE_STORAGE_KEY);
      const result = await agentArcadeApi.clearLogs();

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
      setChatMessages([welcomeChatMessage]);
      setChosenModel(null);
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
    setSelectedModel(row.displayName);
    setPendingDeleteModel(row);
  }, []);

  const cancelDeleteModel = useCallback(() => {
    if (isDeletingModel) return;
    setPendingDeleteModel(null);
  }, [isDeletingModel]);

  const confirmDeleteModel = useCallback(async () => {
    if (!pendingDeleteModel) return;

    const aliases = getModelAliases(pendingDeleteModel);
    const modelName = pendingDeleteModel.installedModel?.model ?? pendingDeleteModel.displayName;
    const targetHost = selectedHost?.hostname ?? 'selected computer';

    setIsDeletingModel(true);
    setActivity(`Deleting ${modelName} from ${targetHost}...`);

    try {
      const result = await agentArcadeApi.deleteModel({
        model: modelName,
        baseUrl: ollama.baseUrl,
      });

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
      setShortlistIds((current) => removeSetValues(current, aliases));
      setQueuedModelIds((current) => removeSetValues(current, aliases));

      if (aliases.includes(selectedModel)) {
        const nextModel = modelRows.find((row) => !aliases.includes(row.displayName) && row.installed)?.displayName
          ?? modelRows.find((row) => !aliases.includes(row.displayName))?.displayName
          ?? 'qwen2.5:7b';
        setSelectedModel(nextModel);
      }

      setPendingDeleteModel(null);
      setActivity(`${result.model} deleted from ${targetHost}. Download it again if that match deserves a second date.`);
    } catch (error) {
      setActivity(`Model delete failed: ${getErrorMessage(error)}`);
    } finally {
      setIsDeletingModel(false);
    }
  }, [modelRows, ollama.baseUrl, pendingDeleteModel, selectedHost?.hostname, selectedHostId, selectedModel]);

  const selectNav = useCallback((id: NavId) => {
    setActiveNavId(id);

    if (id === 'history') {
      void loadLogs();
      setActivity(`${getNavLabel(id)} selected.`);
      return;
    }

    setActivity(`${getNavLabel(id)} selected.`);
  }, [loadLogs]);

  const selectTheme = useCallback((nextThemeId: ThemeId) => {
    setThemeId(nextThemeId);
    setActivity(`${getThemeLabel(nextThemeId)} theme selected.`);
  }, []);

  const selectUiMode = useCallback((nextMode: UiMode) => {
    setUiMode(nextMode);
    setActivity(nextMode === 'beginner'
      ? 'Beginner mode selected. RigMatch will keep the interface focused on the next useful step.'
      : 'Advanced mode selected. RigMatch will show more setup details, commands, and diagnostics.');
  }, []);

  const requestBenchmarkForModel = useCallback((model: string) => {
    const row = modelRows.find((candidate) => candidate.displayName === model || candidate.id === model);
    const installed = Boolean(row?.installed || installedModelNames.has(model));
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);

    if (!installed) {
      setActivity('Pick an installed Ollama model before starting the compatibility test.');
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
      setActivity(getHostBenchmarkBlocker(selectedHost, ollama) ?? 'Pick an installed Ollama model before starting the compatibility test.');
      return;
    }

    requestBenchmarkForModel(selectedModel);
  }, [canBenchmark, ollama, requestBenchmarkForModel, selectedHost, selectedModel]);

  const requestBenchmarkRow = useCallback((row: ModelRow) => {
    requestBenchmarkForModel(row.displayName);
  }, [requestBenchmarkForModel]);

  const startBenchmark = useCallback(async (modelOverride?: string | null) => {
    const modelToTest = modelOverride ?? selectedModel;
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);
    const progressId = createRunProgressId('single');

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
      message: `${benchmarkQuestionCount} question suite warming up...`,
      questionIndex: 0,
      questionTotal: benchmarkPromptPlan.length,
      questionLabel: benchmarkPromptPlan[0]?.label,
      questionPrompt: benchmarkPromptPlan[0]?.prompt,
      completedQuestions: 0,
      questionScores: {},
    });
    setActivity(`Testing ${modelToTest} with ${benchmarkQuestionCount} questions for speed, reliability, and computer fit...`);

    try {
      const result = await agentArcadeApi.runBenchmark({
        model: modelToTest,
        baseUrl: ollama.baseUrl,
        questionCount: benchmarkQuestionCount,
        questions: benchmarkPromptPlan,
        progressId,
      });
      setBenchmark(result);
      setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
      setModelScores((current) => upsertModelScores(current, [result]));
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
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      await agentArcadeApi.appendLog({
        level: 'error',
        source: 'renderer',
        message: `Model test failed: ${modelToTest}`,
        details: {
          model: modelToTest,
          computer: selectedHost?.hostname ?? system.hostname,
          baseUrl: ollama.baseUrl,
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
      setIsBenchmarking(false);
    }
  }, [benchmarkPromptPlan, benchmarkQuestionCount, loadLogs, ollama, selectedHost, selectedModel, system.hostname]);

  const queueModel = useCallback((row: ModelRow) => {
    setSelectedModel(row.displayName);
    setQueuedModelIds((current) => {
      const next = new Set(current);
      if (next.has(row.displayName)) {
        next.delete(row.displayName);
        const remainingGb = sumQueuedGb(modelRows, next);
        setActivity(`${row.displayName} removed. Queue now totals ${formatGb(remainingGb)}.`);
      } else {
        const rowGb = row.sizeGb || 0;
        const nextQueuedGb = sumQueuedGb(modelRows, next) + rowGb;
        const freeAfterQueue = system.storage.availableGb - nextQueuedGb;

        if (rowGb <= 0) {
          setActivity(`${row.displayName} has unknown size. Check the model page before downloading.`);
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
        const warning = freeAfterQueue < 25 ? ' Low-space warning.' : '';
        setActivity(`${row.displayName} queued (+${formatGb(rowGb)}). Queue totals ${formatGb(nextQueuedGb)}; ${formatGb(freeAfterQueue)} free after queue.${warning}`);
      }
      return next;
    });
  }, [modelRows, system.gpu.vramGb, system.storage.availableGb]);

  const pullQueuedModels = useCallback(async () => {
    if (queuedRows.length === 0) {
      setActivity('Pick a model to download before starting the queue.');
      return;
    }

    if (!ollama.ready) {
      setActivity('Ollama must be running before RigMatch.AI can download models.');
      return;
    }

    setIsPullingModels(true);

    try {
      for (const row of queuedRows) {
        setPullingModel(row.displayName);
        setActivity(`Downloading ${row.displayName} into ${selectedHost?.hostname ?? 'this computer'}... This can take a while.`);
        await agentArcadeApi.pullModel({
          model: row.displayName,
          baseUrl: ollama.baseUrl,
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
      }

      setQueuedModelIds(new Set<string>());
      setActivity(`${queuedRows.length} model${queuedRows.length === 1 ? '' : 's'} downloaded. Refreshing the model list...`);
      await refreshRig();
    } catch (error) {
      setActivity(`Model download failed: ${getErrorMessage(error)}`);
    } finally {
      setPullingModel(null);
      setIsPullingModels(false);
    }
  }, [ollama.baseUrl, ollama.ready, queuedRows, refreshRig, selectedHost?.hostname]);

  const toggleShortlist = useCallback((row: ModelRow) => {
    const hardwareFit = getHardwareFit(row, system.gpu.vramGb);

    setShortlistIds((current) => {
      const next = new Set(current);
      if (next.has(row.displayName)) {
        next.delete(row.displayName);
        setActivity(`${row.displayName} removed from the Speed Dating lineup.`);
        return next;
      }

      if (!row.installed) {
        setActivity(`${row.displayName} needs to be installed before it can join Speed Dating.`);
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
  }, [system.gpu.vramGb]);

  const requestListTest = useCallback(() => {
    const runnableRows = shortlistedRows.filter((row) => row.installed).slice(0, 5);
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);

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
  }, [benchmarkQuestionCount, ollama, selectedHost, shortlistedRows]);

  const runListTest = useCallback(async () => {
    const runnableRows = shortlistedRows.filter((row) => row.installed).slice(0, 5);
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);
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
        const result = await agentArcadeApi.runBenchmark({
          model: row.displayName,
          baseUrl: ollama.baseUrl,
          questionCount: benchmarkQuestionCount,
          questions: benchmarkPromptPlan,
          progressId,
        });
        results.push(result);
        setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
        setModelScores((current) => upsertModelScores(current, [result]));
        setRunProgress({
          progressId: runnableRows[index + 1] ? `${listRunId}-${index + 1}` : progressId,
          mode: 'speed-date',
          phase: 'running',
          label: 'Speed Dating',
          currentModel: runnableRows[index + 1]?.displayName ?? result.model,
          completed: index + 1,
          total: runnableRows.length,
          percent: Math.round(((index + 1) / runnableRows.length) * 100),
          message: `${result.model} scored ${result.scores.total} (${result.scores.grade}).`,
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
      }

      const winner = results.reduce((best, result) =>
        result.scores.total > best.scores.total ? result : best,
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
        message: `${winner.model} gets the rose for this computer.`,
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
          .map(toTestedModelScore)
          .sort((a, b) => b.total - a.total),
      });
      setActivity(`Best match: ${winner.model} scored ${winner.scores.total} for this setup.`);
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
      setIsListTesting(false);
    }
  }, [benchmarkPromptPlan, benchmarkQuestionCount, loadLogs, ollama, selectedHost, shortlistedRows, system.hostname]);

  const confirmPendingRun = useCallback(() => {
    const mode = pendingRunMode;
    const model = pendingSingleModel;
    setPendingRunMode(null);
    setPendingSingleModel(null);

    if (mode === 'single') {
      void startBenchmark(model);
      return;
    }

    if (mode === 'speed-date') {
      void runListTest();
    }
  }, [pendingRunMode, pendingSingleModel, runListTest, startBenchmark]);

  const cancelPendingRun = useCallback(() => {
    setPendingRunMode(null);
    setPendingSingleModel(null);
    setActivity('Model test cancelled before resources were engaged.');
  }, []);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    if (!message) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message,
    };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');

    try {
      const response = await agentArcadeApi.sendChat({
        model: selectedModel,
        message,
        baseUrl: ollama.baseUrl,
      });
      setChatMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-agent`,
          role: 'agent',
          content: response.message,
        },
      ]);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'agent',
          content: `I could not reach the selected model: ${getErrorMessage(error)}`,
        },
      ]);
    }
  }, [chatInput, ollama.baseUrl, selectedModel]);

  useEffect(() => {
    void refreshRig();
  }, [refreshRig]);

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
    const history: PersistedHistory = {
      benchmark,
      benchmarkByModel,
      listTestResult,
      modelScores,
      chatMessages,
      selectedModel,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [benchmark, benchmarkByModel, chatMessages, listTestResult, modelScores, selectedModel]);

  useEffect(() => {
    if (!agentArcadeApi.onBenchmarkProgress) return undefined;

    return agentArcadeApi.onBenchmarkProgress((update) => {
      setRunProgress((current) => {
        if (!current || current.progressId !== update.id || current.phase !== 'running') return current;

        const promptTotal = update.promptTotal || current.questionTotal || benchmarkPromptPlan.length;
        const completedQuestions = update.phase === 'prompt-complete'
          ? Math.min(promptTotal, update.promptIndex + 1)
          : current.completedQuestions ?? 0;
        const promptFraction = update.phase === 'prompt-complete' ? 1 : update.phase === 'prompt-start' ? 0.35 : 0;
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
          completedQuestions,
          message: update.message ?? current.message,
          questionScores: typeof update.sobrietyScore === 'number'
            ? { ...(current.questionScores ?? {}), [questionKey]: update.sobrietyScore }
            : current.questionScores,
        };
      });
    });
  }, [benchmarkPromptPlan.length]);

  return (
    <div className="app-shell" data-theme={themeId} data-ui-mode={uiMode}>
      <TopDeck isScanning={isScanningRig} onScan={refreshRig}
        system={system}
        ollama={ollama}
      />

      <SideMenu
        items={navItems}
        ollamaReady={ollama.ready}
        modelCount={modelRows.length}
        shortlistCount={shortlistedRows.length}
        isRunning={isBenchmarking || isListTesting}
        topPick={topRigPick}
        activeId={activeNavId}
        scoredCount={scoredModelCount}
        onSelect={selectNav}
      />

      <main className="stage-content">
        {activeNavId === 'lan' && (
          <LanBrowser
            active={true}
            system={system}
            ollama={ollama}
            hosts={hosts}
            modelCount={modelRows.length}
            selectedHostId={selectedHostId}
            isScanning={isScanningRig}
            onScan={refreshRig}
            onSelect={setSelectedHostId}
            onInstallOllama={openOllamaDownload}
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
            modelScores={modelScores}
            diskGuard={diskGuard}
            vramGb={system.gpu.vramGb}
            queuedCount={queuedRows.length}
            isBenchmarking={isBenchmarking || isListTesting}
            isPulling={isPullingModels}
            isDeletingModel={isDeletingModel}
            pullingModel={pullingModel}
            shortlistedCount={shortlistedRows.length}
            onSelect={setSelectedModel}
            onScoreModel={requestBenchmarkRow}
            onDeleteModel={requestDeleteModel}
            onQueueModel={queueModel}
            onPullQueued={pullQueuedModels}
            onToggleShortlist={toggleShortlist}
            onOpenSpeedDate={() => selectNav('speedDate')}
            onOpenTopPick={() => selectNav('agent')}
            onRefresh={refreshRig}
          />
        )}
        {activeNavId === 'speedDate' && (
          <SpeedDatePanel
            active={true}
            host={selectedHost}
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
            onRemoveCandidate={toggleShortlist}
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
            onEditQuestions={() => setSuiteEditorOpen(true)}
          />
        )}
        {(activeNavId === 'history' || activeNavId === 'settings' || activeNavId === 'about') && (
          <UtilityPanel
            panel={activeNavId}
            benchmark={benchmark}
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
          />
        )}
      </main>

      <Ticker
        activity={activity}
        benchmark={benchmark}
        isDesktopRuntime={isDesktopRuntime}
      />

      {chatOpen && (
        <ChatDock
          agentName={agentName}
          model={selectedModel}
          messages={chatMessages}
          value={chatInput}
          onChange={setChatInput}
          onClose={() => setChatOpen(false)}
          onSend={sendChat}
        />
      )}

      {setupGuideOpen && (
        <SetupGuideDock
          system={system}
          onClose={() => setSetupGuideOpen(false)}
          onInstallOllama={openOllamaDownload}
        />
      )}

      {runProgress?.phase === 'running' && runProgress.mode === 'single' && (
        <LiveFlirtSpotlight progress={runProgress} host={selectedHost} />
      )}

      {suiteEditorOpen && (
        <TestSuiteEditorDock
          questions={benchmarkQuestions}
          onChange={setBenchmarkQuestions}
          onReset={() => setBenchmarkQuestions([...DEFAULT_BENCHMARK_QUESTIONS])}
          onClose={() => setSuiteEditorOpen(false)}
        />
      )}

      {pendingRunMode && (
        <RunWarningModal
          mode={pendingRunMode}
          selectedModel={pendingSingleModel ?? selectedModel}
          shortlistedCount={shortlistedRows.length}
          questionCount={benchmarkQuestionCount}
          system={system}
          onCancel={cancelPendingRun}
          onConfirm={confirmPendingRun}
        />
      )}

      {chosenModel && (
        <ChoiceCruiseModal
          model={chosenModel}
          host={selectedHost}
          onClose={() => setChosenModel(null)}
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
      {pendingScoreClear && (
        <ClearScoresModal
          pending={pendingScoreClear}
          scoreCount={scoredModelCount}
          onCancel={cancelClearScores}
          onConfirm={confirmClearScores}
        />
      )}

      {tutorialOpen && (
        <FirstRunTutorial
          stepIndex={tutorialStep}
          selectedModel={selectedModel}
          hostCount={hosts.length}
          modelCount={modelRows.length}
          shortlistCount={shortlistedRows.length}
          scoredCount={scoredModelCount}
          canBenchmark={canBenchmark}
          ollamaReady={ollama.ready}
          isScanning={isScanningRig}
          isBenchmarking={isBenchmarking}
          onStepChange={setTutorialStep}
          onClose={closeTutorial}
          onSelectNav={selectNav}
          onCheckComputer={refreshRig}
          onRunTest={requestBenchmark}
          onOpenCompare={() => selectNav('speedDate')}
          onOpenSetupGuide={openSetupGuide}
        />
      )}
    </div>
  );
}

function TopDeck({
  system,
  ollama,
  isScanning,
  onScan,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  isScanning: boolean;
  onScan: () => void;
}) {
  const gpuLabel = `${system.gpu.model}${system.gpu.vramGb ? ` ${system.gpu.vramGb}GB` : ''}`;
  const hostCountLabel = ollama.ready ? 'Local Ollama' : 'Check local app';
  const localMachine = {
    hostname: system.hostname,
    ip: system.networks[0]?.address ?? '127.0.0.1',
    isLocal: true,
  };

  return (
    <header className="top-deck">
      <div className="brand-block" aria-label="RigMatch.AI">
        <BrandMark />
        <div>
          <h1>RigMatch.AI</h1>
          <p>AI model matchmaking for your computer</p>
        </div>
      </div>

      <section className="rig-card" aria-label="Selected computer">
        <MachineAvatar host={localMachine} size="medium" />
        <div>
          <strong>{system.hostname}</strong>
          <span className={ollama.ready ? 'status-good' : 'status-bad'}>
            {ollama.ready ? 'Ollama Ready' : 'Ollama Offline'}
          </span>
          <span>{gpuLabel}</span>
        </div>
      </section>

      <section className="monitor-grid" aria-label="System monitor">
        <MetricTile label="CPU" value={`${system.cpu.loadPercent}%`} level={system.cpu.loadPercent} />
        <MetricTile label="RAM" value={`${system.memory.usedGb} / ${system.memory.totalGb} GB`} level={(system.memory.usedGb / Math.max(1, system.memory.totalGb)) * 100} />
        <MetricTile label="VRAM" value={`${system.gpu.vramGb || '?'} GB`} level={system.gpu.vramGb ? Math.min(100, (system.gpu.vramGb / 16) * 100) : 18} />
      </section>

      <section className="service-card" aria-label="Ollama service">
        <img className="status-art service-bot" src={statusOllamaService} alt="" draggable={false} />
        <div>
          <span>Ollama Service</span>
          <strong className={ollama.ready ? 'status-good' : 'status-bad'}>
            {ollama.ready ? 'Running' : 'Not Found'}
          </strong>
        </div>
      </section>

      <section className="scan-card" aria-label="Scan status">
        <img
          className={`status-art ${isScanning ? 'radar-spin' : ''}`}
          src={statusLocalScan}
          alt=""
          draggable={false}
        />
        <div>
          <span>Scan Status</span>
          <strong>{hostCountLabel}</strong>
          <button type="button" className="primary-button compact" onClick={onScan}>
            <ScanLine aria-hidden="true" />
            Check Local
          </button>
        </div>
      </section>
    </header>
  );
}

function SideMenu({
  items,
  activeId,
  ollamaReady,
  modelCount,
  shortlistCount,
  scoredCount,
  isRunning,
  topPick,
  onSelect,
}: {
  items: NavItem[];
  activeId: NavId;
  ollamaReady: boolean;
  modelCount: number;
  shortlistCount: number;
  scoredCount: number;
  isRunning: boolean;
  topPick: RigPick | null;
  onSelect: (id: NavId) => void;
}) {
  const navMeta: Record<NavId, string> = {
    lan: ollamaReady ? 'Ready' : 'Setup',
    models: `${modelCount}`,
    speedDate: `${shortlistCount}/5`,
    bench: isRunning ? 'Live' : '1 model',
    agent: scoredCount > 0 ? 'Ready' : 'Wait',
    history: scoredCount > 0 ? `${scoredCount}` : 'New',
    settings: 'Prefs',
    about: 'Info',
  };

  return (
    <aside className="side-menu" aria-label="RigMatch.AI menu">
      <div className="side-menu-title">
        <span>Matchmaker Menu</span>
        <strong>Choose a round</strong>
      </div>
      <nav className="side-menu-nav" aria-label="Primary navigation">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? 'side-menu-item active' : 'side-menu-item'}
              onClick={() => onSelect(item.id)}
              aria-pressed={item.id === activeId}
              aria-label={item.label}
              title={`${item.label}: ${item.description}`}
            >
              <b>{index + 1}</b>
              <Icon aria-hidden="true" />
              <span className="side-menu-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <em>{navMeta[item.id]}</em>
            </button>
          );
        })}
      </nav>
      {topPick && (
        <button type="button" className="side-menu-winner" onClick={() => onSelect('agent')}>
          <Trophy aria-hidden="true" />
          <span>Bachelor Number 1</span>
          <strong>{topPick.profile.agentName}</strong>
          <em>{topPick.score ? `${topPick.score.total} Match · ${topPick.score.grade}` : topPick.fitLabel}</em>
        </button>
      )}
      <button
        type="button"
        className={activeId === 'speedDate' ? 'side-menu-summary active' : 'side-menu-summary'}
        onClick={() => onSelect('speedDate')}
        aria-label={`Open Speed Dating. Tonight's lineup has ${shortlistCount} of 5 picked and ${
          scoredCount > 0 ? `${scoredCount} scored` : 'no scored models yet'
        }.`}
        title="Open Speed Dating lineup"
      >
        <span>Tonight's lineup</span>
        <strong>{shortlistCount}/5 picked</strong>
        <em>{scoredCount > 0 ? `${scoredCount} scored` : 'Run a test to crown a match'}</em>
      </button>
    </aside>
  );
}


function FirstRunTutorial({
  stepIndex,
  selectedModel,
  hostCount,
  modelCount,
  shortlistCount,
  scoredCount,
  canBenchmark,
  ollamaReady,
  isScanning,
  isBenchmarking,
  onStepChange,
  onClose,
  onSelectNav,
  onCheckComputer,
  onRunTest,
  onOpenCompare,
  onOpenSetupGuide,
}: {
  stepIndex: number;
  selectedModel: string;
  hostCount: number;
  modelCount: number;
  shortlistCount: number;
  scoredCount: number;
  canBenchmark: boolean;
  ollamaReady: boolean;
  isScanning: boolean;
  isBenchmarking: boolean;
  onStepChange: (stepIndex: number) => void;
  onClose: () => void;
  onSelectNav: (id: NavId) => void;
  onCheckComputer: () => void;
  onRunTest: () => void;
  onOpenCompare: () => void;
  onOpenSetupGuide: () => void;
}) {
  const steps = [
    {
      round: 'Welcome',
      title: 'Welcome to RigMatch',
      body: 'This tour helps you find one local AI model that works well on this computer. The app should be helpful first, easy second, and fun third.',
      prize: 'Goal: get one local AI model working on this computer.',
      navId: 'lan' as NavId,
      primaryLabel: 'Start Round 1',
    },
    {
      round: 'Round 1',
      title: 'Check this computer',
      body: ollamaReady
        ? `${hostCount || 1} computer${hostCount === 1 ? '' : 's'} checked. Ollama is ready, so the show can go on.`
        : 'RigMatch needs Ollama running before it can test local AI models. If Ollama is missing, open the setup guide first.',
      prize: ollamaReady ? 'Prize: your computer is eligible.' : 'Prize: get Ollama ready.',
      navId: 'lan' as NavId,
      primaryLabel: ollamaReady ? (isScanning ? 'Checking' : 'Check Again') : 'Open Setup Guide',
    },
    {
      round: 'Round 2',
      title: 'Pick the contestants',
      body: `${modelCount} model${modelCount === 1 ? '' : 's'} are in the dating pool. Pick installed models for Speed Dating, or download one if the pool is empty.`,
      prize: `${shortlistCount}/5 models picked for comparison.`,
      navId: 'models' as NavId,
      primaryLabel: 'Show Models',
    },
    {
      round: 'Round 3',
      title: 'Run one model test',
      body: canBenchmark
        ? `${selectedModel} is ready. A test checks speed, reliability, and whether this computer can comfortably run it.`
        : 'Choose an installed model first. Once one is selected, the Start button in Test Model becomes the big green moment.',
      prize: scoredCount > 0 ? `${scoredCount} model${scoredCount === 1 ? '' : 's'} tested so far.` : 'Prize: get your first match score.',
      navId: 'bench' as NavId,
      primaryLabel: canBenchmark ? (isBenchmarking ? 'Testing' : 'Run Test') : 'Pick a Model',
    },
    {
      round: 'Bonus Round',
      title: 'Compare a few models',
      body: 'Speed Dating compares up to five picked models using the same questions. This is the fastest way to find a winner without reading every spec.',
      prize: shortlistCount >= 2 ? 'Ready to compare.' : 'Pick at least two installed models first.',
      navId: 'speedDate' as NavId,
      primaryLabel: 'Open Speed Dating',
    },
    {
      round: 'Finale',
      title: 'Crown the best match',
      body: scoredCount > 0
        ? 'The Best Match panel explains the result in plain language, then lets you chat with the selected local model.'
        : 'Once a test finishes, come here for the recommendation. No confetti cannon yet, but emotionally, yes.',
      prize: scoredCount > 0 ? 'Prize: a model worth chatting with.' : 'Prize: almost there.',
      navId: 'agent' as NavId,
      primaryLabel: scoredCount > 0 ? 'Show Best Match' : 'Go to Test Model',
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

  const runPrimaryAction = () => {
    onSelectNav(step.navId);

    if (currentIndex === 0) {
      goToStep(1);
      return;
    }

    if (currentIndex === 1) {
      if (ollamaReady) {
        onCheckComputer();
      } else {
        onOpenSetupGuide();
      }
      return;
    }

    if (currentIndex === 2) {
      onSelectNav('models');
      return;
    }

    if (currentIndex === 3) {
      if (canBenchmark) {
        onRunTest();
      } else {
        onSelectNav('models');
      }
      return;
    }

    if (currentIndex === 4) {
      onOpenCompare();
      return;
    }

    if (currentIndex === 5) {
      onSelectNav(scoredCount > 0 ? 'agent' : 'bench');
      onClose();
    }
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
            Skip
          </button>
        </div>

        <div
          className="tutorial-romance-hero"
          style={{ backgroundImage: `url(${robotRomanceHero})` }}
          aria-label="A retro robot dating-show illustration with a local computer meeting an AI model."
        >
          <div className="tutorial-romance-copy">
            <span>RigMatch personals</span>
            <strong>Local computer seeks emotionally available AI model</strong>
            <em>Must enjoy short tests, clear prompts, and healthy VRAM boundaries.</em>
          </div>
        </div>

        <div className="tutorial-body">
          <p>{step.body}</p>
          <div className="tutorial-prize">
            <span>Show Host Note</span>
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
          <button type="button" className="primary-button compact" onClick={runPrimaryAction} disabled={isScanning || isBenchmarking}>
            <Trophy aria-hidden="true" />
            {step.primaryLabel}
          </button>
          {isLastStep ? (
            <button type="button" className="mini-button outline" onClick={onClose}>
              Finish
            </button>
          ) : (
            <button type="button" className="mini-button outline" onClick={() => goToStep(currentIndex + 1)}>
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function LanBrowser({
  active,
  system,
  ollama,
  hosts,
  modelCount,
  selectedHostId,
  isScanning,
  onScan,
  onSelect,
  onInstallOllama,
  onScanRig,
  onOpenSetupGuide,
}: {
  active: boolean;
  system: SystemProfile;
  ollama: OllamaStatus;
  hosts: NetworkHost[];
  modelCount: number;
  selectedHostId: string;
  isScanning: boolean;
  onScan: () => void;
  onSelect: (id: string) => void;
  onInstallOllama: () => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const hostMeta = ollama.ready ? 'Local Ollama ready' : 'Local Ollama offline';
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
      detail: ollama.models.length > 0 ? `${modelCount} model${modelCount === 1 ? '' : 's'} in the dating pool.` : 'Download one model before the first compatibility date.',
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
          <strong>{ollama.ready ? 'Ready for a compatibility date' : 'One setup step before the show starts'}</strong>
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
  onScanRig,
  onOpenSetupGuide,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  onInstallOllama: () => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const platformName = getPlatformName(system.platform);
  const ready = ollama.ready;
  const prepTitle = isDesktopRuntime
    ? ready ? `${platformName} ready` : `${platformName} needs Ollama`
    : 'Preview sample data';
  const prepMessage = isDesktopRuntime
    ? ready
      ? 'This computer is ready. RigMatch v1 tests local Ollama models on this machine.'
      : 'Install or start Ollama here, then check this computer again.'
    : 'Preview sample data is local-only. The desktop app checks the real Ollama install on this computer.';

  return (
    <div className={`ollama-prep ${ready && isDesktopRuntime ? 'ready' : 'needs-setup'}`}>
      <div className="prep-badge" aria-hidden="true">
        <ShieldCheck />
      </div>
      <div className="prep-copy">
        <span>Local AI Setup</span>
        <strong>{prepTitle}</strong>
        <em>{prepMessage}</em>
      </div>
      <div className="prep-actions">
        <button type="button" className="mini-button" onClick={onInstallOllama}>
          <Download aria-hidden="true" />
          Ollama
        </button>
        <button type="button" className="mini-button outline" onClick={onScanRig}>
          <RefreshCw aria-hidden="true" />
          Check Again
        </button>
        <button type="button" className="mini-button outline" onClick={onOpenSetupGuide}>
          <ExternalLink aria-hidden="true" />
          Setup
        </button>
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
            <p>Open Ollama, install it, then use Check Again. RigMatch.AI looks for the local API on port 11434.</p>
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
  questionCount,
  system,
  onCancel,
  onConfirm,
}: {
  mode: PendingRunMode;
  selectedModel: string;
  shortlistedCount: number;
  questionCount: number;
  system: SystemProfile;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = mode === 'single' ? 'Start Model Test?' : 'Start Speed Dating?';
  const subject = mode === 'single' ? selectedModel : `${shortlistedCount} picked models`;
  const totalQuestions = mode === 'single' ? questionCount : questionCount * shortlistedCount;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal" role="dialog" aria-modal="true" aria-labelledby="run-warning-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>Resource Warning</span>
            <strong id="run-warning-title">{title}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            RigMatch.AI will test <strong>{subject}</strong> with <strong>{totalQuestions}</strong> total question
            {totalQuestions === 1 ? '' : 's'}. This can heavily use CPU, GPU, VRAM, RAM,
            storage bandwidth, fans, and battery until the run finishes.
          </p>
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
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="primary-button compact" onClick={onConfirm}>
            <Zap aria-hidden="true" />
            {mode === 'single' ? 'Start Test' : 'Start Speed Dating'}
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteModelModal({
  row,
  host,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  row: ModelRow;
  host?: NetworkHost;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const modelName = row.installedModel?.model ?? row.displayName;
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'size unknown';
  const hostName = host?.hostname ?? 'selected computer';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="delete-model-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Delete Model</span>
            <strong id="delete-model-title">{modelName}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            This removes <strong>{modelName}</strong> from Ollama on <strong>{hostName}</strong>. It can free about
            <strong> {sizeLabel}</strong>, but the model must be downloaded again before RigMatch can test or chat with it.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Target Computer</span>
              <strong>{hostName}</strong>
              <em>{host?.baseUrl ?? 'Local Ollama API'}</em>
            </div>
            <div>
              <span>Model Size</span>
              <strong>{sizeLabel}</strong>
              <em>Disk space returns after Ollama removes the model files.</em>
            </div>
            <div>
              <span>Scores</span>
              <strong>Also removed</strong>
              <em>Saved match scores for this model are cleared from this session.</em>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel} disabled={isDeleting}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="danger-button compact" onClick={onConfirm} disabled={isDeleting}>
            <Trash2 aria-hidden="true" />
            {isDeleting ? 'Deleting' : 'Delete Model'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ClearDataModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="clear-data-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Clear Data</span>
            <strong id="clear-data-title">Reset RigMatch Data?</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            This clears local RigMatch data: logs, scores, Speed Dating results, chat, queued downloads, saved theme,
            and custom benchmark questions. It does <strong>not</strong> delete Ollama models.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Clears</span>
              <strong>App history</strong>
              <em>Scores, logs, comparison rankings, and chat reset immediately.</em>
            </div>
            <div>
              <span>Restores</span>
              <strong>Defaults</strong>
              <em>Question suite, theme, model shortlist, and run state return to first-run defaults.</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Ollama models</strong>
              <em>Use the trash button in Dating Pool to delete downloaded model files.</em>
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
            Clear All Data
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
                and date transcripts.
              </>
            ) : (
              <>
                This clears the saved scorecard and date transcript for <strong>{pending.model}</strong>.
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

function ChoiceCruiseModal({
  model,
  host,
  onClose,
}: {
  model: string;
  host?: NetworkHost;
  onClose: () => void;
}) {
  const hostName = host?.hostname ?? 'This computer';
  const shortModelName = getShortModelName(model);

  return (
    <div className="modal-backdrop cruise-backdrop" role="presentation">
      <section className="choice-cruise-modal" role="dialog" aria-modal="true" aria-labelledby="choice-cruise-title">
        <div className="cruise-title">
          <div>
            <span>It's a match</span>
            <strong id="choice-cruise-title">{model}</strong>
            <em>{hostName} picked this model. No settings changed.</em>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="cruise-scene" aria-hidden="true">
          <span className="cruise-sun" />
          <span className="cruise-heart heart-one">
            <Heart aria-hidden="true" />
          </span>
          <span className="cruise-heart heart-two">
            <Heart aria-hidden="true" />
          </span>
          <div className="cruise-boat">
            <div className="cruise-passengers">
              <MachineAvatar host={host} size="small" />
              <AvatarBust model={model} size="small" />
            </div>
            <span className="boat-cabin" />
            <span className="boat-sail" />
            <span className="boat-hull" />
          </div>
          <span className="cruise-wave wave-one" />
          <span className="cruise-wave wave-two" />
        </div>

        <div className="cruise-caption">
          <span>Romantic cruise launched</span>
          <strong>{hostName} + {shortModelName}</strong>
          <em>This is just the victory animation. Your installed models and Ollama settings are unchanged.</em>
        </div>
      </section>
    </div>
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
    { id: 'beginner', label: 'Beginner', description: 'Guided steps, simpler wording, fewer diagnostics.' },
    { id: 'advanced', label: 'Advanced', description: 'Setup commands, ports, logs, and deeper details.' },
  ];

  return (
    <section className="ui-mode-picker" aria-label="Interface mode">
      <div>
        <span>Interface Mode</span>
        <strong>{uiMode === 'beginner' ? 'Beginner-friendly' : 'Advanced diagnostics'}</strong>
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

function RemoteRunnerRoadmap() {
  return (
    <section className="runner-roadmap" aria-label="Remote runner roadmap">
      <span>Phase 2</span>
      <strong>Remote runners are intentionally paused</strong>
      <p>v1 stays local-only. A future runner can pair trusted machines without scanning random devices or asking users to expose Ollama.</p>
      <ol>
        <li>Install runner on the other computer.</li>
        <li>Pair it with a local trust code.</li>
        <li>Test only approved Ollama hosts.</li>
      </ol>
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

function UtilityPanel({
  panel,
  benchmark,
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
}: {
  panel: UtilityPanelId;
  benchmark: BenchmarkResult;
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
}) {
  const Icon = panel === 'history' ? History : panel === 'settings' ? Settings : Info;
  const recentModelScores = useMemo(() => getRecentModelScores(modelScores), [modelScores]);
  const savedChatMessageCount = Math.max(0, chatMessages.length - 1);

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

      {panel === 'history' && (
        <RomanceArtBanner
          image={robotScorecardCeremony}
          className="scorecard-art-banner"
          kicker="Scorecard ceremony"
          title="Past dates, saved scores, crowned matches"
          body={recentModelScores.length > 0 ? `${recentModelScores.length} model score${recentModelScores.length === 1 ? '' : 's'} saved locally.` : 'Run a model test or Speed Dating to start the ceremony.'}
        />
      )}

      {panel === 'history' && (
        <div className="utility-body">
          <div className="utility-stat">
            <span>Saved app history</span>
            <strong>{recentModelScores.length} model score{recentModelScores.length === 1 ? '' : 's'}</strong>
            <em>
              {savedChatMessageCount > 0
                ? `${savedChatMessageCount} chat message${savedChatMessageCount === 1 ? '' : 's'} saved locally`
                : 'Chat starts saving locally after your first message'}
            </em>
          </div>
          <div className="utility-stat">
            <span>Last compatibility test</span>
            <strong>{recentModelScores.length > 0 ? benchmark.model : 'No saved score'}</strong>
            <em>{recentModelScores.length > 0 ? `${benchmark.scores.total} total · ${benchmark.scores.grade}` : 'Run a date to save the next scorecard.'}</em>
          </div>
          <section className="score-cleanup-panel" aria-label="Score cleanup">
            <div>
              <span>Score Cleanup</span>
              <strong>Forget stale match history</strong>
              <em>Clears scorecards and transcripts only. Installed Ollama models stay put.</em>
            </div>
            <button type="button" className="danger-button compact" onClick={onClearAllScores} disabled={!recentModelScores.length}>
              <Trash2 aria-hidden="true" />
              Clear All Scores
            </button>
          </section>
          <HistoryTimeline scores={recentModelScores} onClearScore={onClearScore} />
          {recentModelScores.length > 0 && (
            <ol className="utility-list" aria-label="Saved model scores">
              {recentModelScores.slice(0, 5).map((score, index) => (
                <li key={`${score.model}-${score.completedAt}`}>
                  <b>{index + 1}</b>
                  <span>{score.model}</span>
                  <strong>{score.total}</strong>
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
          )}
          <div className="utility-stat">
            <span>Current match</span>
            <strong>{selectedHost?.hostname ?? 'Local machine'}</strong>
            <em>{selectedModel}</em>
          </div>
          {listTestResult ? (
            <ol className="utility-list" aria-label="Latest Speed Dating ranking">
              {listTestResult.results.map((result, index) => (
                <li key={result.model} className={result.model === listTestResult.winner ? 'winner' : ''}>
                  <b>{index + 1}</b>
                  <span>{result.model}</span>
                  <strong>{result.total}</strong>
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
          <UiModePicker uiMode={uiMode} onUiModeChange={onUiModeChange} />
          <ThemePicker themeId={themeId} onThemeChange={onThemeChange} />
          <div className="utility-stat">
            <span>Runtime</span>
            <strong>{isDesktopRuntime ? 'Desktop bridge' : 'Preview mode'}</strong>
            <em>{system.os.distro} · {system.arch}</em>
          </div>
          <div className="utility-stat">
            <span>Platform Target</span>
            <strong>Windows · macOS · Ubuntu/Linux</strong>
            <em>Electron desktop builds should stay local-first and portable across all three operating systems.</em>
          </div>
          <div className="utility-stat">
            <span>Ollama</span>
            <strong>{ollama.ready ? 'Ready' : 'Offline'}</strong>
            <em>{ollama.baseUrl}</em>
          </div>
          <div className="utility-stat">
            <span>CUDA</span>
            <strong>{getCudaSummary(system.cuda)}</strong>
            <em>{getCudaDetail(system.cuda)}</em>
          </div>
          <div className="utility-stat">
            <span>Scope</span>
            <strong>Local computer only</strong>
            <em>Remote systems are planned for RigMatch 2.0.</em>
          </div>
          <RemoteRunnerRoadmap />
          <button type="button" className="primary-button compact" onClick={onOpenSetupGuide}>
            <ExternalLink aria-hidden="true" />
            Setup Guide
          </button>
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
        </div>
      )}

      {panel === 'about' && (
        <div className="utility-body">
          <div className="utility-logo">
            <BrandMark />
            <strong>RigMatch.AI</strong>
            <em>v{APP_VERSION}</em>
          </div>
          <UpdateCenter
            channel={updateChannel}
            result={updateCheck}
            isChecking={isCheckingUpdates}
            onChannelChange={onUpdateChannelChange}
            onCheck={onCheckForUpdates}
            onOpenPage={onOpenUpdatePage}
          />
          <ReleaseNotes />
          <section className="product-principles" aria-label="Product promise">
            <div>
              <span>Product Promise</span>
              <strong>Helpful. Easy. Fun.</strong>
              <em>In that order.</em>
            </div>
            <ol>
              <li>
                <b>1</b>
                <span>Helpful</span>
                <em>Recommend models that make sense for this computer.</em>
              </li>
              <li>
                <b>2</b>
                <span>Easy</span>
                <em>Make the next step obvious and keep advanced choices optional.</em>
              </li>
              <li>
                <b>3</b>
                <span>Fun</span>
                <em>Use the matchmaking theme to make testing less boring.</em>
              </li>
            </ol>
          </section>
          <div className="utility-stat">
            <span>Mode</span>
            <strong>Donationware</strong>
            <em>Local-first matchmaking lab for Ollama machines.</em>
            <a
              className="donation-link"
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noreferrer"
            >
              <Coffee aria-hidden="true" />
              Buy Me a Coffee
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
          <div className="utility-stat">
            <span>Current target</span>
            <strong>{selectedHost?.hostname ?? 'Local machine'}</strong>
            <em>{selectedModel}</em>
          </div>
        </div>
      )}
    </section>
  );
}

function UpdateCenter({
  channel,
  result,
  isChecking,
  onChannelChange,
  onCheck,
  onOpenPage,
}: {
  channel: UpdateChannel;
  result: UpdateCheckResponse | null;
  isChecking: boolean;
  onChannelChange: (channel: UpdateChannel) => void;
  onCheck: () => void;
  onOpenPage: () => void;
}) {
  const status = result?.status ?? 'unknown';
  const statusLabel = getUpdateStatusLabel(result, isChecking);
  const channelLabel = getUpdateChannelLabel(channel);

  return (
    <section className={`update-center ${status}`} aria-label="RigMatch update center">
      <div className="update-center-head">
        <div>
          <span>Upgrade Center</span>
          <strong>{statusLabel}</strong>
          <em>Choose stable releases or nightly builds, then check what RigMatch can download.</em>
        </div>
        <div className="update-actions">
          <button type="button" className="mini-button outline" onClick={onCheck} disabled={isChecking}>
            <RefreshCw className={isChecking ? 'spin' : ''} aria-hidden="true" />
            {isChecking ? 'Checking' : 'Check'}
          </button>
          <button type="button" className="primary-button compact" onClick={onOpenPage}>
            <Download aria-hidden="true" />
            Downloads
          </button>
        </div>
      </div>

      <div className="update-channel-toggle" aria-label="Update channel">
        <button
          type="button"
          className={channel === 'release' ? 'active' : ''}
          onClick={() => onChannelChange('release')}
          aria-pressed={channel === 'release'}
        >
          <strong>Release</strong>
          <span>Stable date</span>
          <em>Best for normal users.</em>
        </button>
        <button
          type="button"
          className={channel === 'nightly' ? 'active' : ''}
          onClick={() => onChannelChange('nightly')}
          aria-pressed={channel === 'nightly'}
        >
          <strong>Nightly</strong>
          <span>Wild card date</span>
          <em>Newest experiments, more risk.</em>
        </button>
      </div>

      <div className="update-result">
        <span>{channelLabel} channel</span>
        <strong>{result?.latestName ?? 'No check yet'}</strong>
        <em>{getUpdateResultDetail(result, channel)}</em>
        {result?.releaseNotes && <p>{result.releaseNotes}</p>}
        {result?.error && <p className="update-error">{result.error}</p>}
      </div>
    </section>
  );
}

function ReleaseNotes() {
  return (
    <section className="release-notes" aria-label="Release notes">
      <div className="release-notes-head">
        <span>Release Notes</span>
        <strong>What changed in this build</strong>
      </div>
      <ol>
        {releaseNotes.map((release) => (
          <li key={release.version}>
            <div>
              <span>v{release.version}</span>
              <strong>{release.label}</strong>
              <em>{release.date}</em>
            </div>
            <ul>
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
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
        <span>Run a compatibility date and RigMatch will keep the local score story here.</span>
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

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <img src={rigmatchBrandIcon} alt="" draggable={false} />
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
  modelScores,
  diskGuard,
  vramGb,
  queuedCount,
  isBenchmarking,
  isPulling,
  isDeletingModel,
  pullingModel,
  shortlistedCount,
  onSelect,
  onScoreModel,
  onDeleteModel,
  onQueueModel,
  onPullQueued,
  onToggleShortlist,
  onOpenSpeedDate,
  onOpenTopPick,
  onRefresh,
}: {
  active: boolean;
  rows: ModelRow[];
  selectedModel: string;
  installedModelNames: Set<string>;
  shortlistIds: Set<string>;
  queuedModelIds: Set<string>;
  modelScores: Record<string, TestedModelScore>;
  diskGuard: ReturnType<typeof getDiskGuard>;
  vramGb: number;
  queuedCount: number;
  isBenchmarking: boolean;
  isPulling: boolean;
  isDeletingModel: boolean;
  pullingModel: string | null;
  shortlistedCount: number;
  onSelect: (model: string) => void;
  onScoreModel: (row: ModelRow) => void;
  onDeleteModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onPullQueued: () => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSpeedDate: () => void;
  onOpenTopPick: () => void;
  onRefresh: () => void;
}) {
  const [modelQuery, setModelQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<ModelQuickFilterId>('fits-vram');
  const [sortKey, setSortKey] = useState<ModelSortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const selectedRow = rows.find((row) => row.displayName === selectedModel || row.id === selectedModel);
  const selectedProfile = getModelProfile(selectedRow?.displayName ?? selectedModel);
  const selectedScore = selectedRow ? getModelScore(selectedRow, modelScores) : modelScores[selectedModel];
  const selectedQueued = selectedRow ? queuedModelIds.has(selectedRow.displayName) : false;
  const selectedShortlisted = selectedRow ? shortlistIds.has(selectedRow.displayName) : false;
  const selectedInstalled = selectedRow ? installedModelNames.has(selectedRow.displayName) || selectedRow.installed : false;
  const query = modelQuery.trim().toLowerCase();
  const quickFilters = useMemo(
    () => getModelQuickFilters(rows, modelScores, vramGb),
    [modelScores, rows, vramGb],
  );
  const vramSafeCount = quickFilters.find((filter) => filter.id === 'fits-vram')?.count ?? 0;
  const rigPick = useMemo(
    () => getRigPick(rows, modelScores, vramGb),
    [modelScores, rows, vramGb],
  );
  const shortlistedRows = useMemo(
    () => rows.filter((row) => shortlistIds.has(row.displayName)).slice(0, 5),
    [rows, shortlistIds],
  );
  const visibleRows = useMemo(() => {
    const filteredRows = rows.filter((row) => {
      const score = getModelScore(row, modelScores);
      const queued = queuedModelIds.has(row.displayName);
      const matchesQuery = !query || getModelSearchText(row, queued, score).includes(query);
      return matchesQuery && modelMatchesQuickFilter(row, quickFilter, score, vramGb);
    });

    return sortModelRows(filteredRows, sortKey, sortDirection, queuedModelIds, modelScores);
  }, [modelScores, query, quickFilter, queuedModelIds, rows, sortDirection, sortKey, vramGb]);
  const modelCountLabel = query || quickFilter !== 'all' ? `${visibleRows.length}/${rows.length} models` : `${rows.length} models`;
  const vramLabel = vramGb > 0 ? `${formatGb(vramGb)} VRAM` : 'detected VRAM';

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
      <PanelHeader
        icon={Boxes}
        title="Contestant Pool"
        actionLabel="Refresh"
        onAction={onRefresh}
        meta={modelCountLabel}
      />
      <RomanceArtBanner
        image={robotContestantWall}
        className="model-pool-art-banner"
        kicker="Model personals"
        title="Browse AI contestants for this rig"
        body={`${vramSafeCount} models look like realistic dates for ${vramLabel}. Pick up to five for Speed Dating.`}
      />
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
        <span className="model-sort-status">
          Sort: {getModelSortLabel(sortKey)} / {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </span>
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
        {quickFilter === 'fits-vram' && (
          <div className="model-filter-note">
            <ShieldCheck aria-hidden="true" />
            <span>Showing {vramSafeCount} rig picks for {vramLabel}, including close fits. Out-of-league models stay offstage unless you show all.</span>
            <button type="button" onClick={() => setQuickFilter('all')}>Show all</button>
          </div>
        )}
      </div>
      <div className="contestant-focus-row">
        <SelectedContestantCard
          row={selectedRow}
          profile={selectedProfile}
          score={selectedScore}
          vramGb={vramGb}
          installed={selectedInstalled}
          queued={selectedQueued}
          shortlisted={selectedShortlisted}
          isBenchmarking={isBenchmarking}
          onScoreModel={onScoreModel}
          onQueueModel={onQueueModel}
          onToggleShortlist={onToggleShortlist}
          onOpenSpeedDate={onOpenSpeedDate}
        />
        {rigPick && (
          <CurrentWinnerCard
            pick={rigPick}
            onSelect={onSelect}
            onOpenTopPick={onOpenTopPick}
          />
        )}
      </div>
      <div className="table-wrap model-table">
        <table>
          <thead>
            <tr>
              <SortableModelHeader label="Model" sortName="name" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Brains" sortName="params" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Size" sortName="size" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Good For" sortName="skill" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Origin" sortName="origin" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="From" sortName="source" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Status" sortName="status" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Match" sortName="score" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedModel === row.displayName || selectedModel === row.id;
              const installed = installedModelNames.has(row.displayName) || row.installed;
              const queued = queuedModelIds.has(row.displayName);
              const shortlisted = shortlistIds.has(row.displayName);
              const profile = getModelProfile(row.displayName);
              const origin = getModelOrigin(row.displayName);
              const sizeRisk = getSizeRisk(row.sizeGb);
              const statusLabel = getModelStatusLabel(row, queued);
              const score = getModelScore(row, modelScores);
              const hardwareFit = getHardwareFit(row, vramGb);
              const rowClassName = [
                selected ? 'selected' : '',
                hardwareFit.tone === 'out-of-league' ? 'out-of-league' : '',
              ].filter(Boolean).join(' ');
              return (
                <tr key={row.id} className={rowClassName}>
                  <td>
                    <button type="button" className="model-name-button" onClick={() => onSelect(row.displayName)}>
                      <AvatarBust model={row.displayName} size="tiny" />
                      <span>{row.displayName}</span>
                    </button>
                  </td>
                  <td>{row.params}</td>
                  <td title={`${sizeRisk.message} ${hardwareFit.detail}`}>
                    <div className="size-fit-cell">
                      <span className={`size-pill ${sizeRisk.tone}`}>
                        {row.sizeGb ? `${row.sizeGb} GB` : '?'}
                      </span>
                      <span className={`fit-pill ${hardwareFit.tone}`}>{hardwareFit.label}</span>
                    </div>
                  </td>
                  <td title={profile.specialties.join(', ')}>{profile.specialties[0]}</td>
                  <td title={`${origin.organization} · ${origin.country}`}>
                    <span className={`origin-pill origin-${origin.family}`}>{origin.country}</span>
                  </td>
                  <td>{row.source}</td>
                  <td>
                    <ModelStatusPill installed={installed} queued={queued} label={statusLabel} />
                  </td>
                  <td>
                    <ModelScorePill score={score} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className={shortlisted ? 'slot-button active' : 'slot-button'}
                        onClick={() => onToggleShortlist(row)}
                        disabled={!installed || !hardwareFit.recommend}
                        title={!installed ? 'Download before comparing' : hardwareFit.recommend ? 'Pick for Speed Dating' : hardwareFit.detail}
                        aria-label={`${shortlisted ? 'Remove' : 'Add'} ${row.displayName} from Speed Dating`}
                      >
                        {hardwareFit.recommend ? shortlisted ? 'Picked' : 'Date' : 'Too Big'}
                      </button>
                      {installed ? (
                        <>
                          <button
                            type="button"
                            className="mini-button score-row-button"
                            onClick={() => onScoreModel(row)}
                            disabled={isBenchmarking || !hardwareFit.recommend}
                            title={hardwareFit.recommend ? `Test ${row.displayName} on this computer` : hardwareFit.detail}
                          >
                            <Gauge aria-hidden="true" />
                            Test
                          </button>
                          <button
                            type="button"
                            className="icon-action delete-model-button"
                            onClick={() => onDeleteModel(row)}
                            disabled={isBenchmarking || isDeletingModel}
                            title={`Delete ${row.displayName} from Ollama`}
                            aria-label={`Delete ${row.displayName} from Ollama`}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={queued ? 'mini-button queued' : 'mini-button outline'}
                          onClick={() => onQueueModel(row)}
                          disabled={!queued && !hardwareFit.recommend}
                          title={hardwareFit.recommend ? `${queued ? 'Remove from queue' : 'Queue download'}: ${row.sizeGb ? formatGb(row.sizeGb) : 'unknown size'}` : hardwareFit.detail}
                        >
                          {hardwareFit.recommend ? queued ? 'Drop' : `Get ${row.sizeGb ? `${row.sizeGb}G` : '?'}` : 'Too Big'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={9}>
                  <div className="table-empty-state">
                    <strong>No contestants match these filters</strong>
                    <span>Clear the search or show the full dating pool.</span>
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
        <ModelPoolLineupStrip
          rows={shortlistedRows}
          modelScores={modelScores}
          disabled={isBenchmarking}
          onRemove={onToggleShortlist}
          onOpenSpeedDate={onOpenSpeedDate}
        />
        <div className="selected-specialties">
          <AvatarBust model={selectedRow?.displayName ?? selectedModel} size="small" />
          <div>
            <strong>{selectedProfile.archetype}</strong>
            <span>{selectedProfile.specialties.join(' · ')}</span>
          </div>
          <ModelProfileMini
            row={selectedRow}
            profile={selectedProfile}
            score={selectedScore}
            vramGb={vramGb}
          />
          <button
            type="button"
            className="mini-button outline speed-date-launch"
            onClick={onOpenSpeedDate}
            title="Compare up to 5 models and rank the best match."
          >
            <Trophy aria-hidden="true" />
            Speed Dating
            <em>{shortlistedCount}/5 picked</em>
          </button>
        </div>
        <DiskGuard guard={diskGuard} />
        <div className="pull-queue">
          <span>Download Queue</span>
          <strong>{isPulling ? 'Downloading' : `${queuedCount} queued`}</strong>
          <em>{isPulling ? pullingModel ?? 'Working...' : 'Download queued models into Ollama.'}</em>
          <button
            type="button"
            className="primary-button compact"
            onClick={onPullQueued}
            disabled={queuedCount === 0 || isPulling}
          >
            <Download aria-hidden="true" />
            {isPulling ? 'Downloading' : 'Download'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ModelPoolLineupStrip({
  rows,
  modelScores,
  disabled,
  onRemove,
  onOpenSpeedDate,
}: {
  rows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  disabled: boolean;
  onRemove: (row: ModelRow) => void;
  onOpenSpeedDate: () => void;
}) {
  const slots = Array.from({ length: 5 }, (_item, index) => rows[index]);
  const full = rows.length >= 5;

  return (
    <section className={full ? 'model-pool-lineup full' : 'model-pool-lineup'} aria-label="Speed Dating lineup">
      <div className="model-pool-lineup-head">
        <div>
          <span>Speed Dating Lineup</span>
          <strong>{rows.length}/5 picked</strong>
          <em>{full ? 'Lineup full. Remove one here before adding another.' : 'Use Date in the table to add contestants.'}</em>
        </div>
        <button type="button" className="mini-button outline" onClick={onOpenSpeedDate}>
          <Trophy aria-hidden="true" />
          Open
        </button>
      </div>
      <div className="model-pool-lineup-slots">
        {slots.map((row, index) => {
          if (!row) {
            return (
              <span key={`empty-${index}`} className="model-pool-empty-slot">
                <b>{index + 1}</b>
                <strong>Open seat</strong>
                <em>Pick Date</em>
              </span>
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

function RomanceArtBanner({
  image,
  className = '',
  kicker,
  title,
  body,
}: {
  image: string;
  className?: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <section
      className={`romance-art-banner ${className}`}
      style={{ backgroundImage: `url(${image})` }}
      aria-label={title}
    >
      <div>
        <span>{kicker}</span>
        <strong>{title}</strong>
        <em>{body}</em>
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
  isBenchmarking,
  onScoreModel,
  onQueueModel,
  onToggleShortlist,
  onOpenSpeedDate,
}: {
  row?: ModelRow;
  profile: ModelProfile;
  score?: TestedModelScore;
  vramGb: number;
  installed: boolean;
  queued: boolean;
  shortlisted: boolean;
  isBenchmarking: boolean;
  onScoreModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSpeedDate: () => void;
}) {
  if (!row) {
    return (
      <section className="contestant-spotlight empty" aria-label="Selected contestant">
        <div>
          <span>Selected Contestant</span>
          <strong>No model selected</strong>
          <em>Pick a model from the table to inspect its profile, fit, and next action.</em>
        </div>
      </section>
    );
  }

  const hardwareFit = getHardwareFit(row, vramGb);
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'Size unknown';
  const matchLabel = score ? `${score.total} Match · ${score.grade}` : 'No score yet';
  const statusLabel = installed
    ? 'Installed locally'
    : queued
      ? 'In download queue'
      : row.live
        ? 'Available to download'
        : 'Catalog pick';
  const vramLabel = vramGb > 0 ? `${formatGb(vramGb)} VRAM` : 'detected VRAM';
  const canJoinSpeedDate = installed && hardwareFit.recommend;
  const origin = getModelOrigin(row.displayName);

  return (
    <section className="contestant-spotlight" aria-label={`Selected contestant is ${row.displayName}`}>
      <AvatarBust model={row.displayName} size="small" />
      <div className="contestant-spotlight-copy">
        <span>Selected Contestant</span>
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
        <div title={origin.organization}>
          <span>Origin</span>
          <strong>{origin.country}</strong>
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
      <div className="contestant-spotlight-actions">
        <span>{hardwareFit.detail} This rig has {vramLabel}.</span>
        <div>
          {installed ? (
            <button
              type="button"
              className="primary-button compact"
              onClick={() => onScoreModel(row)}
              disabled={isBenchmarking || !hardwareFit.recommend}
            >
              <Gauge aria-hidden="true" />
              Run Date
            </button>
          ) : (
            <button
              type="button"
              className={queued ? 'primary-button compact queued' : 'primary-button compact'}
              onClick={() => onQueueModel(row)}
              disabled={!queued && !hardwareFit.recommend}
            >
              <Download aria-hidden="true" />
              {queued ? 'Queued' : 'Get Model'}
            </button>
          )}
          <button
            type="button"
            className={shortlisted ? 'mini-button contestant-date-button active' : 'mini-button contestant-date-button'}
            onClick={() => onToggleShortlist(row)}
            disabled={isBenchmarking || (!shortlisted && !canJoinSpeedDate)}
          >
            <Heart aria-hidden="true" />
            {shortlisted ? 'Picked' : 'Pick for Speed Dating'}
          </button>
          <button type="button" className="mini-button outline" onClick={onOpenSpeedDate}>
            <Trophy aria-hidden="true" />
            Lineup
          </button>
        </div>
      </div>
    </section>
  );
}

function CurrentWinnerCard({
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
    <aside className="current-winner-card" aria-label={`Current winner is ${row.displayName}`}>
      <div className="current-winner-badge">
        <Trophy aria-hidden="true" />
        <span>Bachelor Number 1</span>
      </div>
      <div>
        <span>Current winner is</span>
        <strong>{row.displayName}</strong>
        <em>{score ? `${score.total} Match · ${score.grade}` : pick.fitLabel}</em>
      </div>
      <p>{score ? `${row.displayName} has the highest saved score that still fits this computer.` : pick.reason}</p>
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

function ModelProfileMini({
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
}: {
  label: string;
  sortName: ModelSortKey;
  sortKey: ModelSortKey;
  direction: SortDirection;
  onSort: (sortName: ModelSortKey) => void;
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
    </th>
  );
}

function ModelScorePill({ score }: { score?: TestedModelScore }) {
  if (!score) {
    return (
      <span className="score-pill empty" title="Not tested yet. Run a date to score this model on this computer.">
        <strong>--</strong>
        <em>Test</em>
      </span>
    );
  }

  return (
    <span
      className={`score-pill ${getScoreTone(score.total)}`}
      title={`Match ${score.total} · ${score.grade}; speed ${score.speed}, reliability ${score.sobriety}`}
    >
      <strong>{score.total}</strong>
      <em>{score.grade}</em>
    </span>
  );
}

function ModelStatusPill({
  installed,
  queued,
  label,
}: {
  installed: boolean;
  queued: boolean;
  label: string;
}) {
  const Icon = installed ? ShieldCheck : queued ? Download : Download;
  const tone = installed ? 'installed' : queued ? 'queued' : 'available';

  return (
    <span className={`model-status-pill ${tone}`}>
      <Icon aria-hidden="true" />
      {label}
    </span>
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
        title="Test One Model"
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
        <button type="button" className="mini-button outline" onClick={onOpenSuiteEditor}>
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
      >
        <Zap aria-hidden="true" />
        Cancel Run
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
          <button type="button" className="mini-button outline" onClick={onOpenSuiteEditor} disabled={isRunning}>
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
      label: 'Chemistry',
      value: score ? String(score.total) : 'N/A',
      detail: 'Overall match score combining speed, reliability, stability, and hardware fit.',
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
  onRunListTest,
}: {
  active: boolean;
  host?: NetworkHost;
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
  onRunListTest: () => void;
}) {
  const winnerResult = listTestResult?.results.find((result) => result.model === listTestResult.winner);
  const canRunListTest = shortlistedRows.length >= 2 && !isListTesting;
  const selectedSlots = Array.from({ length: 5 }, (_, index) => shortlistedRows[index]);
  const questionLabel = `${questionCount} questions per model`;
  const runReadiness = shortlistedRows.length >= 2
    ? `${shortlistedRows.length} contestants will answer the same ${questionCount} questions.`
    : 'Pick at least two installed contestants before the show starts.';

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
        body={winnerResult ? `${listTestResult?.winner} is leading with ${winnerResult.total} Match.` : 'Run the show to crown Bachelor Number 1 for this computer.'}
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
            <button
              type="button"
              className="mini-button outline"
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
              {isListTesting ? 'Testing' : shortlistedRows.length >= 2 ? 'Start Speed Dating' : 'Pick 2+'}
            </button>
          </div>
        </div>

        <SpeedDateTranscriptPanel
          rows={shortlistedRows}
          benchmarks={benchmarkByModel}
          questionPlan={questionPlan}
          runProgress={runProgress?.mode === 'speed-date' ? runProgress : null}
        />

        <section className="speed-date-lineup-card" aria-label="Selected models for Speed Dating">
          <div className="speed-date-lineup-head">
            <div>
              <span>Tonight's Lineup</span>
              <strong>These are the models RigMatch will test</strong>
              <em>Use Choose Models to add contestants. Use the X on a card to remove one.</em>
            </div>
            <div className="speed-date-lineup-stats" aria-label="Speed Dating setup summary">
              <span>{questionLabel}</span>
              <strong>{shortlistedRows.length * questionCount} total prompts</strong>
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
        </section>

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
                  <em>{result.speed} speed · {result.sobriety} trust</em>
                  <strong>{result.total}</strong>
                </li>
              ))}
            </ol>
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
        <span>{score ? `${score.total} Match · ${score.grade}` : 'Not tested yet'}</span>
        <span>{sizeLabel}</span>
        <span>{hardwareFit.label}</span>
      </div>
      <p>{profile.specialties.join(' · ')}</p>
    </article>
  );
}

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
  const activeModel = rows.some((row) => row.displayName === requestedModel) ? requestedModel : defaultModel;

  const activeRow = rows.find((row) => row.displayName === activeModel) ?? rows[0];
  const benchmark = activeRow ? getBenchmarkForModel(benchmarks, activeRow.displayName, activeRow) : null;
  const isLiveModel = Boolean(activeRow && runProgress?.phase === 'running' && runProgress.currentModel === activeRow.displayName);
  const activePromptIndex = Math.max(0, runProgress?.questionIndex ?? 0);

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
          <span>Date Q&A</span>
          <strong>See what RigMatch asked and how each model answered</strong>
          <em>{benchmark ? `${benchmark.prompts.length} answers saved for ${activeRow.displayName}.` : isLiveModel ? 'This contestant is answering now.' : 'This contestant has not been tested yet.'}</em>
        </div>
        <div className="speed-date-transcript-tabs" role="tablist" aria-label="Contestant transcripts">
          {rows.map((row, index) => {
            const rowBenchmark = getBenchmarkForModel(benchmarks, row.displayName, row);
            const active = row.displayName === activeRow.displayName;
            return (
              <button
                key={row.displayName}
                type="button"
                className={active ? 'active' : ''}
                onClick={() => setRequestedModel(row.displayName)}
                role="tab"
                aria-selected={active}
              >
                <b>{index + 1}</b>
                <span>{getShortModelName(row.displayName)}</span>
                <em>{rowBenchmark ? `${rowBenchmark.scores.total}` : runProgress?.currentModel === row.displayName ? 'Live' : 'No answers'}</em>
              </button>
            );
          })}
        </div>
      </div>

      {benchmark ? (
        <ol className="speed-date-qa-list" aria-label={`${activeRow.displayName} saved answers`}>
          {benchmark.prompts.map((prompt, index) => (
            <li key={`${activeRow.displayName}-${prompt.id}-${index}`}>
              <div className="speed-date-qa-head">
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div>
                  <span>{prompt.label}</span>
                  <strong>{prompt.sobrietyScore} answer quality</strong>
                </div>
                <em>{prompt.tokensPerSecond} tok/s · {formatMs(prompt.elapsedMs)}</em>
              </div>
              <div className="speed-date-qa-block asked">
                <span>RigMatch asked</span>
                <p>{prompt.prompt}</p>
              </div>
              <div className="speed-date-qa-block answered">
                <span>{activeRow.displayName} answered</span>
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
              <span>Waiting for a date</span>
              <strong>{activeRow.displayName} has no saved answers yet</strong>
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
        <button type="button" className="mini-button outline suite-edit-button" onClick={onOpenSuiteEditor}>
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

const BENCHMARK_QUESTION_TYPES: BenchmarkQuestionType[] = ['assistant', 'json', 'truth', 'format', 'coding'];

function TestSuiteEditorDock({
  questions,
  onChange,
  onReset,
  onClose,
}: {
  questions: BenchmarkQuestion[];
  onChange: (questions: BenchmarkQuestion[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
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
      </div>
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
                    <option key={type} value={type}>{type}</option>
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
  onEditQuestions,
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
  onEditQuestions: () => void;
}) {
  const activeProfile = getModelProfile(model);
  const matchNotes = getMatchNotes(activeProfile, selectedScore, host);
  const selectedRow = rows.find((row) => row.displayName === selectedModel || row.id === selectedModel);
  const rosterRows = rows.slice(0, 6);

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
              : 'Run a model test to crown Bachelor Number 1.'}
          </em>
        </div>
      </div>

      <div className="avatar-frame" aria-label={`${agentName} avatar`}>
        <AvatarBust model={model} size="large" />
      </div>

      <div className="character-roster" aria-label="Model shortlist">
        {rosterRows.map((row) => {
          const rowScore = row.displayName === selectedModel
            ? selectedScore ?? getModelScore(row, modelScores)
            : getModelScore(row, modelScores);
          const scoreLabel = rowScore ? `${rowScore.total} · ${rowScore.grade}` : 'Not tested';
          const title = rowScore
            ? `${row.displayName}: Match ${rowScore.total}, grade ${rowScore.grade}.`
            : `${row.displayName}: not tested yet.`;

          return (
            <button
              key={row.displayName}
              type="button"
              className={row.displayName === selectedModel ? 'roster-card active' : 'roster-card'}
              onClick={() => onSelect(row.displayName)}
              title={title}
            >
              <AvatarBust model={row.displayName} size="tiny" />
              <span className="roster-name">{getShortModelName(row.displayName)}</span>
              <span className={rowScore ? `roster-score ${getScoreTone(rowScore.total)}` : 'roster-score empty'}>
                {scoreLabel}
              </span>
            </button>
          );
        })}
      </div>

      <div className="match-tagline">
        <span>Matchmaker note</span>
        <strong>{host?.hostname ?? 'Local machine'} + {model}</strong>
      </div>

      <div className={selectedScore ? 'top-pick-ribbon scored' : 'top-pick-ribbon'} aria-label="Top pick status">
        <span>{selectedScore ? 'Bachelor Number 1 for this rig' : 'Awaiting a first date'}</span>
        <strong>{agentName}</strong>
        <em>{selectedScore ? `${selectedScore.total} Match · ${selectedScore.grade}` : 'Run a compatibility test to crown the winner.'}</em>
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
        onChoose={onChoose}
        onEditQuestions={onEditQuestions}
      />

      <div className="match-hero">
        <div className="agent-nameplate">
          <strong>{agentName}</strong>
          <span>Ollama model</span>
          <span>{activeProfile.archetype}</span>
          <span>{host?.hostname ?? 'Local machine'}</span>
        </div>

        <div className="score-grid">
          <ScoreTile label="Reliability" value={selectedScore?.sobriety} grade={selectedScore ? gradeFor(selectedScore.sobriety) : undefined} tone="pink" />
          <ScoreTile label="Speed" value={selectedScore?.speed} grade={selectedScore ? gradeFor(selectedScore.speed) : undefined} tone="gold" />
          <ScoreTile label="Match" value={selectedScore?.total} grade={selectedScore?.grade} tone="green" />
        </div>

        <div className="score-glossary" aria-label="Score glossary">
          <span title={getScoreTooltip('Reliability')}>Trust</span>
          <span title={getScoreTooltip('Speed')}>Pace</span>
          <span title={getScoreTooltip('Match')}>Fit</span>
        </div>

        <ResultExplanationCard
          model={model}
          profile={activeProfile}
          score={selectedScore}
          host={host}
        />

        <button type="button" className="talk-button" onClick={onTalk}>
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
  onChoose,
  onEditQuestions,
}: {
  model: string;
  profile: ModelProfile;
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  row?: ModelRow;
  host?: NetworkHost;
  system: SystemProfile;
  onTalk: () => void;
  onChoose: () => void;
  onEditQuestions: () => void;
}) {
  const sections = getAgentDatingProfileSections(model, profile, score, row, host, system);
  const details = getAgentDatingProfileDetails(model, profile, score, row, host, system);
  const [activeProfileTab, setActiveProfileTab] = useState<'about' | 'scores' | 'questions'>('about');
  const statusLabel = row?.installed ? 'Online now' : row?.live ? 'Available' : 'Catalog only';
  const locationLabel = host?.hostname ?? system.hostname;
  const matchLine = score
    ? `${score.total} Match score · ${score.grade} chemistry`
    : 'Waiting for a first compatibility date';
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
  ];

  return (
    <section className="dating-profile-card" aria-label={`${profile.agentName} dating profile`}>
      <div className="dating-profile-head">
        <div className="profile-photo-card">
          <AvatarBust model={model} size="large" />
          <span>{statusLabel}</span>
        </div>
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
            <button type="button" className="choose-me-button compact" onClick={onChoose}>
              <Heart aria-hidden="true" />
              Choose Me
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
      value: exactScores ? String(exactScores.total) : score ? String(score.total) : 'N/A',
      note: exactScores?.grade ?? score?.grade ?? 'Run a date',
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
          <em>{score ? `RigMatch scored this model ${score.total} with ${score.grade} chemistry.` : 'No scored compatibility date yet.'}</em>
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
            <span>Run this model in Test One Model or Speed Dating to save prompt-level proof.</span>
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
        <strong>No date transcript yet</strong>
        <span>Run this model in Test One Model or Speed Dating. RigMatch will save each question, answer, score, and timing here.</span>
        <em>Questions can still be changed with Edit Questions in Test One Model or Edit Suite in Speed Dating.</em>
        <button type="button" className="mini-button outline" onClick={onEditQuestions}>
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
          <span>Date Transcript</span>
          <strong>{prompts.length} questions asked</strong>
          <em>{formatHistoryTime(benchmark.completedAt)} · {benchmark.scores.total} Match · {benchmark.scores.grade}</em>
        </div>
        <div>
          <span>Question Suite</span>
          <strong>Editable</strong>
          <em>Changes apply to the next single test or Speed Dating run.</em>
          <button type="button" className="mini-button outline" onClick={onEditQuestions}>
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
                <strong>{prompt.sobrietyScore} answer quality</strong>
              </div>
              <em>{prompt.tokensPerSecond} tok/s · {formatMs(prompt.elapsedMs)}</em>
            </div>
            <div className="profile-qa-block asked">
              <span>RigMatch asked</span>
              <p>{prompt.prompt}</p>
            </div>
            <div className="profile-qa-block answered">
              <span>{model} answered</span>
              <pre>{prompt.response.trim() || 'No answer returned.'}</pre>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChatDock({
  agentName,
  model,
  messages,
  value,
  onChange,
  onClose,
  onSend,
}: {
  agentName: string;
  model: string;
  messages: ChatMessage[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <aside className="chat-dock" aria-label={`Chat with ${agentName}`}>
      <div className="chat-title">
        <div>
          <strong>{agentName}</strong>
          <span>{model === agentName ? 'Local model chat' : model}</span>
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="chat-stream">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.content}
          </div>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ask the matched local agent..."
          aria-label="Message"
        />
        <button type="submit" className="primary-button">
          Send
        </button>
      </form>
    </aside>
  );
}

function getAgentDatingProfileSections(
  model: string,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  row: ModelRow | undefined,
  host: NetworkHost | undefined,
  system: SystemProfile,
) {
  const hostName = getCleanHostName(host?.hostname ?? system.hostname);
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const scoreSummary = score
    ? `${score.total} overall, ${score.sobriety}% trust, ${score.speed}% pace, and ${score.fit}% computer fit`
    : `untested chemistry with ${hostName}`;
  const specialtyList = profile.specialties.join(', ');
  const fitSummary = getFootprintFit(sizeGb, system).toLowerCase();

  return [
    {
      title: 'My self-summary',
      body: `${model} is a ${profile.archetype.toLowerCase()} looking for one good local computer, clear prompts, and a relationship with healthy VRAM boundaries.`,
    },
    {
      title: "What I'm doing with my life",
      body: `Trying to win over ${hostName} with ${specialtyList}. Current chemistry: ${scoreSummary}.`,
    },
    {
      title: "I'm really good at",
      body: `${profile.specialties.slice(0, 3).join(', ')}. Also pretending that benchmark questions are casual small talk.`,
    },
    {
      title: 'The first things rigs notice about me',
      body: getDatingFirstImpression(profile, row, score, system),
    },
    {
      title: 'Favorite prompts, tools, and snacks',
      body: `Structured prompts, honest refusals, tidy summaries, and whatever keeps the fans below leaf-blower mode.`,
    },
    {
      title: 'The six things I could never do without',
      body: getDatingSixThings(profile, row, system, fitSummary).join(', '),
    },
  ];
}

function getAgentDatingProfileDetails(
  model: string,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  row: ModelRow | undefined,
  host: NetworkHost | undefined,
  system: SystemProfile,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const sizeLabel = sizeGb ? formatGb(sizeGb) : 'Unknown';
  const statusLabel = row?.installed ? 'Online now' : row?.live ? 'Available to download' : 'Catalog only';
  const origin = getModelOrigin(model);

  return [
    { label: 'Last Online', value: statusLabel },
    { label: 'Last Date', value: score ? formatHistoryTime(score.completedAt) : 'Not tested yet' },
    { label: 'Looking For', value: getCleanHostName(host?.hostname ?? system.hostname) },
    { label: 'Model', value: model },
    { label: 'Origin', value: `${origin.country} · ${origin.organization}` },
    { label: 'Brains', value: row?.params ?? 'Unknown' },
    { label: 'Body Type', value: profile.archetype },
    { label: 'Size', value: sizeLabel },
    { label: 'VRAM Fit', value: getFootprintFit(sizeGb, system) },
    { label: 'Best At', value: profile.specialties.join(', ') },
    { label: 'Match Score', value: score ? `${score.total} (${score.grade})` : 'Run a date' },
    { label: 'Trust', value: score ? `${score.sobriety}%` : 'Unknown' },
    { label: 'Dealbreaker', value: getDatingDealbreaker(sizeGb, score, system) },
  ];
}

function getDatingFirstImpression(
  profile: ModelProfile,
  row: ModelRow | undefined,
  score: TestedModelScore | undefined,
  system: SystemProfile,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  if (score && score.total >= 90) return `That ${score.grade} grade. Subtle? No. Effective? Absolutely.`;
  if (sizeGb && system.gpu.vramGb > 0 && sizeGb > system.gpu.vramGb) {
    return `The ambition. This one wants more VRAM than the current rig can comfortably offer.`;
  }

  switch (profile.variant) {
    case 'nova':
      return 'Calm JSON manners, steady instruction-following, and a suspiciously organized calendar.';
    case 'visor':
      return 'The dramatic visor energy and a willingness to turn a plain prompt into a whole scene.';
    case 'helmet':
      return 'Fast replies, practical instincts, and very little patience for overcomplicated setup.';
    case 'arcade':
      return 'Small download, quick charm, and the confidence of someone who travels light.';
    case 'pilot':
      return 'Tiny logic-specialist energy with a clipboard, a checklist, and a backup checklist.';
    case 'chrome':
      return 'Big reasoning presence. Shows up wearing analysis like formalwear.';
    default:
      return 'Wildcard confidence and just enough mystery to justify one compatibility date.';
  }
}

function getDatingSixThings(
  profile: ModelProfile,
  row: ModelRow | undefined,
  system: SystemProfile,
  fitSummary: string,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const vramThing = system.gpu.vramGb > 0
    ? `${formatGb(system.gpu.vramGb)} VRAM`
    : `${formatGb(system.memory.totalGb)} RAM`;
  const sizeThing = sizeGb ? `${formatGb(sizeGb)} of space` : 'a known model size';

  return [
    vramThing,
    sizeThing,
    profile.specialties[0] ?? 'good prompts',
    'Ollama',
    fitSummary,
    'one patient rig',
  ];
}

function getDatingDealbreaker(
  sizeGb: number | null,
  score: TestedModelScore | undefined,
  system: SystemProfile,
) {
  if (sizeGb && system.gpu.vramGb > 0 && sizeGb > system.gpu.vramGb) {
    return `Wants more than ${formatGb(system.gpu.vramGb)} VRAM`;
  }

  if (score && score.fit < 70) return 'Needs a better hardware fit';
  if (score && score.sobriety < 75) return 'Needs supervision';
  return 'None spotted';
}

function getCleanHostName(hostname: string) {
  return hostname.replace(/\s*\(This Machine\)/i, '') || 'this computer';
}

function getMatchNotes(
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  host?: NetworkHost,
) {
  const hostName = host?.hostname?.replace(/\s*\(This Machine\)/i, '') ?? 'this computer';
  const bestSpecialty = profile.specialties[0] ?? 'daily assistant work';
  if (!score) {
    return {
      summary: `${hostName} has not tested this ${profile.archetype.toLowerCase()} yet.`,
      reasons: [
        { label: 'Best For', value: bestSpecialty },
        { label: 'Computer Fit', value: 'N/A' },
        { label: 'Chemistry', value: 'N/A' },
      ],
    };
  }

  const chemistry = Math.round((score.total + score.sobriety) / 2);
  const summary =
    chemistry >= 90
      ? `${hostName} has strong chemistry with this ${profile.archetype.toLowerCase()}.`
      : chemistry >= 80
        ? `${hostName} looks like a practical match for this ${profile.archetype.toLowerCase()}.`
        : `${hostName} may need a better-fit candidate after another test.`;

  return {
    summary,
    reasons: [
      { label: 'Best For', value: bestSpecialty },
      { label: 'Computer Fit', value: `${score.fit}%` },
      { label: 'Chemistry', value: `${chemistry}%` },
    ],
  };
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
    if (!isBenchmarkResult(parsed.benchmark)) return null;

    const benchmarkByModel = isBenchmarkByModel(parsed.benchmarkByModel)
      ? upsertBenchmarkResults({}, Object.values(parsed.benchmarkByModel))
      : upsertBenchmarkResults({}, [parsed.benchmark]);
    const modelScores = isModelScores(parsed.modelScores)
      ? parsed.modelScores
      : upsertModelScores({}, Object.values(benchmarkByModel));

    return {
      benchmark: parsed.benchmark,
      benchmarkByModel,
      listTestResult: isListTestResult(parsed.listTestResult) ? parsed.listTestResult : null,
      modelScores,
      chatMessages: normalizeSavedChatMessages(parsed.chatMessages),
      selectedModel: typeof parsed.selectedModel === 'string' ? parsed.selectedModel : parsed.benchmark.model,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : parsed.benchmark.completedAt,
    };
  } catch {
    return null;
  }
}

function normalizeSavedChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [welcomeChatMessage];

  const messages = value.filter(isChatMessage);
  const conversation = messages.filter((message) => message.id !== welcomeChatMessage.id).slice(-99);
  return [welcomeChatMessage, ...conversation];
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'agent') &&
    typeof value.content === 'string'
  );
}

function isBenchmarkResult(value: unknown): value is BenchmarkResult {
  if (!isRecord(value) || !isRecord(value.scores)) return false;
  return (
    typeof value.model === 'string' &&
    typeof value.baseUrl === 'string' &&
    typeof value.completedAt === 'string' &&
    typeof value.elapsedMs === 'number' &&
    typeof value.scores.total === 'number' &&
    typeof value.scores.grade === 'string'
  );
}

function isListTestResult(value: unknown): value is ListTestResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.winner === 'string' &&
    Array.isArray(value.results) &&
    value.results.every(isTestedModelScore)
  );
}

function isModelScores(value: unknown): value is Record<string, TestedModelScore> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isTestedModelScore);
}

function isBenchmarkByModel(value: unknown): value is Record<string, BenchmarkResult> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isBenchmarkResult);
}

function isTestedModelScore(value: unknown): value is TestedModelScore {
  if (!isRecord(value)) return false;
  return (
    typeof value.model === 'string' &&
    typeof value.total === 'number' &&
    typeof value.grade === 'string' &&
    typeof value.speed === 'number' &&
    typeof value.sobriety === 'number' &&
    typeof value.fit === 'number' &&
    typeof value.completedAt === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function Ticker({
  activity,
  benchmark,
  isDesktopRuntime,
}: {
  activity: string;
  benchmark: BenchmarkResult;
  isDesktopRuntime: boolean;
}) {
  return (
    <footer className="ticker">
      <div>
        <span>Match Ticker</span>
        <strong>{activity}</strong>
      </div>
      <div>
        <span>{isDesktopRuntime ? 'Desktop bridge online' : 'Preview mode'}</span>
        <strong>Local-only v1 · {benchmark.scores.total} score</strong>
      </div>
      <div className="queue-meter" aria-label="Benchmark queue">
        {Array.from({ length: 12 }).map((_, index) => (
          <i key={index} className={index < Math.round(benchmark.scores.total / 10) ? 'lit' : ''} />
        ))}
      </div>
    </footer>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  actionLabel,
  onAction,
  busy = false,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  meta?: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <Icon aria-hidden="true" />
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
      <button type="button" className="mini-button" onClick={onAction} disabled={busy}>
        <RefreshCw className={busy ? 'spin' : ''} aria-hidden="true" />
        {actionLabel}
      </button>
    </div>
  );
}

function MetricTile({ label, value, level }: { label: string; value: string; level: number }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="mini-bars" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <i key={index} className={index < Math.round((level / 100) * 18) ? 'lit' : ''} />
        ))}
      </div>
    </div>
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
  const phaseLabel = progress.phase === 'complete'
    ? 'Crowned'
    : progress.questionPhase === 'prompt-complete'
      ? 'Scored'
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
}: {
  progress: RunProgress;
  host?: NetworkHost;
}) {
  return (
    <aside className="live-flirt-spotlight" aria-label="Live model test animation">
      <div className="live-flirt-head">
        <span>{progress.mode === 'speed-date' ? 'Live Speed Dating' : 'Live Model Test'}</span>
        <strong>{progress.currentModel}</strong>
        <em>{progress.completed}/{progress.total}</em>
      </div>
      <FlirtTestAnimation
        model={progress.currentModel}
        host={host}
        mode={progress.mode}
        questionLabel={progress.questionLabel}
      />
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
    ? 'I dressed for this prompt.'
    : mode === 'speed-date'
    ? 'I love a fair date.'
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

function ScoreBars({
  benchmark,
  score,
  active,
}: {
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  active: boolean;
}) {
  const rows = [
    { label: 'Prompt Throughput', value: benchmark?.prompts[0]?.tokensPerSecond, max: 140, unit: 'tok/s' },
    { label: 'Generation Speed', value: score?.speed ?? benchmark?.scores.speed, max: 100, unit: '%' },
    {
      label: 'First Token Latency',
      value: benchmark ? Math.max(0, 100 - (benchmark.prompts[0]?.elapsedMs ?? 600) / 20) : undefined,
      max: 100,
      unit: '%',
    },
    { label: 'Reliability Score', value: score?.sobriety ?? benchmark?.scores.sobriety, max: 100, unit: '%' },
  ];
  const hasScore = Boolean(score || benchmark);

  return (
    <div className="score-bars">
      <div className="overall-progress">
        <span>Overall Progress</span>
        <strong>{active ? '42%' : hasScore ? '100%' : 'N/A'}</strong>
        <i style={{ width: active ? '42%' : hasScore ? '100%' : '0%' }} />
      </div>
      {rows.map((row) => (
        <div className={Number.isFinite(row.value) ? 'bar-row' : 'bar-row empty'} key={row.label}>
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${Number.isFinite(row.value) ? Math.min(100, ((row.value ?? 0) / row.max) * 100) : 0}%` }} />
          </div>
          <strong>
            {Number.isFinite(row.value) ? `${Math.round(row.value ?? 0)}${row.unit}` : 'N/A'}
          </strong>
        </div>
      ))}
    </div>
  );
}

function ResultExplanationCard({
  model,
  profile,
  score,
  host,
}: {
  model: string;
  profile: ModelProfile;
  score?: TestedModelScore;
  host?: NetworkHost;
}) {
  const explanation = getResultExplanation(model, profile, score, host);

  return (
    <div className={`result-explainer ${score ? getScoreTone(score.total) : 'empty'}`}>
      <span>{score ? 'Judge Card' : 'Judge Card Pending'}</span>
      <strong>{explanation.title}</strong>
      <p>{explanation.body}</p>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  grade,
  tone,
}: {
  label: string;
  value?: number;
  grade?: string;
  tone: 'pink' | 'gold' | 'green';
}) {
  const tooltip = getScoreTooltip(label);
  const hasValue = Number.isFinite(value);

  return (
    <div
      className={`score-tile ${tone}${hasValue ? '' : ' empty'}`}
      title={hasValue ? tooltip : `No ${label.toLowerCase()} score yet. Run a test for this model.`}
      aria-label={hasValue ? `${label}: ${value}, ${grade}. ${tooltip}` : `${label}: not scored yet.`}
    >
      <span>{label}</span>
      <strong>{hasValue ? value : 'N/A'}</strong>
      <em>{grade ?? 'N/A'}</em>
    </div>
  );
}

function getScoreTooltip(label: string) {
  const key = label.toLowerCase();
  if (key.includes('sobriety') || key.includes('reliability')) {
    return 'Reliability check for hallucination traps, careful answers, and instruction discipline.';
  }

  if (key.includes('speed')) {
    return 'How quickly this model responds on the selected computer, including throughput and latency.';
  }

  if (key.includes('compatibility') || key.includes('match')) {
    return 'Overall match score combining speed, reliability, stability, and hardware fit.';
  }

  return 'Score from the latest model test.';
}

function AvatarBust({ model, size }: { model: string; size: 'tiny' | 'small' | 'large' }) {
  const family = getModelFamily(model);
  const avatarSrc = MODEL_AVATAR_ASSETS[family] ?? modelAvatarGeneric;

  return (
    <span
      className={`avatar-bust ${size} family-${family}`}
      aria-hidden="true"
    >
      <img src={avatarSrc} alt="" draggable={false} />
    </span>
  );
}

function MachineAvatar({
  host,
  size,
}: {
  host?: Pick<NetworkHost, 'hostname' | 'ip' | 'isLocal'>;
  size: 'tiny' | 'small' | 'medium';
}) {
  return (
    <span
      className={`machine-avatar ${size} ${host?.isLocal ? 'local' : 'remote'}`}
      aria-hidden="true"
    >
      <img src={machineAvatarLocal} alt="" draggable={false} />
    </span>
  );
}

function DiskGuard({ guard }: { guard: ReturnType<typeof getDiskGuard> }) {
  return (
    <div className={`disk-guard ${guard.tone}`}>
      <div>
        <span>Disk Guard</span>
        <strong>{guard.summary}</strong>
      </div>
      <div className="disk-bar" aria-label={guard.summary}>
        <i style={{ width: `${guard.percent}%` }} />
      </div>
      <em>{guard.message}</em>
    </div>
  );
}

function toTestedModelScore(result: BenchmarkResult): TestedModelScore {
  return {
    model: result.model,
    total: result.scores.total,
    grade: result.scores.grade,
    speed: result.scores.speed,
    sobriety: result.scores.sobriety,
    fit: result.scores.fit,
    completedAt: result.completedAt,
  };
}

function upsertModelScores(
  current: Record<string, TestedModelScore>,
  results: BenchmarkResult[],
) {
  return results.reduce<Record<string, TestedModelScore>>((next, result) => {
    const score = toTestedModelScore(result);
    next[score.model] = score;
    return next;
  }, { ...current });
}

function upsertBenchmarkResults(
  current: Record<string, BenchmarkResult>,
  results: BenchmarkResult[],
) {
  return results.reduce<Record<string, BenchmarkResult>>((next, result) => {
    next[normalizeModelKey(result.model)] = result;
    return next;
  }, { ...current });
}

function getRecentModelScores(modelScores: Record<string, TestedModelScore>) {
  return Object.values(modelScores)
    .filter(isTestedModelScore)
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

function getModelScore(row: ModelRow, modelScores: Record<string, TestedModelScore>) {
  return (
    modelScores[row.displayName] ||
    modelScores[row.installedModel?.model ?? ''] ||
    modelScores[row.installedModel?.name ?? ''] ||
    modelScores[`${row.name}:${row.tag}`]
  );
}

function getBenchmarkForModel(
  benchmarks: Record<string, BenchmarkResult>,
  selectedModel: string,
  selectedRow?: ModelRow,
) {
  const directKeys = [
    selectedModel,
    selectedRow?.displayName,
    selectedRow?.id,
    selectedRow ? `${selectedRow.name}:${selectedRow.tag}` : '',
    selectedRow?.installedModel?.model,
    selectedRow?.installedModel?.name,
  ].filter(Boolean);

  for (const key of directKeys) {
    const direct = benchmarks[normalizeModelKey(key)];
    if (direct) return direct;
  }

  return Object.values(benchmarks)
    .filter(isBenchmarkResult)
    .find((candidate) => isBenchmarkForModel(candidate, selectedModel, selectedRow)) ?? null;
}

function getModelAliases(row: ModelRow) {
  return Array.from(new Set([
    row.id,
    row.displayName,
    `${row.name}:${row.tag}`,
    row.installedModel?.model,
    row.installedModel?.name,
  ].filter(Boolean) as string[]));
}

function ollamaModelMatchesAliases(model: OllamaModel, aliases: string[]) {
  return aliases.includes(model.model) || aliases.includes(model.name);
}

function removeModelScores(current: Record<string, TestedModelScore>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeModelKey);
  const next = { ...current };
  aliases.forEach((alias) => {
    delete next[alias];
  });
  Object.entries(next).forEach(([key, score]) => {
    if (normalizedAliases.includes(normalizeModelKey(key)) || normalizedAliases.includes(normalizeModelKey(score.model))) {
      delete next[key];
    }
  });
  return next;
}

function removeBenchmarkResults(current: Record<string, BenchmarkResult>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeModelKey);
  const next = { ...current };
  normalizedAliases.forEach((alias) => {
    delete next[alias];
  });
  Object.entries(next).forEach(([key, result]) => {
    if (normalizedAliases.includes(normalizeModelKey(result.model))) {
      delete next[key];
    }
  });
  return next;
}

function removeListTestScores(current: ListTestResult | null, aliases: string[]) {
  if (!current) return null;
  const normalizedAliases = aliases.map(normalizeModelKey);
  const remaining = current.results
    .filter((score) => !normalizedAliases.includes(normalizeModelKey(score.model)))
    .sort((left, right) => right.total - left.total);

  if (!remaining.length) return null;

  return {
    winner: remaining[0].model,
    results: remaining,
  };
}

function isBenchmarkForAliases(benchmark: BenchmarkResult, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeModelKey);
  return normalizedAliases.includes(normalizeModelKey(benchmark.model));
}

function createEmptyBenchmark(model: string, baseUrl: string): BenchmarkResult {
  return {
    model,
    baseUrl,
    questionCount: 0,
    completedAt: new Date().toISOString(),
    elapsedMs: 0,
    prompts: [],
    scores: {
      speed: 0,
      sobriety: 0,
      stability: 0,
      fit: 0,
      total: 0,
      grade: 'N/A',
    },
  };
}

function removeSetValues(current: Set<string>, aliases: string[]) {
  const next = new Set(current);
  aliases.forEach((alias) => {
    next.delete(alias);
  });
  return next;
}

function isBenchmarkForModel(
  benchmark: BenchmarkResult,
  selectedModel: string,
  selectedRow?: ModelRow,
) {
  const benchmarkKey = normalizeModelKey(benchmark.model);
  return [
    selectedModel,
    selectedRow?.displayName,
    selectedRow?.id,
    selectedRow ? `${selectedRow.name}:${selectedRow.tag}` : '',
    selectedRow?.installedModel?.model,
    selectedRow?.installedModel?.name,
  ]
    .filter(Boolean)
    .some((key) => normalizeModelKey(key) === benchmarkKey);
}

function getScoreTone(total: number) {
  if (total >= 90) return 'elite';
  if (total >= 80) return 'good';
  if (total >= 70) return 'ok';
  return 'low';
}

function getResultExplanation(
  model: string,
  profile: ModelProfile,
  score?: TestedModelScore,
  host?: NetworkHost,
) {
  if (!score) {
    return {
      title: 'No chemistry test yet',
      body: `Run a model test and RigMatch will explain whether ${profile.agentName} is a good fit for ${host?.hostname ?? 'this computer'}.`,
    };
  }

  const strongestTrait = score.sobriety >= score.speed && score.sobriety >= score.fit
    ? 'it followed instructions well'
    : score.speed >= score.fit
      ? 'it answered quickly'
      : 'it fits this computer comfortably';
  const caution = score.total >= 88
    ? 'This one is worth chatting with first.'
    : score.fit < 70
      ? 'Watch the hardware fit before long runs.'
      : score.sobriety < 75
        ? 'Use it for lighter tasks until it proves itself on stricter prompts.'
        : 'It is usable, but another contestant may be a stronger daily driver.';

  return {
    title: `${profile.agentName} scored ${score.total} (${score.grade})`,
    body: `${model} is a ${score.grade} match because ${strongestTrait}, scored ${score.speed}% speed, ${score.sobriety}% answer quality, and ${score.fit}% computer fit on ${host?.hostname ?? 'this computer'}. ${caution}`,
  };
}

function getModelProfileHighlights(
  row: ModelRow | undefined,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  vramGb: number,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const origin = getModelOrigin(row?.displayName ?? '');
  const redFlag = sizeGb && vramGb > 0 && sizeGb > vramGb
    ? sizeGb <= vramGb * 1.15 ? 'RAM assist' : 'Out of league'
    : sizeGb && sizeGb >= 12
      ? 'Large download'
      : score && score.sobriety < 75
        ? 'Needs supervision'
        : 'Low drama';

  return [
    {
      label: 'Date vibe',
      value: profile.archetype,
    },
    {
      label: 'Best for',
      value: profile.specialties.slice(0, 2).join(' + '),
    },
    {
      label: 'Origin',
      value: origin.country,
    },
    {
      label: 'Red flag',
      value: redFlag,
    },
  ];
}

function getRigPick(
  rows: ModelRow[],
  scores: Record<string, TestedModelScore>,
  vramGb: number,
): RigPick | null {
  const fittingRows = rows.filter((row) => modelFitsVram(row, vramGb));
  if (fittingRows.length === 0) return null;

  const scoredPick = fittingRows
    .map((row) => ({ row, score: getModelScore(row, scores) }))
    .filter((item): item is { row: ModelRow; score: TestedModelScore } => Boolean(item.score))
    .sort((left, right) => right.score.total - left.score.total)[0];

  if (scoredPick) {
    return {
      row: scoredPick.row,
      score: scoredPick.score,
      profile: getModelProfile(scoredPick.row.displayName),
      tone: 'scored',
      fitLabel: getRigPickFitLabel(scoredPick.row, vramGb),
      reason: `${scoredPick.row.displayName} has the highest saved Match score that still fits this computer.`,
    };
  }

  const installedPick = fittingRows
    .filter((row) => row.installed)
    .sort((left, right) => getHardwareRecommendationScore(right, vramGb) - getHardwareRecommendationScore(left, vramGb))[0];

  if (installedPick) {
    return {
      row: installedPick,
      profile: getModelProfile(installedPick.displayName),
      tone: 'installed',
      fitLabel: getRigPickFitLabel(installedPick, vramGb),
      reason: `${installedPick.displayName} is already installed and sized for this rig. Give this contestant the first date.`,
    };
  }

  const downloadPick = fittingRows
    .filter((row) => row.live)
    .sort((left, right) => getHardwareRecommendationScore(right, vramGb) - getHardwareRecommendationScore(left, vramGb))[0];

  if (!downloadPick) return null;

  return {
    row: downloadPick,
    profile: getModelProfile(downloadPick.displayName),
    tone: 'download',
    fitLabel: getRigPickFitLabel(downloadPick, vramGb),
    reason: `${downloadPick.displayName} looks like the best download candidate for this hardware. Bigger models can wait for a stronger rig.`,
  };
}

function getHardwareRecommendationScore(row: ModelRow, vramGb: number) {
  const sizeGb = row.sizeGb ?? 0;
  const targetGb = vramGb > 0 ? Math.max(2, vramGb * 0.55) : 4;
  const statusBoost = row.installed ? 40 : row.live ? 8 : 0;
  const sizeBoost = Math.min(sizeGb, targetGb) * 3;
  const distancePenalty = Math.abs(sizeGb - targetGb) * 4;

  return statusBoost + sizeBoost - distancePenalty;
}

function getRigPickFitLabel(row: ModelRow, vramGb: number) {
  if (!row.sizeGb) return 'Size unknown';
  if (vramGb <= 0) return `${formatGb(row.sizeGb)} model`;
  const headroomGb = Math.max(0, vramGb - row.sizeGb);
  if (headroomGb >= Math.max(2, vramGb * 0.25)) return `${formatGb(headroomGb)} headroom`;
  if (headroomGb > 0) return `${formatGb(headroomGb)} tight headroom`;
  return 'RAM-assisted';
}

function sortModelRows(
  rows: ModelRow[],
  sortKey: ModelSortKey,
  direction: SortDirection,
  queuedModelIds: Set<string>,
  modelScores: Record<string, TestedModelScore>,
) {
  const directionFactor = direction === 'asc' ? 1 : -1;

  return [...rows].sort((left, right) => {
    if (sortKey === 'size') {
      if (left.sizeGb == null && right.sizeGb == null) {
        return left.displayName.localeCompare(right.displayName);
      }

      if (left.sizeGb == null) return 1;
      if (right.sizeGb == null) return -1;

      const sizeDelta = left.sizeGb - right.sizeGb;
      return sizeDelta === 0 ? left.displayName.localeCompare(right.displayName) : sizeDelta * directionFactor;
    }

    const leftValue = getModelSortValue(left, sortKey, queuedModelIds.has(left.displayName), modelScores);
    const rightValue = getModelSortValue(right, sortKey, queuedModelIds.has(right.displayName), modelScores);

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      const delta = leftValue - rightValue;
      return delta === 0 ? left.displayName.localeCompare(right.displayName) : delta * directionFactor;
    }

    return String(leftValue).localeCompare(String(rightValue), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * directionFactor;
  });
}

function getModelSortValue(
  row: ModelRow,
  sortKey: ModelSortKey,
  queued: boolean,
  modelScores: Record<string, TestedModelScore>,
) {
  switch (sortKey) {
    case 'params':
      return getParamSortValue(row.params);
    case 'skill':
      return getModelProfile(row.displayName).specialties[0] ?? '';
    case 'origin':
      return getModelOrigin(row.displayName).country;
    case 'source':
      return row.source;
    case 'status':
      return getModelStatusRank(row, queued);
    case 'score':
      return getModelScore(row, modelScores)?.total ?? -1;
    case 'name':
    default:
      return row.displayName;
  }
}

function getModelSearchText(row: ModelRow, queued: boolean, score?: TestedModelScore) {
  const profile = getModelProfile(row.displayName);
  return [
    row.displayName,
    row.name,
    row.tag,
    row.params,
    row.sizeGb ? formatGb(row.sizeGb) : 'unknown size',
    row.source,
    getModelOrigin(row.displayName).country,
    getModelOrigin(row.displayName).organization,
    row.pack,
    row.live ? 'live available ollama library' : 'local curated',
    getModelStatusLabel(row, queued),
    score ? `tested score ${score.total} ${score.grade}` : 'untested no score',
    profile.agentName,
    profile.archetype,
    ...profile.specialties,
  ]
    .join(' ')
    .toLowerCase();
}

function getModelStatusLabel(row: ModelRow, queued: boolean) {
  if (row.installed) return 'Installed';
  if (queued) return 'Queued';
  if (row.live) return 'Available';
  return 'Not Installed';
}

function getModelStatusRank(row: ModelRow, queued: boolean) {
  if (row.installed) return 3;
  if (queued) return 2;
  if (row.live) return 1;
  return 0;
}

function getParamSortValue(params: string) {
  const match = params.match(/(\d+(?:\.\d+)?)\s*([bm])/i);
  if (!match) return -1;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return -1;

  return match[2].toLowerCase() === 'm' ? value / 1000 : value;
}

function getModelSortLabel(sortKey: ModelSortKey) {
  switch (sortKey) {
    case 'params':
      return 'Brains';
    case 'size':
      return 'Size';
    case 'skill':
      return 'Good For';
    case 'origin':
      return 'Origin';
    case 'source':
      return 'From';
    case 'status':
      return 'Status';
    case 'score':
      return 'Match';
    case 'name':
    default:
      return 'Model';
  }
}

function mergeModelRows(catalog: CatalogModel[], installedModels: OllamaModel[]): ModelRow[] {
  const rows = catalog.map((entry) => {
    const exactName = `${entry.name}:${entry.tag}`;
    const installed = installedModels.find(
      (model) =>
        model.model === exactName ||
        model.name === exactName ||
        (entry.tag === 'latest' && (model.model || model.name).startsWith(`${entry.name}:`)),
    );

    return {
      ...entry,
      displayName: installed?.model || installed?.name || exactName,
      installed: Boolean(installed),
      ready: Boolean(installed),
      installedModel: installed,
      installLabel: installed ? 'Installed' : 'Queue',
      params: installed?.parameterSize || entry.params,
      sizeGb: installed?.sizeGb || entry.sizeGb,
    };
  });

  const dedupedRows = new Map<string, ModelRow>();
  rows.forEach((row) => {
    const key = normalizeModelKey(row.displayName);
    const existing = dedupedRows.get(key);
    if (!existing || shouldPreferModelRow(row, existing)) {
      dedupedRows.set(key, row);
    }
  });

  const existing = new Set(dedupedRows.keys());
  const extras = installedModels
    .filter((model) => !existing.has(normalizeModelKey(model.model || model.name)))
    .map((model) => ({
      id: model.model || model.name,
      name: (model.model || model.name).split(':')[0],
      tag: (model.model || model.name).split(':')[1] ?? 'latest',
      displayName: model.model || model.name,
      params: model.parameterSize || 'Installed',
      sizeGb: model.sizeGb || null,
      pack: 'Installed',
      source: 'Ollama local',
      live: false,
      installed: true,
      ready: true,
      installedModel: model,
      installLabel: 'Installed',
    }));

  return [...extras, ...dedupedRows.values()].slice(0, 180);
}

function normalizeModelKey(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}

function shouldPreferModelRow(next: ModelRow, current: ModelRow) {
  if (next.installed !== current.installed) return next.installed;

  const nextExact = normalizeModelKey(`${next.name}:${next.tag}`) === normalizeModelKey(next.displayName);
  const currentExact = normalizeModelKey(`${current.name}:${current.tag}`) === normalizeModelKey(current.displayName);
  if (nextExact !== currentExact) return nextExact;

  if (next.live !== current.live) return next.live;
  if (Boolean(next.sizeGb) !== Boolean(current.sizeGb)) return Boolean(next.sizeGb);
  if (next.source === 'Ollama local' && current.source !== 'Ollama local') return true;

  return false;
}

function getAgentName(model: string) {
  return getModelProfile(model).agentName;
}

function getPlatformName(platform: string) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return platform || 'This machine';
}

function createRunProgressId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCudaSummary(cuda: SystemProfile['cuda']) {
  if (cuda.status === 'not-nvidia') return 'No NVIDIA GPU';
  if (cuda.status === 'current') return `Toolkit ${cuda.toolkitVersion}`;
  if (cuda.status === 'behind') return 'Update available';
  if (cuda.status === 'toolkit-missing') return 'Toolkit not found';
  if (cuda.driverCudaVersion) return `Driver CUDA ${cuda.driverCudaVersion}`;
  return 'Unknown';
}

function getCudaDetail(cuda: SystemProfile['cuda']) {
  const latest = cuda.latestToolkitVersion ? `latest ${cuda.latestToolkitVersion}` : 'latest unknown';
  const driver = cuda.driverCudaVersion ? `driver supports ${cuda.driverCudaVersion}` : 'driver CUDA unknown';

  if (cuda.status === 'not-nvidia') {
    return 'CUDA acceleration applies to NVIDIA GPUs.';
  }

  if (cuda.status === 'current') {
    return `${driver}; ${latest}.`;
  }

  if (cuda.status === 'behind') {
    return `Toolkit ${cuda.toolkitVersion}; ${latest}.`;
  }

  if (cuda.status === 'toolkit-missing') {
    return `${driver}; ${latest}. nvcc not installed.`;
  }

  return cuda.error || `${driver}; ${latest}.`;
}

function getSelectedContestantBlurb(
  row: ModelRow,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  hardwareFit: HardwareFit,
) {
  if (score) {
    return `${row.displayName} scored ${score.total} (${score.grade}) on this rig. ${hardwareFit.detail}`;
  }

  if (row.installed) {
    return `${row.displayName} is installed and ready for a compatibility date. ${hardwareFit.detail}`;
  }

  if (hardwareFit.recommend) {
    return `${row.displayName} looks like a realistic download for this rig. ${profile.specialties.join(', ')}.`;
  }

  return `${row.displayName} is listed in the model pool, but RigMatch is cautious here: ${hardwareFit.detail}`;
}

function getUpdateChannelLabel(channel: UpdateChannel) {
  return channel === 'nightly' ? 'Nightly' : 'Release';
}

function getUpdateStatusLabel(result: UpdateCheckResponse | null, isChecking: boolean) {
  if (isChecking) return 'Checking for upgrades';
  if (!result) return 'Ready to check for upgrades';
  if (result.hasUpdate) return 'New build available';
  if (result.status === 'current') return 'You are up to date';
  return 'Update status unknown';
}

function getUpdateResultDetail(result: UpdateCheckResponse | null, channel: UpdateChannel) {
  if (!result) {
    return channel === 'nightly'
      ? 'Nightly checks look for prerelease or nightly-tagged builds.'
      : 'Release checks look for the newest stable build.';
  }

  const latest = result.latestVersion ? `latest v${result.latestVersion}` : 'latest version unknown';
  const checked = result.checkedAt ? `checked ${formatReleaseDate(result.checkedAt)}` : 'not checked';
  const date = result.latestDate ? `published ${formatReleaseDate(result.latestDate)}` : 'publish date unknown';

  if (result.error) {
    return `Current v${result.currentVersion}; ${checked}. Downloads still open manually.`;
  }

  return `Current v${result.currentVersion}; ${latest}; ${date}.`;
}

function formatReleaseDate(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getLocalRigDetailCards(host: NetworkHost, system: SystemProfile, ollama: OllamaStatus) {
  const primaryNetwork = system.networks.find((network) => !network.isVirtual) ?? system.networks[0];
  const adapterLabel = primaryNetwork ? `${primaryNetwork.name} · ${primaryNetwork.subnet}.x` : 'Adapter unknown';

  return [
    {
      label: 'OS',
      value: getPlatformName(system.platform),
      detail: `${system.os.distro || 'Unknown OS'} ${system.os.release || ''}`.trim(),
    },
    {
      label: 'CPU',
      value: system.cpu.brand,
      detail: `${system.cpu.physicalCores} cores · ${system.cpu.cores} threads · ${system.cpu.loadPercent}% load`,
    },
    {
      label: 'GPU',
      value: system.gpu.model,
      detail: `${system.gpu.vramGb || '?'} GB VRAM · driver ${system.gpu.driverVersion}`,
    },
    {
      label: 'Memory',
      value: `${system.memory.usedGb} / ${system.memory.totalGb} GB`,
      detail: `${system.memory.availableGb} GB available`,
    },
    {
      label: 'Storage',
      value: `${system.storage.availableGb} GB free`,
      detail: `${system.storage.sizeGb} GB total · ${system.storage.mount || 'primary disk'}`,
    },
    {
      label: 'CUDA',
      value: getCudaSummary(system.cuda),
      detail: getCudaDetail(system.cuda),
    },
    {
      label: 'Ollama',
      value: ollama.version ? `v${ollama.version}` : host.version ? `v${host.version}` : 'Version unknown',
      detail: `${ollama.models.length || host.models} models · ${host.pingMs ?? ollama.pingMs ?? '?'} ms`,
    },
    {
      label: 'Network',
      value: host.ip,
      detail: adapterLabel,
    },
  ];
}

function getRemoteRigDetailCards(host: NetworkHost) {
  if (host.discovery === 'computer') {
    return [
      {
        label: 'Machine',
        value: host.hostname,
        detail: host.ip,
      },
      {
        label: 'Ollama API',
        value: 'Phase 2',
        detail: 'Remote systems are disabled in v1.',
      },
      {
        label: 'Open Ports',
        value: host.openPorts?.length ? host.openPorts.join(', ') : 'None seen',
        detail: 'Computer discovery is not the same as Ollama access.',
      },
      {
        label: 'Next Step',
        value: 'Use local Ollama',
        detail: 'Install and test models on this computer for v1.',
      },
    ];
  }

  return [
    {
      label: 'Endpoint',
      value: host.ip,
      detail: host.baseUrl,
    },
    {
      label: 'Provider',
      value: host.provider,
      detail: host.version ? `Ollama v${host.version}` : 'Version not reported',
    },
    {
      label: 'Inventory',
      value: `${host.models} models`,
      detail: `${host.status} · ${host.pingMs ?? '?'} ms`,
    },
    {
      label: 'Hardware',
      value: host.isDemo ? 'Sample profile' : 'Runner needed',
      detail: host.isDemo
        ? 'Preview data, not a real machine scan.'
        : 'Ollama API does not expose CPU/GPU/RAM yet.',
    },
  ];
}

function getFootprintFit(sizeGb: number | null, system: SystemProfile) {
  if (!sizeGb) return 'Unknown model size';

  const vramGb = system.gpu.vramGb || 0;
  if (vramGb > 0 && sizeGb <= vramGb * 0.55) return 'Comfortable VRAM headroom';
  if (vramGb > 0 && sizeGb <= vramGb * 0.8) return 'Good VRAM fit';
  if (vramGb > 0 && sizeGb <= vramGb) return 'Tight VRAM fit';
  if (vramGb > 0 && sizeGb <= vramGb * 1.15) return 'RAM-assisted trial';
  if (vramGb > 0 && sizeGb > vramGb * 1.15) return "Out of this rig's league";
  if (sizeGb <= system.memory.availableGb * 0.45) return 'Likely RAM-assisted';
  return 'Memory-heavy candidate';
}

function isHostBenchmarkReady(host: NetworkHost | undefined, ollama: OllamaStatus) {
  return !getHostBenchmarkBlocker(host, ollama);
}

function getHostBenchmarkBlocker(host: NetworkHost | undefined, ollama: OllamaStatus) {
  if (!host || host.isLocal || host.isDemo) {
    return ollama.ready ? null : 'Ollama must be running before RigMatch.AI can test a model.';
  }

  if (host.discovery === 'computer') {
    return `${host.hostname} is not available in RigMatch v1. Remote systems are planned for RigMatch 2.0.`;
  }

  if (host.status.toLowerCase() !== 'ready' || !host.provider.toLowerCase().includes('ollama')) {
    return `${host.hostname} is not ready for testing yet. RigMatch needs an Ollama API at ${host.baseUrl}.`;
  }

  return null;
}

function getNavLabel(id: NavId) {
  return navItems.find((item) => item.id === id)?.label ?? 'Panel';
}

function getThemeLabel(id: ThemeId) {
  return themeOptions.find((theme) => theme.id === id)?.label ?? 'Studio Orange';
}

function getSavedThemeId(): ThemeId {
  const savedThemeId = window.localStorage.getItem('agentArcadeTheme');
  return isThemeId(savedThemeId) ? savedThemeId : 'orange';
}

function getSavedUiMode(): UiMode {
  const savedMode = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
  return savedMode === 'advanced' ? 'advanced' : 'beginner';
}

function getSavedTutorialSeen() {
  return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'seen';
}

function isThemeId(value: string | null): value is ThemeId {
  return themeOptions.some((theme) => theme.id === value);
}

function getModelFamily(model: string): ModelFamilyId {
  const lower = String(model || '').toLowerCase();
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('llama')) return 'llama';
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('mistral')) return 'mistral';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('phi')) return 'phi';
  return 'generic';
}

function getModelOrigin(model: string) {
  const family = getModelFamily(model);

  switch (family) {
    case 'deepseek':
      return { family, country: 'China', organization: 'DeepSeek' };
    case 'qwen':
      return { family, country: 'China', organization: 'Alibaba Cloud' };
    case 'mistral':
      return { family, country: 'France', organization: 'Mistral AI' };
    case 'llama':
      return { family, country: 'United States', organization: 'Meta' };
    case 'gemma':
      return { family, country: 'United States', organization: 'Google' };
    case 'phi':
      return { family, country: 'United States', organization: 'Microsoft' };
    case 'generic':
    default:
      return { family, country: 'Unknown', organization: 'Unknown model family' };
  }
}

function getModelProfile(model: string): ModelProfile {
  const modelName = model || 'Unknown model';
  const lower = modelName.toLowerCase();
  const seed = hashString(lower);
  const hue = seed % 360;
  const accentHue = (hue + 128 + (seed % 48)) % 360;

  if (lower.includes('qwen')) {
    return {
      agentName: modelName,
      archetype: 'Balanced technician',
      specialties: ['JSON/tools', 'instructions', 'daily chat'],
      hue: 128,
      accentHue: 190,
      variant: 'nova',
    };
  }

  if (lower.includes('mistral')) {
    return {
      agentName: modelName,
      archetype: 'Creative generalist',
      specialties: ['writing', 'summaries', 'brainstorming'],
      hue: 286,
      accentHue: 44,
      variant: 'visor',
    };
  }

  if (lower.includes('llama')) {
    return {
      agentName: modelName,
      archetype: 'Fast utility fighter',
      specialties: ['assistant', 'speed', 'general help'],
      hue: 205,
      accentHue: 108,
      variant: 'helmet',
    };
  }

  if (lower.includes('gemma')) {
    return {
      agentName: modelName,
      archetype: 'Small-footprint helper',
      specialties: ['low memory', 'quick chat', 'summaries'],
      hue: 42,
      accentHue: 318,
      variant: 'arcade',
    };
  }

  if (lower.includes('phi')) {
    return {
      agentName: modelName,
      archetype: 'Tiny logic specialist',
      specialties: ['coding', 'math', 'small rigs'],
      hue: 178,
      accentHue: 24,
      variant: 'pilot',
    };
  }

  if (lower.includes('deepseek')) {
    return {
      agentName: modelName,
      archetype: 'Reasoning bruiser',
      specialties: ['reasoning', 'hard prompts', 'analysis'],
      hue: 350,
      accentHue: 212,
      variant: 'chrome',
    };
  }

  return {
    agentName: modelName,
    archetype: 'Wildcard contender',
    specialties: ['chat', 'utility', 'experiments'],
    hue,
    accentHue,
    variant: ['visor', 'helmet', 'chrome', 'arcade', 'pilot', 'nova'][seed % 6] as ModelProfile['variant'],
  };
}

function getDiskGuard(rows: ModelRow[], queuedRows: ModelRow[], freeGb: number) {
  const installedGb = rows
    .filter((row) => row.installed)
    .reduce((sum, row) => sum + (row.sizeGb || 0), 0);
  const queuedGb = queuedRows.reduce((sum, row) => sum + (row.sizeGb || 0), 0);
  const plannedGb = installedGb + queuedGb;
  const availableAfterQueue = Math.max(0, freeGb - queuedGb);
  const queuePercent = freeGb > 0 ? Math.min(100, Math.round((queuedGb / freeGb) * 100)) : 0;
  const tone = queuedGb > Math.max(0, freeGb - 10) ? 'danger' : queuedGb > freeGb * 0.4 ? 'warn' : 'ok';

  return {
    installedGb,
    queuedGb,
    plannedGb,
    availableAfterQueue,
    queuedCount: queuedRows.length,
    percent: Math.max(queuedGb > 0 ? 5 : 0, queuePercent),
    tone,
    summary: `${formatGb(plannedGb)} planned · ${queuedRows.length} queued`,
    message:
      queuedGb === 0
        ? `${formatGb(installedGb)} installed. ${formatGb(freeGb)} free.`
        : `${formatGb(queuedGb)} queued downloads. ${formatGb(availableAfterQueue)} free after queue.`,
  };
}

function getModelQuickFilters(
  rows: ModelRow[],
  scores: Record<string, TestedModelScore>,
  vramGb: number,
): Array<{ id: ModelQuickFilterId; label: string; count: number }> {
  return [
    { id: 'all', label: 'All', count: rows.length },
    { id: 'installed', label: 'Installed', count: rows.filter((row) => row.installed).length },
    { id: 'fits-vram', label: 'Rig Picks', count: rows.filter((row) => modelFitsVram(row, vramGb)).length },
    { id: 'scored', label: 'Scored', count: rows.filter((row) => Boolean(getModelScore(row, scores))).length },
    { id: 'unscored', label: 'Unscored', count: rows.filter((row) => row.installed && !getModelScore(row, scores)).length },
    { id: 'huge', label: 'Out of League', count: rows.filter((row) => getHardwareFit(row, vramGb).tone === 'out-of-league').length },
  ];
}

function modelMatchesQuickFilter(
  row: ModelRow,
  filter: ModelQuickFilterId,
  score: TestedModelScore | undefined,
  vramGb: number,
) {
  if (filter === 'installed') return row.installed;
  if (filter === 'fits-vram') return modelFitsVram(row, vramGb);
  if (filter === 'scored') return Boolean(score);
  if (filter === 'unscored') return row.installed && !score;
  if (filter === 'huge') return getHardwareFit(row, vramGb).tone === 'out-of-league';
  return true;
}

function modelFitsVram(row: ModelRow, vramGb: number) {
  return getHardwareFit(row, vramGb).recommend;
}

function getHardwareFit(row: Pick<ModelRow, 'params' | 'sizeGb'>, vramGb: number): HardwareFit {
  const sizeGb = row.sizeGb ?? null;
  const paramsB = getParamSortValue(row.params);
  const vramLabel = vramGb > 0 ? formatGb(vramGb) : 'detected VRAM';

  if (!sizeGb) {
    const looksHuge = paramsB >= 32 && (vramGb <= 0 || vramGb < 24);
    return looksHuge
      ? {
        tone: 'out-of-league',
        label: 'Out of league',
        detail: `${row.params} models are too ambitious for ${vramLabel} without a much larger rig.`,
        recommend: false,
      }
      : {
        tone: 'unknown',
        label: 'Check size',
        detail: 'Model size is unknown, so RigMatch will not recommend it until the footprint is known.',
        recommend: false,
      };
  }

  if (vramGb <= 0) {
    return sizeGb <= 4
      ? {
        tone: 'tight',
        label: 'Small pick',
        detail: `${formatGb(sizeGb)} is small enough to consider while VRAM is unknown.`,
        recommend: true,
      }
      : {
        tone: 'unknown',
        label: 'Check VRAM',
        detail: `${formatGb(sizeGb)} needs a known GPU profile before RigMatch recommends it.`,
        recommend: false,
      };
  }

  if (paramsB >= 64 && vramGb < 48) {
    return {
      tone: 'out-of-league',
      label: 'Out of league',
      detail: `${row.params} is out of this rig's league. ${vramLabel} VRAM should stay with smaller contestants.`,
      recommend: false,
    };
  }

  if (paramsB >= 32 && vramGb < 24) {
    return {
      tone: 'out-of-league',
      label: 'Out of league',
      detail: `${row.params} is a heavyweight date for ${vramLabel}. Try a 3B-14B contestant first.`,
      recommend: false,
    };
  }

  const comfortLimit = vramGb * 0.58;
  const goodLimit = vramGb * 0.8;
  const hardLimit = Math.max(1, vramGb * 1.15);

  if (sizeGb <= comfortLimit) {
    return {
      tone: 'sweet-spot',
      label: 'Sweet spot',
      detail: `${formatGb(sizeGb)} leaves comfortable headroom on ${vramLabel}.`,
      recommend: true,
    };
  }

  if (sizeGb <= goodLimit) {
    return {
      tone: 'good',
      label: 'Good fit',
      detail: `${formatGb(sizeGb)} should fit ${vramLabel} with useful headroom.`,
      recommend: true,
    };
  }

  if (sizeGb <= hardLimit) {
    const ramAssist = sizeGb > vramGb;
    return {
      tone: 'tight',
      label: ramAssist ? 'RAM assist' : 'Tight fit',
      detail: ramAssist
        ? `${formatGb(sizeGb)} may spill past ${vramLabel}, but it is close enough for a cautious trial.`
        : `${formatGb(sizeGb)} is close to the limit for ${vramLabel}. Short tests are safer.`,
      recommend: true,
    };
  }

  return {
    tone: 'out-of-league',
    label: 'Out of league',
    detail: `${formatGb(sizeGb)} is too much model for ${vramLabel}. Pick a smaller contestant for this rig.`,
    recommend: false,
  };
}

function sumQueuedGb(rows: ModelRow[], queuedIds: Set<string>) {
  return rows
    .filter((row) => queuedIds.has(row.displayName))
    .reduce((sum, row) => sum + (row.sizeGb || 0), 0);
}

function getSizeRisk(sizeGb: number | null) {
  if (!sizeGb) {
    return {
      tone: 'unknown',
      message: 'Unknown download size. Check before downloading.',
    };
  }

  if (sizeGb >= 12) {
    return {
      tone: 'huge',
      message: `${formatGb(sizeGb)} is a huge model. Several of these can fill a drive quickly.`,
    };
  }

  if (sizeGb >= 7) {
    return {
      tone: 'large',
      message: `${formatGb(sizeGb)} is a large model. Watch cumulative downloads.`,
    };
  }

  if (sizeGb >= 3.5) {
    return {
      tone: 'medium',
      message: `${formatGb(sizeGb)} is a medium model.`,
    };
  }

  return {
    tone: 'small',
    message: `${formatGb(sizeGb)} is relatively light.`,
  };
}

function getShortModelName(model: string) {
  return model.replace(':latest', '').replace(/-instruct/gi, '').slice(0, 12);
}

function formatGb(value: number) {
  if (!Number.isFinite(value)) return '? GB';
  return `${Math.round(value * 10) / 10} GB`;
}

function formatMs(value: number) {
  if (!Number.isFinite(value)) return '? ms';
  if (value >= 1000) return `${Math.round((value / 1000) * 10) / 10}s`;
  return `${Math.round(value)} ms`;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function gradeFor(score: number) {
  if (score >= 95) return 'S';
  if (score >= 88) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 72) return 'B';
  if (score >= 64) return 'C';
  return 'D';
}

function formatLogTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatHistoryTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScoreTimelineNote(score: TestedModelScore) {
  if (score.total >= 90) {
    return `Strong match: ${score.speed}% speed and ${score.sobriety}% answer quality.`;
  }

  if (score.fit < 70) {
    return `Hardware caution: ${score.fit}% computer fit.`;
  }

  if (score.sobriety < 75) {
    return `Needs supervision: ${score.sobriety}% answer quality.`;
  }

  return `Solid contender: ${score.speed}% speed, ${score.fit}% computer fit.`;
}

function formatLogDetails(details: unknown) {
  if (details == null) return '';
  if (typeof details === 'string') return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function formatLogsForClipboard(logs: AppLogEntry[]) {
  return logs
    .map((entry) => {
      const details = formatLogDetails(entry.details);
      return [
        `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`,
        details ? `details:\n${details}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, '');
}

export default App;
