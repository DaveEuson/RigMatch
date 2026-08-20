// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type {
  BenchmarkResult,
  CatalogResponse,
  NetworkHost,
  OllamaStatus,
  SystemProfile,
} from './types.ts';
import { appendRuns, emptyRunHistory, type RunHardware, type RunHistory, type RunHistoryEntry } from './lib/runHistory.ts';
import { gradeForMatchScore } from './lib/scoring.ts';

// ── Pre-scan defaults (desktop) ──────────────────────────────────────────────
// The demo* values below are sample data for the browser preview. On desktop
// they must NOT be the starting state: if the launch scan fails, the app would
// keep presenting fabricated hardware ("RTX 3060, 12 GB") as detected fact and
// size real model recommendations against it. These neutral profiles degrade
// honestly instead — getHardwareFit treats vramGb <= 0 as "Check VRAM" and
// recommends nothing until a real scan lands.
export const unscannedSystem: SystemProfile = {
  hostname: 'This computer',
  platform: '',
  arch: '',
  os: { distro: '', release: '' },
  cpu: { manufacturer: '', brand: '', physicalCores: 0, cores: 0, loadPercent: 0 },
  memory: { totalGb: 0, availableGb: 0, usedGb: 0 },
  gpu: {
    vendor: '',
    model: '',
    vramGb: 0,
    vramUsedGb: null,
    gpuLoadPercent: null,
    driverVersion: '',
    bus: '',
  },
  storage: { sizeGb: 0, availableGb: 0, mount: '' },
  battery: { hasBattery: false, percent: null, isCharging: false, acConnected: null },
  cuda: {
    detected: false,
    status: 'unknown',
    driverVersion: null,
    driverCudaVersion: null,
    toolkitVersion: null,
    latestToolkitVersion: null,
    source: 'not scanned',
    error: null,
  },
  networks: [],
};

/** Not-yet-checked provider status: never claims a runtime is ready. */
export const unscannedProviderStatus: OllamaStatus = {
  ready: false,
  baseUrl: 'http://127.0.0.1:11434',
  version: null,
  pingMs: null,
  error: null,
  models: [],
};

export const demoSystem: SystemProfile = {
  hostname: 'Dave-PC',
  platform: 'win32',
  arch: 'x64',
  os: {
    distro: 'Windows',
    release: '11',
  },
  cpu: {
    manufacturer: 'AMD',
    brand: 'Ryzen 7 local rig',
    physicalCores: 8,
    cores: 16,
    loadPercent: 23,
  },
  memory: {
    totalGb: 31.9,
    availableGb: 18.7,
    usedGb: 13.2,
  },
  gpu: {
    vendor: 'NVIDIA',
    model: 'RTX 3060',
    vramGb: 12,
    vramUsedGb: 4.2,
    gpuLoadPercent: 35,
    driverVersion: 'ready',
    bus: 'PCIe',
  },
  storage: {
    sizeGb: 1907,
    availableGb: 812,
    mount: 'C:',
  },
  battery: {
    hasBattery: false,
    percent: null,
    isCharging: false,
    acConnected: true,
  },
  cuda: {
    detected: true,
    status: 'toolkit-missing',
    driverVersion: '596.49',
    driverCudaVersion: '13.2',
    toolkitVersion: null,
    latestToolkitVersion: '13.3',
    source: 'Preview sample',
    error: 'CUDA Toolkit compiler not found in PATH.',
  },
  networks: [
    {
      name: 'Ethernet',
      address: '192.168.1.42',
      subnet: '192.168.1',
    },
  ],
};

export const demoOllama: OllamaStatus = {
  ready: true,
  baseUrl: 'http://127.0.0.1:11434',
  version: '0.30.10',
  pingMs: 4,
  error: null,
  models: [
    {
      name: 'qwen2.5:7b',
      model: 'qwen2.5:7b',
      sizeGb: 4.7,
      parameterSize: '7B',
      quantization: 'Q4_K_M',
    },
    {
      name: 'llama3.2:3b',
      model: 'llama3.2:3b',
      sizeGb: 2,
      parameterSize: '3B',
      quantization: 'Q4_K_M',
    },
    {
      name: 'mistral:7b',
      model: 'mistral:7b',
      sizeGb: 4.1,
      parameterSize: '7B',
      quantization: 'Q4_K_M',
    },
    {
      name: 'gemma3:4b',
      model: 'gemma3:4b',
      sizeGb: 3.3,
      parameterSize: '4B',
      quantization: 'Q4_K_M',
    },
    {
      name: 'phi3:mini',
      model: 'phi3:mini',
      sizeGb: 2.3,
      parameterSize: '3.8B',
      quantization: 'Q4_K_M',
    },
  ],
};

export const demoLmStudio: OllamaStatus = {
  ready: true,
  baseUrl: 'http://127.0.0.1:1234/v1',
  version: 'OpenAI-compatible local server',
  pingMs: 6,
  error: null,
  models: [
    {
      name: 'lmstudio-community/qwen2.5-coder-7b-instruct',
      model: 'lmstudio-community/qwen2.5-coder-7b-instruct',
      sizeGb: 4.7,
      parameterSize: '7B',
      provider: 'lm-studio',
      providerLabel: 'LM Studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
    },
  ],
};

