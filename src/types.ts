export type SystemProfile = {
  hostname: string;
  platform: string;
  arch: string;
  os: {
    distro: string;
    release: string;
    codename?: string;
  };
  cpu: {
    manufacturer: string;
    brand: string;
    physicalCores: number;
    cores: number;
    loadPercent: number;
  };
  memory: {
    totalGb: number;
    availableGb: number;
    usedGb: number;
  };
  gpu: {
    vendor: string;
    model: string;
    vramGb: number;
    vramUsedGb: number | null;
    gpuLoadPercent: number | null;
    driverVersion: string;
    bus: string;
    isUnifiedMemory?: boolean;
  };
  storage: {
    sizeGb: number;
    availableGb: number;
    mount: string;
  };
  battery: {
    hasBattery: boolean;
    percent: number | null;
    isCharging: boolean;
    acConnected: boolean | null;
  };
  cuda: {
    detected: boolean;
    status: 'current' | 'behind' | 'toolkit-missing' | 'unknown' | 'not-nvidia';
    driverVersion: string | null;
    driverCudaVersion: string | null;
    toolkitVersion: string | null;
    latestToolkitVersion: string | null;
    source: string;
    error: string | null;
  };
  networks: Array<{
    name: string;
    address: string;
    subnet: string;
    isVirtual?: boolean;
  }>;
};

export type OllamaModel = {
  name: string;
  model: string;
  sizeGb: number;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  provider?: LocalModelProvider;
  providerLabel?: string;
  baseUrl?: string;
};

export type LocalModelProvider = 'ollama' | 'lm-studio';

export type OllamaStatus = {
  ready: boolean;
  baseUrl: string;
  version: string | null;
  pingMs: number | null;
  models: OllamaModel[];
  error: string | null;
};

export type CatalogModel = {
  id: string;
  name: string;
  tag: string;
  params: string;
  sizeGb: number | null;
  pack: string;
  source: string;
  live: boolean;
  pulls?: number | null;
};

export type CatalogResponse = {
  syncedAt: string;
  source: string;
  models: CatalogModel[];
  error: string | null;
};

export type NetworkHost = {
  id: string;
  hostname: string;
  ip: string;
  provider: string;
  discovery?: 'ollama' | 'lm-studio' | 'computer';
  version?: string;
  models: number;
  status: string;
  pingMs: number | null;
  baseUrl: string;
  isLocal: boolean;
  isDemo?: boolean;
  openPorts?: number[];
  setupHint?: string;
};

export type ScanResponse = {
  scannedAt: string;
  subnets: string[];
  checkedHosts?: number;
  durationMs?: number;
  networks?: SystemProfile['networks'];
  hosts: NetworkHost[];
};

export type BenchmarkPromptResult = {
  id: string;
  label: string;
  prompt: string;
  elapsedMs: number;
  tokensPerSecond: number;
  sobrietyScore: number;
  response: string;
  doneReason: string;
  status?: 'ok' | 'no-response' | 'truncated' | 'failed';
  diagnostic?: string;
  evalCount?: number;
  evalDurationMs?: number;
  thinkingDisabled?: boolean;
};

export type BenchmarkResult = {
  model: string;
  baseUrl: string;
  questionCount: number;
  completedAt: string;
  elapsedMs: number;
  avgLatencyMs?: number;
  avgFirstTokenMs?: number;
  avgTokensPerSecond?: number;
  prompts: BenchmarkPromptResult[];
  scores: {
    speed: number;
    sobriety: number;
    stability: number;
    fit: number;
    total: number;
    grade: string;
  };
};

export type TestedModelScore = {
  model: string;
  total: number;
  grade: string;
  speed: number;
  sobriety: number;
  stability?: number;
  fit: number;
  completedAt: string;
  suiteName?: string;
  preciseTotal?: number;
  scoreSchemaVersion?: number;
};

export type BenchmarkProgressUpdate = {
  id: string;
  model: string;
  phase: 'started' | 'prompt-start' | 'prompt-run' | 'prompt-token' | 'prompt-complete' | 'complete' | 'failed';
  promptIndex: number;
  promptTotal: number;
  runIndex?: number;
  runTotal?: number;
  promptId?: string;
  promptLabel?: string;
  prompt?: string;
  elapsedMs?: number;
  tokensPerSecond?: number;
  sobrietyScore?: number;
  message?: string;
};

export type PullProgressUpdate = {
  id: string;
  model: string;
  baseUrl?: string;
  phase: 'queued' | 'started' | 'pulling' | 'paused' | 'complete' | 'failed';
  status: string;
  percent: number | null;
  completedBytes?: number | null;
  totalBytes?: number | null;
  speedBps?: number | null;
  digest?: string | null;
  error?: string | null;
  updatedAt: string;
};

export type ChatResponse = {
  model: string;
  message: string;
  completedAt: string;
};

export type AdvancedGenerateRequest = {
  model: string;
  baseUrl?: string;
  prompt: string;
  keep_alive?: string;
  timeoutMs?: number;
  options?: Record<string, unknown>;
  width?: number;
  height?: number;
  steps?: number;
};

