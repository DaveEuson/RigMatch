import type { BenchmarkQuestionType } from './benchmarkSuite.ts';
import type { TaskScores } from './lib/taskScores.ts';

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
  /**
   * Ollama's content digest for these exact weights. Tags mutate — pulling
   * `llama3.1:8b` next month can fetch different weights under the same name —
   * so the digest, not the tag, is what a saved score was actually measured on.
   */
  digest?: string;
  provider?: LocalModelProvider;
  providerLabel?: string;
  baseUrl?: string;
  /**
   * What the provider says this model can do — 'completion', 'vision',
   * 'tools', 'image'. Absent for models that are not installed (the browsable
   * catalogue cannot be asked) and for providers that do not report it, in
   * which case callers fall back to reading the name.
   */
  capabilities?: string[];
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
  /**
   * What the Ollama website lists this family as able to do. Coarser than an
   * installed model's own report — it describes a family, not a tag — and
   * covers only the top twenty per capability, which is all /search returns.
   */
  capabilities?: string[];
  /**
   * What runs this model. Absent means Ollama, which is nearly everything.
   *
   * Deliberately a property of the row rather than a separate screen: someone
   * who wants to make a video should search for "makes video", not learn that
   * video lives in a different registry from chat. Where the file comes from
   * is our problem.
   */
  runtime?: 'ollama' | 'comfyui';
  /** Links a ComfyUI row back to its catalogue entry, for downloading. */
  generationId?: string;
  /** Who published it. Set for generation rows, whose names match no Ollama
      family and would otherwise read "Unknown model family". */
  publisher?: string;
  /** What this produces, for the capability filters. */
  generationKind?: 'image' | 'video' | 'text-encoder';
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
  /**
   * What this question was testing. Optional because runs recorded before it
   * was kept have no way to say — those simply produce no per-task breakdown
   * rather than an average over unknown material.
   */
  type?: BenchmarkQuestionType;
  prompt: string;
  elapsedMs: number;
  tokensPerSecond: number;
  sobrietyScore: number;
  /**
   * How sobrietyScore was arrived at. 'judge' is a real quality reading;
   * 'heuristic' means a rule matched (JSON keys, a refusal, a list shape);
   * 'unjudged' means nothing could actually grade this answer and the number
   * is a placeholder — prose scored by length, or code the scorer can only
   * confirm is code. Absent on runs recorded before this was kept.
   */
  scoredBy?: 'judge' | 'heuristic' | 'unjudged';
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

/** What a score was measured on, stamped at scoring time. */
export type ScoreRigStamp = {
  /** GPU model string, e.g. "NVIDIA GeForce RTX 4070". */
  gpu: string;
  vramGb: number;
  driverVersion?: string;
  appVersion: string;
  /** Content digest of the exact weights tested, when the provider reports one. */
  modelDigest?: string;
  quantization?: string;
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
  /**
   * The setup this score was measured on. Scores are only meaningful relative
   * to a rig, and both sides of the measurement can drift underneath a saved
   * number: hardware and drivers change, and Ollama tags mutate so the same
   * name can point at different weights. Absent on scores saved before the
   * stamp existed — those can't claim drift either way.
   */
  rig?: ScoreRigStamp;
  /**
   * Measured generation throughput, carried over from the run's
   * `avgTokensPerSecond`. Kept alongside the `speed` sub-score because `speed`
   * saturates: it maps 100 tok/s to 100 and clamps, so on capable hardware most
   * models tie at 100 and the sub-score can no longer be read back as a rate.
   * Optional -- scores saved before this field existed will not have it.
   */
  tokensPerSecond?: number;
  /**
   * What this model was good at, per kind of question, measured on this rig.
   * Absent for runs recorded before question types were kept.
   */
  taskScores?: TaskScores;
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

/**
 * Something the user attached to a chat message. Audio and images travel the
 * same way to Ollama — both go in the `images` array — but they preview
 * differently and only some models can accept each.
 */
export type ChatAttachment = {
  dataUrl: string;
  kind: 'image' | 'audio';
  name: string;
};

/** A single message in a local-model chat transcript. */
export type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  /** Attachments, base64 or data URLs. Audio rides here too — that is how
      Ollama accepts a recording. */
  images?: string[];
  /** What those attachments are, so the transcript renders them correctly. */
  attachmentKind?: 'image' | 'audio';
};

/** Progress of a background skill-test run (App Builder / image / recognition). */
export type SkillRunStatus = {
  phase: 'idle' | 'running' | 'complete' | 'failed';
  label: string;
  completed: number;
  total: number;
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
  /** Image(s) for a vision/OCR model to read (data URLs or bare base64). */
  images?: string[];
  /** When true (with a streamId), tokens are emitted via onAdvancedGenerateProgress. */
  stream?: boolean;
  streamId?: string;
};