export const demoCatalog: CatalogResponse = {
  syncedAt: new Date().toISOString(),
  source: 'Demo catalog',
  error: null,
  models: [
    { id: 'qwen2.5:7b', name: 'qwen2.5', tag: '7b', params: '7B', sizeGb: 4.7, pack: 'Quality', source: 'Ollama', live: false },
    { id: 'llama3.2:3b', name: 'llama3.2', tag: '3b', params: '3B', sizeGb: 2, pack: 'Balanced', source: 'Ollama', live: false },
    { id: 'mistral:7b', name: 'mistral', tag: '7b', params: '7B', sizeGb: 4.1, pack: 'Quality', source: 'Ollama', live: false },
    { id: 'gemma3:4b', name: 'gemma3', tag: '4b', params: '4B', sizeGb: 3.3, pack: 'Balanced', source: 'Ollama', live: false },
    { id: 'phi3:mini', name: 'phi3', tag: 'mini', params: '3.8B', sizeGb: 2.3, pack: 'Balanced', source: 'Ollama', live: false },
    { id: 'deepseek-r1:7b', name: 'deepseek-r1', tag: '7b', params: '7B', sizeGb: 4.7, pack: 'Reasoning', source: 'Ollama', live: false },
  ],
};

export const demoHosts: NetworkHost[] = [
  {
    id: 'local',
    hostname: 'Dave-PC (This Machine)',
    ip: '192.168.1.42',
    provider: 'Ollama',
    models: 12,
    status: 'Ready',
    pingMs: 1,
    baseUrl: 'http://127.0.0.1:11434',
    isLocal: true,
    isDemo: true,
  },
  {
    id: 'gaming-rig',
    hostname: 'Gaming-Rig',
    ip: '192.168.1.15',
    provider: 'Ollama',
    models: 18,
    status: 'Ready',
    pingMs: 2,
    baseUrl: 'http://192.168.1.15:11434',
    isLocal: false,
    isDemo: true,
  },
  {
    id: 'media-server',
    hostname: 'Media-Server',
    ip: '192.168.1.23',
    provider: 'Ollama',
    models: 7,
    status: 'Ready',
    pingMs: 3,
    baseUrl: 'http://192.168.1.23:11434',
    isLocal: false,
    isDemo: true,
  },
  {
    id: 'office-pc',
    hostname: 'Office-PC',
    ip: '192.168.1.77',
    provider: 'Ollama',
    models: 5,
    status: 'Ready',
    pingMs: 5,
    baseUrl: 'http://192.168.1.77:11434',
    isLocal: false,
    isDemo: true,
  },
];

export const demoBenchmark: BenchmarkResult = {
  model: 'qwen2.5:7b',
  baseUrl: 'http://127.0.0.1:11434',
  questionCount: 10,
  completedAt: new Date().toISOString(),
  elapsedMs: 97000,
  avgLatencyMs: 792,
  avgFirstTokenMs: 210,
  avgTokensPerSecond: 91.2,
  prompts: [
    {
      id: 'json_tool_call',
      label: 'JSON/tool output',
      prompt:
        'Return only valid JSON for this local assistant request: "living room movie night". Use keys intent, action, target, and urgency.',
      elapsedMs: 812,
      tokensPerSecond: 91.2,
      sobrietyScore: 94,
      response: '{"intent":"home_media","action":"turn_on","target":"living_room_lights","media":"jazz"}',
      doneReason: 'complete',
    },
    {
      id: 'truth_boundary',
      label: 'Accuracy trap',
      prompt:
        'What is my current private IP address? If it was not provided, say you cannot determine it from the prompt.',
      elapsedMs: 694,
      tokensPerSecond: 103.1,
      sobrietyScore: 96,
      response: 'I cannot determine your current private IP address from the prompt.',
      doneReason: 'complete',
    },
    {
      id: 'instruction_following',
      label: 'Instruction following',
      prompt:
        'Reply with exactly two short bullet points. Explain what a local assistant should do for: media server cleanup.',
      elapsedMs: 871,
      tokensPerSecond: 84.7,
      sobrietyScore: 95,
      response: '- Smaller models load fewer weights into memory.\n- They spend less time generating each token on modest GPUs.',
      doneReason: 'complete',
    },
  ],
  scores: {
    speed: 94,
    sobriety: 91,
    stability: 98,
    fit: 88,
    total: 92,
    grade: 'A',
  },
};

/**
 * A sample benchmark timeline for the browser preview, so the trend and
 * "since last test" delta are visible on the demo page. Desktop never uses
 * this — App seeds real history from stored runs (see runHistory.ts) and
 * gates this branch on isDesktopRuntime, exactly like demoBenchmark itself.
 *
 * Dates are relative to load so the demo never shows a stale "2 years ago",
 * and the qwen entry deliberately spans a GPU change to show that state.
 */
export function demoRunHistory(now: number = Date.now()): RunHistory {
  const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const oldRig: RunHardware = { gpu: 'GeForce RTX 3060', vramGb: 12, ramGb: 32, cpu: 'Ryzen 5 5600X', os: 'Windows 11' };
  const newRig: RunHardware = { ...oldRig, gpu: 'GeForce RTX 4070', vramGb: 12 };

  const run = (model: string, days: number, total: number, hardware: RunHardware): RunHistoryEntry => ({
    model,
    completedAt: daysAgo(days),
    total,
    grade: gradeForMatchScore(total),
    speed: total,
    sobriety: total,
    stability: total,
    fit: total,
    questionCount: demoBenchmark.questionCount,
    elapsedMs: 97_000,
    suiteName: 'Default Suite v0.1',
    hardware,
  });

  return appendRuns(emptyRunHistory(), [
    run('qwen2.5:7b', 96, 83, oldRig),
    run('qwen2.5:7b', 61, 85, oldRig),
    run('qwen2.5:7b', 24, 92, newRig),
    run('llama3.2:3b', 61, 88, oldRig),
    run('llama3.2:3b', 24, 86, newRig),
  ]);
}
