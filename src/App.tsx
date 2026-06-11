import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  BookOpen,
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
  ExternalLink,
  FolderOpen,
  Gauge,
  Heart,
  HelpCircle,
  History,
  Info,
  Lightbulb,
  MessageSquare,
  Network,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
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
  demoCatalog,
  demoHosts,
  demoOllama,
  demoSystem,
} from './sampleData';
import type {
  AppLogEntry,
  BenchmarkResult,
  BenchmarkProgressUpdate,
  BenchmarkPromptResult,
  CatalogModel,
  ModelRow,
  NetworkHost,
  OllamaModel,
  OllamaStatus,
  PullProgressUpdate,
  SystemProfile,
  AutoUpdateStatus,
  OllamaInstallProgress,
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
import rigmatchBrandIcon from './assets/rigmatch-brand-icon.svg';
import robotContestantWall from './assets/robot-contestant-wall.png';
import robotModelTest from './assets/robot-model-test.png';
import robotRigGreenroom from './assets/robot-rig-greenroom.png';
import robotRomanceHero from './assets/robot-romance-hero.png';
import robotScorecardCeremony from './assets/robot-scorecard-ceremony.png';
import robotSpeedDateShow from './assets/robot-speed-date-show.png';
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
type ModelSortKey = 'name' | 'params' | 'size' | 'skill' | 'origin' | 'source' | 'status' | 'score' | 'speed' | 'pulls';
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
  suiteName?: string;
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

function playJingle(type: 'speed-date-complete' | 'new-winner' | 'its-a-match') {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes =
      type === 'speed-date-complete'
        ? [
            { freq: 261.63, start: 0,    dur: 0.08, vol: 0.15 },
            { freq: 329.63, start: 0.09, dur: 0.08, vol: 0.15 },
            { freq: 392.00, start: 0.18, dur: 0.08, vol: 0.15 },
            { freq: 523.25, start: 0.28, dur: 0.30, vol: 0.20 },
            { freq: 659.25, start: 0.34, dur: 0.25, vol: 0.14 },
          ]
        : type === 'new-winner'
        ? [
            { freq: 523.25, start: 0,    dur: 0.09, vol: 0.18 },
            { freq: 659.25, start: 0.11, dur: 0.09, vol: 0.18 },
            { freq: 783.99, start: 0.22, dur: 0.09, vol: 0.18 },
            { freq: 1046.5, start: 0.36, dur: 0.38, vol: 0.20 },
          ]
        : /* its-a-match — romantic ascending arpeggio */ [
            { freq: 261.63, start: 0,    dur: 0.14, vol: 0.16 }, // C4
            { freq: 329.63, start: 0.16, dur: 0.14, vol: 0.16 }, // E4
            { freq: 392.00, start: 0.32, dur: 0.14, vol: 0.16 }, // G4
            { freq: 523.25, start: 0.48, dur: 0.22, vol: 0.20 }, // C5
            { freq: 659.25, start: 0.55, dur: 0.20, vol: 0.16 }, // E5
            { freq: 783.99, start: 0.62, dur: 0.20, vol: 0.14 }, // G5
            { freq: 1046.5, start: 0.72, dur: 0.70, vol: 0.22 }, // C6
            { freq: 783.99, start: 0.80, dur: 0.55, vol: 0.12 }, // G5 harmony
            { freq: 659.25, start: 0.90, dur: 0.45, vol: 0.10 }, // E5 tail
          ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(note.vol, now + note.start + 0.012);
      gain.gain.linearRampToValueAtTime(0, now + note.start + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.05);
    }
    const totalDur = Math.max(...notes.map((n) => n.start + n.dur));
    window.setTimeout(() => void ctx.close(), (totalDur + 0.3) * 1000);
  } catch {
    // AudioContext unavailable
  }
}

const navItems: NavItem[] = [
  { id: 'models', label: 'Models', description: 'Browse, test, compare', icon: Boxes },
  { id: 'speedDate', label: 'Comparison', description: 'Ranked results & details', icon: Trophy },
  { id: 'history', label: 'Scorecards', description: 'Test rankings', icon: History },
  { id: 'agent', label: 'Top Pick', description: 'Best match profile', icon: Bot },
  { id: 'lan', label: 'Your Rig', description: 'Hardware & Ollama', icon: Network },
  { id: 'settings', label: 'Settings', description: 'Theme and app prefs', icon: Settings },
  { id: 'about', label: 'About', description: 'Version and support', icon: Info },
];

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/daveeuson';
const AMAZON_AFFILIATE_TAG = 'daveeuson01-20';
const APP_VERSION = '0.1.6';
const GITHUB_ISSUES_URL = 'https://github.com/DaveEuson/RigMatch.AI/issues/new';
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
    version: '0.1.6',
    label: 'Release Safety & Download Consent',
    date: 'Current build',
    notes: [
      'Added third-party model notices in Settings and About for Ollama/Gemma model terms.',
      'Bulk Download All now requires an explicit third-party model terms acknowledgement before queueing pulls.',
      'Added a bottom download status window for active Ollama pulls and queued model downloads.',
      'Top Match now includes a Use this model action in the top deck.',
      'System resource meters are compacted so CPU, RAM, VRAM, and GPU fit the header row.',
      'Default desktop window now opens wider to give the header, lineup, and download dock more room.',
      'Added a repo-level THIRD_PARTY_MODELS.md release checklist.',
    ],
  },
  {
    version: '0.1.5',
    label: 'Ollama Parity Benchmarks',
    date: 'June 2026',
    notes: [
      'Benchmark timing now uses an unscored Warm-up Period before measuring Ollama parity requests.',
      'Scored prompts now use stream:false, keep_alive, deterministic options, and Ollama official timing fields.',
      'Speed score now comes from Ollama official eval_count / eval_duration metrics.',
      'Truncated Ollama runs now affect stability instead of being treated as clean finishes.',
      'Closing RigMatch now warns about Ollama model storage and can delete unscored or low-scored models.',
      'Added local speed comparison diagnostics for beta tester reports.',
    ],
  },
  {
    version: '0.1.4',
    label: 'Speed & Popularity in the Table',
    date: 'June 2026',
    notes: [
      'New Speed column in the model table — shows tok/s for benchmarked models, pull count otherwise.',
      'Speed column is sortable: click the header to rank by real benchmark speed.',
      'Pull counts (popularity) now visible at a glance for every model with Ollama library data.',
    ],
  },
  {
    version: '0.1.3',
    label: 'Smarter Benchmarks & Scoring',
    date: 'June 2026',
    notes: [
      'Benchmark now streams tokens live — no more frozen "Asking now" during generation.',
      'Added num_ctx cap so large-context models (Gemma4, Qwen3) don\'t blow out VRAM.',
      'Increased max response length so models can finish answering.',
      'Fixed answer-quality scoring to catch more natural refusal phrasing.',
      'ScoreBars now shows real Avg Response Time and First Token latency in ms/s.',
      'Bottleneck explainer: Judge Card now flags CPU-only mode, VRAM overflow, slow drive, GPU not active.',
      'Out-of-league models now show amber warning instead of being blocked — test anyway at your own risk.',
      'Section flow: View Scorecards → after Speed Dating; Top Pick → in Scorecards header.',
      'Stop Run button in single test panel now actually stops the run.',
      'Fixed model size scoring for 12b, 27b, 9b and other missing sizes.',
      'In-app Ollama installer for Windows and Mac.',
      'Live VRAM used and GPU % in the system header.',
    ],
  },
  {
    version: '0.1.2',
    label: 'Stability & Security',
    date: 'June 2026',
    notes: [
      'Download cancel now immediately aborts the active Ollama pull, not just the queue.',
      'Chat timeouts and failures now surface in the activity ticker.',
      'Clearing app data now confirms disk write before resetting UI state.',
      'Fixed catalog double-fetch race when clicking Refresh rapidly.',
      'Fixed stale model selection crash when a model is removed from Ollama.',
      'Ollama update check now times out after 5 seconds instead of hanging.',
      'Hardened chat message sanitization against control-character injection.',
    ],
  },
  {
    version: '0.1.1',
    label: 'Beta Hardening',
    date: 'June 2026',
    notes: [
      'Bug report button, markdown chat rendering, VRAM header, sticky profile tabs, and lineup banner.',
      'UI polish: single-row tabs, Top Pick hero card, roster X buttons, avatar glow.',
      'Stability and hardening improvements across the board.',
    ],
  },
  {
    version: '0.1.0',
    label: 'Local Matchmaker Preview',
    date: 'June 2026',
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
  chatMessagesByModel: Record<string, ChatMessage[]>;
  chatMessages?: ChatMessage[]; // kept for migrating old saves
  selectedModel?: string;
  savedAt: string;
};