export type AdvancedGenerateProgress = {
  streamId: string;
  model?: string;
  text: string;
  delta?: string;
  done: boolean;
  error?: string;
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

/**
 * How busy the graphics card was just before a run.
 *
 * `unknown` means RigMatch could not check — deliberately distinct from `clear`,
 * which means it checked and the GPU was quiet. Collapsing the two would state a
 * fact the app does not have.
 *
 * `apps` only ever contains programs from a known-heavy allowlist; the GPU
 * driver's own process list is unusable for this on Windows, where it reports
 * the desktop shell as a GPU consumer with no per-process memory figures.
 */
export type GpuContentionLevel = 'clear' | 'busy' | 'heavy' | 'unknown';

export type GpuContention = {
  level: GpuContentionLevel;
  /** Plain-language fragments, e.g. "the graphics card is 62% busy". */
  reasons: string[];
  /** Named programs worth closing. Never the shell, never Ollama or RigMatch. */
  apps: string[];
  utilizationPercent: number | null;
  vramUsedPercent: number | null;
  /** The full sentence to show the user. Empty when there is nothing to say. */
  message: string;
  /** Which tool produced the reading: nvidia-smi, rocm-smi, systeminformation. */
  source: string | null;
};

/** What ComfyUI reports about itself, or why it could not be reached. */
export type ComfyStatus = {
  reachable: boolean;
  stats?: unknown;
  /** Filenames from /models/checkpoints. Empty is meaningful: running, no models. */
  checkpoints: string[];
  /** T5 encoders from /models/text_encoders. An LTX graph cannot run without one. */
  textEncoders?: string[];
  /** /prompt's reply, carrying queue_remaining — how busy this instance is. */
  execInfo?: unknown;
};

export type AgentArcadeApi = {
  /**
   * `checkForUpdates` permits the one outbound call on this path — asking NVIDIA
   * for the newest CUDA toolkit version. Pass it only for a user-initiated rig
   * check; automatic refreshes must stay local.
   */
  getSystemProfile: (options?: { checkForUpdates?: boolean }) => Promise<SystemProfile>;
  /**
   * Hand a built preview document to the main process and get back a URL on a
   * scheme that does not inherit the app's CSP. Returns null in the browser
   * preview, which has no main process and therefore cannot run App Builder
   * output at all.
   */
  publishAppPreview: (html: string) => Promise<string | null>;
  getGpuContention: () => Promise<GpuContention>;
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
  /**
   * ComfyUI, which is where image generation actually happens — Ollama hosts no
   * image models and its runtime refuses the ones that exist. Optional because
   * an older preload will not have them, and the Image Lab has to tell the user
   * ComfyUI is unavailable rather than throwing.
   */
  getComfyStatus?: (baseUrl?: string) => Promise<ComfyStatus>;
  comfySubmit?: (baseUrl: string | undefined, graph: Record<string, unknown>, clientId?: string) => Promise<{ promptId: string }>;
  comfyHistory?: (baseUrl: string | undefined, promptId: string) => Promise<unknown>;
  comfyImage?: (baseUrl: string | undefined, ref: { filename: string; subfolder: string; type: string }) => Promise<string>;
  comfyInterrupt?: (baseUrl: string | undefined, promptId: string) => Promise<unknown>;
  /** Unload models and evict cached outputs before a timed run. */
  comfyFree?: (baseUrl?: string) => Promise<unknown>;
  /**
   * Generation models do not come from Ollama, so they cannot be pulled — they
   * are files that must land in a folder ComfyUI reads, and ComfyUI does not
   * say where that is. Hence a picker, a verification step, and a downloader.
   */
  comfyPickFolder?: () => Promise<{ canceled: boolean; folder?: string }>;
  comfyVerifyFolder?: (folder: string, serverCheckpoints: string[]) =>
    Promise<{ ok: boolean; root?: string; reason?: string; warning?: string | null }>;
  comfyDownloadModel?: (request: {
    root: string; folder: string; filename: string; url: string;
    expectedBytes?: number; progressId?: string;
  }) => Promise<{ path: string; alreadyPresent: boolean; bytes: number }>;
  comfyAbortDownload?: (progressId: string) => Promise<boolean>;
  onComfyDownloadProgress?: (
    callback: (progress: { id: string; received: number; total: number; percent: number | null }) => void,
  ) => () => void;
  // Cloud judge bridge (strictly opt-in): one OpenRouter completion using the
  // user's own key, routed through the main process. Only used for judging.
  openRouterGenerate?: (request: { apiKey: string; model: string; prompt: string; maxTokens?: number }) => Promise<{ response: string; error: string | null }>;
  // Stop-button support: abort an in-flight streamed generation by streamId, and
  // cancel a running benchmark at its next question/run boundary by progressId.
  abortAdvancedGenerate?: (streamId: string) => Promise<void>;
  cancelBenchmark?: (progressId: string) => Promise<void>;
  onAdvancedGenerateProgress?: (callback: (payload: AdvancedGenerateProgress) => void) => () => void;
  runBenchmark: (request: {
    model: string;
    baseUrl?: string;
    provider?: LocalModelProvider;
    questionCount?: number;
    questions?: Array<{ id: string; label: string; type: string; prompt: string }>;
    progressId?: string;
    // Opt-in LLM-as-judge quality scoring. 'judge' grades answers with judgeModel —
    // a local Ollama model, or an OpenRouter model when judgeProvider is
    // 'openrouter' (requires judgeApiKey). Anything else uses the heuristic scorer.
    qualityMode?: 'heuristic' | 'judge';
    judgeModel?: string;
    judgeProvider?: 'local' | 'openrouter';
    judgeApiKey?: string;
    /**
     * A local model used to mark only the answers the heuristic cannot — chat
     * and writing, which have no shape to match and would otherwise be scored
     * by length. Applies when qualityMode is 'heuristic'; `judge` still means
     * judge everything. Always local: auto-engaging a paid, off-machine judge
     * would break both the wallet and the local-only promise.
     */
    autoJudgeModel?: string;
  }) => Promise<BenchmarkResult>;
  onBenchmarkProgress?: (callback: (update: BenchmarkProgressUpdate) => void) => () => void;
  getActiveBenchmark: () => Promise<BenchmarkStatus>;
  onBenchmarkStatus?: (callback: (status: BenchmarkStatus) => void) => () => void;
  onPullProgress?: (callback: (update: PullProgressUpdate) => void) => () => void;
  sendChat: (request: { model: string; message: string; baseUrl?: string; provider?: LocalModelProvider; images?: string[] }) => Promise<ChatResponse>;
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