export type AdvancedGenerateResponse = {
  response?: string;
  image?: string;
  images?: string[];
  done_reason?: string;
  error?: string;
};

export type PullModelResponse = {
  model: string;
  status: string;
  completedAt: string;
  baseUrl: string;
};

export type DeleteModelResponse = {
  model: string;
  status: string;
  completedAt: string;
  baseUrl: string;
};

export type AppLogLevel = 'info' | 'warn' | 'error';

export type AppLogEntry = {
  id: string;
  timestamp: string;
  level: AppLogLevel;
  source: string;
  message: string;
  details?: unknown;
};

export type AppLogResponse = {
  entries: AppLogEntry[];
  logPath: string;
};

export type UpdateChannel = 'release' | 'nightly';

export type AutoUpdateStatus = {
  phase: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  error?: string;
};

export type UpdateCheckResponse = {
  channel: UpdateChannel;
  currentVersion: string;
  checkedAt: string;
  latestVersion: string | null;
  latestName: string | null;
  latestDate: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  downloadKind: 'installer' | 'release-page';
  releaseNotes: string | null;
  hasUpdate: boolean;
  status: 'current' | 'available' | 'unknown';
  error: string | null;
};

export type OllamaInstallProgress =
  | { phase: 'idle' }
  | { phase: 'downloading'; percent: number; receivedBytes: number; totalBytes: number }
  | { phase: 'ready'; installerPath: string }
  | { phase: 'script'; command: string }
  | { phase: 'error'; error: string };

export type BenchmarkStatus = {
  running: boolean;
  progressId?: string | null;
  model?: string;
  snapshot?: BenchmarkProgressUpdate | null;
};

export type AgentArcadeApi = {
  getSystemProfile: () => Promise<SystemProfile>;
  getOllamaStatus: (baseUrl?: string) => Promise<OllamaStatus>;
  getLmStudioStatus: (baseUrl?: string) => Promise<OllamaStatus>;
  getOllamaCatalog: (options?: { force?: boolean }) => Promise<CatalogResponse>;
  openOllamaDownload: () => Promise<void>;
  scanLan: () => Promise<ScanResponse>;
  addHostByAddress: (address: string) => Promise<NetworkHost>;
  pullModel: (request: { model: string; baseUrl?: string; progressId?: string }) => Promise<PullModelResponse>;
  abortPull: (progressId?: string, reason?: 'pause' | 'cancel') => Promise<void>;
  deleteModel: (request: { model: string; baseUrl?: string }) => Promise<DeleteModelResponse>;
  runAdvancedGenerate: (request: AdvancedGenerateRequest) => Promise<AdvancedGenerateResponse>;
  runBenchmark: (request: {
    model: string;
    baseUrl?: string;
    provider?: LocalModelProvider;
    questionCount?: number;
    questions?: Array<{ id: string; label: string; type: string; prompt: string }>;
    progressId?: string;
  }) => Promise<BenchmarkResult>;
  onBenchmarkProgress?: (callback: (update: BenchmarkProgressUpdate) => void) => () => void;
  getActiveBenchmark: () => Promise<BenchmarkStatus>;
  onBenchmarkStatus?: (callback: (status: BenchmarkStatus) => void) => () => void;
  onPullProgress?: (callback: (update: PullProgressUpdate) => void) => () => void;
  sendChat: (request: { model: string; message: string; baseUrl?: string; provider?: LocalModelProvider }) => Promise<ChatResponse>;
  getLogs: (limit?: number) => Promise<AppLogResponse>;
  appendLog: (entry: Partial<AppLogEntry>) => Promise<AppLogEntry>;
  clearLogs: () => Promise<AppLogResponse>;
  openLogsFolder: () => Promise<{ logPath: string }>;
  checkForUpdates: (channel?: UpdateChannel) => Promise<UpdateCheckResponse>;
  openUpdatePage: (channel?: UpdateChannel, url?: string | null) => Promise<{ url: string }>;
  closeApp: () => Promise<{ ok: boolean }>;
  cancelCloseApp: () => Promise<{ ok: boolean }>;
  onAppCloseRequest?: (callback: () => void) => () => void;
  syncScores: (scores: Record<string, unknown>) => Promise<void>;
  openChatApp: () => Promise<{ ok: boolean; reason?: string }>;
  checkAutoUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdaterStatus?: (callback: (status: AutoUpdateStatus) => void) => () => void;
  startOllamaInstall: () => Promise<void>;
  launchOllamaInstaller: (installerPath: string) => Promise<void>;
  onOllamaInstallProgress?: (callback: (progress: OllamaInstallProgress) => void) => () => void;
};

export type ModelRow = CatalogModel & {
  displayName: string;
  installed: boolean;
  ready: boolean;
  installedModel?: OllamaModel;
  installLabel: string;
  localProvider?: LocalModelProvider;
  localProviderLabel?: string;
  localBaseUrl?: string;
  canDownload?: boolean;
};
