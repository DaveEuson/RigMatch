import {
  demoBenchmark,
  demoCatalog,
  demoHosts,
  demoOllama,
  demoSystem,
} from './sampleData';
import { buildBenchmarkPromptPlan, normalizeBenchmarkQuestionCount } from './benchmarkSuite';
import type { AgentArcadeApi, BenchmarkProgressUpdate, PullProgressUpdate, UpdateChannel } from './types';

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
const RIGMATCH_RELEASES_URL = 'https://github.com/daveeuson/RigMatch.AI/releases';
const APP_VERSION = '0.1.0';
const benchmarkProgressListeners = new Set<(update: BenchmarkProgressUpdate) => void>();
const pullProgressListeners = new Set<(update: PullProgressUpdate) => void>();

function emitBenchmarkProgress(update: BenchmarkProgressUpdate) {
  benchmarkProgressListeners.forEach((listener) => listener(update));
}

function emitPullProgress(update: PullProgressUpdate) {
  pullProgressListeners.forEach((listener) => listener(update));
}

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
    await delay(250);
    return {
      scannedAt: new Date().toISOString(),
      subnets: [],
      checkedHosts: 1,
      durationMs: 250,
      networks: demoSystem.networks,
      hosts: demoHosts.filter((host) => host.isLocal),
    };
  },
  async addHostByAddress() {
    await delay(120);
    throw new Error('Remote Ollama hosts are disabled for v1. Remote runners are planned for RigMatch 2.0.');
  },
  async pullModel(request) {
    const progressId = request.progressId || `preview-pull-${Date.now()}`;
    const baseUrl = request.baseUrl || demoOllama.baseUrl;
    const totalBytes = 3.4 * 1024 * 1024 * 1024;
    const startedAt = Date.now();

    emitPullProgress({
      id: progressId,
      model: request.model,
      baseUrl,
      phase: 'started',
      status: 'Starting preview download',
      percent: 0,
      completedBytes: 0,
      totalBytes,
      speedBps: 0,
      updatedAt: new Date().toISOString(),
    });

    for (let step = 1; step <= 10; step += 1) {
      await delay(180);
      const completedBytes = Math.round((totalBytes * step) / 10);
      const elapsedSeconds = Math.max(0.1, (Date.now() - startedAt) / 1000);
      emitPullProgress({
        id: progressId,
        model: request.model,
        baseUrl,
        phase: step === 10 ? 'complete' : 'pulling',
        status: step === 10 ? 'Preview download complete' : 'Pulling preview layer',
        percent: step * 10,
        completedBytes,
        totalBytes,
        speedBps: step === 10 ? 0 : completedBytes / elapsedSeconds,
        updatedAt: new Date().toISOString(),
      });
    }

    return {
      model: request.model,
      status: 'Preview pull complete',
      baseUrl,
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
    const scores = demoScoresForModel(request.model);
    const questionCount = normalizeBenchmarkQuestionCount(request.questionCount);
    const promptPlan = buildBenchmarkPromptPlan(questionCount, request.questions);
    const progressId = request.progressId;

    if (progressId) {
      emitBenchmarkProgress({
        id: progressId,
        model: request.model,
        phase: 'started',
        promptIndex: 0,
        promptTotal: promptPlan.length,
        message: `${request.model} is entering the preview compatibility round.`,
      });

      for (const [index, prompt] of promptPlan.entries()) {
        emitBenchmarkProgress({
          id: progressId,
          model: request.model,
          phase: 'prompt-start',
          promptIndex: index,
          promptTotal: promptPlan.length,
          promptId: prompt.id,
          promptLabel: prompt.label,
          prompt: prompt.prompt,
          message: `Asking ${prompt.label}.`,
        });
        await delay(Math.max(35, Math.round(720 / promptPlan.length)));
        emitBenchmarkProgress({
          id: progressId,
          model: request.model,
          phase: 'prompt-complete',
          promptIndex: index,
          promptTotal: promptPlan.length,
          promptId: prompt.id,
          promptLabel: prompt.label,
          prompt: prompt.prompt,
          elapsedMs: 650 + index * 35,
          tokensPerSecond: Math.max(22, scores.speed + 12 - index * 7),
          sobrietyScore: Math.max(40, scores.sobriety - index * 2),
          message: `${prompt.label} scored ${Math.max(40, scores.sobriety - index * 2)}.`,
        });
      }
    } else {
      await delay(1200);
    }

    if (progressId) {
      emitBenchmarkProgress({
        id: progressId,
        model: request.model,
        phase: 'complete',
        promptIndex: promptPlan.length,
        promptTotal: promptPlan.length,
        message: `${request.model} finished the preview round with ${scores.total} match score.`,
      });
    }

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
  onBenchmarkProgress(callback) {
    benchmarkProgressListeners.add(callback);
    return () => {
      benchmarkProgressListeners.delete(callback);
    };
  },
  onPullProgress(callback) {
    pullProgressListeners.add(callback);
    return () => {
      pullProgressListeners.delete(callback);
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
  async checkForUpdates(channel: UpdateChannel = 'release') {
    await delay(550);
    return {
      channel,
      currentVersion: APP_VERSION,
      checkedAt: new Date().toISOString(),
      latestVersion: APP_VERSION,
      latestName: channel === 'nightly' ? 'Preview nightly channel' : 'RigMatch.AI preview release',
      latestDate: new Date().toISOString(),
      releaseUrl: RIGMATCH_RELEASES_URL,
      downloadUrl: RIGMATCH_RELEASES_URL,
      releaseNotes:
        channel === 'nightly'
          ? 'Preview mode can show the Nightly channel. Desktop builds will check GitHub prereleases and nightly-tagged releases.'
          : 'Preview mode can show the Release channel. Desktop builds will check the latest stable GitHub release.',
      hasUpdate: false,
      status: 'current',
      error: null,
    };
  },
  async openUpdatePage(channel: UpdateChannel = 'release') {
    const url = channel === 'nightly'
      ? `${RIGMATCH_RELEASES_URL}?channel=nightly`
      : RIGMATCH_RELEASES_URL;
    window.open(url, '_blank', 'noopener,noreferrer');
    return { url };
  },
  async syncScores() {
    // no-op in preview mode
  },
  async openChatApp() {
    return { ok: false, reason: 'Not in desktop runtime' };
  },
  async checkAutoUpdate() { /* no-op in preview */ },
  async downloadUpdate() { /* no-op in preview */ },
  async installUpdate() { /* no-op in preview */ },
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
