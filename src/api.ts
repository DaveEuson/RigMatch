import {
  demoBenchmark,
  demoCatalog,
  demoHosts,
  demoOllama,
  demoSystem,
} from './sampleData';
import { buildBenchmarkPromptPlan, normalizeBenchmarkQuestionCount } from './benchmarkSuite';
import type { AgentArcadeApi } from './types';

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';

const fallbackApi: AgentArcadeApi = {
  async getSystemProfile() {
    await delay(350);
    return demoSystem;
  },
  async getOllamaStatus() {
    await delay(300);
    return demoOllama;
  },
  async getOllamaCatalog() {
    await delay(450);
    return demoCatalog;
  },
  async openOllamaDownload() {
    window.open(OLLAMA_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
  },
  async scanLan() {
    await delay(800);
    return {
      scannedAt: new Date().toISOString(),
      subnets: ['192.168.1'],
      checkedHosts: 254,
      durationMs: 800,
      networks: demoSystem.networks,
      hosts: demoHosts,
    };
  },
  async addHostByAddress(address) {
    await delay(350);
    const normalized = address.trim() || '192.168.1.99';
    return {
      id: normalized,
      hostname: normalized,
      ip: normalized.replace(/^https?:\/\//, '').replace(/:11434\/?$/, ''),
      provider: 'Ollama',
      models: 6,
      status: 'Ready',
      pingMs: 7,
      baseUrl: normalized.startsWith('http') ? normalized : `http://${normalized}:11434`,
      isLocal: false,
      isDemo: true,
    };
  },
  async pullModel(request) {
    await delay(1500);
    return {
      model: request.model,
      status: 'Preview pull complete',
      baseUrl: request.baseUrl || demoOllama.baseUrl,
      completedAt: new Date().toISOString(),
    };
  },
  async deleteModel(request) {
    await delay(650);
    return {
      model: request.model,
      status: 'Preview delete complete',
      baseUrl: request.baseUrl || demoOllama.baseUrl,
      completedAt: new Date().toISOString(),
    };
  },
  async runBenchmark(request) {
    await delay(1200);
    const scores = demoScoresForModel(request.model);
    const questionCount = normalizeBenchmarkQuestionCount(request.questionCount);
    const promptPlan = buildBenchmarkPromptPlan(questionCount, request.questions);
    return {
      ...demoBenchmark,
      model: request.model,
      baseUrl: request.baseUrl || demoBenchmark.baseUrl,
      questionCount,
      completedAt: new Date().toISOString(),
      scores,
      prompts: promptPlan.map((prompt, index) => ({
        ...prompt,
        tokensPerSecond: Math.max(22, scores.speed + 12 - index * 7),
        sobrietyScore: Math.max(40, scores.sobriety - index * 2),
        elapsedMs: 650 + index * 35,
        response: demoBenchmark.prompts[index % demoBenchmark.prompts.length]?.response ?? '',
        doneReason: 'preview',
      })),
    };
  },
  async sendChat(request) {
    await delay(650);
    return {
      model: request.model,
      message:
        "I'm running in preview mode, but the desktop build will send this directly to your selected local Ollama model.",
      completedAt: new Date().toISOString(),
    };
  },
  async getLogs() {
    await delay(120);
    return {
      entries: [],
      logPath: 'Preview mode',
    };
  },
  async appendLog(entry) {
    await delay(50);
    return {
      id: `${Date.now()}-preview`,
      timestamp: new Date().toISOString(),
      level: entry.level ?? 'info',
      source: entry.source ?? 'preview',
      message: entry.message ?? '',
      details: entry.details,
    };
  },
  async clearLogs() {
    await delay(80);
    return {
      entries: [],
      logPath: 'Preview mode',
    };
  },
  async openLogsFolder() {
    await delay(80);
    return {
      logPath: 'Preview mode',
    };
  },
};

export const agentArcadeApi: AgentArcadeApi = window.agentArcade ?? fallbackApi;
export const isDesktopRuntime = Boolean(window.agentArcade);

function demoScoresForModel(model: string) {
  const lower = model.toLowerCase();

  if (lower.includes('qwen')) {
    return { speed: 92, sobriety: 94, stability: 96, fit: 90, total: 93, grade: 'A' };
  }

  if (lower.includes('llama')) {
    return { speed: 97, sobriety: 84, stability: 94, fit: 95, total: 90, grade: 'A' };
  }

  if (lower.includes('mistral')) {
    return { speed: 84, sobriety: 90, stability: 91, fit: 84, total: 88, grade: 'A' };
  }

  if (lower.includes('gemma')) {
    return { speed: 91, sobriety: 78, stability: 90, fit: 98, total: 86, grade: 'A-' };
  }

  if (lower.includes('phi')) {
    return { speed: 99, sobriety: 72, stability: 86, fit: 100, total: 84, grade: 'B+' };
  }

  if (lower.includes('deepseek')) {
    return { speed: 66, sobriety: 96, stability: 82, fit: 72, total: 83, grade: 'B+' };
  }

  return { speed: 78, sobriety: 78, stability: 84, fit: 82, total: 80, grade: 'B+' };
}
