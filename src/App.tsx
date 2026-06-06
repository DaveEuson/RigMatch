import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
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
  History,
  Info,
  MessageSquare,
  Network,
  Radar,
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
  CatalogModel,
  ModelRow,
  NetworkHost,
  OllamaModel,
  OllamaStatus,
  ScanResponse,
  SystemProfile,
} from './types';
import './App.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
};

type NavItem = {
  id: NavId;
  label: string;
  icon: LucideIcon;
};

type NavId = 'lan' | 'models' | 'bench' | 'agent' | 'history' | 'settings' | 'about';

type UtilityPanelId = Extract<NavId, 'history' | 'settings' | 'about'>;

type ThemeId = 'lime' | 'blue' | 'magenta' | 'amber' | 'mono';
type PendingRunMode = 'single' | 'speed-date';
type ModelSortKey = 'name' | 'params' | 'size' | 'skill' | 'source' | 'status' | 'score';
type SortDirection = 'asc' | 'desc';
type ModelQuickFilterId = 'all' | 'installed' | 'fits-vram' | 'scored' | 'unscored' | 'huge';

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
  };
};

type ModelProfile = {
  agentName: string;
  archetype: string;
  specialties: string[];
  hue: number;
  accentHue: number;
  variant: 'visor' | 'helmet' | 'chrome' | 'arcade' | 'pilot' | 'nova';
};

const navItems: NavItem[] = [
  { id: 'lan', label: 'Rig Roster', icon: Network },
  { id: 'models', label: 'Match Pool', icon: Boxes },
  { id: 'bench', label: 'Compatibility Test', icon: Gauge },
  { id: 'agent', label: 'Matchmaker', icon: Bot },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'about', label: 'About', icon: Info },
];

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/daveeuson';
const TEST_SUITE_STORAGE_KEY = 'rigmatch:test-suite:v1';

const themeOptions: Array<{
  id: ThemeId;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  { id: 'lime', label: 'Arcade Lime', description: 'Classic cabinet glow', swatches: ['#69ff55', '#7eb8ff', '#ff59c7'] },
  { id: 'blue', label: 'Cyber Blue', description: 'Cooler screen light', swatches: ['#68d7ff', '#9cb6ff', '#ff68c7'] },
  { id: 'magenta', label: 'Neon Pop', description: 'Pink-purple arcade', swatches: ['#ff6bd6', '#8dd8ff', '#ffd15f'] },
  { id: 'amber', label: 'Amber CRT', description: 'Warm terminal mode', swatches: ['#ffc95a', '#74d4ff', '#ff8ccf'] },
  { id: 'mono', label: 'High Contrast', description: 'Less color pressure', swatches: ['#f4f7fb', '#82c8ff', '#ffd86a'] },
];

const demoRemoteHostIds = new Set(demoHosts.filter((host) => !host.isLocal).map((host) => host.id));
const initialHosts = isDesktopRuntime ? [] : demoHosts;
const initialSelectedHostId = initialHosts[0]?.id ?? 'localhost';
const DEFAULT_SHORTLIST_IDS = ['qwen2.5:7b', 'llama3.2:3b', 'mistral:7b', 'gemma3:4b', 'phi3:mini'];
const welcomeChatMessage: ChatMessage = {
  id: 'welcome',
  role: 'agent',
  content: 'I am your matched local agent. Run a compatibility test, then we can talk with the winning model.',
};

