import {
  demoBenchmark,
  demoCatalog,
  demoHosts,
  demoLmStudio,
  demoOllama,
  demoSystem,
} from './sampleData';
import { buildBenchmarkPromptPlan, normalizeBenchmarkQuestionCount } from './benchmarkSuite';
import type { AdvancedGenerateProgress, AgentArcadeApi, BenchmarkProgressUpdate, PullProgressUpdate, UpdateChannel } from './types';

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
const RIGMATCH_RELEASES_URL = 'https://github.com/daveeuson/RigMatch.AI/releases';
const APP_VERSION = '0.3.0';

// Sample App Builder output used to simulate token streaming in preview mode —
// prose "reasoning" followed by a real single-file interactive canvas app.
const PREVIEW_APP_BUILDER_SAMPLE = `Let me plan this out. I'll write a single-file HTML page with a canvas, a game loop using requestAnimationFrame, and keyboard controls. Structure first, then styling, then the game logic.

\`\`\`html
<!doctype html>
<html>
<head>
<style>
  body { margin: 0; background: #111; color: #eee; font-family: sans-serif; display: grid; place-items: center; height: 100vh; }
  canvas { background: #000; border: 2px solid #efbc5a; }
  h1 { font-size: 20px; }
</style>
</head>
<body>
<h1>Bouncing Box</h1>
<canvas id="c" width="240" height="240"></canvas>
<p>Arrow keys nudge the box.</p>
<script>
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  let x = 110, y = 110, vx = 2, vy = 2;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') vx -= 1;
    if (e.key === 'ArrowRight') vx += 1;
    if (e.key === 'ArrowUp') vy -= 1;
    if (e.key === 'ArrowDown') vy += 1;
  });
  function loop() {
    x += vx; y += vy;
    if (x < 0 || x > 220) vx = -vx;
    if (y < 0 || y > 220) vy = -vy;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 240, 240);
    ctx.fillStyle = '#95b46a'; ctx.fillRect(x, y, 20, 20);
    requestAnimationFrame(loop);
  }
  loop();
</script>
</body>
</html>
\`\`\`

That gives a self-contained interactive canvas app that runs entirely offline.`;

// Sample vision/OCR "reading" used to simulate streaming in preview mode.
const PREVIEW_VISION_SAMPLE = `Looking at the image, I can see a stylized retro robot character rendered in a warm, illustrated style. It has a boxy head with two round eyes and an antenna, set against a soft gradient background. The color palette leans on oranges and greens, giving it a friendly game-show feel. There's no readable text in the image, so this is a picture-description task rather than OCR. Overall: a single cartoon robot mascot, centered, with no other objects present.`;
const benchmarkProgressListeners = new Set<(update: BenchmarkProgressUpdate) => void>();
const pullProgressListeners = new Set<(update: PullProgressUpdate) => void>();
const advancedGenerateProgressListeners = new Set<(payload: AdvancedGenerateProgress) => void>();
const previewPullControllers = new Map<string, AbortController>();

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
  async getLmStudioStatus() {
    await delay(260);
    return demoLmStudio;
  },
  async getActiveBenchmark() {
    return { running: false };
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
    const controller = new AbortController();
    previewPullControllers.set(progressId, controller);

    try {
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
        if (controller.signal.aborted) throw new Error('Preview download paused');
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
    } finally {
      previewPullControllers.delete(progressId);
    }
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
  async runAdvancedGenerate(request) {
    const sample = (request.images && request.images.length > 0)
      ? PREVIEW_VISION_SAMPLE
      : request.prompt.toLowerCase().includes('single-file')
        ? PREVIEW_APP_BUILDER_SAMPLE
        : '';

    // Simulate token streaming so the live "watch it build/read" UI can be
    // exercised in preview mode. Emits accumulating text to listeners.
    if (request.stream && request.streamId && sample) {
      const streamId = request.streamId;
      const model = request.model;
      const chunks = sample.match(/[\s\S]{1,24}/g) ?? [sample];
      let text = '';
      for (const chunk of chunks) {
        await delay(28);
        text += chunk;
        advancedGenerateProgressListeners.forEach((listener) =>
          listener({ streamId, model, delta: chunk, text, done: false }));
      }
      advancedGenerateProgressListeners.forEach((listener) =>
        listener({ streamId, model, text, done: true }));
      return { response: sample, done_reason: 'preview' };
    }

    await delay(650);
    return { response: sample, done_reason: 'preview' };
  },
  onAdvancedGenerateProgress(callback) {
    advancedGenerateProgressListeners.add(callback);
    return () => {
      advancedGenerateProgressListeners.delete(callback);
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
    const sawImage = Array.isArray(request.images) && request.images.length > 0;
    return {
      model: request.model,
      message: sawImage
        ? "I received your image (preview mode). In the desktop build I'd send it straight to your local vision model to read."
        : "I'm running in preview mode, but the desktop build will send this directly to your selected local Ollama model.",
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
      downloadName: null,
      downloadKind: 'release-page',
      releaseNotes:
        channel === 'nightly'
          ? 'Preview mode can show the Nightly channel. Desktop builds will check GitHub prereleases and nightly-tagged releases.'
          : 'Preview mode can show the Release channel. Desktop builds will check the latest stable GitHub release.',
      hasUpdate: false,
      status: 'current',
      error: null,
    };
  },
  async openUpdatePage(channel: UpdateChannel = 'release', preferredUrl?: string | null) {
    const url = preferredUrl || (channel === 'nightly'
      ? `${RIGMATCH_RELEASES_URL}?channel=nightly`
      : RIGMATCH_RELEASES_URL);
    window.open(url, '_blank', 'noopener,noreferrer');
    return { url };
  },
  async closeApp() {
    window.close();
    return { ok: false };
  },
  async cancelCloseApp() {
    return { ok: true };
  },
  onAppCloseRequest() {
    return () => undefined;
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
  async abortPull(progressId?: string) {
    if (progressId) {
      previewPullControllers.get(progressId)?.abort();
      return;
    }
    previewPullControllers.forEach((controller) => controller.abort());
  },
  async startOllamaInstall() { /* no-op in preview */ },
  async launchOllamaInstaller() { /* no-op in preview */ },
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
