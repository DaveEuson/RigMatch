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
    driverVersion: string;
    bus: string;
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
};

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
  discovery?: 'ollama' | 'computer';
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
};

export type BenchmarkResult = {
  model: string;
  baseUrl: string;
  questionCount: number;
  completedAt: string;
  elapsedMs: number;
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

export type ChatResponse = {
  model: string;
  message: string;
  completedAt: string;
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

export type AgentArcadeApi = {
  getSystemProfile: () => Promise<SystemProfile>;
  getOllamaStatus: (baseUrl?: string) => Promise<OllamaStatus>;
  getOllamaCatalog: () => Promise<CatalogResponse>;
  openOllamaDownload: () => Promise<void>;
  scanLan: () => Promise<ScanResponse>;
  addHostByAddress: (address: string) => Promise<NetworkHost>;
  pullModel: (request: { model: string; baseUrl?: string }) => Promise<PullModelResponse>;
  deleteModel: (request: { model: string; baseUrl?: string }) => Promise<DeleteModelResponse>;
  runBenchmark: (request: {
    model: string;
    baseUrl?: string;
    questionCount?: number;
    questions?: Array<{ id: string; label: string; type: string; prompt: string }>;
  }) => Promise<BenchmarkResult>;
  sendChat: (request: { model: string; message: string; baseUrl?: string }) => Promise<ChatResponse>;
  getLogs: (limit?: number) => Promise<AppLogResponse>;
  appendLog: (entry: Partial<AppLogEntry>) => Promise<AppLogEntry>;
  clearLogs: () => Promise<AppLogResponse>;
  openLogsFolder: () => Promise<{ logPath: string }>;
};

export type ModelRow = CatalogModel & {
  displayName: string;
  installed: boolean;
  ready: boolean;
  installedModel?: OllamaModel;
  installLabel: string;
};