function App() {
  const [system, setSystem] = useState<SystemProfile>(demoSystem);
  const [ollama, setOllama] = useState<OllamaStatus>(demoOllama);
  const [catalog, setCatalog] = useState<CatalogModel[]>(demoCatalog.models);
  const [hosts, setHosts] = useState<NetworkHost[]>(initialHosts);
  const [selectedHostId, setSelectedHostId] = useState(initialSelectedHostId);
  const [selectedModel, setSelectedModel] = useState('qwen2.5:7b');
  const [benchmark, setBenchmark] = useState<BenchmarkResult>(demoBenchmark);
  const [queuedModelIds, setQueuedModelIds] = useState<Set<string>>(() => new Set());
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(
    () => new Set(DEFAULT_SHORTLIST_IDS),
  );
  const [isScanningRig, setIsScanningRig] = useState(false);
  const [isScanningLan, setIsScanningLan] = useState(false);
  const [isAddingHost, setIsAddingHost] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [isListTesting, setIsListTesting] = useState(false);
  const [isPullingModels, setIsPullingModels] = useState(false);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pendingDeleteModel, setPendingDeleteModel] = useState<ModelRow | null>(null);
  const [listTestResult, setListTestResult] = useState<ListTestResult | null>(null);
  const [modelScores, setModelScores] = useState<Record<string, TestedModelScore>>(() =>
    isDesktopRuntime ? {} : upsertModelScores({}, [demoBenchmark]),
  );
  const [pendingRunMode, setPendingRunMode] = useState<PendingRunMode | null>(null);
  const [pendingSingleModel, setPendingSingleModel] = useState<string | null>(null);
  const [benchmarkQuestionCount, setBenchmarkQuestionCount] = useState<BenchmarkQuestionCount>(10);
  const [benchmarkQuestions, setBenchmarkQuestions] = useState<BenchmarkQuestion[]>(() => getSavedBenchmarkQuestions());
  const [suiteEditorOpen, setSuiteEditorOpen] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [activity, setActivity] = useState('RigMatch.AI booted. Ready to pair a rig.');
  const [activeNavId, setActiveNavId] = useState<NavId>('lan');
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanelId | null>(null);
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [logPath, setLogPath] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(() => getSavedThemeId());
  const [chatOpen, setChatOpen] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [speedDateOpen, setSpeedDateOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    welcomeChatMessage,
  ]);

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
  const selectedBenchmark = isBenchmarkForModel(benchmark, selectedModel, selectedRow) ? benchmark : null;
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

  const refreshRig = useCallback(async () => {
    setIsScanningRig(true);
    setActivity('Scanning rig, Ollama service, and model catalog...');

    try {
      const [profile, ollamaStatus, catalogResponse] = await Promise.all([
        agentArcadeApi.getSystemProfile(),
        agentArcadeApi.getOllamaStatus(),
        agentArcadeApi.getOllamaCatalog(),
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

      setHosts((current) => {
        const retainedHosts = current.filter(
          (host) => !host.isLocal && host.id !== 'localhost' && (!isDesktopRuntime || !demoRemoteHostIds.has(host.id)),
        );

        return [localHost, ...retainedHosts];
      });
      setSelectedHostId(localHost.id);

      if (ollamaStatus.models.length > 0) {
        setSelectedModel((current) =>
          ollamaStatus.models.some((model) => model.model === current) ? current : ollamaStatus.models[0].model,
        );
      }

      const mode = isDesktopRuntime ? 'desktop bridge' : 'preview fallback';
      const catalogNote = catalogResponse.error ? ` Catalog fallback: ${catalogResponse.error}` : '';
      setActivity(
        isDesktopRuntime
          ? `Rig scan complete via ${mode}.${catalogNote}`
          : `Preview sample data loaded via ${mode}.${catalogNote}`,
      );
    } catch (error) {
      setActivity(`Rig scan failed: ${getErrorMessage(error)}`);
    } finally {
      setIsScanningRig(false);
    }
  }, []);

  const scanLan = useCallback(async () => {
    setIsScanningLan(true);
    setActivity('Sweeping LAN for Ollama hosts on port 11434...');

    try {
      const scan = await agentArcadeApi.scanLan();
      if (scan.hosts.length > 0) {
        setHosts(scan.hosts);
        setSelectedHostId(scan.hosts[0].id);
        const sampleCount = countSampleHosts(scan.hosts);
        const remoteOllamaCount = scan.hosts.filter((host) => !host.isLocal && !host.isDemo && host.discovery !== 'computer').length;
        const computerCount = scan.hosts.filter((host) => !host.isLocal && !host.isDemo && host.discovery === 'computer').length;
        const scanScope = getScanScopeLabel(scan);
        setActivity(
          sampleCount > 0
            ? `LAN preview returned ${sampleCount} sample host${sampleCount === 1 ? '' : 's'}. Desktop scans verify real machines.`
            : remoteOllamaCount > 0
              ? `LAN scan checked ${scanScope} and found ${remoteOllamaCount} remote Ollama host${remoteOllamaCount === 1 ? '' : 's'} plus ${computerCount} computer${computerCount === 1 ? '' : 's'}.`
              : computerCount > 0
                ? `LAN scan checked ${scanScope} and found ${computerCount} computer${computerCount === 1 ? '' : 's'}, but no remote Ollama API answered.`
                : `LAN scan checked ${scanScope}; only this machine answered. Remote Ollama may be bound to localhost or blocked by firewall.`,
        );
      } else {
        setActivity(
          `LAN scan checked ${getScanScopeLabel(scan)}. No Ollama APIs answered on port 11434. Check OLLAMA_HOST and firewall rules on remote rigs.`,
        );
      }
    } catch (error) {
      setActivity(`LAN scan failed: ${getErrorMessage(error)}`);
    } finally {
      setIsScanningLan(false);
    }
  }, []);

  const openOllamaDownload = useCallback(async () => {
    setActivity('Opening Ollama official download page...');

    try {
      await agentArcadeApi.openOllamaDownload();
      setActivity('Ollama download page opened. Install it, then run Scan Rig again.');
    } catch (error) {
      setActivity(`Could not open Ollama download page: ${getErrorMessage(error)}`);
    }
  }, []);

  const openSetupGuide = useCallback(() => {
    setSetupGuideOpen(true);
    setActivity('Ollama setup guide opened. Remote machines need Ollama or the future Runner before testing.');
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
    setUtilityPanel('history');
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

  const requestClearData = useCallback(() => {
    setClearDataOpen(true);
  }, []);

  const confirmClearData = useCallback(async () => {
    try {
      window.localStorage.removeItem(TEST_SUITE_STORAGE_KEY);
      window.localStorage.removeItem('agentArcadeTheme');
      const result = await agentArcadeApi.clearLogs();

      setAppLogs(result.entries);
      setLogPath(result.logPath);
      setBenchmark(demoBenchmark);
      setModelScores({});
      setListTestResult(null);
      setQueuedModelIds(new Set<string>());
      setShortlistIds(new Set(DEFAULT_SHORTLIST_IDS));
      setPendingRunMode(null);
      setPendingSingleModel(null);
      setBenchmarkQuestionCount(10);
      setBenchmarkQuestions([...DEFAULT_BENCHMARK_QUESTIONS]);
      setRunProgress(null);
      setThemeId('lime');
      setChatInput('');
      setChatMessages([welcomeChatMessage]);
      setSpeedDateOpen(false);
      setSuiteEditorOpen(false);
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
    const targetHost = selectedHost?.hostname ?? 'selected rig';

    setIsDeletingModel(true);
    setActivity(`Deleting ${modelName} from ${targetHost}...`);

    try {
      const result = await agentArcadeApi.deleteModel({
        model: modelName,
        baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
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
      setShortlistIds((current) => removeSetValues(current, aliases));
      setQueuedModelIds((current) => removeSetValues(current, aliases));

      if (aliases.includes(selectedModel)) {
        const nextModel = modelRows.find((row) => !aliases.includes(row.displayName) && row.installed)?.displayName
          ?? modelRows.find((row) => !aliases.includes(row.displayName))?.displayName
          ?? 'qwen2.5:7b';
        setSelectedModel(nextModel);
      }

      setPendingDeleteModel(null);
      setActivity(`${result.model} deleted from ${targetHost}. Pull it again if that match deserves a second date.`);
    } catch (error) {
      setActivity(`Model delete failed: ${getErrorMessage(error)}`);
    } finally {
      setIsDeletingModel(false);
    }
  }, [modelRows, ollama.baseUrl, pendingDeleteModel, selectedHost?.baseUrl, selectedHost?.hostname, selectedHostId, selectedModel]);

  const selectNav = useCallback((id: NavId) => {
    setActiveNavId(id);

    if (id === 'history' || id === 'settings' || id === 'about') {
      setUtilityPanel(id);
      if (id === 'history') {
        void loadLogs();
      }
      setActivity(`${getNavLabel(id)} opened.`);
      return;
    }

    setUtilityPanel(null);
    setActivity(`${getNavLabel(id)} selected.`);
  }, [loadLogs]);

  const selectTheme = useCallback((nextThemeId: ThemeId) => {
    setThemeId(nextThemeId);
    setActivity(`${getThemeLabel(nextThemeId)} theme selected.`);
  }, []);

  const addManualHost = useCallback(async () => {
    const address = manualAddress.trim();
    if (!address) {
      setActivity('Enter an IP address or Ollama URL before adding a host.');
      return;
    }

    setIsAddingHost(true);
    setActivity(`Checking ${address} for an Ollama service...`);

    try {
      const host = await agentArcadeApi.addHostByAddress(address);
      setHosts((current) => {
        const withoutDuplicate = current.filter(
          (existing) => existing.id !== host.id && existing.baseUrl !== host.baseUrl && existing.ip !== host.ip,
        );
        return [host, ...withoutDuplicate];
      });
      setSelectedHostId(host.id);
      setManualAddress('');
      setActivity(
        host.isDemo
          ? `${host.hostname} added as sample preview data. Desktop mode verifies real hosts.`
          : host.discovery === 'computer'
            ? `${host.hostname} added as a computer. Ollama is not reachable on port 11434 yet.`
          : `${host.hostname} added to the LAN browser.`,
      );
    } catch (error) {
      setActivity(`Manual host add failed: ${getErrorMessage(error)}`);
    } finally {
      setIsAddingHost(false);
    }
  }, [manualAddress]);

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
    setActivity(`Confirm resource warning before scoring ${model}.`);
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

    if (hostBlocker) {
      setRunProgress({
        mode: 'single',
        phase: 'failed',
        label: 'Compatibility Test',
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
      mode: 'single',
      phase: 'running',
      label: 'Compatibility Test',
      currentModel: modelToTest,
      completed: 0,
      total: 1,
      percent: 12,
      message: `${benchmarkQuestionCount} question suite warming up...`,
    });
    setActivity(`Scoring ${modelToTest} with ${benchmarkQuestionCount} questions for speed, sobriety, and rig chemistry...`);

    try {
      const result = await agentArcadeApi.runBenchmark({
        model: modelToTest,
        baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
        questionCount: benchmarkQuestionCount,
        questions: benchmarkPromptPlan,
      });
      setBenchmark(result);
      setModelScores((current) => upsertModelScores(current, [result]));
      setRunProgress({
        mode: 'single',
        phase: 'complete',
        label: 'Compatibility Test',
        currentModel: result.model,
        completed: 1,
        total: 1,
        percent: 100,
        message: `${result.model} finished with ${result.scores.grade} grade.`,
        lastResult: {
          model: result.model,
          total: result.scores.total,
          grade: result.scores.grade,
        },
      });
      setActivity(`${result.model} finished with ${result.scores.grade} grade and ${result.scores.total} total score.`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      await agentArcadeApi.appendLog({
        level: 'error',
        source: 'renderer',
        message: `Compatibility test failed: ${modelToTest}`,
        details: {
          model: modelToTest,
          rig: selectedHost?.hostname ?? system.hostname,
          baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
          questionCount: benchmarkQuestionCount,
          error: errorMessage,
        },
      }).catch(() => undefined);
      void loadLogs();
      setRunProgress({
        mode: 'single',
        phase: 'failed',
        label: 'Compatibility Test',
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
  }, [modelRows, system.storage.availableGb]);

  const pullQueuedModels = useCallback(async () => {
    if (queuedRows.length === 0) {
      setActivity('Queue a model before pulling it into Ollama.');
      return;
    }

    if (!ollama.ready) {
      setActivity('Ollama must be running before RigMatch.AI can pull models.');
      return;
    }

    setIsPullingModels(true);

    try {
      for (const row of queuedRows) {
        setPullingModel(row.displayName);
        setActivity(`Pulling ${row.displayName} into ${selectedHost?.hostname ?? 'this rig'}... This can take a while.`);
        await agentArcadeApi.pullModel({
          model: row.displayName,
          baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
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
      setActivity(`${queuedRows.length} model${queuedRows.length === 1 ? '' : 's'} pulled. Refreshing rig inventory...`);
      await refreshRig();
    } catch (error) {
      setActivity(`Model pull failed: ${getErrorMessage(error)}`);
    } finally {
      setPullingModel(null);
      setIsPullingModels(false);
    }
  }, [ollama.baseUrl, ollama.ready, queuedRows, refreshRig, selectedHost?.baseUrl, selectedHost?.hostname]);

  const toggleShortlist = useCallback((row: ModelRow) => {
    if (!row.installed) {
      setActivity(`${row.displayName} needs to be installed before it can join a Speed Date.`);
      return;
    }

    setShortlistIds((current) => {
      const next = new Set(current);
      if (next.has(row.displayName)) {
        next.delete(row.displayName);
        setActivity(`${row.displayName} removed from the 5-model Speed Date.`);
        return next;
      }

      if (next.size >= 5) {
        setActivity('Speed Date is full. Remove one model before adding another.');
        return current;
      }

      next.add(row.displayName);
      setActivity(`${row.displayName} added to the 5-model Speed Date.`);
      return next;
    });
  }, []);

  const requestListTest = useCallback(() => {
    const runnableRows = shortlistedRows.filter((row) => row.installed).slice(0, 5);
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);

    if (runnableRows.length < 2) {
      setActivity('Pick at least 2 installed models for Speed Date. Five is the sweet spot.');
      return;
    }

    if (hostBlocker) {
      setActivity(hostBlocker);
      return;
    }

    setPendingSingleModel(null);
    setPendingRunMode('speed-date');
    setActivity(`Confirm resource warning before Speed Dating ${runnableRows.length} models with ${benchmarkQuestionCount} questions each.`);
  }, [benchmarkQuestionCount, ollama, selectedHost, shortlistedRows]);

  const runListTest = useCallback(async () => {
    const runnableRows = shortlistedRows.filter((row) => row.installed).slice(0, 5);
    const hostBlocker = getHostBenchmarkBlocker(selectedHost, ollama);

    if (hostBlocker) {
      setRunProgress({
        mode: 'speed-date',
        phase: 'failed',
        label: 'Speed Date',
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
      mode: 'speed-date',
      phase: 'running',
      label: 'Speed Date',
      currentModel: runnableRows[0]?.displayName ?? 'Waiting',
      completed: 0,
      total: runnableRows.length,
      percent: 0,
      message: `0 of ${runnableRows.length} model candidates tested with ${benchmarkQuestionCount} questions each.`,
    });
    setActivity(`Running Speed Date across ${runnableRows.length} model candidates with ${benchmarkQuestionCount} questions each...`);

    try {
      const results: BenchmarkResult[] = [];
      for (const [index, row] of runnableRows.entries()) {
        setRunProgress((current) => ({
          mode: 'speed-date',
          phase: 'running',
          label: 'Speed Date',
          currentModel: row.displayName,
          completed: index,
          total: runnableRows.length,
          percent: Math.round(((index + 0.25) / runnableRows.length) * 100),
          message: `Testing candidate ${index + 1} of ${runnableRows.length}.`,
          lastResult: current?.lastResult,
        }));
        setActivity(`Speed Date: testing chemistry with ${row.displayName}...`);
        const result = await agentArcadeApi.runBenchmark({
          model: row.displayName,
          baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
          questionCount: benchmarkQuestionCount,
          questions: benchmarkPromptPlan,
        });
        results.push(result);
        setModelScores((current) => upsertModelScores(current, [result]));
        setRunProgress({
          mode: 'speed-date',
          phase: 'running',
          label: 'Speed Date',
          currentModel: runnableRows[index + 1]?.displayName ?? result.model,
          completed: index + 1,
          total: runnableRows.length,
          percent: Math.round(((index + 1) / runnableRows.length) * 100),
          message: `${result.model} scored ${result.scores.total} (${result.scores.grade}).`,
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
      setSelectedModel(winner.model);
      setRunProgress({
        mode: 'speed-date',
        phase: 'complete',
        label: 'Speed Date',
        currentModel: winner.model,
        completed: runnableRows.length,
        total: runnableRows.length,
        percent: 100,
        message: `${winner.model} wins this rig match.`,
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
        message: 'Speed Date failed',
        details: {
          rig: selectedHost?.hostname ?? system.hostname,
          baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
          questionCount: benchmarkQuestionCount,
          candidates: runnableRows.map((row) => row.displayName),
          error: errorMessage,
        },
      }).catch(() => undefined);
      void loadLogs();
      setRunProgress((current) => ({
        mode: 'speed-date',
        phase: 'failed',
        label: 'Speed Date',
        currentModel: current?.currentModel ?? 'Unknown candidate',
        completed: current?.completed ?? 0,
        total: current?.total ?? runnableRows.length,
        percent: current?.percent ?? 0,
        message: errorMessage,
        lastResult: current?.lastResult,
      }));
      setActivity(`Speed Date failed: ${errorMessage}`);
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
    setActivity('Compatibility test cancelled before resources were engaged.');
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
        baseUrl: selectedHost?.baseUrl ?? ollama.baseUrl,
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
  }, [chatInput, ollama.baseUrl, selectedHost?.baseUrl, selectedModel]);

  useEffect(() => {
    void refreshRig();
  }, [refreshRig]);

  useEffect(() => {
    window.localStorage.setItem(TEST_SUITE_STORAGE_KEY, JSON.stringify(benchmarkQuestions));
  }, [benchmarkQuestions]);

  useEffect(() => {
    window.localStorage.setItem('agentArcadeTheme', themeId);
  }, [themeId]);

  return (
    <div className="app-shell" data-theme={themeId}>
      <TopDeck
        system={system}
        ollama={ollama}
        hosts={hosts}
        isScanning={isScanningRig}
        navItems={navItems}
        activeNavId={activeNavId}
        onScan={refreshRig}
        onNavSelect={selectNav}
      />

      <MatchFlowStrip
        hosts={hosts}
        rows={modelRows}
        selectedModel={selectedModel}
        shortlistCount={shortlistedRows.length}
        scoredCount={scoredModelCount}
        ollamaReady={ollama.ready}
        runProgress={runProgress}
      />

      <main className="workbench" aria-label="RigMatch.AI workbench">
        <section className="center-stack" aria-label="Machine and model selection">
          <LanBrowser
            active={activeNavId === 'lan'}
            system={system}
            ollama={ollama}
            hosts={hosts}
            selectedHostId={selectedHostId}
            isScanning={isScanningLan}
            isAddingHost={isAddingHost}
            manualAddress={manualAddress}
            onScan={scanLan}
            onSelect={setSelectedHostId}
            onManualAddressChange={setManualAddress}
            onAddHost={addManualHost}
            onInstallOllama={openOllamaDownload}
            onScanRig={refreshRig}
            onOpenSetupGuide={openSetupGuide}
          />
          <div className="lower-stack">
            <ModelCabinet
              active={activeNavId === 'models'}
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
              onOpenSpeedDate={() => setSpeedDateOpen(true)}
              onRefresh={refreshRig}
            />
            <BenchmarkRun
              active={activeNavId === 'bench'}
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
          </div>
        </section>

        <section className="right-stack" aria-label="Benchmark and selected agent">
          <AgentReveal
            active={activeNavId === 'agent'}
            agentName={agentName}
            model={selectedModel}
            selectedScore={selectedModelScore}
            host={selectedHost}
            rows={modelRows}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            onTalk={() => setChatOpen(true)}
          />
        </section>
      </main>

      <Ticker
        activity={activity}
        benchmark={benchmark}
        hosts={hosts}
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

      {speedDateOpen && (
        <SpeedDateWindow
          shortlistedRows={shortlistedRows}
          listTestResult={listTestResult}
          runProgress={runProgress}
          isListTesting={isListTesting}
          questionCount={benchmarkQuestionCount}
          questionPlan={benchmarkPromptPlan}
          onQuestionCountChange={setBenchmarkQuestionCount}
          onOpenSuiteEditor={() => setSuiteEditorOpen(true)}
          onOpenLogs={openLogsPanel}
          onRemoveCandidate={toggleShortlist}
          onRunListTest={requestListTest}
          onClose={() => setSpeedDateOpen(false)}
        />
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

      {utilityPanel && (
        <UtilityDock
          panel={utilityPanel}
          benchmark={benchmark}
          listTestResult={listTestResult}
          selectedHost={selectedHost}
          selectedModel={selectedModel}
          hosts={hosts}
          ollama={ollama}
          system={system}
          themeId={themeId}
          appLogs={appLogs}
          logPath={logPath}
          isLoadingLogs={isLoadingLogs}
          onThemeChange={selectTheme}
          onRefreshLogs={loadLogs}
          onCopyLogs={copyLogs}
          onClearLogs={clearLogs}
          onOpenLogsFolder={openLogsFolder}
          onClearAllData={requestClearData}
          onClose={() => setUtilityPanel(null)}
          onOpenSetupGuide={() => {
            setUtilityPanel(null);
            openSetupGuide();
          }}
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
    </div>
  );
}

function TopDeck({
  system,
  ollama,
  hosts,
  isScanning,
  navItems,
  activeNavId,
  onScan,
  onNavSelect,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  hosts: NetworkHost[];
  isScanning: boolean;
  navItems: NavItem[];
  activeNavId: NavId;
  onScan: () => void;
  onNavSelect: (id: NavId) => void;
}) {
  const gpuLabel = `${system.gpu.model}${system.gpu.vramGb ? ` ${system.gpu.vramGb}GB` : ''}`;
  const hostCountLabel = getHostCountLabel(hosts);
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
          <p>matchmaker lab v0.1.0</p>
        </div>
        <CompactNav items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
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
        <Bot className="service-bot" aria-hidden="true" />
        <div>
          <span>Ollama Service</span>
          <strong className={ollama.ready ? 'status-good' : 'status-bad'}>
            {ollama.ready ? 'Running' : 'Not Found'}
          </strong>
        </div>
      </section>

      <section className="scan-card" aria-label="Scan status">
        <Radar className={isScanning ? 'radar-spin' : ''} aria-hidden="true" />
        <div>
          <span>Scan Status</span>
          <strong>{hostCountLabel}</strong>
          <button type="button" className="primary-button compact" onClick={onScan}>
            <ScanLine aria-hidden="true" />
            Scan Rig
          </button>
        </div>
      </section>
    </header>
  );
}

function CompactNav({
  items,
  activeId,
  onSelect,
}: {
  items: NavItem[];
  activeId: NavId;
  onSelect: (id: NavId) => void;
}) {
  return (
    <nav className="compact-nav" aria-label="RigMatch.AI navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={item.id === activeId ? 'compact-nav-item active' : 'compact-nav-item'}
            onClick={() => onSelect(item.id)}
            aria-pressed={item.id === activeId}
            aria-label={item.label}
            title={item.label}
          >
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}

function MatchFlowStrip({
  hosts,
  rows,
  selectedModel,
  shortlistCount,
  scoredCount,
  ollamaReady,
  runProgress,
}: {
  hosts: NetworkHost[];
  rows: ModelRow[];
  selectedModel: string;
  shortlistCount: number;
  scoredCount: number;
  ollamaReady: boolean;
  runProgress: RunProgress | null;
}) {
  const activeIndex = hosts.length === 0 || !ollamaReady
    ? 0
    : runProgress?.phase === 'running'
      ? 2
      : scoredCount > 0
        ? 3
        : rows.length > 0
          ? 2
          : 1;
  const steps = [
    {
      label: 'Find Rig',
      detail: ollamaReady ? getHostCountLabel(hosts, { noun: 'machine' }) : 'Ollama offline',
      icon: Network,
      done: hosts.length > 0 && ollamaReady,
    },
    {
      label: 'Browse Pool',
      detail: `${rows.length} models`,
      icon: Boxes,
      done: rows.length > 0,
    },
    {
      label: 'Score Chemistry',
      detail: runProgress?.phase === 'running'
        ? `${runProgress.percent}% running`
        : scoredCount > 0
          ? `${scoredCount} scored`
          : `${shortlistCount}/5 candidates`,
      icon: Gauge,
      done: scoredCount > 0,
    },
    {
      label: 'Talk To Match',
      detail: getShortModelName(selectedModel),
      icon: MessageSquare,
      done: false,
    },
  ];

  return (
    <section className="flow-rail" aria-label="RigMatch journey">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const locked = index > activeIndex && !step.done;
        const state = step.done ? 'done' : index === activeIndex ? 'active' : locked ? 'locked' : 'ready';

        return (
          <div key={step.label} className={`flow-step ${state}`}>
            <Icon aria-hidden="true" />
            <div>
              <span>{step.label}</span>
              <strong>{step.detail}</strong>
            </div>
            <em>{index + 1}</em>
          </div>
        );
      })}
    </section>
  );
}

function LanBrowser({
  active,
  system,
  ollama,
  hosts,
  selectedHostId,
  isScanning,
  isAddingHost,
  manualAddress,
  onScan,
  onSelect,
  onManualAddressChange,
  onAddHost,
  onInstallOllama,
  onScanRig,
  onOpenSetupGuide,
}: {
  active: boolean;
  system: SystemProfile;
  ollama: OllamaStatus;
  hosts: NetworkHost[];
  selectedHostId: string;
  isScanning: boolean;
  isAddingHost: boolean;
  manualAddress: string;
  onScan: () => void;
  onSelect: (id: string) => void;
  onManualAddressChange: (value: string) => void;
  onAddHost: () => void;
  onInstallOllama: () => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hostMeta = getHostCountLabel(hosts, { compact: true });
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
        title="Rig Roster"
        actionLabel={isScanning ? 'Scanning' : 'Find LAN'}
        onAction={onScan}
        busy={isScanning}
        meta={hostMeta}
      />
      <div className="advanced-host-bar">
        <button
          type="button"
          className="mini-button outline"
          onClick={() => setAdvancedOpen((current) => !current)}
          aria-expanded={advancedOpen}
          aria-controls="manual-host-form"
        >
          <Settings aria-hidden="true" />
          Advanced Add Host
        </button>
        <span>{advancedOpen ? 'Manual rig entry' : 'Use when a rig does not appear in scan.'}</span>
      </div>
      {advancedOpen && (
        <form
          id="manual-host-form"
          className="manual-host-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onAddHost();
          }}
        >
          <label htmlFor="manual-host">Add IP</label>
          <input
            id="manual-host"
            value={manualAddress}
            onChange={(event) => onManualAddressChange(event.target.value)}
            placeholder="192.168.1.50"
            inputMode="url"
          />
          <button type="submit" className="mini-button" disabled={isAddingHost}>
            {isAddingHost ? 'Checking' : 'Add Host'}
          </button>
        </form>
      )}
      <OllamaPrep
        system={system}
        ollama={ollama}
        onInstallOllama={onInstallOllama}
        onScanRig={onScanRig}
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
        <strong>No rig selected</strong>
        <span>Find LAN or add an IP to inspect a machine.</span>
      </div>
    );
  }

  const cards = host.isLocal || host.ip === '127.0.0.1'
    ? getLocalRigDetailCards(host, system, ollama)
    : getRemoteRigDetailCards(host);

  return (
    <div className="rig-details-panel" aria-label="Selected rig details">
      <div className="rig-details-head">
        <MachineAvatar host={host} size="small" />
        <div>
          <span>Selected Rig</span>
          <strong>{host.hostname}</strong>
        </div>
        <em>
          {host.isLocal
            ? 'Full local profile'
            : host.discovery === 'computer'
              ? 'Computer found · Ollama setup needed'
              : 'Ollama network profile'}
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
      ? 'LAN scan finds machines already running Ollama. Runner setup comes later.'
      : 'Install Ollama here, then scan this rig again. Remote machines need their own setup.'
    : 'These rows are demo machines. Use the desktop app and Find LAN for real network results.';

  return (
    <div className={`ollama-prep ${ready && isDesktopRuntime ? 'ready' : 'needs-setup'}`}>
      <div className="prep-badge" aria-hidden="true">
        <ShieldCheck />
      </div>
      <div className="prep-copy">
        <span>Ollama Prep</span>
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
          Check Rig
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
          <strong>Prepare a test machine</strong>
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
            <p>Open Ollama, install it, then use Check Rig. RigMatch.AI looks for the local API on port 11434.</p>
            <button type="button" className="primary-button compact" onClick={onInstallOllama}>
              Official Download
            </button>
          </div>
        </section>

        <section className="setup-card">
          <Network aria-hidden="true" />
          <div>
            <span>Remote machine</span>
            <strong>LAN-visible Ollama</strong>
            <p>Install Ollama there, set it to listen on the LAN, allow inbound TCP 11434, then run Find LAN or Add IP here.</p>
            <code>OLLAMA_HOST=0.0.0.0:11434</code>
          </div>
        </section>

        <section className="setup-card command-card">
          <Terminal aria-hidden="true" />
          <div>
            <span>Windows</span>
            <strong>Installer path</strong>
            <p>Install Ollama for Windows, keep it running in the tray, then Check Rig. Remote testing still needs TCP 11434 exposed.</p>
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
  const title = mode === 'single' ? 'Start Compatibility Test?' : 'Compare Models?';
  const subject = mode === 'single' ? selectedModel : `${shortlistedCount} model candidates`;
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
            {mode === 'single' ? 'Start Test' : 'Compare Models'}
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
  const hostName = host?.hostname ?? 'selected rig';

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
            <strong> {sizeLabel}</strong>, but the model must be pulled again before RigMatch can score or chat with it.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Target Rig</span>
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
            This clears local RigMatch data: logs, scores, Speed Date results, chat, queued downloads, saved theme,
            and custom benchmark questions. It does <strong>not</strong> delete Ollama models.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Clears</span>
              <strong>App history</strong>
              <em>Scores, logs, Speed Date rankings, and chat reset immediately.</em>
            </div>
            <div>
              <span>Restores</span>
              <strong>Defaults</strong>
              <em>Question suite, theme, model shortlist, and run state return to first-run defaults.</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Ollama models</strong>
              <em>Use the trash button in Match Pool to delete downloaded model files.</em>
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

function UtilityDock({
  panel,
  benchmark,
  listTestResult,
  selectedHost,
  selectedModel,
  hosts,
  ollama,
  system,
  themeId,
  appLogs,
  logPath,
  isLoadingLogs,
  onThemeChange,
  onRefreshLogs,
  onCopyLogs,
  onClearLogs,
  onOpenLogsFolder,
  onClearAllData,
  onClose,
  onOpenSetupGuide,
}: {
  panel: UtilityPanelId;
  benchmark: BenchmarkResult;
  listTestResult: ListTestResult | null;
  selectedHost?: NetworkHost;
  selectedModel: string;
  hosts: NetworkHost[];
  ollama: OllamaStatus;
  system: SystemProfile;
  themeId: ThemeId;
  appLogs: AppLogEntry[];
  logPath: string;
  isLoadingLogs: boolean;
  onThemeChange: (themeId: ThemeId) => void;
  onRefreshLogs: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
  onOpenLogsFolder: () => void;
  onClearAllData: () => void;
  onClose: () => void;
  onOpenSetupGuide: () => void;
}) {
  const Icon = panel === 'history' ? History : panel === 'settings' ? Settings : Info;

  return (
    <aside className="utility-dock" aria-label={`${getNavLabel(panel)} panel`}>
      <div className="utility-title">
        <div>
          <Icon aria-hidden="true" />
          <div>
            <span>Side Rail</span>
            <strong>{getNavLabel(panel)}</strong>
          </div>
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </button>
      </div>

      {panel === 'history' && (
        <div className="utility-body">
          <div className="utility-stat">
            <span>Last compatibility test</span>
            <strong>{benchmark.model}</strong>
            <em>{benchmark.scores.total} total · {benchmark.scores.grade}</em>
          </div>
          <div className="utility-stat">
            <span>Current match</span>
            <strong>{selectedHost?.hostname ?? 'Local machine'}</strong>
            <em>{selectedModel}</em>
          </div>
          {listTestResult ? (
            <ol className="utility-list" aria-label="Latest Speed Date">
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
              <strong>No Speed Date yet</strong>
              <span>Run a Speed Date to rank the model candidates.</span>
            </div>
          )}
          <section className="log-console" aria-label="Run logs">
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
            <span>Network</span>
            <strong>{getHostCountLabel(hosts)}</strong>
            <em>Runner support planned for remote installs.</em>
          </div>
          <button type="button" className="primary-button compact" onClick={onOpenSetupGuide}>
            <ExternalLink aria-hidden="true" />
            Setup Guide
          </button>
          <section className="danger-zone" aria-label="Data reset">
            <div>
              <span>Danger Zone</span>
              <strong>Clear App Data</strong>
              <em>Clears RigMatch logs, scores, Speed Date results, chat, saved theme, and custom question suite. Installed Ollama models stay put.</em>
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
            <em>v0.1.0</em>
          </div>
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
    </aside>
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
      <span className="brand-robot">
        <span className="brand-robot-antenna" />
        <span className="brand-robot-ear left" />
        <span className="brand-robot-ear right" />
        <span className="brand-robot-head">
          <span className="brand-robot-eye left" />
          <span className="brand-robot-eye right" />
          <span className="brand-robot-heart" />
        </span>
      </span>
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
  onRefresh: () => void;
}) {
  const [modelQuery, setModelQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<ModelQuickFilterId>('fits-vram');
  const [sortKey, setSortKey] = useState<ModelSortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const selectedRow = rows.find((row) => row.displayName === selectedModel || row.id === selectedModel);
  const selectedProfile = getModelProfile(selectedRow?.displayName ?? selectedModel);
  const query = modelQuery.trim().toLowerCase();
  const quickFilters = useMemo(
    () => getModelQuickFilters(rows, modelScores, vramGb),
    [modelScores, rows, vramGb],
  );
  const vramSafeCount = quickFilters.find((filter) => filter.id === 'fits-vram')?.count ?? 0;
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
        title="Match Pool"
        actionLabel="Refresh"
        onAction={onRefresh}
        meta={modelCountLabel}
      />
      <div className="model-tools">
        <label className="model-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search models</span>
          <input
            type="search"
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
            placeholder="Search models, skills, size, status..."
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
            <span>Showing {vramSafeCount} VRAM-safe matches for {vramLabel}</span>
            <button type="button" onClick={() => setQuickFilter('all')}>Show all</button>
          </div>
        )}
      </div>
      <div className="table-wrap model-table">
        <table>
          <thead>
            <tr>
              <SortableModelHeader label="Model Name" sortName="name" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Params" sortName="params" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Size" sortName="size" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Skill" sortName="skill" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Src" sortName="source" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Status" sortName="status" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <SortableModelHeader label="Score" sortName="score" sortKey={sortKey} direction={sortDirection} onSort={changeSort} />
              <th>Test</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedModel === row.displayName || selectedModel === row.id;
              const installed = installedModelNames.has(row.displayName) || row.installed;
              const queued = queuedModelIds.has(row.displayName);
              const shortlisted = shortlistIds.has(row.displayName);
              const profile = getModelProfile(row.displayName);
              const sizeRisk = getSizeRisk(row.sizeGb);
              const statusLabel = getModelStatusLabel(row, queued);
              const score = getModelScore(row, modelScores);
              return (
                <tr key={row.id} className={selected ? 'selected' : ''}>
                  <td>
                    <button type="button" className="model-name-button" onClick={() => onSelect(row.displayName)}>
                      <AvatarBust model={row.displayName} size="tiny" />
                      <span>{row.displayName}</span>
                    </button>
                  </td>
                  <td>{row.params}</td>
                  <td title={sizeRisk.message}>
                    <span className={`size-pill ${sizeRisk.tone}`}>
                      {row.sizeGb ? `${row.sizeGb} GB` : '?'}
                    </span>
                  </td>
                  <td title={profile.specialties.join(', ')}>{profile.specialties[0]}</td>
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
                        disabled={!installed}
                        title={installed ? 'Toggle Speed Date slot' : 'Install before speed dating'}
                        aria-label={`${shortlisted ? 'Remove' : 'Add'} ${row.displayName} from Speed Date`}
                      >
                        {shortlisted ? 'In' : '+5'}
                      </button>
                      {installed ? (
                        <>
                          <button
                            type="button"
                            className="mini-button score-row-button"
                            onClick={() => onScoreModel(row)}
                            disabled={isBenchmarking}
                            title={`Score ${row.displayName} on this rig`}
                          >
                            <Gauge aria-hidden="true" />
                            Score
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
                          title={`${queued ? 'Remove from queue' : 'Queue download'}: ${row.sizeGb ? formatGb(row.sizeGb) : 'unknown size'}`}
                        >
                          {queued ? 'Drop' : `+${row.sizeGb ? `${row.sizeGb}G` : '?'}`}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={8}>No model matches found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="model-footer">
        <div className="selected-specialties">
          <AvatarBust model={selectedRow?.displayName ?? selectedModel} size="small" />
          <div>
            <strong>{selectedProfile.archetype}</strong>
            <span>{selectedProfile.specialties.join(' · ')}</span>
          </div>
          <button
            type="button"
            className="mini-button outline speed-date-launch"
            onClick={onOpenSpeedDate}
            title="Compare up to 5 candidate models with the selected question suite."
          >
            <Trophy aria-hidden="true" />
            Speed Date
            <em>{shortlistedCount}/5 candidates</em>
          </button>
        </div>
        <DiskGuard guard={diskGuard} />
        <div className="pull-queue">
          <span>Ollama Pull</span>
          <strong>{isPulling ? 'Downloading' : `${queuedCount} queued`}</strong>
          <em>{isPulling ? pullingModel ?? 'Working...' : 'Pull queued models into the selected rig.'}</em>
          <button
            type="button"
            className="primary-button compact"
            onClick={onPullQueued}
            disabled={queuedCount === 0 || isPulling}
          >
            <Download aria-hidden="true" />
            {isPulling ? 'Pulling' : 'Pull Queue'}
          </button>
        </div>
      </div>
    </section>
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
    return <span className="score-pill empty" title="Not scored yet. Run Score to grade this model on this rig.">N/A</span>;
  }

  return (
    <span
      className={`score-pill ${getScoreTone(score.total)}`}
      title={`Score ${score.total} · ${score.grade}; speed ${score.speed}, sobriety ${score.sobriety}`}
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
    ? 'Compatibility gauntlet active'
    : selectedScore
      ? `Last match grade ${selectedScore.grade}`
      : 'Not scored yet';

  return (
    <section className={active ? 'panel benchmark-panel panel-focused' : 'panel benchmark-panel'}>
      <PanelHeader
        icon={Gauge}
        title="Compatibility Test"
        actionLabel={isRunning ? 'Running' : 'Start'}
        onAction={onStart}
        busy={isRunning}
        meta={isRunning ? 'Running' : canBenchmark ? 'Ready' : hostReady ? 'Needs model' : 'Rig not ready'}
      />

      <div className="run-title">
        <strong>{model}</strong>
        <span>{scoreStatus}</span>
      </div>

      <div className="test-suite-strip">
        <div>
          <span>Question Set</span>
          <strong>{questionCount} questions</strong>
        </div>
        <button type="button" className="mini-button outline" onClick={onOpenSuiteEditor}>
          <Settings aria-hidden="true" />
          Edit Suite
        </button>
      </div>

      {runProgress?.mode === 'single' && <RunProgressPanel progress={runProgress} onOpenLogs={onOpenLogs} />}

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
      label: 'Rig Fit',
      value: score ? `${score.fit}%` : 'N/A',
      detail: 'Footprint fit based on model size, available VRAM, RAM, and current benchmark fit.',
    },
    {
      label: 'Chemistry',
      value: score ? String(score.total) : 'N/A',
      detail: 'Overall match score combining speed, sobriety, stability, and hardware fit.',
    },
    {
      label: 'Best Proof',
      value: score ? String(topPrompt ? topPrompt.sobrietyScore : score.sobriety) : 'N/A',
      detail: 'Highest prompt reliability score from the latest compatibility test.',
    },
  ];
  const matchRows = [
    {
      label: 'Rig',
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
        <span>Match Notes</span>
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
          <strong>{score ? 'Summary score saved' : 'No score yet'}</strong>
          <span>{score ? 'Run this model again to refresh prompt proof.' : 'Run Score to grade this model on this rig.'}</span>
        </div>
      )}
    </div>
  );
}

function SpeedDateWindow({
  shortlistedRows,
  listTestResult,
  runProgress,
  isListTesting,
  questionCount,
  questionPlan,
  onQuestionCountChange,
  onOpenSuiteEditor,
  onOpenLogs,
  onRemoveCandidate,
  onRunListTest,
  onClose,
}: {
  shortlistedRows: ModelRow[];
  listTestResult: ListTestResult | null;
  runProgress: RunProgress | null;
  isListTesting: boolean;
  questionCount: BenchmarkQuestionCount;
  questionPlan: BenchmarkQuestion[];
  onQuestionCountChange: (count: BenchmarkQuestionCount) => void;
  onOpenSuiteEditor: () => void;
  onOpenLogs: () => void;
  onRemoveCandidate: (row: ModelRow) => void;
  onRunListTest: () => void;
  onClose: () => void;
}) {
  const winnerResult = listTestResult?.results.find((result) => result.model === listTestResult.winner);
  const canRunListTest = shortlistedRows.length >= 2 && !isListTesting;
  const selectedSlots = Array.from({ length: 5 }, (_, index) => shortlistedRows[index]);

  return (
    <aside className="speed-date-window" role="dialog" aria-label="Speed Date">
      <div className="speed-date-title">
        <div>
          <span>Speed Date</span>
          <strong>Compare Models</strong>
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </button>
      </div>

      <div className="speed-date-body">
        <div className="speed-date-status">
          <div>
            <span>Candidates</span>
            <strong>{shortlistedRows.length}/5 selected</strong>
          </div>
          <button
            type="button"
            className="primary-button compact"
            onClick={onRunListTest}
            disabled={!canRunListTest}
          >
            <Trophy aria-hidden="true" />
            {isListTesting ? 'Testing' : shortlistedRows.length >= 2 ? 'Compare Models' : 'Pick 2+'}
          </button>
        </div>

        {runProgress?.mode === 'speed-date' && <RunProgressPanel progress={runProgress} onOpenLogs={onOpenLogs} />}

        <div className="list-slots speed-date-slots" aria-label="Selected Speed Date models">
          {selectedSlots.map((row, index) => (
            row ? (
              <button
                key={row.displayName}
                type="button"
                className="candidate-chip filled"
                onClick={() => onRemoveCandidate(row)}
                disabled={isListTesting}
                title={`Remove ${row.displayName} from Compare Models`}
                aria-label={`Remove ${row.displayName} from Compare Models`}
              >
                <span>{getShortModelName(row.displayName)}</span>
                <X aria-hidden="true" />
              </button>
            ) : (
              <span key={`empty-${index}`} className="empty-slot">
                Slot {index + 1}
              </span>
            )
          ))}
        </div>

        <QuestionSuitePreview
          questionCount={questionCount}
          questions={questionPlan}
          disabled={isListTesting}
          onQuestionCountChange={onQuestionCountChange}
          onOpenSuiteEditor={onOpenSuiteEditor}
        />

        {listTestResult ? (
          <div className="speed-date-results">
            <div className="list-winner">
              <span>Best Match</span>
              <strong>{listTestResult.winner}</strong>
              <em>{winnerResult ? `${winnerResult.total} · ${winnerResult.grade}` : 'Ranked'}</em>
            </div>
            <ol aria-label="Speed Date ranking">
              {listTestResult.results.map((result, index) => (
                <li key={result.model} className={result.model === listTestResult.winner ? 'winner' : ''}>
                  <b>{index + 1}</b>
                  <span>{result.model}</span>
                  <em>{result.speed} spd · {result.sobriety} sober</em>
                  <strong>{result.total}</strong>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="speed-date-empty">
            <Trophy aria-hidden="true" />
            <strong>No ranking yet</strong>
          </div>
        )}
      </div>
    </aside>
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
  selectedScore,
  host,
  rows,
  selectedModel,
  onSelect,
  onTalk,
}: {
  active: boolean;
  agentName: string;
  model: string;
  selectedScore?: TestedModelScore;
  host?: NetworkHost;
  rows: ModelRow[];
  selectedModel: string;
  onSelect: (model: string) => void;
  onTalk: () => void;
}) {
  const activeProfile = getModelProfile(model);
  const matchNotes = getMatchNotes(activeProfile, selectedScore, host);
  const rosterRows = rows.slice(0, 6);

  return (
    <section className={active ? 'panel agent-panel panel-focused' : 'panel agent-panel'}>
      <div className="agent-heading">
        <Bot aria-hidden="true" />
        <h2>Matchmaker</h2>
      </div>

      <div className="avatar-frame" aria-label={`${agentName} avatar`}>
        <AvatarBust model={model} size="large" />
      </div>

      <div className="character-roster" aria-label="Model character select">
        {rosterRows.map((row) => (
          <button
            key={row.displayName}
            type="button"
            className={row.displayName === selectedModel ? 'roster-card active' : 'roster-card'}
            onClick={() => onSelect(row.displayName)}
            title={`${row.displayName}: ${getModelProfile(row.displayName).specialties.join(', ')}`}
          >
            <AvatarBust model={row.displayName} size="tiny" />
            <span>{getShortModelName(row.displayName)}</span>
          </button>
        ))}
      </div>

      <div className="match-tagline">
        <span>Compatibility desk</span>
        <strong>{host?.hostname ?? 'Local machine'} + {model}</strong>
      </div>

      <div className="match-hero">
        <div className="agent-nameplate">
          <strong>{agentName}</strong>
          <span>{model}</span>
          <span>{activeProfile.archetype}</span>
          <span>{host?.hostname ?? 'Local machine'}</span>
        </div>

        <div className="score-grid">
          <ScoreTile label="Sobriety" value={selectedScore?.sobriety} grade={selectedScore ? gradeFor(selectedScore.sobriety) : undefined} tone="pink" />
          <ScoreTile label="Speed" value={selectedScore?.speed} grade={selectedScore ? gradeFor(selectedScore.speed) : undefined} tone="gold" />
          <ScoreTile label="Compatibility" value={selectedScore?.total} grade={selectedScore?.grade} tone="green" />
        </div>

        <div className="score-glossary" aria-label="Score glossary">
          <span title={getScoreTooltip('Sobriety')}>Trust</span>
          <span title={getScoreTooltip('Speed')}>Pace</span>
          <span title={getScoreTooltip('Compatibility')}>Fit</span>
        </div>

        <button type="button" className="talk-button" onClick={onTalk}>
          <MessageSquare aria-hidden="true" />
          Talk to Match
        </button>
      </div>

      <div
        className={selectedScore ? 'grade-track' : 'grade-track empty'}
        aria-label="Grade track"
        title={selectedScore ? 'D to S grade band for the total compatibility score.' : 'Run Score to place this model on the grade track.'}
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
          <span>Rig</span>
          <strong>{host?.hostname ?? 'Local machine'}</strong>
        </div>
        <i aria-hidden="true" />
        <div>
          <AvatarBust model={model} size="small" />
          <span>Agent Candidate</span>
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
          <span>{model}</span>
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

function getMatchNotes(
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  host?: NetworkHost,
) {
  const hostName = host?.hostname?.replace(/\s*\(This Machine\)/i, '') ?? 'this rig';
  const bestSpecialty = profile.specialties[0] ?? 'daily assistant work';
  if (!score) {
    return {
      summary: `${hostName} has not been scored with this ${profile.archetype.toLowerCase()} yet.`,
      reasons: [
        { label: 'Best For', value: bestSpecialty },
        { label: 'Rig Fit', value: 'N/A' },
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
      { label: 'Rig Fit', value: `${score.fit}%` },
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

function Ticker({
  activity,
  benchmark,
  hosts,
  isDesktopRuntime,
}: {
  activity: string;
  benchmark: BenchmarkResult;
  hosts: NetworkHost[];
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
        <strong>{getHostCountLabel(hosts, { noun: 'host' })} · {benchmark.scores.total} score</strong>
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

function RunProgressPanel({ progress, onOpenLogs }: { progress: RunProgress; onOpenLogs?: () => void }) {
  const phaseLabel = progress.phase === 'complete'
    ? 'Complete'
    : progress.phase === 'failed'
      ? 'Failed'
      : 'Running';
  const completedLabel = `${progress.completed}/${progress.total}`;

  return (
    <div className={`run-progress-card ${progress.phase}`} aria-live="polite">
      <div className="run-progress-head">
        <span>{progress.label}</span>
        <strong>{phaseLabel}</strong>
      </div>
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
    { label: 'Sobriety Score', value: score?.sobriety ?? benchmark?.scores.sobriety, max: 100, unit: '%' },
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
      title={hasValue ? tooltip : `No ${label.toLowerCase()} score yet. Run Score for this model.`}
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
  if (key.includes('sobriety')) {
    return 'Reliability check for hallucination traps, careful answers, and instruction discipline.';
  }

  if (key.includes('speed')) {
    return 'How quickly this model responds on the selected rig, including throughput and latency.';
  }

  if (key.includes('compatibility')) {
    return 'Overall match score combining speed, sobriety, stability, and hardware fit.';
  }

  return 'Benchmark score from the latest compatibility test.';
}

function AvatarBust({ model, size }: { model: string; size: 'tiny' | 'small' | 'large' }) {
  const profile = getModelProfile(model);
  const style = {
    '--avatar-hue': `${profile.hue}deg`,
    '--avatar-accent-hue': `${profile.accentHue}deg`,
  } as CSSProperties;

  return (
    <span
      className={`avatar-bust ${size} ${profile.variant}`}
      style={style}
      aria-hidden="true"
    >
      <span className="avatar-crest" />
      <span className="avatar-face">
        <span className="avatar-eye left" />
        <span className="avatar-eye right" />
        <span className="avatar-mouth" />
      </span>
      <span className="avatar-guard left" />
      <span className="avatar-guard right" />
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
  const label = `${host?.hostname ?? 'Unknown machine'} ${host?.ip ?? ''}`;
  const seed = hashString(label);
  const style = {
    '--machine-hue': `${(seed % 90) + 165}deg`,
    '--machine-accent-hue': `${(seed % 110) + 35}deg`,
  } as CSSProperties;

  return (
    <span
      className={`machine-avatar ${size} ${host?.isLocal ? 'local' : 'remote'}`}
      style={style}
      aria-hidden="true"
    >
      <span className="machine-screen">
        <span />
        <span />
      </span>
      <span className="machine-base" />
      <span className="machine-tower">
        <span />
        <span />
      </span>
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

function getModelScore(row: ModelRow, modelScores: Record<string, TestedModelScore>) {
  return (
    modelScores[row.displayName] ||
    modelScores[row.installedModel?.model ?? ''] ||
    modelScores[row.installedModel?.name ?? ''] ||
    modelScores[`${row.name}:${row.tag}`]
  );
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
  const next = { ...current };
  aliases.forEach((alias) => {
    delete next[alias];
  });
  return next;
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
      return 'Params';
    case 'size':
      return 'Size';
    case 'skill':
      return 'Skill';
    case 'source':
      return 'Source';
    case 'status':
      return 'Status';
    case 'score':
      return 'Score';
    case 'name':
    default:
      return 'Model Name';
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

  return [...extras, ...dedupedRows.values()].slice(0, 80);
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
        value: 'Not reachable',
        detail: host.setupHint ?? 'Port 11434 did not answer from this PC.',
      },
      {
        label: 'Open Ports',
        value: host.openPorts?.length ? host.openPorts.join(', ') : 'None seen',
        detail: 'Computer discovery is not the same as Ollama access.',
      },
      {
        label: 'Next Step',
        value: 'Expose Ollama',
        detail: 'Set OLLAMA_HOST=0.0.0.0:11434, then restart Ollama.',
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
  if (sizeGb <= system.memory.availableGb * 0.45) return 'Likely RAM-assisted';
  return 'Memory-heavy candidate';
}

function countSampleHosts(hosts: NetworkHost[]) {
  return hosts.filter((host) => host.isDemo).length;
}

function isHostBenchmarkReady(host: NetworkHost | undefined, ollama: OllamaStatus) {
  return !getHostBenchmarkBlocker(host, ollama);
}

function getHostBenchmarkBlocker(host: NetworkHost | undefined, ollama: OllamaStatus) {
  if (!host || host.isLocal || host.isDemo) {
    return ollama.ready ? null : 'Ollama must be running before RigMatch.AI can score a model.';
  }

  if (host.discovery === 'computer') {
    return `${host.hostname} was found as a computer, but Ollama is not reachable at ${host.baseUrl}. On that rig, set OLLAMA_HOST=0.0.0.0:11434 and allow TCP 11434, then run Find LAN again.`;
  }

  if (host.status.toLowerCase() !== 'ready' || !host.provider.toLowerCase().includes('ollama')) {
    return `${host.hostname} is not ready for scoring yet. RigMatch needs an Ollama API at ${host.baseUrl}.`;
  }

  return null;
}

function getScanScopeLabel(scan: ScanResponse) {
  const checked = scan.checkedHosts ? `${scan.checkedHosts} IPs` : 'the LAN';
  const subnetText = getSubnetListLabel(scan.subnets);
  const durationText = scan.durationMs ? ` in ${(scan.durationMs / 1000).toFixed(1)}s` : '';

  return `${checked}${subnetText ? ` across ${subnetText}` : ''}${durationText}`;
}

function getSubnetListLabel(subnets: string[]) {
  if (subnets.length === 0) return '';
  if (subnets.length <= 4) return subnets.join(', ');

  return `${subnets.slice(0, 4).join(', ')} +${subnets.length - 4} more`;
}

function getHostCountLabel(
  hosts: NetworkHost[],
  options: { compact?: boolean; noun?: 'host' | 'machine' } = {},
) {
  const sampleCount = countSampleHosts(hosts);
  const noun = options.noun ?? 'machine';
  const labelFor = (count: number, qualifier?: string) => {
    if (options.compact) {
      return qualifier ? `${count} ${qualifier}` : `${count} found`;
    }

    const descriptor = qualifier ? `${qualifier} ` : '';
    return `${count} ${descriptor}${noun}${count === 1 ? '' : 's'}`;
  };

  if (sampleCount === 0) {
    return labelFor(hosts.length);
  }

  if (sampleCount === hosts.length) {
    return labelFor(sampleCount, 'sample');
  }

  return options.compact
    ? `${hosts.length} found · ${sampleCount} sample`
    : `${hosts.length} ${noun}${hosts.length === 1 ? '' : 's'} (${sampleCount} sample)`;
}

function getNavLabel(id: NavId) {
  return navItems.find((item) => item.id === id)?.label ?? 'Panel';
}

function getThemeLabel(id: ThemeId) {
  return themeOptions.find((theme) => theme.id === id)?.label ?? 'Arcade Lime';
}

function getSavedThemeId(): ThemeId {
  const savedThemeId = window.localStorage.getItem('agentArcadeTheme');
  return isThemeId(savedThemeId) ? savedThemeId : 'lime';
}

function isThemeId(value: string | null): value is ThemeId {
  return themeOptions.some((theme) => theme.id === value);
}

function getModelProfile(model: string): ModelProfile {
  const lower = model.toLowerCase();
  const seed = hashString(lower);
  const hue = seed % 360;
  const accentHue = (hue + 128 + (seed % 48)) % 360;

  if (lower.includes('qwen')) {
    return {
      agentName: 'Nova Q',
      archetype: 'Balanced technician',
      specialties: ['JSON/tools', 'instructions', 'daily chat'],
      hue: 128,
      accentHue: 190,
      variant: 'nova',
    };
  }

  if (lower.includes('mistral')) {
    return {
      agentName: 'Mistral Neon',
      archetype: 'Creative generalist',
      specialties: ['writing', 'summaries', 'brainstorming'],
      hue: 286,
      accentHue: 44,
      variant: 'visor',
    };
  }

  if (lower.includes('llama')) {
    return {
      agentName: 'Llama Circuit',
      archetype: 'Fast utility fighter',
      specialties: ['assistant', 'speed', 'general help'],
      hue: 205,
      accentHue: 108,
      variant: 'helmet',
    };
  }

  if (lower.includes('gemma')) {
    return {
      agentName: 'Gemma Byte',
      archetype: 'Small-footprint helper',
      specialties: ['low memory', 'quick chat', 'summaries'],
      hue: 42,
      accentHue: 318,
      variant: 'arcade',
    };
  }

  if (lower.includes('phi')) {
    return {
      agentName: 'Phi Pilot',
      archetype: 'Tiny logic specialist',
      specialties: ['coding', 'math', 'small rigs'],
      hue: 178,
      accentHue: 24,
      variant: 'pilot',
    };
  }

  if (lower.includes('deepseek')) {
    return {
      agentName: 'Deep Circuit',
      archetype: 'Reasoning bruiser',
      specialties: ['reasoning', 'hard prompts', 'analysis'],
      hue: 350,
      accentHue: 212,
      variant: 'chrome',
    };
  }

  return {
    agentName: 'RigMatch Agent',
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
    { id: 'fits-vram', label: 'Fits VRAM', count: rows.filter((row) => modelFitsVram(row, vramGb)).length },
    { id: 'scored', label: 'Scored', count: rows.filter((row) => Boolean(getModelScore(row, scores))).length },
    { id: 'unscored', label: 'Unscored', count: rows.filter((row) => row.installed && !getModelScore(row, scores)).length },
    { id: 'huge', label: 'Huge', count: rows.filter((row) => (row.sizeGb ?? 0) >= 12).length },
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
  if (filter === 'huge') return (row.sizeGb ?? 0) >= 12;
  return true;
}

function modelFitsVram(row: ModelRow, vramGb: number) {
  if (!row.sizeGb || vramGb <= 0) return false;
  return row.sizeGb <= Math.max(1, vramGb - 1);
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
      message: 'Unknown download size. Check before pulling.',
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
