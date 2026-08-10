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
import { calculatePreciseTotal, gradeForMatchScore } from './lib/scoring';

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
const RIGMATCH_RELEASES_URL = 'https://github.com/daveeuson/RigMatch/releases';
const APP_VERSION = '0.4.4';

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
// Sample image-generation output used in preview mode — a small, clearly
// labeled placeholder (not real model output) so the "show off your work"
// image-gen flow can be exercised without a real Ollama image model.
const PREVIEW_IMAGE_GENERATION_SAMPLE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAe5UlEQVR42u3deZxU1Zkw4FPQjWwmUSMKohJAAvqxuO+N+xL3La5JNEZFRDBqXKImMe5mxsSFxSXDZD4UN9S4a1QU4sIiogIiSMugguOYOCoge88fNZZtd3V1VXct91Y9z6/+gO7qW7dOnXrfe85777mJ/n12CQBUnjaaAEACAEACAEACAEACAEACAEACAEACAEACAEACAEACAEACAEACAEACAEACAKCQqlrwN397+t/embugri5UVbW9deS4uXNrkz9JJBIdO7S/deTdM998J/mT5PNffnnGhht+b9EHS5548sXkT276wyWjxtxz682XH3zomakNpp7cq9cWr742c+KLU0IIY/987YwZc24dOS6EMHzYT956+90XX5qafOZzz4x9+ZUZv73y1uR/r7js7ME1O+134GkhhB8dXHP0UQesXr2murrqwQnPPP3M5Pq7XV1d9djjE596elLjl77vgacK2txPPX5H8i2n9YMe3QcO7PvIX58rebc4+aTD7r7nsQK908yNkJf9af3+gwSQ3po1a4afd00IoWfPzS+56Mwzh1xR/ye/uWzoqadfmvpJ0sABfY895sBkAujQoX2XTTZ6b8GixhtMOvzQffr+sOfEF6d07Nh+7dp1W/frlfx5v369/v/dj6aetnr16i226NqmTZt169YlEolu3TZZvXp1CGGnHQcc8qO9zjv/2qVLl3fu3PGG6y789NPPpr8+K/Uq7duvd/21F6xYsXLii1MavHRpvb/ww/cXfhiFPTklYgE01/05RQKAAiWAlNraD7p13fhbIez9D7+/8QaNn/n2rHmXXnJm27Zt165du8P220yd+laGzb49e96+++wSQth6696vvTZzt922q66urqtb1759u88++7z+M+fNW9ivb8/Zc97r3XvLBbWLemzZLYRw4gmHjBozfunS5SGEpUuXjx4z/uenHTP99Vmpv1qxYuXoMeOHn/uT5CCjWcccfcCPDh4c6urG3HHfp59+duEFP+/cueMTT750/wNPJY9nX5o0fdCgvuPvfWJA/z7/b5s+Ex5+NvWrxx6fuPXWvUNduOb6MUuW/Hdyg+uv3+m84T/dcMPvVVdVjRx9T2oIUv/ouKnN/qBH9/o7sMEG373owtPXX7/Txx9/usvOAw89YkiGjade4qFHnhvQv0/nzh3H/vtDkyZP33DD715y0ZkdO7Rf/tWK62+848gj9uvQof1Nf7jk/F9dn/qTtDvT4A/r6kJyZxYv/qTZd5rUYAv//Ofn9ccHyX///LRjUvvTuEkzP983HEKBagDbb7fN/Pf+s/5Pdtyh/4wZcxo/c926dXPmvLfN1r1DCLvusu3kl1/PsNmFCz/q2q1LIpHov02fN99699157/fZasvevbecO7e2wTOnTnt7px0HhBB22rH/1KlvJ3+45Zbd5s9f+E2SmL+wR4/NGvzhgtpF3TfbJMu3+bOfHHnuiKuuvHrUAfvvfvRR+99+533nDr/6xOMPSf62XbvqRx97fsR515x/3qkPTnh2xC+vSf2qurp67rvvDxt+1aOPvzBs6CmpDQ4dcuKEh5795QXXXXXNqF9deHraF21qsw124JyzT3ph4pRhw696adLUDh3Wy2bjVVVVn3/+5bkjrr7s8j8NH/aTEMKwoSc//8Krw0Zc9fwLr55z9kn/NnbCV1+tqB89m9qZBn+Y2pnJf5/erl11NjvTYAtpm6L+/jTVpE09H8jzCKCqquqWP12WSCSWLl1+wx/uSv2kqqpqiy26/vTUi1M/ST7/9jvvnz17/suvvLHzzgPfevvdbbbu/a9/HNt4g/WfvGjR4s27b9qvX8/7HniyS5eNtt6699q1a998c26DPZk27e2jjtxv7F8e2n7bbR55JP3UeSKRqKtr+MO2bduuWbM27UuHEH5x+nED+vd5cMIzkyZPDyG8NuXNyy49++G//u2a68Z07Nh+33123W3XbTt16vB1bqub++7769atW7Nmzbvv1q6rq2vfvl3yV3V1dZMnTw8hTHxxav3ottOOAzb7Ov10aL9echarUcpMv9nRt4+vvwPbDuqX/AheeXXm2nV12Wy8TZvEk0+9FEJYvOSTTp07hhAGDep33Q13hhBemDjlrDOPT5e/0+9Mgz+sW1eX685kfulEouEBSlNN2tTzgULVABr/5KQTDj34oJq773ms8XOmTH3zuGMPenGrHvPmL1y7dm3mDc6aNb9fv17rtWu3fPmKWbPnnfazo9esWfvnsQ822JMvvlxaV1fXpctGIYRly79KDSD6bNVj1uz5yf/22arHwkYT6/369lpQ+0Halw4h3PXnB+r/99rrbx84oO9xxx60/767bbTR916a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';

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
  async publishAppPreview() {
    // No main process in the browser preview, so there is no scheme to serve
    // from. App Builder needs Ollama anyway, so this path is unreachable in
    // practice; null makes the caller fall back rather than guess.
    return null;
  },
  async getGpuContention() {
    await delay(200);
    // The browser preview has no graphics card to read. "unknown" is the honest
    // answer — reporting "clear" would be inventing a hardware measurement, the
    // same mistake as the demo scores that once drifted from the real weights.
    return {
      level: 'unknown' as const,
      reasons: [],
      apps: [],
      utilizationPercent: null,
      vramUsedPercent: null,
      message: 'RigMatch checks your graphics card for other running programs before a test. The browser preview has no graphics card to check.',
      source: null,
    };
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
    // Image-generation requests carry width/height (no other advanced-lab
    // challenge does) and return an image, not streamed text.
    if (request.width) {
      await delay(900);
      return { image: PREVIEW_IMAGE_GENERATION_SAMPLE, response: '', done_reason: 'preview' };
    }

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
  async openRouterGenerate() {
    await delay(200);
    return { response: '', error: 'Cloud judging is unavailable in preview mode.' };
  },
  async abortAdvancedGenerate() { /* no-op in preview */ },
  async cancelBenchmark() { /* no-op in preview */ },
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

    const demoPrompts = promptPlan.map((prompt, index) => ({
      ...prompt,
      tokensPerSecond: Math.max(22, scores.speed + 12 - index * 7),
      sobrietyScore: Math.max(40, scores.sobriety - index * 2),
      elapsedMs: 650 + index * 35,
      response: demoBenchmark.prompts[index % demoBenchmark.prompts.length]?.response ?? '',
      doneReason: 'preview',
    }));

    return {
      ...demoBenchmark,
      model: request.model,
      baseUrl: request.baseUrl || demoBenchmark.baseUrl,
      questionCount,
      completedAt: new Date().toISOString(),
      scores,
      // Averaged from the per-prompt rates above, the same way the real engine
      // derives it -- otherwise the preview has no throughput to show and every
      // demo scorecard falls back to the vague "20+ tok/s" estimate.
      avgTokensPerSecond: Math.round(
        (demoPrompts.reduce((sum, p) => sum + p.tokensPerSecond, 0) / demoPrompts.length) * 10,
      ) / 10,
      prompts: demoPrompts,
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
      latestName: channel === 'nightly' ? 'Preview nightly channel' : 'RigMatch preview release',
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

/**
 * Sample sub-scores per model family for the browser demo.
 *
 * The total and grade are COMPUTED from the same weights and bands the real
 * benchmark uses — never hand-written. Previously they were typed by hand and
 * drifted up to 3.6 points from what the published weights produce (phi3:mini
 * showed 84 in the header while its own breakdown reproduced 87.6), and one
 * entry carried an "A-" that exists in no grade table. That made the demo look
 * like the app disagreed with itself about its own headline number.
 */
function demoScoresForModel(model: string) {
  const lower = model.toLowerCase();

  const signals =
    lower.includes('qwen') ? { speed: 92, sobriety: 94, stability: 96, fit: 90 }
    : lower.includes('llama') ? { speed: 97, sobriety: 84, stability: 94, fit: 95 }
    : lower.includes('mistral') ? { speed: 84, sobriety: 90, stability: 91, fit: 84 }
    : lower.includes('gemma') ? { speed: 91, sobriety: 78, stability: 90, fit: 98 }
    : lower.includes('phi') ? { speed: 99, sobriety: 72, stability: 86, fit: 100 }
    : lower.includes('deepseek') ? { speed: 66, sobriety: 96, stability: 82, fit: 72 }
    : { speed: 78, sobriety: 78, stability: 84, fit: 82 };

  const total = Math.round(calculatePreciseTotal({ ...signals, total: 0 }));
  return { ...signals, total, grade: gradeForMatchScore(total) };
}