const USE_CASE_CARDS: Array<{ icon: LucideIcon; title: string; description: string; prompt: string }> = [
  {
    icon: PenLine,
    title: 'Writing',
    description: 'Draft emails, letters, summaries, and blog posts',
    prompt: 'Help me write a short professional email to a client explaining that their project delivery will be delayed by one week.',
  },
  {
    icon: Code2,
    title: 'Coding',
    description: 'Explain code, fix bugs, write functions',
    prompt: 'Explain what this Python function does, then suggest how to make it faster:\n\ndef find_dupes(items):\n    seen = []\n    dupes = []\n    for item in items:\n        if item in seen:\n            dupes.append(item)\n        else:\n            seen.append(item)\n    return dupes',
  },
  {
    icon: BookOpen,
    title: 'Research',
    description: 'Summarize topics, explain concepts, answer questions',
    prompt: "Explain how large language models work in plain English, as if you're talking to someone who has never studied AI.",
  },
  {
    icon: ShieldCheck,
    title: 'Privacy',
    description: "Ask anything you wouldn't want searched online",
    prompt: "I'd like to understand my options for dealing with a difficult situation at work where my manager takes credit for my ideas. What are some approaches I could consider?",
  },
  {
    icon: Lightbulb,
    title: 'Brainstorm',
    description: 'Generate ideas, names, plans, and creative options',
    prompt: "I'm starting a small side project and need a name. It's a tool that helps people track their daily habits and reflect on their progress. Give me 10 name ideas, from professional to playful.",
  },
];

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
  const [isPullCancelRequested, setIsPullCancelRequested] = useState(false);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgressByModel, setPullProgressByModel] = useState<Record<string, PullProgressUpdate>>({});
  const pullQueueCancelRef = useRef(false);
  const stopRunRef = useRef(false);
  const [pendingDeleteModel, setPendingDeleteModel] = useState<ModelRow | null>(null);
  const [listTestResult, setListTestResult] = useState<ListTestResult | null>(savedHistory?.listTestResult ?? null);
  const [modelScores, setModelScores] = useState<Record<string, TestedModelScore>>(() =>
    savedHistory?.modelScores ?? (isDesktopRuntime ? {} : upsertModelScores({}, [demoBenchmark])),
  );
  const [modelNotes, setModelNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('rigmatch:model-notes:v1') ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [scoreTrend, setScoreTrend] = useState<Record<string, number[]>>({});
  const [pendingRunMode, setPendingRunMode] = useState<PendingRunMode | null>(null);
  const [pendingSingleModel, setPendingSingleModel] = useState<string | null>(null);
  const [closeCleanupOpen, setCloseCleanupOpen] = useState(false);
  const [isCloseCleanupDeleting, setIsCloseCleanupDeleting] = useState(false);
  const [closeCleanupMessage, setCloseCleanupMessage] = useState<string | null>(null);
  const [benchmarkQuestionCount, setBenchmarkQuestionCount] = useState<BenchmarkQuestionCount>(10);
  const [benchmarkQuestions, setBenchmarkQuestions] = useState<BenchmarkQuestion[]>(() => getSavedBenchmarkQuestions());
  const [suiteEditorOpen, setSuiteEditorOpen] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [activity, setActivity] = useState('Contestants is your hub: browse models, run tests, manage downloads, and start Speed Dating.');
  const [activeNavId, setActiveNavId] = useState<NavId>('models');
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [logPath, setLogPath] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('release');
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResponse | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<AutoUpdateStatus>({ phase: 'idle' });
  const [ollamaInstallProgress, setOllamaInstallProgress] = useState<OllamaInstallProgress>({ phase: 'idle' });
  const [themeId, setThemeId] = useState<ThemeId>(() => getSavedThemeId());
  const [uiMode, setUiMode] = useState<UiMode>(() => getSavedUiMode());
  const [chatOpen, setChatOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [pendingThirdPartyDownloadRows, setPendingThirdPartyDownloadRows] = useState<ModelRow[] | null>(null);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [pendingScoreClear, setPendingScoreClear] = useState<PendingScoreClear | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(() => !getSavedTutorialSeen());
  const [tutorialStep, setTutorialStep] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatMessagesByModel, setChatMessagesByModel] = useState<Record<string, ChatMessage[]>>(
    savedHistory?.chatMessagesByModel ?? {},
  );
  const chatMessages = chatMessagesByModel[selectedModel] ?? [welcomeChatMessage];

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

  useEffect(() => {
    if (modelRows.length > 0 && !selectedRow) {
      setSelectedModel('qwen2.5:7b');
    }
  }, [modelRows, selectedRow]);

  const canBenchmark = Boolean(selectedRow?.installed && selectedHostCanBenchmark);
  const agentName = getAgentName(selectedModel);
  const shortlistedRows = useMemo(
    () => modelRows.filter((row) => shortlistIds.has(row.displayName)).slice(0, 5),
    [modelRows, shortlistIds],
  );
  const installedRowsForCleanup = useMemo(
    () => modelRows.filter((row) => row.installed),
    [modelRows],
  );
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
        ? ` Model catalog synced from ${catalogResponse.source}.`
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
      setActivity('All saved match scores and test transcripts were cleared. Ollama models stayed installed.');
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
    setShortlistIds((current) => removeSetValues(current, aliases));
    setQueuedModelIds((current) => removeSetValues(current, aliases));

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

  const saveModelNote = useCallback((model: string, note: string) => {
    setModelNotes((current) => {
      const next = { ...current, [model]: note };
      localStorage.setItem('rigmatch:model-notes:v1', JSON.stringify(next));
      return next;
    });
  }, []);

  const startBenchmark = useCallback(async (modelOverride?: string | null, questionsOverride?: BenchmarkQuestion[]) => {
    const modelToTest = modelOverride ?? selectedModel;
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);
    const progressId = createRunProgressId('single');
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
      const result = await agentArcadeApi.runBenchmark({
        model: modelToTest,
        baseUrl: ollama.baseUrl,
        questionCount: count,
        questions,
        progressId,
      });
      setBenchmark(result);
      setBenchmarkByModel((current) => upsertBenchmarkResults(current, [result]));
      setModelScores((current) => upsertModelScores(current, [result], currentSuiteName));
      setScoreTrend((current) => {
        const prev = current[result.model] ?? [];
        return { ...current, [result.model]: [...prev.slice(-9), result.scores.total] };
      });
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

  const requestQuickCheckRow = useCallback((row: ModelRow) => {
    void startBenchmark(row.displayName, QUICK_CHECK_QUESTIONS);
  }, [startBenchmark]);

  const queueModel = useCallback((row: ModelRow) => {
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
  }, [modelRows, ollama.baseUrl, system.gpu.vramGb, system.storage.availableGb]);

  const cancelDownloadQueue = useCallback(() => {
    if (isPullingModels) {
      if (isPullCancelRequested) {
        setActivity('Download queue stop is already requested. Waiting for the current Ollama pull to finish.');
        return;
      }

      pullQueueCancelRef.current = true;
      setIsPullCancelRequested(true);
      void agentArcadeApi.abortPull();
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
          ? `Stopping the download queue after ${pullingModel}. Ollama may finish this pull, but no more queued models will start.`
          : 'Stopping the download queue. No more queued models will start.',
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

  const pullQueuedModels = useCallback(async () => {
    if (queuedRows.length === 0) {
      setActivity('Pick a model to download before starting the queue.');
      return;
    }

    if (!ollama.ready) {
      setActivity('Ollama must be running before RigMatch.AI can download models.');
      return;
    }

    pullQueueCancelRef.current = false;
    setIsPullCancelRequested(false);
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
        setPullingModel(row.displayName);
        setPullProgressByModel((current) => ({
          ...current,
          [row.displayName]: {
            ...(current[row.displayName] ?? createQueuedPullProgress(row.displayName, ollama.baseUrl)),
            id: progressId,
            model: row.displayName,
            baseUrl: ollama.baseUrl,
            phase: 'started',
            status: 'Starting download',
            percent: 0,
            speedBps: 0,
            updatedAt: new Date().toISOString(),
          },
        }));
        setActivity(`Downloading ${row.displayName} into ${selectedHost?.hostname ?? 'this computer'}... This can take a while.`);
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
      setPullingModel(null);
      setIsPullingModels(false);
      setIsPullCancelRequested(false);
      pullQueueCancelRef.current = false;
    }
  }, [ollama.baseUrl, ollama.ready, queuedRows, refreshRig, selectedHost?.hostname]);

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

  const toggleShortlist = useCallback((row: ModelRow) => {
    const hardwareFit = getHardwareFit(row, system.gpu.vramGb);

    setShortlistIds((current) => {
      const next = new Set(current);
      if (next.has(row.displayName)) {
        next.delete(row.displayName);
        setActivity(`${row.displayName} removed from the Speed Dating lineup.`);
        return next;
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
    const missingDownloadCount = shortlistedRows.filter((row) => !row.installed).length;
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);

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
        setModelScores((current) => upsertModelScores(current, [result], currentSuiteName));
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
          .sort((a, b) => b.total - a.total),
      });
      setActivity(`Best match: ${winner.model} scored ${winner.scores.total} for this setup.`);
      playJingle('speed-date-complete');
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
    const chatModel = selectedModel;
    setChatMessagesByModel((prev) => ({
      ...prev,
      [chatModel]: [...(prev[chatModel] ?? [welcomeChatMessage]), userMessage],
    }));
    setChatInput('');

    try {
      const response = await agentArcadeApi.sendChat({
        model: chatModel,
        message,
        baseUrl: ollama.baseUrl,
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
  }, [chatInput, ollama.baseUrl, selectedModel]);

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
      chatMessagesByModel,
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
    if (queuedRows.length > 0 && !isPullingModels && ollama.ready) {
      void pullQueuedModels();
    }
  }, [isPullingModels, ollama.ready, pullQueuedModels, queuedRows.length]);

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

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => item.id !== 'agent' || scoredModelCount > 0),
    [scoredModelCount],
  );

  return (
    <div className="app-shell" data-theme={themeId} data-ui-mode={uiMode}>
      <TopDeck isScanning={isScanningRig} onScan={refreshRig}
        system={system}
        ollama={ollama}
        topPick={topRigPick}
        onUseTopPick={(model) => {
          setSelectedModel(model);
          setChosenModel(model);
        }}
      />

      <SideMenu
        items={visibleNavItems}
        ollamaReady={ollama.ready}
        modelCount={modelRows.length}
        shortlistCount={shortlistedRows.length}
        isRunning={isBenchmarking || isListTesting}
        activeId={activeNavId}
        scoredCount={scoredModelCount}
        topPick={topRigPick}
        onSelect={selectNav}
        onOpenTutorial={() => { setTutorialOpen(true); setTutorialStep(0); }}
        onOpenSupport={() => setSupportModalOpen(true)}
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
            isDeletingModel={isDeletingModel}
            pullingModel={pullingModel}
            listTestResult={listTestResult}
            runProgress={runProgress}
            questionCount={benchmarkQuestionCount}
            shortlistedCount={shortlistedRows.length}
            onSelect={setSelectedModel}
            onScoreModel={requestBenchmarkRow}
            onDeleteModel={requestDeleteModel}
            onQueueModel={queueModel}
            onPullQueued={pullQueuedModels}
            onCancelQueue={cancelDownloadQueue}
            onToggleShortlist={toggleShortlist}
            onOpenSuiteEditor={() => setSuiteEditorOpen(true)}
            onOpenSpeedDate={() => selectNav('speedDate')}
            onOpenTopPick={() => selectNav('agent')}
            onRefresh={refreshRig}
            onOpenModelChat={(model) => { setSelectedModel(model); setChatOpen(true); }}
            modelNotes={modelNotes}
            onSaveModelNote={saveModelNote}
            scoreTrend={scoreTrend}
            onQuickCheck={requestQuickCheckRow}
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
            onStop={() => { stopRunRef.current = true; }}
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
            onRunTest={() => { void startBenchmark(); }}
            onEditQuestions={() => setSuiteEditorOpen(true)}
            onTalkWithPrompt={(prompt) => { setChatInput(prompt); setChatOpen(true); }}
          />
        )}
        {(activeNavId === 'history' || activeNavId === 'settings' || activeNavId === 'about') && (
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

      <Ticker
        activity={activity}
        isDesktopRuntime={isDesktopRuntime}
        topPick={topRigPick}
        queuedRows={queuedRows}
        pullProgressByModel={pullProgressByModel}
        isPulling={isPullingModels}
        pullingModel={pullingModel}
        isPullCancelRequested={isPullCancelRequested}
        onCancelQueue={cancelDownloadQueue}
        onOpenDownloads={() => selectNav('models')}
        onOpenChat={async () => {
          if (isDesktopRuntime) {
            const result = await agentArcadeApi.openChatApp();
            if (!result?.ok) alert('RigMatch Chat not found.\n\nBuild it with: cd rigmatch-chat && npx tauri build');
          } else {
            setChatOpen(true);
          }
        }}
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

      {runProgress?.phase === 'running' && (
        <LiveFlirtSpotlight progress={runProgress} host={selectedHost} onStop={() => { stopRunRef.current = true; }} />
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
      {closeCleanupOpen && (
        <CloseCleanupModal
          installedRows={installedRowsForCleanup}
          unscoredRows={unscoredRowsForCleanup}
          lowScoredRows={lowScoredRowsForCleanup}
          isDeleting={isCloseCleanupDeleting}
          message={closeCleanupMessage}
          onDeleteUnscored={() => { void deleteRowsThenClose(unscoredRowsForCleanup, 'unscored'); }}
          onDeleteLowScored={() => { void deleteRowsThenClose(lowScoredRowsForCleanup, 'low-scored'); }}
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

      {!tutorialOpen && (
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
          onStepChange={setTutorialStep}
          onClose={closeTutorial}
          onSelectNav={selectNav}
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
  topPick,
  onUseTopPick,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  isScanning: boolean;
  onScan: () => void;
  topPick?: RigPick | null;
  onUseTopPick: (model: string) => void;
}) {
  const gpuLabel = system.gpu.isUnifiedMemory
    ? `${system.gpu.model} · Unified Memory`
    : `${system.gpu.model}${system.gpu.vramGb ? ` ${system.gpu.vramGb}GB` : ''}`;
  const statusTitle = ollama.ready ? 'Local Ollama Ready' : 'Ollama Not Found';
  const statusDetail = ollama.ready
    ? `${ollama.models.length} installed model${ollama.models.length === 1 ? '' : 's'} visible.`
    : 'Install or start Ollama, then check this computer again.';
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
        <MetricTile
          label={system.gpu.isUnifiedMemory ? 'Memory' : 'VRAM'}
          value={
            system.gpu.isUnifiedMemory
              ? `${system.memory.totalGb} GB unified`
              : system.gpu.vramUsedGb != null && system.gpu.vramGb
                ? `${system.gpu.vramUsedGb} / ${system.gpu.vramGb} GB`
                : system.gpu.vramGb
                  ? `${system.gpu.vramGb} GB`
                  : '? GB'
          }
          level={
            system.gpu.vramUsedGb != null && system.gpu.vramGb
              ? (system.gpu.vramUsedGb / system.gpu.vramGb) * 100
              : 0
          }
        />
        {system.gpu.gpuLoadPercent != null && (
          <MetricTile label="GPU" value={`${system.gpu.gpuLoadPercent}%`} level={system.gpu.gpuLoadPercent} />
        )}
      </section>

      <section className="local-status-card" aria-label="Local AI status">
        <div className={ollama.ready ? 'local-status-icon ready' : 'local-status-icon needs-setup'} aria-hidden="true">
          {isScanning ? <RefreshCw className="spin" /> : ollama.ready ? <ShieldCheck /> : <AlertTriangle />}
        </div>
        <div>
          <span>Local AI Status</span>
          <strong className={ollama.ready ? 'status-good' : 'status-bad'}>{statusTitle}</strong>
          <em>{statusDetail}</em>
          <button type="button" className="primary-button compact" onClick={onScan}>
            <ScanLine aria-hidden="true" />
            Check Local
          </button>
        </div>
      </section>

      {topPick ? (
        <section className="top-deck-winner" aria-label="Current best model">
          <Trophy aria-hidden="true" />
          <div className="top-deck-winner-copy">
            <div className="top-deck-winner-head">
              <span>{topPickLabel(topPick.score?.grade)}</span>
              <button
                type="button"
                className="top-deck-use-model-btn"
                onClick={() => onUseTopPick(topPick.row.displayName)}
                title="Set this as your active model"
              >
                Use this model
              </button>
            </div>
            <strong>{topPick.row.displayName}</strong>
            <em>{topPick.score ? `${topPick.score.total} Match · ${topPick.score.grade}` : topPick.fitLabel}</em>
          </div>
        </section>
      ) : (
        <section className="top-deck-winner empty" aria-label="No winner yet">
          <Trophy aria-hidden="true" />
          <div>
            <span>Best Match</span>
            <strong>No tests yet</strong>
            <em>Test a model to crown the winner.</em>
          </div>
        </section>
      )}
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
  onOpenTutorial,
  onOpenSupport,
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
  onOpenTutorial: () => void;
  onOpenSupport: () => void;
}) {
  const navMeta: Record<NavId, string> = {
    lan: ollamaReady ? 'Ready' : 'Setup',
    models: `${modelCount}`,
    speedDate: `${shortlistCount}/5`,
    bench: isRunning ? 'Live' : '1 model',
    agent: topPick?.score ? getResponseEstimate(topPick.score.speed) : (scoredCount > 0 ? 'Ready' : 'Wait'),
    history: scoredCount > 0 ? `${scoredCount}` : 'New',
    settings: 'Prefs',
    about: 'Info',
  };

  return (
    <aside className="side-menu" aria-label="RigMatch.AI menu">
      <button type="button" className="side-menu-title" onClick={onOpenTutorial} title="Re-open the getting started guide" aria-label="Open getting started guide">
        <span>Matchmaker Hub</span>
        <strong>Start with Models</strong>
      </button>
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
      <button
        type="button"
        className="side-menu-donate"
        title="Support RigMatch development"
        onClick={onOpenSupport}
      >
        ☕ Support RigMatch
      </button>
    </aside>
  );
}


function FirstRunTutorial({
  stepIndex,
  installedCount,
  modelCount,
  ollamaReady,
  ollamaVersion,
  onStepChange,
  onClose,
  onSelectNav,
}: {
  stepIndex: number;
  installedCount: number;
  modelCount: number;
  ollamaReady: boolean;
  ollamaVersion: string | null;
  onStepChange: (stepIndex: number) => void;
  onClose: () => void;
  onSelectNav: (id: NavId) => void;
}) {
  const steps: Array<{ round: string; title: string; body: ReactNode; prize: string; navId: NavId }> = [
    {
      round: '👋 Welcome',
      title: 'Find the best local AI for this computer',
      body: (
        <div className="tutorial-welcome-screen">
          <p className="tutorial-intro-lead">
            RigMatch tests your installed Ollama models on the same questions, measures speed and answer quality, then recommends the best fit for your hardware.
          </p>
          <div className={`tutorial-status-strip ${ollamaReady ? 'ready' : 'offline'}`}>
            {ollamaReady ? (
              <><CheckCircle aria-hidden="true" /> Ollama ready{ollamaVersion ? ` · v${ollamaVersion}` : ''}{installedCount > 0 ? ` · ${installedCount} installed` : ''}{modelCount > installedCount ? ` · ${modelCount} in library` : ''}</>
            ) : (
              <><AlertCircle aria-hidden="true" /> Ollama not detected — <button type="button" className="inline-link" onClick={() => window.open('https://ollama.ai', '_blank', 'noopener,noreferrer')}>install it free at ollama.ai</button></>
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
              <em>Scorecards rank each model by speed, quality, and fit.</em>
            </div>
          </div>
        </div>
      ),
      prize: 'Everything runs on this computer. No cloud, no account, no subscription.',
      navId: 'models' as NavId,
    },
    {
      round: '🔧 Setup',
      title: ollamaReady ? 'Ollama is running — you\'re set up!' : 'Install Ollama to get started',
      body: ollamaReady ? (
        <div className="tutorial-intro-body">
          <div className="tutorial-ollama-status ready">
            <CheckCircle aria-hidden="true" />
            Ollama detected{ollamaVersion ? ` — v${ollamaVersion}` : ''}
          </div>
          <p className="tutorial-intro-lead">Ollama is your local AI engine — <strong>100% free</strong>, no account, no subscription. It runs AI models directly on this computer without any cloud. RigMatch.AI uses it to benchmark and rank models against your specific hardware.</p>
          <p>You're all set. Hit <strong>Next</strong> to see how the show works.</p>
        </div>
      ) : (
        <div className="tutorial-intro-body">
          <div className="tutorial-ollama-status offline">
            <AlertCircle aria-hidden="true" />
            Ollama not detected
          </div>
          <p className="tutorial-intro-lead">Think of Ollama like a mini version of ChatGPT that runs entirely on your own computer — <strong>totally free</strong>, no account, no subscription, no data leaving your machine.</p>
          <p>It downloads AI models and runs them locally. RigMatch.AI uses it to test each model against your hardware and score how well they actually work on your rig.</p>
          <div className="tutorial-install-steps">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.open('https://ollama.ai', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink aria-hidden="true" />
              Download Ollama free at ollama.ai
            </button>
            <p>After installing, <strong>start Ollama</strong>, then re-open RigMatch.AI. The status above will turn green.</p>
          </div>
        </div>
      ),
      prize: ollamaReady ? 'Engine ready — let\'s meet the contestants.' : 'Install Ollama, start it, then relaunch RigMatch.AI.',
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
              RigMatch.AI helps you find <strong>your</strong> perfect match. And it does it like a <strong>gameshow</strong>. 🎬
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
              <div><strong>The Final Rose</strong><em>Scorecards rank every model by speed, quality, and fit — one walks away as your Top Match.</em></div>
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

function amazonUrl(query: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${AMAZON_AFFILIATE_TAG}`;
}

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
      <p className="upgrade-disclosure">
        Affiliate links — purchases support RigMatch.AI at no extra cost to you.
      </p>
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
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
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
  ollamaInstallProgress: OllamaInstallProgress;
  onStartOllamaInstall: () => void;
  onLaunchOllamaInstaller: (path: string) => void;
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
      ? 'This computer is ready. RigMatch tests local Ollama models on this machine.'
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
          <span>One-time setup</span>
          <strong>Install Ollama to get started</strong>
          <p>
            Ollama is a <strong>free, open-source</strong> program that runs AI models locally.
            {isLinux
              ? ' Run the one-line install command below — it sets everything up automatically.'
              : ' Click below to download and run the installer — it starts Ollama automatically in the background.'}
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
}) {
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
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

  const questionLabels: Record<BenchmarkQuestionCount, string> = {
    10:  '10 — Quick (2–3 min)',
    20:  '20 — Standard (5 min)',
    50:  '50 — Deep (15 min)',
    100: '100 — Full suite (30+ min)',
  };

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
            RigMatch.AI will test <strong>{subject}</strong> with <strong>{totalQuestions}</strong> total question
            {totalQuestions === 1 ? '' : 's'}. This can heavily use CPU, GPU, VRAM, RAM,
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
                  <button type="button" className="run-question-edit-link" onClick={onEditQuestions}>
                    Edit suite ↗
                  </button>
                )}
              </div>
            </div>
            <div className="run-question-options" role="group" aria-label="Questions per model">
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
            disabled={uninstalledContestantCount > 0 && mode === 'speed-date'}
          >
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

function CloseCleanupModal({
  installedRows,
  unscoredRows,
  lowScoredRows,
  isDeleting,
  message,
  onDeleteUnscored,
  onDeleteLowScored,
  onUnderstand,
}: {
  installedRows: ModelRow[];
  unscoredRows: ModelRow[];
  lowScoredRows: ModelRow[];
  isDeleting: boolean;
  message: string | null;
  onDeleteUnscored: () => void;
  onDeleteLowScored: () => void;
  onUnderstand: () => void;
}) {
  const installedGb = sumModelRowGb(installedRows);
  const unscoredGb = sumModelRowGb(unscoredRows);
  const lowScoredGb = sumModelRowGb(lowScoredRows);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal model-cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="close-cleanup-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Before You Close</span>
            <strong id="close-cleanup-title">Unused Ollama models can take up a lot of space</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            RigMatch leaves downloaded Ollama models on this computer so you can test or chat later.
            If you are not using some of them, deleting those models can free meaningful disk space.
          </p>
          <div className="modal-warning-grid model-cleanup-summary">
            <div>
              <span>Installed Models</span>
              <strong>{installedRows.length}</strong>
              <em>{formatGb(installedGb)} estimated on disk.</em>
            </div>
            <div>
              <span>Not Scored</span>
              <strong>{unscoredRows.length}</strong>
              <em>{formatGb(unscoredGb)} that RigMatch has not benchmarked.</em>
            </div>
            <div>
              <span>Scored 80 or Below</span>
              <strong>{lowScoredRows.length}</strong>
              <em>{formatGb(lowScoredGb)} from lower-ranked matches.</em>
            </div>
          </div>
          {message && (
            <div className="run-download-warning model-cleanup-message">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}
        </div>
        <div className="model-cleanup-actions" aria-label="Model cleanup options">
          <button
            type="button"
            className="danger-button compact"
            onClick={onDeleteUnscored}
            disabled={isDeleting || unscoredRows.length === 0}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? 'Deleting...' : `Delete Not Scored (${unscoredRows.length})`}
          </button>
          <button
            type="button"
            className="danger-button compact"
            onClick={onDeleteLowScored}
            disabled={isDeleting || lowScoredRows.length === 0}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? 'Deleting...' : `Delete 80 or Below (${lowScoredRows.length})`}
          </button>
          <button type="button" className="mini-button outline" onClick={onUnderstand} disabled={isDeleting}>
            <Check aria-hidden="true" />
            I Understand
          </button>
        </div>
      </section>
    </div>
  );
}

const SUPPORT_HARDWARE_LINKS = [
  {
    label: 'RTX 4070 Ti GPU',
    desc: '12 GB VRAM — runs 13B models with headroom. Best price-to-VRAM upgrade for most rigs.',
    query: 'RTX 4070 Ti graphics card 12GB',
  },
  {
    label: 'RTX 4090 GPU',
    desc: '24 GB VRAM — the local AI endgame. 70B models in reach. Serious kit for serious models.',
    query: 'RTX 4090 graphics card 24GB',
  },
  {
    label: 'AI-Ready Gaming Desktop',
    desc: 'Pre-built Windows PC with high-VRAM GPU — plug in Ollama and go, no assembly required.',
    query: 'gaming desktop RTX 4070 Ti AI machine learning',
  },
  {
    label: 'Apple Mac Studio M4 Max',
    desc: '36–128 GB unified memory. Runs 30B models silently. Every GB counts for local AI.',
    query: 'Apple Mac Studio M4 Max',
  },
] as const;

function SupportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="support-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
        </button>
        <div className="support-modal-header">
          <span>☕</span>
          <div>
            <h2 id="support-modal-title">Support RigMatch</h2>
            <p>Free to use, forever. If it saved you time hunting the right model, a coffee keeps the lights on.</p>
          </div>
        </div>

        <a
          className="support-coffee-btn"
          href={BUY_ME_A_COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Coffee aria-hidden="true" />
          Buy Me a Coffee
          <ExternalLink aria-hidden="true" className="support-ext-icon" />
        </a>

        <div className="support-divider">
          <span>or level up your rig</span>
        </div>

        <p className="support-hardware-intro">
          More VRAM = more models. These affiliate links cost you nothing extra and send a small cut back to RigMatch development.
        </p>

        <div className="support-hardware-grid">
          {SUPPORT_HARDWARE_LINKS.map((link) => (
            <a
              key={link.label}
              href={`https://www.amazon.com/s?k=${encodeURIComponent(link.query)}&tag=${AMAZON_AFFILIATE_TAG}`}
              target="_blank"
              rel="noopener noreferrer"
              className="support-hardware-card"
              aria-label={`Search for ${link.label} on Amazon`}
            >
              <div className="support-hardware-card-inner">
                <strong>{link.label}</strong>
                <p>{link.desc}</p>
              </div>
              <span className="support-amazon-badge">
                <ShoppingCart aria-hidden="true" />
                Amazon
              </span>
            </a>
          ))}
        </div>

        <p className="support-disclosure">
          Affiliate links — purchases support RigMatch.AI at no extra cost to you.
        </p>
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
              <em>Use the trash button in Contestants to delete downloaded model files.</em>
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

const CONFETTI_PIECES = [
  { x: '8%',  col: '#ff6b9d', delay: '0s',    dur: '2.1s', rot: '15deg',  size: '9px' },
  { x: '17%', col: '#ffd93d', delay: '0.3s',  dur: '2.5s', rot: '-20deg', size: '7px' },
  { x: '25%', col: '#6bcb77', delay: '0.1s',  dur: '1.9s', rot: '40deg',  size: '8px' },
  { x: '33%', col: '#4d96ff', delay: '0.5s',  dur: '2.3s', rot: '-10deg', size: '6px' },
  { x: '42%', col: '#ff6b9d', delay: '0.7s',  dur: '2.0s', rot: '30deg',  size: '10px' },
  { x: '50%', col: '#ffd93d', delay: '0.2s',  dur: '2.6s', rot: '-35deg', size: '7px' },
  { x: '58%', col: '#c77dff', delay: '0.9s',  dur: '1.8s', rot: '20deg',  size: '9px' },
  { x: '66%', col: '#6bcb77', delay: '0.4s',  dur: '2.2s', rot: '-25deg', size: '8px' },
  { x: '74%', col: '#ff6b9d', delay: '0.6s',  dur: '2.4s', rot: '45deg',  size: '6px' },
  { x: '83%', col: '#ffd93d', delay: '0.1s',  dur: '2.0s', rot: '-15deg', size: '10px' },
  { x: '91%', col: '#4d96ff', delay: '0.8s',  dur: '2.7s', rot: '10deg',  size: '7px' },
  { x: '12%', col: '#c77dff', delay: '1.1s',  dur: '2.1s', rot: '-30deg', size: '8px' },
  { x: '38%', col: '#ff6b9d', delay: '1.3s',  dur: '1.9s', rot: '25deg',  size: '9px' },
  { x: '62%', col: '#ffd93d', delay: '1.0s',  dur: '2.3s', rot: '-40deg', size: '6px' },
  { x: '78%', col: '#6bcb77', delay: '1.4s',  dur: '2.5s', rot: '35deg',  size: '7px' },
  { x: '95%', col: '#c77dff', delay: '0.5s',  dur: '2.0s', rot: '-20deg', size: '8px' },
];

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

  useEffect(() => {
    playJingle('its-a-match');
  }, []);

  return (
    <div className="modal-backdrop cruise-backdrop" role="presentation">
      <section className="choice-cruise-modal" role="dialog" aria-modal="true" aria-labelledby="choice-cruise-title">
        <div className="cruise-confetti" aria-hidden="true">
          {CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              className="cruise-confetti-piece"
              style={{
                left: p.x,
                background: p.col,
                animationDelay: p.delay,
                animationDuration: p.dur,
                transform: `rotate(${p.rot})`,
                width: p.size,
                height: p.size,
              } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="cruise-title">
          <div>
            <span>It&apos;s a match</span>
            <strong id="choice-cruise-title">{model}</strong>
            <em>Saved as your Top Match for {hostName}. Your Ollama setup is untouched.</em>
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

        <div className="cruise-what-next">
          <span>Your chosen model is ready — here&apos;s how to use it</span>
          <div className="whats-next-grid">
            <button
              type="button"
              className="whats-next-item whats-next-action"
              onClick={async () => {
                const result = await agentArcadeApi.openChatApp();
                if (!result?.ok) alert('RigMatch Chat companion not found.\n\nDownload it from the Releases page or build it from source:\n  cd rigmatch-chat && npx tauri build');
              }}
            >
              <MessageSquare aria-hidden="true" />
              <div>
                <strong>RigMatch Chat</strong>
                <em>Open RigMatch Chat — your AIM-style local AI messenger. {shortModelName} is already online.</em>
              </div>
            </button>
            <div className="whats-next-item">
              <Terminal aria-hidden="true" />
              <div>
                <strong>Terminal</strong>
                <code>ollama run {model}</code>
              </div>
            </div>
            <div className="whats-next-item">
              <Code2 aria-hidden="true" />
              <div>
                <strong>VS Code (Continue.dev)</strong>
                <em>Install the Continue extension, then select {shortModelName} as your Autocomplete or Chat model. No API key needed.</em>
              </div>
            </div>
            <div className="whats-next-item">
              <ExternalLink aria-hidden="true" />
              <div>
                <strong>Open WebUI</strong>
                <em>A full ChatGPT-style browser interface. Run it with Docker and it auto-connects to Ollama at localhost:11434.</em>
              </div>
            </div>
            <div className="whats-next-item">
              <Code2 aria-hidden="true" />
              <div>
                <strong>Python / JavaScript</strong>
                <code>{'import ollama\nollama.chat("' + model + '",\n  [{"role":"user","content":"Hi"}])'}</code>
              </div>
            </div>
            <div className="whats-next-item">
              <ExternalLink aria-hidden="true" />
              <div>
                <strong>Any app via REST</strong>
                <em>Anything that speaks OpenAI format works. Point it at <code>localhost:11434/v1</code> with no API key.</em>
              </div>
            </div>
            <a
              className="whats-next-item whats-next-action whats-next-support"
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Coffee aria-hidden="true" />
              <div>
                <strong>Support RigMatch</strong>
                <em>Free to use, donationware. If it saved you time, a coffee keeps it going.</em>
              </div>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

const SCORE_WEIGHTS = [
  { label: 'Quality', pct: 34, detail: 'Average per-prompt answer quality score (0–100). Measured by rule-based heuristics: does JSON parse? Does the truth-trap get a humble answer? Does the format match? No cloud AI judge — entirely local.' },
  { label: 'Speed', pct: 32, detail: 'Tokens/sec on your hardware × 1.5, plus a bonus for responses under ~6 s. This reflects your machine, not some cloud baseline.' },
  { label: 'Reliability', pct: 18, detail: 'Percentage of prompts that returned a non-empty response. A model that crashes or stalls hurts here.' },
  { label: 'Computer Fit', pct: 16, detail: 'How well the model size matches a typical home rig. Tiny 1–3B models score highest (96); 70B+ models score lowest (38) unless you have 48 GB+ VRAM.' },
];

const GRADE_ROWS = [
  { grade: 'S', range: '95–100' },
  { grade: 'A', range: '88–94' },
  { grade: 'B+', range: '80–87' },
  { grade: 'B', range: '72–79' },
  { grade: 'C', range: '64–71' },
  { grade: 'D', range: '0–63' },
];

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
  { label: 'Gemma 4 license', href: 'https://ai.google.dev/gemma/apache_2' },
] as const;

function ThirdPartyModelNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'third-party-model-notice compact' : 'third-party-model-notice'} aria-label="Third-party model notice">
      <div>
        <span>Third-party model notice</span>
        <strong>Models have their own terms</strong>
        <em>
          RigMatch benchmarks models through the user's Ollama setup. It does not bundle model weights, sell model access,
          or claim endorsement from model providers.
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
  const Icon = panel === 'history' ? History : panel === 'settings' ? Settings : Info;
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
              <p>RigMatch runs the same set of prompts across each model on <strong>your actual computer</strong> and combines three signals into a single Match score (0–100).</p>
              <p className="score-explainer-weight">Answer quality matters most. Speed and hardware fit help separate close matches.</p>
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
                  {([['S', 'elite', '95–100'], ['A', 'good', '80–94'], ['B', 'good', '65–79'], ['C', 'ok', '50–64'], ['D', 'low', '0–49']] as const).map(([grade, tone, range]) => (
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
            <em>{topRankedScore ? `${topRankedScore.total} total · ${topRankedScore.grade}` : 'Run a test to save the next scorecard.'}</em>
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
                      {pick.score.total} · {pick.score.grade}
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
                      <span>{score.model}</span>
                      <em>{score.speed} spd · {score.sobriety} sobriety · {score.fit} fit · {getResponseEstimate(score.speed)}</em>
                    </div>
                    <strong className={`score-row-grade ${getScoreTone(score.total)}`}>
                      {isTied && <span className="tie-badge">TIED</span>}
                      {score.total} · {score.grade}
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
            <strong>{isDesktopRuntime ? 'Desktop' : 'Preview mode'}</strong>
            <em>{system.os.distro} · {system.arch}</em>
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
            <em>Local models run entirely on this machine — no data leaves. Models tagged ☁ Cloud run on remote servers.</em>
          </div>
          <ThirdPartyModelNotice compact />

          <button type="button" className="primary-button compact" onClick={onOpenSetupGuide}>
            <ExternalLink aria-hidden="true" />
            Setup Guide
          </button>
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
          <ThirdPartyModelNotice />
          <ReleaseNotes />

          <div className="utility-stat">
            <span>Mode</span>
            <strong>Donationware</strong>
            <em>Free to use. If RigMatch saved you time, a coffee helps keep it going.</em>
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
                onClick={() => void navigator.clipboard.writeText(buildDiagnosticsText(system, ollama, logPath))}
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
        </div>
      )}
    </section>
  );
}

function UpdateCenter({
  channel,
  result,
  isChecking,
  autoUpdateStatus,
  onChannelChange,
  onCheck,
  onOpenPage,
  onDownload,
  onInstall,
}: {
  channel: UpdateChannel;
  result: UpdateCheckResponse | null;
  isChecking: boolean;
  autoUpdateStatus: AutoUpdateStatus;
  onChannelChange: (channel: UpdateChannel) => void;
  onCheck: () => void;
  onOpenPage: () => void;
  onDownload: () => void;
  onInstall: () => void;
}) {
  const status = result?.status ?? 'unknown';
  const statusLabel = getUpdateStatusLabel(result, isChecking);
  const channelLabel = getUpdateChannelLabel(channel);
  const au = autoUpdateStatus;

  return (
    <section className={`update-center ${status}`} aria-label="RigMatch update center">
      <div className="update-center-head">
        <div>
          <span>Upgrade Center</span>
          <strong>{statusLabel}</strong>
          <em>Choose stable releases or nightly builds, then check what RigMatch can download.</em>
        </div>
        <div className="update-actions">
          <button type="button" className="mini-button outline" onClick={onCheck} disabled={isChecking || au.phase === 'downloading'}>
            <RefreshCw className={isChecking ? 'spin' : ''} aria-hidden="true" />
            {isChecking ? 'Checking' : 'Check'}
          </button>
          {au.phase === 'downloaded' ? (
            <button type="button" className="primary-button compact" onClick={onInstall}>
              <Download aria-hidden="true" />
              Install &amp; Restart
            </button>
          ) : au.phase === 'available' ? (
            <button type="button" className="primary-button compact" onClick={onDownload}>
              <Download aria-hidden="true" />
              Download v{au.version}
            </button>
          ) : au.phase === 'downloading' ? (
            <button type="button" className="primary-button compact" disabled>
              <RefreshCw className="spin" aria-hidden="true" />
              {au.percent ?? 0}%
            </button>
          ) : (
            <button type="button" className="primary-button compact" onClick={onOpenPage}>
              <Download aria-hidden="true" />
              View Downloads
            </button>
          )}
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
          <span>Stable build</span>
          <em>Best for normal users.</em>
        </button>
        <button
          type="button"
          className={channel === 'nightly' ? 'active' : ''}
          onClick={() => onChannelChange('nightly')}
          aria-pressed={channel === 'nightly'}
        >
          <strong>Nightly</strong>
          <span>Experimental build</span>
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

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <img src={rigmatchBrandIcon} alt="" draggable={false} />
    </div>
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
  isDeletingModel,
  pullingModel,
  shortlistedCount,
  onSelect,
  onScoreModel,
  onDeleteModel,
  onQueueModel,
  onPullQueued,
  onCancelQueue,
  onToggleShortlist,
  onOpenSpeedDate,
  onOpenTopPick,
  onRefresh,
  onOpenModelChat,
  modelNotes,
  onSaveModelNote,
  scoreTrend,
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
  isDeletingModel: boolean;
  pullingModel: string | null;
  listTestResult: ListTestResult | null;
  runProgress: RunProgress | null;
  questionCount: BenchmarkQuestionCount;
  shortlistedCount: number;
  onSelect: (model: string) => void;
  onScoreModel: (row: ModelRow) => void;
  onDeleteModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onPullQueued: () => void;
  onCancelQueue: () => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSuiteEditor: () => void;
  onOpenSpeedDate: () => void;
  onOpenTopPick: () => void;
  onRefresh: () => void;
  onOpenModelChat: (model: string) => void;
  modelNotes: Record<string, string>;
  onSaveModelNote: (model: string, note: string) => void;
  scoreTrend: Record<string, number[]>;
  onQuickCheck: (row: ModelRow) => void;
}) {
  const [modelQuery, setModelQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<ModelQuickFilterId>('fits-vram');
  const [taskFilter, setTaskFilter] = useState<ModelTaskFilterId | null>(null);
  const [sortKey, setSortKey] = useState<ModelSortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Column widths: Model, Size, Good For, Origin, Status, Match (Actions fills remainder)
  const [colWidths, setColWidths] = useState([165, 68, 92, 100, 90, 72, 80]);
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
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
  // @ts-ignore
  const _rigPick = useMemo(
    () => getRigPick(rows, modelScores, vramGb),
    [modelScores, rows, vramGb],
  );
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
    ? 'Stopping after current'
    : isPulling
      ? 'Downloading now'
      : queuedCount > 0
        ? `${queuedCount} queued · ${formatGb(diskGuard.queuedGb)}`
        : 'No downloads queued';
  const queuePreviewText = visibleQueuePreview.map((row) => row.displayName).join(', ');
  const queueHelperText = isPullCancelRequested
    ? `Finishing ${pullingModel ?? 'the current Ollama pull'}, then stopping the queue.`
    : isPulling
      ? `Pulling ${pullingModel ?? 'the current model'} through Ollama. Stop Queue skips anything not started yet.`
      : queuedCount > 0
        ? `Ready to download ${queuePreviewText || 'queued models'}${hiddenQueueCount > 0 ? ` and ${hiddenQueueCount} more` : ''}.`
        : 'Use Get Model on a contestant to stage a download.';
  const visibleRows = useMemo(() => {
    const filteredRows = rows.filter((row) => {
      const score = getModelScore(row, modelScores);
      const queued = queuedModelIds.has(row.displayName);
      const matchesQuery = !query || getModelSearchText(row, queued, score).includes(query);
      return matchesQuery
        && modelMatchesQuickFilter(row, quickFilter, score, vramGb)
        && (!taskFilter || modelMatchesTask(row, taskFilter));
    });

    return sortModelRows(filteredRows, sortKey, sortDirection, queuedModelIds, modelScores, benchmarkByModel);
  }, [benchmarkByModel, modelScores, query, quickFilter, taskFilter, queuedModelIds, rows, sortDirection, sortKey, vramGb]);
  const modelCountLabel = query || quickFilter !== 'all' || taskFilter ? `${visibleRows.length}/${rows.length} models` : `${rows.length} models`;
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
        title="Models"
        actionLabel="Refresh"
        onAction={onRefresh}
        meta={modelCountLabel}
      />
      <RomanceArtBanner
        image={robotContestantWall}
        className="model-pool-art-banner"
        kicker="Command menu"
        title="Browse, test, and compare AI models"
        body={`${vramSafeCount} models look realistic for ${vramLabel}. Test one model or run Speed Dating from here.`}
      />
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
        <div className="model-task-filters" aria-label="Filter by use case">
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
            <span>Showing {vramSafeCount} rig picks for {vramLabel}, including close fits. Out-of-league models stay offstage unless you show all.</span>
            <button type="button" onClick={() => setQuickFilter('all')}>Show all</button>
          </div>
        )}
      </div>
      {shortlistedCount >= 5 && (
        <div className="lineup-full-banner" role="status">
          <span>⚡ Speed Dating lineup is full — 5/5 contestants selected. Remove one to swap in another.</span>
        </div>
      )}
      <div className="table-wrap model-table">
        <table>
          <colgroup>
            {/* eslint-disable-next-line react/forbid-dom-props */}
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
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
              <SortableModelHeader label="Speed" sortName="speed" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(6, e)} />
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
              const profile = getModelProfile(row.displayName);
              const origin = getModelOrigin(row.displayName);
              const sizeRisk = getSizeRisk(row.sizeGb);
              const statusLabel = getModelStatusLabel(row, queued);
              const score = getModelScore(row, modelScores);
              const rowBenchmark = benchmarkByModel[row.displayName];
              const hardwareFit = getHardwareFit(row, vramGb);
              const platformFit = getPlatformFit(row.displayName, platform);
              const speedDateLineupFullForRow = shortlistedCount >= 5;
              const canChangeSpeedDateSlot = hardwareFit.recommend && (shortlisted || !speedDateLineupFullForRow);
              const speedDateSlotLabel = shortlisted
                ? 'Selected'
                : !hardwareFit.recommend
                  ? 'Too Big'
                  : speedDateLineupFullForRow
                    ? '+ Speed Date'
                    : 'Add to Speed Dating';
              const speedDateSlotTitle = !hardwareFit.recommend
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
                : hardwareFit.recommend
                  ? `Add ${row.displayName} to Speed Dating`
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
                        {row.params && <em className="model-params-sub">{row.params}</em>}
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
                        ? <span className={`fit-pill ${hardwareFit.tone}`}>{hardwareFit.label}</span>
                        : <span className="fit-pill out-of-league">macOS Only</span>
                      }
                    </div>
                  </td>
                  <td title={profile.specialties.join(', ')}>
                    {profile.specialties[0]}
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
                  <td className="speed-cell">
                    {rowBenchmark?.avgTokensPerSecond != null
                      ? <span className="speed-pill tested">{Math.round(rowBenchmark.avgTokensPerSecond)} tok/s</span>
                      : row.pulls != null
                        ? <span className="speed-pill pulls">{formatPullCount(row.pulls)} pulls</span>
                        : <span className="speed-pill empty">—</span>
                    }
                  </td>
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
                          <button
                            type="button"
                            className={`mini-button score-row-button${!hardwareFit.recommend ? ' warn' : ''}`}
                            onClick={() => onScoreModel(row)}
                            disabled={isBenchmarking}
                            title={hardwareFit.recommend ? `Test ${row.displayName} on this computer` : `⚠ Too big for your VRAM — will be slow, test anyway?`}
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
                          className={queued ? 'mini-button queued download-row-button' : `mini-button outline download-row-button${!hardwareFit.recommend ? ' warn' : ''}`}
                          onClick={() => onQueueModel(row)}
                          disabled={!queued && !platformFit.compatible}
                          title={!platformFit.compatible ? platformFit.reason : !hardwareFit.recommend ? `⚠ Too big for your VRAM — download anyway?` : `${queued ? 'Remove from queue' : `Get ${row.displayName}`}: ${row.sizeGb ? formatGb(row.sizeGb) : 'unknown size'}`}
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
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}>
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
                className={isPullCancelRequested ? 'queue-chip stopping' : 'queue-chip active'}
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
              {isPulling ? 'Downloading' : queuedCount > 0 ? 'Start Download' : 'Download'}
            </button>
            {(queuedCount > 0 || isPulling) && (
              <button
                type="button"
                className="mini-button outline queue-cancel-button"
                onClick={onCancelQueue}
                disabled={isPullCancelRequested}
                title={isPulling ? 'Stop after the current Ollama pull finishes' : 'Cancel all queued downloads'}
              >
                <X aria-hidden="true" />
                {isPullCancelRequested ? 'Stopping' : isPulling ? 'Stop Queue' : 'Cancel Queue'}
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
          onScoreModel={onScoreModel}
          onQueueModel={onQueueModel}
          onToggleShortlist={onToggleShortlist}
          onOpenSpeedDate={onOpenSpeedDate}
          modelNotes={modelNotes}
          onSaveModelNote={onSaveModelNote}
          scoreTrend={scoreTrend}
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
}: {
  model: string;
  queued: boolean;
  isActive: boolean;
  isStopping: boolean;
  progress?: PullProgressUpdate;
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
        <strong>{percentLabel}</strong>
      </div>
      <div className="download-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i style={{ width: `${trackPercent}%` }} />
      </div>
      <em>{detailLabel}</em>
    </div>
  );
}

// @ts-ignore
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
            Open Speed Dating
          </button>
          <button type="button" className="mini-button outline" onClick={onOpenSuiteEditor} disabled={isListTesting}>
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
                        <span>Pick a contestant</span>
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

function ScoreRadar({ speed, sobriety, fit }: { speed: number; sobriety: number; fit: number }) {
  const size = 84;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.36;
  const axes = [
    { label: 'Speed', angle: -90, value: speed },
    { label: 'Sobriety', angle: 30, value: sobriety },
    { label: 'Fit', angle: 150, value: fit },
  ];
  const toXY = (angle: number, scale: number) => ({
    x: cx + r * scale * Math.cos((angle * Math.PI) / 180),
    y: cy + r * scale * Math.sin((angle * Math.PI) / 180),
  });
  const polygon = axes.map((a) => { const p = toXY(a.angle, a.value / 100); return `${p.x},${p.y}`; }).join(' ');
  const gridPoly = (s: number) => axes.map((a) => { const p = toXY(a.angle, s); return `${p.x},${p.y}`; }).join(' ');
  return (
    <svg className="score-radar" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {[0.33, 0.66, 1.0].map((s) => <polygon key={s} points={gridPoly(s)} className="radar-grid" />)}
      {axes.map((a) => { const p = toXY(a.angle, 1); return <line key={a.label} x1={cx} y1={cy} x2={p.x} y2={p.y} className="radar-axis" />; })}
      <polygon points={polygon} className="radar-fill" />
      {axes.map((a) => {
        const p = toXY(a.angle, 1.28);
        return <text key={a.label} x={p.x} y={p.y} className="radar-label" textAnchor="middle" dominantBaseline="middle">{a.label}</text>;
      })}
    </svg>
  );
}

function ScoreSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 72, h = 24;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="score-sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} className="sparkline-line" fill="none" />
      {(() => { const last = values[values.length - 1]; const lx = w; const ly = h - ((last - min) / range) * (h - 4) - 2; return <circle cx={lx} cy={ly} r="2.5" className="sparkline-dot" />; })()}
    </svg>
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
  onToggleShortlist,
  onOpenSpeedDate,
  modelNotes,
  onSaveModelNote,
  scoreTrend,
  onQuickCheck,
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
  onScoreModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSpeedDate: () => void;
  modelNotes: Record<string, string>;
  onSaveModelNote: (model: string, note: string) => void;
  scoreTrend: Record<string, number[]>;
  onQuickCheck: (row: ModelRow) => void;
}) {
  const [noteValue, setNoteValue] = useState('');

  useEffect(() => {
    setNoteValue(row ? (modelNotes[row.displayName] ?? '') : '');
  }, [row?.displayName]);

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
            <div><span>Speed</span><strong>{score.speed}</strong></div>
            <div><span>Sobriety</span><strong>{score.sobriety}</strong></div>
            <div><span>Fit</span><strong>{score.fit}</strong></div>
            {trend.length >= 2 && (
              <div className="contestant-sparkline-cell">
                <span>Trend</span>
                <ScoreSparkline values={trend} />
              </div>
            )}
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
              title={!hardwareFit.recommend ? '⚠ Too big for your VRAM — will be slow, test anyway?' : undefined}
            >
              <Gauge aria-hidden="true" />
              Test Model
            </button>
          ) : (
            <button
              type="button"
              className={queued ? 'primary-button compact queued' : `primary-button compact${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onQueueModel(row)}
              title={!hardwareFit.recommend && !queued ? '⚠ Too big for your VRAM — download anyway?' : queued ? 'Remove this model from the download queue' : 'Add this model to the download queue'}
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
              title={!hardwareFit.recommend ? '⚠ Too big for your VRAM — quick check anyway?' : 'Run a 3-question sanity check (coding, sobriety, format)'}
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
        </div>
        {showDownloadProgress && (
          <DownloadProgressInline
            model={row.displayName}
            queued={queued}
            isActive={isPulling}
            isStopping={isPullStopping}
            progress={pullProgress}
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
          onChange={(e) => setNoteValue(e.target.value)}
          onBlur={() => onSaveModelNote(row.displayName, noteValue)}
          rows={2}
        />
      </div>
    </section>
  );
}

// @ts-ignore
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

// @ts-ignore
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

function ModelScorePill({ score }: { score?: TestedModelScore }) {
  if (!score) {
    return (
      <span className="score-pill empty" title="Not tested yet. Run a test to score this model on this computer.">
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
                  <em>{result.speed} spd · {result.sobriety} sobriety · {getResponseEstimate(result.speed)}</em>
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
        <span>{score ? `${score.total} Match · ${score.grade}` : 'Not tested yet'}</span>
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
                // Find the best sobriety score for this question across all contestants
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
                        <p className="sbs-answer-text">{prompt.response.trim() || 'No answer returned.'}</p>
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

function PromptStatusPill({ status }: { status?: BenchmarkPromptResult['status'] }) {
  if (!status || status === 'ok') return null;

  const label = status === 'no-response'
    ? 'No response'
    : status === 'truncated'
      ? 'Truncated'
      : 'Failed';

  return <span className={`prompt-status-pill ${status}`}>{label}</span>;
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
}) {
  const activeProfile = getModelProfile(model);
  const matchNotes = getMatchNotes(activeProfile, selectedScore, host);
  const [dismissedModels, setDismissedModels] = useState<Set<string>>(new Set());

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
          <span>{selectedScore ? `Compatibility result · ${selectedScore.grade}` : 'Awaiting a first test'}</span>
          <strong style={{ color: 'var(--text-strong)', fontSize: '20px', lineHeight: 1.1 }}>{agentName}</strong>
          <em style={{ color: 'var(--text)', fontSize: '12px', fontStyle: 'normal' }}>
            {selectedScore ? `${selectedScore.total} Match · ${selectedScore.grade} · ${getResponseEstimate(selectedScore.speed)}` : 'Run a compatibility test to crown the winner.'}
          </em>
          {selectedScore && (
            <div className="top-pick-ribbon-actions" style={{ justifyContent: 'flex-start', marginTop: '6px' }}>
              <button type="button" className="pick-this-one-btn" onClick={onChoose} title="Set as your active model">
                🌹 Use This Model
              </button>
              <button type="button" className="test-again-btn" onClick={onRunTest}>
                <RefreshCw aria-hidden="true" />
                Test Again
              </button>
            </div>
          )}
        </div>
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
          const isActive = row.displayName === selectedModel;

          return (
            <button
              key={row.displayName}
              type="button"
              className={isActive ? 'roster-card active' : 'roster-card'}
              onClick={() => onSelect(row.displayName)}
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
    ? `${score.total} Match score · ${score.grade} chemistry · ${getResponseEstimate(score.speed)}`
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
      value: exactScores ? String(exactScores.total) : score ? String(score.total) : 'N/A',
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
          <em>{score ? `RigMatch scored this model ${score.total} with ${score.grade} chemistry.` : 'No scored compatibility test yet.'}</em>
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
          <span>Test Transcript</span>
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
    { label: 'Last Test', value: score ? formatHistoryTime(score.completedAt) : 'Not tested yet' },
    { label: 'Looking For', value: getCleanHostName(host?.hostname ?? system.hostname) },
    { label: 'Model', value: model },
    { label: 'By', value: origin.organization },
    { label: 'Brains', value: row?.params ?? 'Unknown' },
    { label: 'Body Type', value: profile.archetype },
    { label: 'Size', value: sizeLabel },
    { label: 'VRAM Fit', value: getFootprintFit(sizeGb, system) },
    { label: 'Best At', value: profile.specialties.join(', ') },
    { label: 'Match Score', value: score ? `${score.total} (${score.grade})` : 'Run a test' },
    { label: 'Answer Quality', value: score ? `${score.sobriety}%` : 'Unknown' },
    { label: 'Test Suite', value: score?.suiteName ?? (score ? 'Default Suite v0.1' : 'Not tested yet') },
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
      return 'Wildcard confidence and just enough mystery to justify one compatibility test.';
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

    const selectedModel = typeof parsed.selectedModel === 'string' ? parsed.selectedModel : parsed.benchmark.model;
    return {
      benchmark: parsed.benchmark,
      benchmarkByModel,
      listTestResult: isListTestResult(parsed.listTestResult) ? parsed.listTestResult : null,
      modelScores,
      chatMessagesByModel: normalizeSavedChatMessagesByModel(parsed.chatMessagesByModel, parsed.chatMessages, selectedModel),
      selectedModel,
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

const LEARNING_TIPS: { term: string; tip: string }[] = [
  { term: 'Match Score', tip: 'A 0–100 rating combining speed, quality, reliability, and hardware fit.' },
  { term: 'Speed Dating', tip: 'Test multiple models with the same questions side-by-side to find your best fit.' },
  { term: 'VRAM', tip: "Video RAM on your GPU. Models must fit here to run fast — too big means slow or won't load." },
  { term: 'Rig Picks', tip: 'Models our algorithm recommends specifically for your GPU and hardware.' },
  { term: 'Ollama', tip: 'The local server that downloads and runs AI models privately on your machine.' },
  { term: 'Tokens/s', tip: 'Roughly how many words a model produces per second. Higher = faster responses.' },
  { term: 'Parameters (3B, 7B…)', tip: 'Billions of values the model learned. Bigger = more capable but slower and heavier.' },
  { term: 'Quantization (Q4/Q8)', tip: 'Compression that shrinks model size. Q4 = smaller and faster, Q8 = more accurate.' },
  { term: 'Sobriety', tip: 'Whether a model follows instructions and avoids making things up (hallucinating).' },
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
  onCancelQueue: () => void;
  onOpenDownloads: () => void;
  onOpenChat: () => void;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activity) return;
    setShowActivity(true);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => setShowActivity(false), 5000);
    return () => { if (activityTimerRef.current) clearTimeout(activityTimerRef.current); };
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
  onCancelQueue,
  onOpenDownloads,
}: {
  queuedRows: ModelRow[];
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isPulling: boolean;
  pullingModel: string | null;
  isPullCancelRequested: boolean;
  onCancelQueue: () => void;
  onOpenDownloads: () => void;
}) {
  const visibleProgress = Object.values(pullProgressByModel).filter((progress) => isVisiblePullProgress(progress));
  const activeProgress = pullingModel ? pullProgressByModel[pullingModel] : visibleProgress[0];
  const activeModel = pullingModel ?? activeProgress?.model ?? queuedRows[0]?.displayName ?? null;
  const phase = activeProgress?.phase ?? (activeModel ? 'queued' : 'queued');
  const queuedBehindCount = queuedRows.filter((row) => row.displayName !== activeModel).length;
  const queued = phase === 'queued' || (!isPulling && queuedRows.some((row) => row.displayName === activeModel));
  const percent = getPullProgressPercent(activeProgress, queued);
  const hasMeasuredPercent = typeof activeProgress?.percent === 'number';
  const trackPercent = hasMeasuredPercent || phase === 'complete'
    ? Math.max(3, Math.min(100, percent))
    : queued
      ? 6
      : 28;
  const percentLabel = hasMeasuredPercent || phase === 'complete'
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
      : isPullCancelRequested
        ? 'Stopping download'
        : isPulling
          ? 'Downloading'
          : queuedRows.length > 0
            ? 'Download queued'
            : 'Download status';

  return (
    <section className={`ticker-download-dock ${phase}`} aria-label="Download status">
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
      {(queuedRows.length > 0 || isPulling) && (
        <button
          type="button"
          className="ticker-download-stop"
          onClick={onCancelQueue}
          disabled={isPullCancelRequested}
          title={isPulling ? 'Stop after the current Ollama pull finishes' : 'Cancel all queued downloads'}
        >
          <X aria-hidden="true" />
          {isPullCancelRequested ? 'Stopping' : isPulling ? 'Stop' : 'Cancel'}
        </button>
      )}
    </section>
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
  onStop,
}: {
  progress: RunProgress;
  host?: NetworkHost;
  onStop?: () => void;
}) {
  const modelCounter = progress.total > 1
    ? `model ${progress.completed + 1}/${progress.total}`
    : null;
  const questionCounter = progress.questionTotal
    ? `q ${(progress.questionIndex ?? 0) + 1}/${progress.questionTotal}`
    : null;
  const counterLabel = [modelCounter, questionCounter].filter(Boolean).join(' · ');

  return (
    <aside className="live-flirt-spotlight" aria-label="Live model test animation">
      <div className="live-flirt-head">
        <span>{progress.mode === 'speed-date' ? 'Live Speed Dating' : 'Live Model Test'}</span>
        <strong>{progress.currentModel}</strong>
        {counterLabel && <em>{counterLabel}</em>}
        {onStop && (
          <button type="button" className="mini-button outline stop-run-btn" onClick={onStop} title="Stop after current model finishes">
            Stop
          </button>
        )}
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

function ScoreBars({
  benchmark,
  score,
  active,
}: {
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  active: boolean;
}) {
  const avgTps = benchmark?.avgTokensPerSecond ?? benchmark?.prompts[0]?.tokensPerSecond;
  const firstTokenMs = benchmark?.avgFirstTokenMs ?? benchmark?.prompts[0]?.elapsedMs;
  const avgResponseMs = benchmark?.avgLatencyMs;
  const rows = [
    { label: 'Speed (tok/s)', value: avgTps, max: 140, unit: ' tok/s', raw: avgTps },
    { label: 'Generation Speed', value: score?.speed ?? benchmark?.scores.speed, max: 100, unit: '%' },
    {
      label: 'Avg Response Time',
      value: avgResponseMs,
      max: 30000,
      unit: 'ms',
      display: avgResponseMs != null ? (avgResponseMs >= 1000 ? `${(avgResponseMs / 1000).toFixed(1)}s` : `${avgResponseMs}ms`) : undefined,
    },
    {
      label: 'First Token',
      value: firstTokenMs,
      max: 10000,
      unit: 'ms',
      display: firstTokenMs != null ? (firstTokenMs >= 1000 ? `${(firstTokenMs / 1000).toFixed(1)}s` : `${firstTokenMs}ms`) : undefined,
      invertBar: true,
    },
    { label: 'Answer Quality', value: score?.sobriety ?? benchmark?.scores.sobriety, max: 100, unit: '%' },
  ];
  const hasScore = Boolean(score || benchmark);

  return (
    <div className="score-bars">
      <div className="overall-progress">
        <span>Overall Progress</span>
        <strong>{active ? '42%' : hasScore ? '100%' : 'N/A'}</strong>
        <i style={{ width: active ? '42%' : hasScore ? '100%' : '0%' }} />
      </div>
      {rows.map((row) => {
        const pct = Number.isFinite(row.value) ? Math.min(100, ((row.value ?? 0) / row.max) * 100) : 0;
        const barPct = row.invertBar ? Math.max(0, 100 - pct) : pct;
        const displayVal = row.display ?? (Number.isFinite(row.value) ? `${Math.round(row.value ?? 0)}${row.unit}` : 'N/A');
        return (
          <div className={Number.isFinite(row.value) ? 'bar-row' : 'bar-row empty'} key={row.label}>
            <span>{row.label}</span>
            <div>
              <i style={{ width: `${barPct}%` }} />
            </div>
            <strong>{displayVal}</strong>
          </div>
        );
      })}
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
  if (key.includes('sobriety') || key.includes('reliability') || key.includes('quality')) {
    return 'How well the model follows prompts — instruction discipline, completeness, and avoiding hallucinations.';
  }

  if (key.includes('speed')) {
    return 'How quickly this model responds on the selected computer, including throughput and latency.';
  }

  if (key.includes('compatibility') || key.includes('match')) {
    return 'Overall match score combining speed, reliability, stability, and hardware fit.';
  }

  return 'Score from the latest model test.';
}

function AvatarBust({ model, size, extraClass }: { model: string; size: 'tiny' | 'small' | 'large'; extraClass?: string }) {
  const family = getModelFamily(model);
  const avatarSrc = MODEL_AVATAR_ASSETS[family] ?? modelAvatarGeneric;

  return (
    <span
      className={['avatar-bust', size, `family-${family}`, extraClass].filter(Boolean).join(' ')}
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

function toTestedModelScore(result: BenchmarkResult, suiteName?: string): TestedModelScore {
  return {
    model: result.model,
    total: result.scores.total,
    grade: result.scores.grade,
    speed: result.scores.speed,
    sobriety: result.scores.sobriety,
    fit: result.scores.fit,
    completedAt: result.completedAt,
    suiteName,
  };
}

function upsertModelScores(
  current: Record<string, TestedModelScore>,
  results: BenchmarkResult[],
  suiteName?: string,
) {
  return results.reduce<Record<string, TestedModelScore>>((next, result) => {
    const score = toTestedModelScore(result, suiteName);
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

function scoreToToks(speed: number): string {
  if (speed >= 90) return '~20 tok/s';
  if (speed >= 75) return '~10 tok/s';
  if (speed >= 55) return '~5 tok/s';
  if (speed >= 35) return '~2 tok/s';
  return '<2 tok/s';
}

function buildShareableScorecard(
  ranked: TestedModelScore[],
  taskPicks: TaskPick[],
  system: SystemProfile,
): string {
  const gpu = system.gpu.model ?? 'Unknown GPU';
  const vram = system.gpu.vramGb ? `${system.gpu.vramGb} GB VRAM` : 'no discrete GPU';
  const ram = system.memory.totalGb ? `${Math.round(system.memory.totalGb)} GB RAM` : '';
  const os = system.platform === 'darwin' ? 'macOS' : system.platform === 'win32' ? 'Windows' : 'Linux';
  const rigLine = [gpu, vram, ram, os].filter(Boolean).join(' · ');

  // Markdown table — works natively on Reddit, Discord, GitHub
  const header = '| # | Model | Score | Grade | Speed | Quality | Fit |';
  const divider = '|---|-------|-------|-------|-------|---------|-----|';
  const tableRows = ranked.map((score, i) => {
    const prev = ranked[i - 1];
    const tied = prev !== undefined && prev.total === score.total;
    const rank = tied ? '=' : `${i + 1}`;
    const toks = scoreToToks(score.speed);
    return `| ${rank} | ${score.model} | ${score.total} | **${score.grade}** | ${toks} | ${score.sobriety} | ${score.fit} |`;
  });

  const sections: string[] = [
    `## 🏆 My Local AI Results — RigMatch.AI`,
    '',
    `**Rig:** ${rigLine}`,
    '',
    header,
    divider,
    ...tableRows,
  ];

  if (taskPicks.length > 0) {
    sections.push('', '**Category picks:**');
    for (const p of taskPicks) {
      sections.push(`- **${p.label}:** ${p.model} (${p.score.total} · ${p.score.grade} · ${scoreToToks(p.score.speed)})`);
    }
  }

  sections.push(
    '',
    '---',
    '_Scored with [RigMatch.AI](https://github.com/DaveEuson/RigMatch.AI) — benchmarks your installed Ollama models and finds your best local AI match._',
  );

  return sections.join('\n');
}

function getRankedModelScores(modelScores: Record<string, TestedModelScore>) {
  return Object.values(modelScores)
    .filter((s) => isTestedModelScore(s) && !isCloudModel(s.model))
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      // Tiebreakers: trust (sobriety) → rig fit → speed → alphabetical
      if (right.sobriety !== left.sobriety) return right.sobriety - left.sobriety;
      if (right.fit !== left.fit) return right.fit - left.fit;
      if (right.speed !== left.speed) return right.speed - left.speed;
      return left.model.localeCompare(right.model);
    });
}

function getModelScore(row: ModelRow, modelScores: Record<string, TestedModelScore>) {
  const direct =
    modelScores[row.displayName] ||
    modelScores[row.installedModel?.model ?? ''] ||
    modelScores[row.installedModel?.name ?? ''] ||
    modelScores[`${row.name}:${row.tag}`];
  if (direct) return direct;
  // Fuzzy fallback: Ollama sometimes returns a more specific tag than the catalog name
  // e.g. stored as "qwen2.5:7b" but run returned "qwen2.5:7b-instruct"
  const displayNorm = normalizeModelKey(row.displayName);
  return Object.values(modelScores).find((s) => {
    const sNorm = normalizeModelKey(s.model);
    return sNorm === displayNorm ||
      sNorm.startsWith(displayNorm + ':') ||
      displayNorm.startsWith(sNorm + ':') ||
      sNorm.startsWith(displayNorm + '-') ||
      displayNorm.startsWith(sNorm + '-');
  });
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

function getResponseEstimate(speedScore: number): string {
  if (speedScore >= 90) return '~1s';
  if (speedScore >= 75) return '~3s';
  if (speedScore >= 55) return '~8s';
  if (speedScore >= 35) return '~20s';
  return '30s+';
}

function getResultExplanation(
  model: string,
  profile: ModelProfile,
  score?: TestedModelScore,
  host?: NetworkHost,
  benchmark?: BenchmarkResult | null,
  system?: SystemProfile,
) {
  if (!score) {
    return {
      title: 'No chemistry test yet',
      body: `Run a model test and RigMatch will explain whether ${profile.agentName} is a good fit for ${host?.hostname ?? 'this computer'}.`,
      bottleneck: null as string | null,
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

  // Bottleneck detection
  let bottleneck: string | null = null;
  const vramGb = system?.gpu.vramGb ?? 0;
  const ramGb = system?.memory.totalGb ?? 0;
  const tps = benchmark?.avgTokensPerSecond ?? 0;
  const firstToken = benchmark?.avgFirstTokenMs ?? 0;
  const gpuName = system?.gpu.model ?? '';
  const hasGpu = Boolean(gpuName && gpuName !== 'Unknown' && !gpuName.toLowerCase().includes('integrated'));

  const modelSizeGb = (() => {
    const m = model.match(/([\d.]+)b\b/i);
    if (!m) return 0;
    return parseFloat(m[1]) * 0.7; // rough GB estimate per billion params
  })();

  if (!hasGpu && tps > 0 && tps < 15) {
    bottleneck = 'Running on CPU — no GPU detected. Install CUDA drivers and ensure Ollama is using your GPU (`ollama ps` shows which device is active). Expect 5–20× faster speeds after.';
  } else if (vramGb > 0 && modelSizeGb > 0 && modelSizeGb > vramGb * 0.95) {
    const overflow = Math.round((modelSizeGb - vramGb) * 10) / 10;
    bottleneck = `Model (~${Math.round(modelSizeGb)} GB) exceeds your ${vramGb} GB VRAM by ~${overflow} GB. Ollama spills the overflow to system RAM, which is 5–20× slower. Try a smaller variant or a quantized Q4 build.`;
  } else if (tps > 0 && tps < 10 && hasGpu) {
    bottleneck = `Only ${Math.round(tps)} tok/s despite a GPU — Ollama may not be using it. Run \`ollama ps\` while testing to confirm GPU is active. Updated drivers or a CUDA reinstall often fix this.`;
  } else if (firstToken > 5000) {
    bottleneck = `First token took ${(firstToken / 1000).toFixed(1)}s. Long load time suggests the model is being read from a slow drive or paged from RAM. Moving your Ollama model folder to an SSD helps significantly.`;
  } else if (ramGb > 0 && ramGb < 16 && score.speed < 50) {
    bottleneck = `Low system RAM (${ramGb} GB detected). When VRAM overflows, the system RAM becomes the bottleneck. 32 GB+ makes a noticeable difference for larger models.`;
  } else if (score.sobriety < 50) {
    bottleneck = 'Answer quality is very low — the model may have misunderstood the test prompts or hit the output token limit mid-answer. It may be an instruction-tuned model that needs a system prompt, or it needs a longer context.';
  }

  return {
    title: `${profile.agentName} scored ${score.total} (${score.grade})`,
    body: `${model} is a ${score.grade} match because ${strongestTrait}, scored ${score.speed}% speed, ${score.sobriety}% answer quality, and ${score.fit}% computer fit on ${host?.hostname ?? 'this computer'}. ${caution}`,
    bottleneck,
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
      label: 'Best use',
      value: profile.archetype,
    },
    {
      label: 'Best for',
      value: profile.specialties.slice(0, 2).join(' + '),
    },
    {
      label: 'By',
      value: origin.organization,
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
    .filter((item): item is { row: ModelRow; score: TestedModelScore } =>
      Boolean(item.score) && !isCloudModel(item.row.displayName))
    .sort((left, right) => {
      if (right.score.total !== left.score.total) return right.score.total - left.score.total;
      if (right.score.sobriety !== left.score.sobriety) return right.score.sobriety - left.score.sobriety;
      if (right.score.fit !== left.score.fit) return right.score.fit - left.score.fit;
      if (right.score.speed !== left.score.speed) return right.score.speed - left.score.speed;
      return left.row.displayName.localeCompare(right.row.displayName);
    })[0];

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
      reason: `${installedPick.displayName} is already installed and sized for this rig. Give this contestant the first test.`,
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
  benchmarkByModel: Record<string, BenchmarkResult> = {},
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

    const leftValue = getModelSortValue(left, sortKey, queuedModelIds.has(left.displayName), modelScores, benchmarkByModel);
    const rightValue = getModelSortValue(right, sortKey, queuedModelIds.has(right.displayName), modelScores, benchmarkByModel);

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
  benchmarkByModel: Record<string, BenchmarkResult> = {},
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
    case 'speed':
      return benchmarkByModel[row.displayName]?.avgTokensPerSecond ?? getModelScore(row, modelScores)?.speed ?? -1;
    case 'pulls':
      return row.pulls ?? -1;
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
    case 'speed':
      return 'Speed';
    case 'pulls':
      return 'Popularity';
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

  return [...extras, ...dedupedRows.values()].slice(0, 500);
}

function normalizeModelKey(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}

function isCloudModel(model: string): boolean {
  const lower = (model || '').toLowerCase();
  return lower.includes('-cloud') || lower.endsWith(':cloud') || lower.includes('cloud:');
}

function isEmbeddingModel(model: string): boolean {
  const lower = (model || '').toLowerCase();
  return lower.includes('embed') || lower.includes('minilm') || lower.includes('bge-');
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
  if (cuda.status === 'current') return `CUDA ready (${cuda.toolkitVersion})`;
  if (cuda.status === 'behind') return 'CUDA update available';
  // Driver is present but the developer toolkit (nvcc) isn't installed — models still run fine via the driver
  if (cuda.status === 'toolkit-missing') return 'Driver ready, toolkit optional';
  if (cuda.driverCudaVersion) return `Driver CUDA ${cuda.driverCudaVersion}`;
  return 'Unknown';
}

function getCudaDetail(cuda: SystemProfile['cuda']) {
  const latest = cuda.latestToolkitVersion ? `latest ${cuda.latestToolkitVersion}` : 'latest unknown';
  const driver = cuda.driverCudaVersion ? `driver supports ${cuda.driverCudaVersion}` : 'driver CUDA unknown';

  if (cuda.status === 'not-nvidia') {
    return 'CUDA acceleration applies to NVIDIA GPUs. Models will run on CPU.';
  }

  if (cuda.status === 'current') {
    return `${driver}; ${latest}. Full CUDA acceleration active.`;
  }

  if (cuda.status === 'behind') {
    return `Toolkit ${cuda.toolkitVersion} installed; ${latest} available. Models run fine — update when convenient.`;
  }

  if (cuda.status === 'toolkit-missing') {
    // The CUDA driver is enough for Ollama to use the GPU — the toolkit (nvcc) is only needed for compiling CUDA code
    return `${driver}. Ollama uses the GPU driver directly — models run with full GPU acceleration. The CUDA Toolkit is only needed if you compile CUDA programs.`;
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
    return `${row.displayName} is installed and ready for a compatibility test. ${hardwareFit.detail}`;
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

  if (lower.includes('embed')) {
    return {
      agentName: modelName,
      archetype: 'Embedding specialist',
      specialties: ['embeddings', 'search', 'similarity'],
      hue,
      accentHue,
      variant: 'pilot',
    };
  }

  if (lower.includes('deepseek') && (lower.includes('ocr') || lower.includes('vision') || lower.includes('vl'))) {
    return {
      agentName: modelName,
      archetype: 'Visual analyst',
      specialties: ['image analysis', 'OCR', 'vision tasks'],
      hue: 350,
      accentHue: 212,
      variant: 'chrome',
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

const TASK_CATEGORIES = [
  { id: 'coding',    label: 'Best for coding',    keywords: ['coding', 'math', 'json/tools', 'instructions'] },
  { id: 'writing',   label: 'Best for writing',   keywords: ['writing', 'summaries', 'brainstorming'] },
  { id: 'assistant', label: 'Best assistant',     keywords: ['assistant', 'daily chat', 'general help', 'chat', 'utility'] },
  { id: 'reasoning', label: 'Best for reasoning', keywords: ['reasoning', 'hard prompts', 'logic'] },
  { id: 'tiny',      label: 'Best tiny model',    keywords: ['low memory', 'small rigs', 'quick chat'] },
  { id: 'speed',     label: 'Fastest on this rig', keywords: [] },
] as const;

type TaskCategoryId = typeof TASK_CATEGORIES[number]['id'];
type ModelTaskFilterId = TaskCategoryId | 'uncensored';

const TASK_FILTER_CHIPS: Array<{ id: ModelTaskFilterId; label: string }> = [
  { id: 'coding',     label: 'Coding' },
  { id: 'assistant',  label: 'Chat' },
  { id: 'writing',    label: 'Writing' },
  { id: 'reasoning',  label: 'Reasoning' },
  { id: 'tiny',       label: 'Tiny' },
  { id: 'uncensored', label: 'Uncensored' },
];

function isUncensoredModel(name: string): boolean {
  const lower = (name || '').toLowerCase();
  return lower.includes('uncensored') || lower.includes('abliterated') ||
    lower.includes('dolphin') || lower.includes('nous-hermes') ||
    lower.includes('openhermes') || lower.includes('hermes-3') ||
    lower.includes('hermes-2');
}

function modelMatchesTask(row: ModelRow, task: ModelTaskFilterId): boolean {
  if (task === 'uncensored') return isUncensoredModel(row.displayName);
  const category = TASK_CATEGORIES.find((c) => c.id === task);
  if (!category || category.keywords.length === 0) return true;
  const specialties = getModelProfile(row.displayName).specialties.map((s) => s.toLowerCase());
  return category.keywords.some((kw) => specialties.some((sp) => sp.includes(kw)));
}

type TaskPick = {
  id: TaskCategoryId;
  label: string;
  model: string;
  score: TestedModelScore;
};

function getTaskTopPicks(modelScores: Record<string, TestedModelScore>): TaskPick[] {
  const scored = Object.values(modelScores).filter((s) => !isCloudModel(s.model));
  if (scored.length === 0) return [];

  const picks: TaskPick[] = [];

  for (const category of TASK_CATEGORIES) {
    let best: TestedModelScore | null = null;

    if (category.id === 'speed') {
      best = [...scored].sort((a, b) => b.speed - a.speed)[0] ?? null;
    } else {
      const matching = scored.filter((s) => {
        const specialties = getModelProfile(s.model).specialties.map((x) => x.toLowerCase());
        return category.keywords.some((kw) => specialties.some((sp) => sp.includes(kw)));
      });
      best = matching.length > 0 ? [...matching].sort((a, b) => b.total - a.total)[0] : null;
    }

    if (best) {
      // Avoid duplicate model entries (keep the first matching category)
      if (!picks.some((p) => p.model === best!.model)) {
        picks.push({ id: category.id, label: category.label, model: best.model, score: best });
      }
    }
  }

  return picks;
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
    summary:
      queuedGb === 0
        ? `${formatGb(installedGb)} installed · ${formatGb(freeGb)} free`
        : `+${formatGb(queuedGb)} queued · ${formatGb(availableAfterQueue)} free after`,
    message:
      queuedGb === 0
        ? `${formatGb(installedGb)} used by installed models.`
        : `${formatGb(installedGb)} installed + ${formatGb(queuedGb)} downloading.`,
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

function getPlatformFit(displayName: string, platform: string): { compatible: boolean; reason: string } {
  const lower = displayName.toLowerCase();
  const isMlx = lower.includes('-mlx') || lower.includes(':mlx');
  if (isMlx && platform !== 'darwin') {
    return {
      compatible: false,
      reason: 'MLX models require macOS with Apple Silicon and cannot run on Windows or Linux.',
    };
  }
  return { compatible: true, reason: '' };
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
      detail: `${row.params} is a heavyweight model for ${vramLabel}. Try a 3B-14B contestant first.`,
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
      label: `Good fit · ${formatGb(sizeGb)}`,
      detail: `${formatGb(sizeGb)} should fit ${vramLabel} with useful headroom.`,
      recommend: true,
    };
  }

  if (sizeGb <= hardLimit) {
    const ramAssist = sizeGb > vramGb;
    return {
      tone: 'tight',
      label: ramAssist ? `RAM assist · ${formatGb(sizeGb)}` : `Tight fit · ${formatGb(sizeGb)}`,
      detail: ramAssist
        ? `${formatGb(sizeGb)} may spill past ${vramLabel}, but it is close enough for a cautious trial.`
        : `${formatGb(sizeGb)} is close to the limit for ${vramLabel}. Short tests are safer.`,
      recommend: true,
    };
  }

  return {
    tone: 'out-of-league',
    label: `Out of league · ${formatGb(sizeGb)}`,
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

function getQueueChipModelName(model: string) {
  return model.replace(':latest', '').replace(/-instruct/gi, '');
}

function createQueuedPullProgress(model: string, baseUrl?: string): PullProgressUpdate {
  return {
    id: createRunProgressId('queued-pull'),
    model,
    baseUrl,
    phase: 'queued',
    status: 'Queued',
    percent: 0,
    completedBytes: 0,
    totalBytes: null,
    speedBps: 0,
    updatedAt: new Date().toISOString(),
  };
}

function removePullProgress(
  current: Record<string, PullProgressUpdate>,
  model: string,
) {
  const next = { ...current };
  delete next[model];
  return next;
}

function removePullProgressForModels(
  current: Record<string, PullProgressUpdate>,
  models: Set<string>,
) {
  const next = { ...current };
  models.forEach((model) => {
    delete next[model];
  });
  return next;
}

function isVisiblePullProgress(progress?: PullProgressUpdate) {
  return Boolean(progress && progress.phase !== 'queued');
}

function getPullProgressPercent(progress: PullProgressUpdate | undefined, queued: boolean) {
  if (progress?.phase === 'complete') return 100;
  if (typeof progress?.percent === 'number') return Math.max(0, Math.min(100, progress.percent));
  return queued ? 0 : 0;
}

function getPullProgressStatusLabel(
  model: string,
  phase: PullProgressUpdate['phase'],
  queued: boolean,
  isActive: boolean,
  isStopping: boolean,
  progress?: PullProgressUpdate,
) {
  if (phase === 'failed') return 'Download failed';
  if (phase === 'complete') return 'Download complete';
  if (isStopping) return 'Stopping after current pull';
  if (isActive) return progress?.status || `Downloading ${getQueueChipModelName(model)}`;
  if (queued) return 'Queued for download';
  return progress?.status || 'Waiting for download';
}

function getPullProgressDetailLabel(
  phase: PullProgressUpdate['phase'],
  queued: boolean,
  progress?: PullProgressUpdate,
) {
  if (phase === 'failed') return progress?.error || 'Ollama reported an error.';
  if (phase === 'complete') return '100% complete.';
  if (phase === 'queued') return '0% · waiting for Start Download.';

  const percent = typeof progress?.percent === 'number' ? `${Math.round(progress.percent)}%` : '--%';
  const speed = formatBytesPerSecond(progress?.speedBps);
  const size = progress?.completedBytes && progress?.totalBytes
    ? `${formatBytes(progress.completedBytes)} / ${formatBytes(progress.totalBytes)}`
    : progress?.completedBytes
      ? formatBytes(progress.completedBytes)
      : queued
        ? 'waiting for bytes'
        : 'starting';

  return `${percent} · ${speed} · ${size}`;
}

function formatPullCount(n: number | null | undefined): string {
  if (n == null) return '';
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatBytesPerSecond(value?: number | null) {
  if (!Number.isFinite(value) || !value || value <= 0) return '-- MB/s';
  return `${formatBytes(value)}/s`;
}

function formatBytes(value?: number | null) {
  if (!Number.isFinite(value) || value === null || value === undefined || value < 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let normalized = value;
  let unitIndex = 0;

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024;
    unitIndex += 1;
  }

  const precision = normalized >= 100 || unitIndex === 0 ? 0 : normalized >= 10 ? 1 : 2;
  return `${normalized.toFixed(precision)} ${units[unitIndex]}`;
}

function buildDiagnosticsText(system: SystemProfile, ollama: OllamaStatus, logPath: string): string {
  const lines = [
    `RigMatch.AI v${APP_VERSION}`,
    `OS: ${system.os.distro} ${system.os.release} (${system.platform} ${system.arch})`,
    `CPU: ${system.cpu.brand} · ${system.cpu.physicalCores} cores`,
    `RAM: ${Math.round(system.memory.totalGb)} GB`,
    `GPU: ${system.gpu.model} · ${system.gpu.vramGb} GB VRAM`,
    `Ollama: ${ollama.version ? `v${ollama.version}` : 'not detected'}`,
    `Log: ${logPath || 'unknown'}`,
  ];
  return lines.join('\n');
}

function buildBugReportUrl(system: SystemProfile, ollama: OllamaStatus, logPath: string): string {
  const diag = buildDiagnosticsText(system, ollama, logPath);
  const body = [
    '**Describe the bug**',
    '[What happened?]',
    '',
    '**Steps to reproduce**',
    '1. ',
    '2. ',
    '',
    '**Expected behavior**',
    '[What did you expect?]',
    '',
    '**Diagnostics**',
    '```',
    diag,
    '```',
  ].join('\n');
  const params = new URLSearchParams({
    labels: 'bug',
    title: `Bug Report [v${APP_VERSION}]`,
    body,
  });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}

function formatGb(value: number) {
  if (!Number.isFinite(value)) return '? GB';
  return `${Math.round(value * 10) / 10} GB`;
}

function sumModelRowGb(rows: ModelRow[]) {
  return rows.reduce((sum, row) => sum + (row.sizeGb ?? row.installedModel?.sizeGb ?? 0), 0);
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

function topPickLabel(grade: string | undefined): string {
  if (!grade) return 'Best Tested';
  if (grade.startsWith('S') || grade.startsWith('A')) return 'Top Match';
  if (grade.startsWith('B')) return 'Strong Contender';
  if (grade.startsWith('C')) return 'Best So Far';
  return 'Best Tested';
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

function compareVersionStrings(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function playDoneJingle() {
  try {
    const ctx = new AudioContext();
    const melody: Array<[number, number, number]> = [
      [523.25, 0,    0.15],
      [659.25, 0.14, 0.15],
      [783.99, 0.28, 0.15],
      [1046.5, 0.42, 0.45],
    ];
    for (const [freq, offset, dur] of melody) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  } catch {
    // audio not available
  }
}

export default App;
