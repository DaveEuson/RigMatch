import { bestModelForTask, type TaskGroupId } from './taskScores.ts';
import type {
  AppLogEntry,
  BenchmarkResult,
  BenchmarkStatus,
  CatalogModel,
  LocalModelProvider,
  ModelRow,
  NetworkHost,
  OllamaModel,
  OllamaStatus,
  PullProgressUpdate,
  SystemProfile,
  TestedModelScore,
} from '../types';
import type { NavId } from '../components/SideMenu';
import { getModelFamily, getModelOrigin } from './modelOrigins.ts';
import { normalizeModelKey } from './modelKey.ts';
import { MATCH_GRADE_BANDS, compareTestedModelScores, formatMatchScore, getScoreSortTotal, isLegacyScore } from './scoring.ts';
import { formatBytes, formatBytesPerSecond, formatGb, hashString, formatThroughput } from './format.ts';
import {
  APP_VERSION,
  GITHUB_ISSUES_URL,
  MODE_SPLASH_STORAGE_KEY,
  TUTORIAL_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
  navItems,
  themeOptions,
  type ThemeId,
  type UiMode,
} from './appConfig.ts';

export type ModelSortKey = 'name' | 'params' | 'size' | 'skill' | 'origin' | 'source' | 'status' | 'score' | 'speed' | 'pulls';
export type SortDirection = 'asc' | 'desc';
export type ModelQuickFilterId = 'all' | 'installed' | 'fits-vram' | 'scored' | 'unscored' | 'good-score' | 'low-score' | 'huge';
export type ListTestResult = {
  winner: string;
  results: TestedModelScore[];
};
export type ModelProfile = {
  agentName: string;
  archetype: string;
  specialties: string[];
  hue: number;
  accentHue: number;
  variant: 'visor' | 'helmet' | 'chrome' | 'arcade' | 'pilot' | 'nova';
};

export type RigPick = {
  row: ModelRow;
  score?: TestedModelScore;
  profile: ModelProfile;
  tone: 'scored' | 'installed' | 'download';
  fitLabel: string;
  reason: string;
};

export type HardwareFit = {
  tone: 'sweet-spot' | 'good' | 'tight' | 'unknown' | 'out-of-league';
  label: string;
  detail: string;
  recommend: boolean;
};
/**
 * What a provider says a model can do, when it says anything.
 *
 * Ollama reports this from `/api/show` — observed vocabulary on 0.32.9:
 * `completion`, `vision`, `tools`, `image`. It is only available for installed
 * models; the browsable catalogue cannot be asked, so the name heuristics below
 * remain the fallback rather than being replaced.
 */
export type CapabilityBearing = {
  capabilities?: string[];
  installedModel?: { capabilities?: string[] };
  displayName?: string;
  name?: string;
};

/**
 * What this model can do, best source first.
 *
 * The installed model wins. That comes from /api/show — the provider
 * describing a file it actually has — whereas `row.capabilities` on a
 * catalogue entry is what the Ollama website lists for the family, which is
 * coarser: it covers a family rather than a tag, so a family listed as
 * seeing does not prove that its 0.5b tag does.
 *
 * Both beat guessing from the name, which is why callers prefer this and fall
 * back to a name rule only when it returns null.
 */
export function getModelCapabilities(row: CapabilityBearing): string[] | null {
  const reported = row.installedModel?.capabilities ?? row.capabilities;
  return Array.isArray(reported) && reported.length > 0 ? reported : null;
}

/**
 * Whether this model can answer at all through the provider it is installed on.
 *
 * An image model can be pulled and reports `capabilities: ['image']`, but
 * generating returns "image generation models are not currently supported" and
 * chatting returns "does not support chat" — Ollama distributes them without
 * being able to run them. Measured on 0.32.9 against x/flux2-klein. Anything
 * that cannot complete must be kept out of chat, out of benchmarks, and out of
 * a lineup, or it scores an F for a fault that is not its own.
 *
 * Unknown capabilities mean an older provider or a catalogue entry, and those
 * are assumed runnable — the previous behaviour, and wrong only for the handful
 * of image models.
 */
export function canGenerateText(row: CapabilityBearing & { generationKind?: string }): boolean {
  // A ComfyUI checkpoint is settled before any capability lookup: it produces
  // pixels, not words, and it has no capabilities field — which the fallback
  // below reads as "assume runnable". That default exists so unknown Ollama
  // catalogue entries are not excluded, and without this line it quietly
  // qualified Stable Diffusion for a conversation benchmark.
  if (row.generationKind) return false;
  const capabilities = getModelCapabilities(row);
  if (capabilities) return capabilities.includes('completion');
  return !isLikelyImageGenerationModel(row.displayName ?? row.name ?? '');
}

/**
 * Models fit to mark another model's prose, most capable first.
 *
 * The judge reads an answer and scores it, so it has to be able to hold a
 * conversation — an embedding model, a ComfyUI checkpoint or an OCR model
 * cannot, and picking one produces confident nonsense rather than an error.
 * That mattered less when judging was opt-in and hand-picked; now that chat
 * and writing questions are marked by a judge automatically, the default
 * cannot simply be "the biggest file installed".
 *
 * Sorted largest-first because a bigger model is the better grader, with the
 * known-weak ones pushed to the back rather than dropped — they are still
 * better than scoring prose by its length.
 */
export function textJudgeCandidates(
  rows: Array<CapabilityBearing & { generationKind?: string; sizeGb?: number | null }>,
): string[] {
  const names = [...rows]
    .filter((row) => canGenerateText(row) && !isEmbeddingModel(row.displayName ?? row.name ?? ''))
    .sort((a, b) => (b.sizeGb ?? 0) - (a.sizeGb ?? 0))
    .map((row) => row.displayName ?? row.name ?? '')
    .filter(Boolean);
  return [
    ...names.filter((name) => !WEAK_TEXT_JUDGE.test(name)),
    ...names.filter((name) => WEAK_TEXT_JUDGE.test(name)),
  ];
}

/**
 * Models that answer but grade badly. OCR models transcribe rather than judge,
 * and the small llava family answers "1" to almost anything — both measured
 * while validating the image judge, and both equally useless on prose.
 */
const WEAK_TEXT_JUDGE = /\bocr\b|deepseek-ocr|got-ocr|olmocr|bakllava|^llava|\/llava/i;

/**
 * Whether a model can sit in the Speed Dating lineup at all.
 *
 * The comparison is a text conversation: every contestant answers the same
 * questions and is graded on the answers. That is the shared floor, and only
 * models that claim it may enter — not because differing capabilities make a
 * comparison unfair in general (a vision model versus a text model is a fair
 * chat comparison; the vision skill simply is not being graded), but because a
 * model with no text floor at all would be graded on a skill it never
 * claimed. Generation models compare against each other in the Lab instead,
 * where a batch run gives every checkpoint the same prompt and the same seed.
 */
export function canJoinComparison(row: ModelRow): boolean {
  return row.runtime !== 'comfyui' && canGenerateText(row) && !isEmbeddingModel(row.displayName);
}

/**
 * Whether this model can be sent audio.
 *
 * Verified on 0.32.9: gemma4:e2b reports `audio` and transcribed a synthesised
 * 42-word passage at 90/100 in 11 seconds, with the WAV passed in the same
 * `images` array that carries pictures. gemma3:4b reports `vision` but not
 * `audio`, and the identical request fails with "Failed to load image or audio
 * file" — so this gate is what stands between a listening test and a guaranteed
 * error scored against the model.
 *
 * Name matching is not offered as a fallback: nothing in a model's name
 * reliably says it can hear, and guessing wrong produces that failure.
 */
export function canHearAudio(row: CapabilityBearing): boolean {
  return getModelCapabilities(row)?.includes('audio') ?? false;
}

/**
 * Models that generate an image.
 *
 * Prefers what the provider reports, and falls back to the family name for
 * anything not installed. The name rule used to return true for anything under
 * `x/`, which is simply Ollama's community namespace and says nothing about
 * what a model does — it tagged `x/canary` as an image generator, a third of
 * everything the "Makes images" filter returned.
 */
export function isImageGenerationModel(row: CapabilityBearing): boolean {
  const capabilities = getModelCapabilities(row);
  if (capabilities) return capabilities.includes('image');
  return isLikelyImageGenerationModel(row.displayName ?? row.name ?? '');
}
/** Name-only fallback, for models the provider cannot be asked about. */
export function isLikelyImageGenerationModel(model: string): boolean {
  const full = (model || '').toLowerCase();
  // Readers and encoders are the easiest thing to confuse with generators.
  if (/ocr|vision|\bvl\b|-vl\b|embed/.test(full)) return false;
  const name = full.includes('/') ? full.slice(full.lastIndexOf('/') + 1) : full;
  return /flux|z-image|qwen-image|stable-?diffusion|\bsdxl\b|\bsd3\b|hidream|pixart|kolors|playground-v|lumina-image|\bchroma\b/
    .test(name);
}
/** Multimodal models that can READ an image the user sends (vision/OCR), as
   opposed to models that GENERATE images. Used to offer image upload in chat. */
export function isVisionModel(model: string): boolean {
  const name = (model || '').toLowerCase();
  if (isLikelyImageGenerationModel(name)) return false; // generators, not readers
  return /vision|llava|bakllava|moondream|minicpm-?v|\bvl\b|-vl\b|\bvl[:-]|qwen2\.?5?-?vl|granite[\w.-]*vision|\bocr\b|smolvlm|pixtral|gemma3|llama3\.2-vision|internvl|cogvlm|florence/.test(name);
}
export function isBenchmarkResult(value: unknown): value is BenchmarkResult {
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

export function isListTestResult(value: unknown): value is ListTestResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.winner === 'string' &&
    Array.isArray(value.results) &&
    value.results.every(isTestedModelScore)
  );
}

export function isModelScores(value: unknown): value is Record<string, TestedModelScore> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isTestedModelScore);
}

export function isBenchmarkByModel(value: unknown): value is Record<string, BenchmarkResult> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isBenchmarkResult);
}

export function isTestedModelScore(value: unknown): value is TestedModelScore {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function normalizeBenchmarkResultModel(result: BenchmarkResult, model: string): BenchmarkResult {
  return result.model === model ? result : { ...result, model };
}

export function upsertBenchmarkResults(
  current: Record<string, BenchmarkResult>,
  results: BenchmarkResult[],
) {
  return results.reduce<Record<string, BenchmarkResult>>((next, result) => {
    next[normalizeModelKey(result.model)] = result;
    return next;
  }, { ...current });
}

export function getRecentModelScores(modelScores: Record<string, TestedModelScore>) {
  return Object.values(modelScores)
    .filter(isTestedModelScore)
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}


export function buildShareableScorecard(
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
    // Ranking is by the one-decimal preciseTotal, so the "=" tie marker must use
    // it too — comparing integer totals marks 85.4 and 84.6 as tied (both "85").
    const tied = prev !== undefined
      && Math.abs((prev.preciseTotal ?? prev.total) - (score.preciseTotal ?? score.total)) < 0.05;
    const rank = tied ? '=' : `${i + 1}`;
    const toks = formatThroughput(score);
    return `| ${rank} | ${score.model} | ${formatMatchScore(score)} | **${score.grade}** | ${toks} | ${score.sobriety} | ${score.fit} |`;
  });

  const sections: string[] = [
    `## 🏆 My Local AI Results — RigMatch`,
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
      sections.push(`- **${p.label}:** ${p.model} (${p.score.total} · ${p.score.grade} · ${formatThroughput(p.score)})`);
    }
  }

  sections.push(
    '',
    '---',
    '_Scored with [RigMatch](https://github.com/DaveEuson/RigMatch) — benchmarks your installed Ollama models and finds your best local AI match._',
  );

  return sections.join('\n');
}

export function getRankedModelScores(modelScores: Record<string, TestedModelScore>) {
  return Object.values(modelScores)
    .filter((s) => isTestedModelScore(s) && !isCloudModel(s.model))
    .sort(compareTestedModelScores);
}

export function getModelScore(row: ModelRow, modelScores: Record<string, TestedModelScore>) {
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

export function getBenchmarkForModel(
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

export function getModelAliases(row: ModelRow) {
  return Array.from(new Set([
    row.id,
    row.displayName,
    `${row.name}:${row.tag}`,
    row.installedModel?.model,
    row.installedModel?.name,
  ].filter(Boolean) as string[]));
}

export function ollamaModelMatchesAliases(model: OllamaModel, aliases: string[]) {
  return aliases.includes(model.model) || aliases.includes(model.name);
}

export function removeModelScores(current: Record<string, TestedModelScore>, aliases: string[]) {
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

export function removeBenchmarkResults(current: Record<string, BenchmarkResult>, aliases: string[]) {
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

export function removeListTestScores(current: ListTestResult | null, aliases: string[]) {
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

export function isBenchmarkForAliases(benchmark: BenchmarkResult, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeModelKey);
  return normalizedAliases.includes(normalizeModelKey(benchmark.model));
}

export function createEmptyBenchmark(model: string, baseUrl: string): BenchmarkResult {
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

export function addSetValues(current: Set<string>, aliases: string[]) {
  const next = new Set(current);
  aliases.forEach((alias) => next.add(alias));
  return next;
}

export function removeSetValues(current: Set<string>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeModelKey);
  return new Set([...current].filter((value) =>
    !aliases.includes(value) && !normalizedAliases.includes(normalizeModelKey(value)),
  ));
}

export function isBenchmarkForModel(
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

export function formatBenchmarkBanner(status: BenchmarkStatus): string {
  const model = status.model ?? 'a model';
  const snap = status.snapshot;
  const parts: string[] = [`Benchmark running — ${model}`];
  if (snap) {
    if (typeof snap.promptIndex === 'number' && typeof snap.promptTotal === 'number' && snap.promptTotal > 0) {
      parts.push(`question ${Math.min(snap.promptTotal, snap.promptIndex + 1)}/${snap.promptTotal}`);
    }
    if (typeof snap.runIndex === 'number' && typeof snap.runTotal === 'number' && snap.runTotal > 1) {
      parts.push(`run ${snap.runIndex + 1}/${snap.runTotal}`);
    }
  }
  return parts.join(' · ');
}


export function getResultExplanation(
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
    title: `${profile.agentName} scored ${formatMatchScore(score)} (${score.grade})`,
    body: `${model} is a ${score.grade} match because ${strongestTrait}, scored ${score.speed}% speed, ${score.sobriety}% answer quality, and ${score.fit}% computer fit on ${host?.hostname ?? 'this computer'}. ${caution}`,
    bottleneck,
  };
}

export function getModelProfileHighlights(
  row: ModelRow | undefined,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  vramGb: number,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const origin = getModelOrigin(row?.displayName ?? '');
  const redFlag = sizeGb && vramGb > 0 && sizeGb > vramGb
    ? sizeGb <= vramGb * 1.15 ? 'RAM assist' : 'Too big for VRAM'
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

export function getRigPick(
  rows: ModelRow[],
  scores: Record<string, TestedModelScore>,
  vramGb: number,
  clearedMatches = new Set<string>(),
): RigPick | null {
  const fittingRows = rows.filter((row) => modelFitsVram(row, vramGb) && !isClearedTopMatch(row, clearedMatches));
  if (fittingRows.length === 0) return null;

  const scoredPick = fittingRows
    .map((row) => ({ row, score: getModelScore(row, scores) }))
    .filter((item): item is { row: ModelRow; score: TestedModelScore } =>
      Boolean(item.score) && !isCloudModel(item.row.displayName))
    .sort((left, right) => compareTestedModelScores(left.score, right.score))[0];

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

export function isClearedTopMatch(row: ModelRow, clearedMatches: Set<string>) {
  if (clearedMatches.size === 0) return false;
  const clearedKeys = new Set([...clearedMatches].map(normalizeModelKey));
  return getModelAliases(row).some((alias) => clearedMatches.has(alias) || clearedKeys.has(normalizeModelKey(alias)));
}

export function getHardwareRecommendationScore(row: ModelRow, vramGb: number) {
  const sizeGb = row.sizeGb ?? 0;
  const targetGb = vramGb > 0 ? Math.max(2, vramGb * 0.55) : 4;
  const statusBoost = row.installed ? 40 : row.live ? 8 : 0;
  const sizeBoost = Math.min(sizeGb, targetGb) * 3;
  const distancePenalty = Math.abs(sizeGb - targetGb) * 4;

  return statusBoost + sizeBoost - distancePenalty;
}

export function getRigPickFitLabel(row: ModelRow, vramGb: number) {
  if (!row.sizeGb) return 'Size unknown';
  if (vramGb <= 0) return `${formatGb(row.sizeGb)} model`;
  const headroomGb = Math.max(0, vramGb - row.sizeGb);
  if (headroomGb >= Math.max(2, vramGb * 0.25)) return `${formatGb(headroomGb)} headroom`;
  if (headroomGb > 0) return `${formatGb(headroomGb)} tight headroom`;
  return 'RAM-assisted';
}

export function sortModelRows(
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

export function getModelSortValue(
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
      return getModelGoodForTags(row).join(' ');
    case 'origin':
      return getModelOrigin(row.displayName).country;
    case 'source':
      return row.source;
    case 'status':
      return getModelStatusRank(row, queued);
    case 'score': {
      // Use the one-decimal precise total so near-ties order the same way the
      // Scorecards ranking does, not alphabetically off a coarser integer total.
      const score = getModelScore(row, modelScores);
      return score ? getScoreSortTotal(score) : -1;
    }
    case 'speed':
      // Rank strictly by measured tok/s (a single scale), looked up with the same
      // normalized key benchmarkByModel is stored under. Untested rows sort last,
      // matching the "Not tested" cell — no mixing in the 0-100 speed score.
      return getBenchmarkForModel(benchmarkByModel, row.displayName, row)?.avgTokensPerSecond ?? -1;
    case 'pulls':
      return row.pulls ?? -1;
    case 'name':
    default:
      return row.displayName;
  }
}

/** Capability and runtime words for the search haystack, with the synonyms a
    person actually types — "hears" for the audio capability, "comfyui" for a
    generation row. Completion is skipped: every chat model has it, so it only
    adds noise. */
function describeCapabilitiesForSearch(row: ModelRow): string[] {
  const words: string[] = [];
  for (const capability of getModelCapabilities(row) ?? []) {
    if (capability === 'audio') words.push('audio hears listening transcribe');
    else if (capability === 'vision') words.push('vision sees reads images');
    else if (capability === 'tools') words.push('tools function calling');
    else if (capability === 'thinking') words.push('thinking reasoning');
    else if (capability !== 'completion') words.push(capability);
  }
  if (row.runtime === 'comfyui') words.push('comfyui generation');
  if (row.generationKind === 'image') words.push('image generation makes images');
  if (row.generationKind === 'video') words.push('video generation makes video');
  if (row.generationKind === 'text-encoder') words.push('text encoder');
  if (row.publisher) words.push(row.publisher);
  return words;
}

export function getModelSearchText(row: ModelRow, queued: boolean, score?: TestedModelScore) {
  const profile = getModelProfile(row.displayName);
  const goodForTags = getModelGoodForTags(row);
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
    ...goodForTags,
    // Capabilities, in the words a person would type. The cold walkthrough
    // searched "audio" for a model that can hear and got "no contestants
    // match" — the ability existed, the haystack just never carried it.
    ...describeCapabilitiesForSearch(row),
  ]
    .join(' ')
    .toLowerCase();
}

export function getModelStatusLabel(row: ModelRow, queued: boolean) {
  if (row.installed) return 'Installed';
  if (queued) return 'Queued';
  if (row.live) return 'Available';
  return 'Not Installed';
}

export function getModelStatusRank(row: ModelRow, queued: boolean) {
  if (row.installed) return 3;
  if (queued) return 2;
  if (row.live) return 1;
  return 0;
}

export function getParamSortValue(params: string) {
  const match = params.match(/(\d+(?:\.\d+)?)\s*([bm])/i);
  if (!match) return -1;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return -1;

  return match[2].toLowerCase() === 'm' ? value / 1000 : value;
}

export function getModelSortLabel(sortKey: ModelSortKey) {
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

export function mergeModelRows(catalog: CatalogModel[], installedModels: OllamaModel[]): ModelRow[] {
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
      localProvider: installed?.provider,
      localProviderLabel: installed?.providerLabel,
      localBaseUrl: installed?.baseUrl,
      canDownload: !installed || installed.provider !== 'lm-studio',
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
      source: model.provider === 'lm-studio' ? 'LM Studio local' : 'Ollama local',
      live: false,
      installed: true,
      ready: true,
      installedModel: model,
      installLabel: 'Installed',
      localProvider: model.provider ?? 'ollama',
      localProviderLabel: model.providerLabel ?? (model.provider === 'lm-studio' ? 'LM Studio' : 'Ollama'),
      localBaseUrl: model.baseUrl,
      canDownload: model.provider !== 'lm-studio',
    }));

  return [...extras, ...dedupedRows.values()].slice(0, 500);
}

// Re-exported from the leaf module so storage layers (runHistory) can key by
// model without importing this file's React/asset graph.
export { normalizeModelKey } from './modelKey.ts';

export function isCloudModel(model: string): boolean {
  const lower = (model || '').toLowerCase();
  return lower.includes('-cloud') || lower.endsWith(':cloud') || lower.includes('cloud:');
}

export function isEmbeddingModel(model: string): boolean {
  const lower = (model || '').toLowerCase();
  return lower.includes('embed') || lower.includes('minilm') || lower.includes('bge-');
}

export function shouldPreferModelRow(next: ModelRow, current: ModelRow) {
  if (next.installed !== current.installed) return next.installed;

  const nextExact = normalizeModelKey(`${next.name}:${next.tag}`) === normalizeModelKey(next.displayName);
  const currentExact = normalizeModelKey(`${current.name}:${current.tag}`) === normalizeModelKey(current.displayName);
  if (nextExact !== currentExact) return nextExact;

  if (next.live !== current.live) return next.live;
  if (Boolean(next.sizeGb) !== Boolean(current.sizeGb)) return Boolean(next.sizeGb);
  if (next.source === 'Ollama local' && current.source !== 'Ollama local') return true;

  return false;
}

export function getAgentName(model: string) {
  return getModelProfile(model).agentName;
}

export function getPlatformName(platform: string) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return platform || 'This machine';
}

export function createRunProgressId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getCudaSummary(cuda: SystemProfile['cuda']) {
  if (cuda.status === 'not-nvidia') return 'No NVIDIA GPU';
  if (cuda.status === 'current') return `CUDA ready (${cuda.toolkitVersion})`;
  if (cuda.status === 'behind') return 'CUDA update available';
  // Driver is present but the developer toolkit (nvcc) isn't installed — models still run fine via the driver
  if (cuda.status === 'toolkit-missing') return 'Driver ready, toolkit optional';
  if (cuda.driverCudaVersion) return `Driver CUDA ${cuda.driverCudaVersion}`;
  return 'Unknown';
}

export function getCudaDetail(cuda: SystemProfile['cuda']) {
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

export function getSelectedContestantBlurb(
  row: ModelRow,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  hardwareFit: HardwareFit,
) {
  // A generation model never reaches Speed Dating, so nothing below applies —
  // and the profile passed in is the personality profiler's invention, which
  // described a video checkpoint as "chat, utility, experiments" in review.
  if (row.generationKind) {
    const makes = row.generationKind === 'text-encoder'
      ? 'reads prompts for image and video models'
      : `makes ${row.generationKind}s`;
    return `${row.displayName} ${makes} on ComfyUI. It does not chat, so it skips Speed Dating — run it from the Lab instead.`;
  }

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

export function getLocalRigDetailCards(host: NetworkHost, system: SystemProfile, ollama: OllamaStatus) {
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

export function getRemoteRigDetailCards(host: NetworkHost) {
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

export function getFootprintFit(sizeGb: number | null, system: SystemProfile) {
  if (!sizeGb) return 'Unknown model size';

  const vramGb = system.gpu.vramGb || 0;
  if (vramGb > 0 && sizeGb <= vramGb * 0.55) return 'Comfortable VRAM headroom';
  if (vramGb > 0 && sizeGb <= vramGb * 0.8) return 'Good VRAM fit';
  if (vramGb > 0 && sizeGb <= vramGb) return 'Tight VRAM fit';
  if (vramGb > 0 && sizeGb <= vramGb * 1.15) return 'RAM-assisted trial';
  if (vramGb > 0 && sizeGb > vramGb * 1.15) return 'Too big for this rig';
  if (sizeGb <= system.memory.availableGb * 0.45) return 'Likely RAM-assisted';
  return 'Memory-heavy candidate';
}

export function isHostBenchmarkReady(host: NetworkHost | undefined, ollama: OllamaStatus) {
  return !getHostBenchmarkBlocker(host, ollama);
}

export function getModelRuntime(row: ModelRow | undefined, ollama: OllamaStatus): { provider: LocalModelProvider; providerLabel: string; baseUrl: string } {
  const provider = row?.localProvider ?? 'ollama';
  return {
    provider,
    providerLabel: row?.localProviderLabel ?? (provider === 'lm-studio' ? 'LM Studio' : 'Ollama'),
    baseUrl: row?.localBaseUrl ?? row?.installedModel?.baseUrl ?? ollama.baseUrl,
  };
}

export function getModelBenchmarkBlocker(row: ModelRow | undefined, host: NetworkHost | undefined, ollama: OllamaStatus) {
  // Checked before the host, because no host can run it: a benchmark asks
  // questions and grades answers, and a checkpoint has no chat endpoint to
  // ask. The row action cell and the shortlist were gated for this; the
  // detail panel's TEST MODEL calls straight through to here and was not.
  if (row && !canJoinComparison(row)) {
    return `${row.displayName} cannot be tested this way — the test asks questions and grades the answers, and this model draws instead of chatting. Run it from the Lab.`;
  }
  if (row?.localProvider === 'lm-studio') return null;
  return getHostBenchmarkBlocker(host, ollama);
}

export function getLineupBenchmarkBlocker(rows: ModelRow[], host: NetworkHost | undefined, ollama: OllamaStatus) {
  return rows.some((row) => row.localProvider !== 'lm-studio') ? getHostBenchmarkBlocker(host, ollama) : null;
}

export function getHostBenchmarkBlocker(host: NetworkHost | undefined, ollama: OllamaStatus) {
  if (!host || host.isLocal || host.isDemo) {
    return ollama.ready ? null : 'Ollama must be running before RigMatch can test a model.';
  }

  if (host.discovery === 'computer') {
    return `${host.hostname} is not available in RigMatch v1. Remote systems are planned for RigMatch 2.0.`;
  }

  if (host.status.toLowerCase() !== 'ready' || !host.provider.toLowerCase().includes('ollama')) {
    return `${host.hostname} is not ready for testing yet. RigMatch needs an Ollama API at ${host.baseUrl}.`;
  }

  return null;
}

export function getNavLabel(id: NavId) {
  return navItems.find((item) => item.id === id)?.label ?? 'Panel';
}

export function getThemeLabel(id: ThemeId) {
  return themeOptions.find((theme) => theme.id === id)?.label ?? 'Stage Plum';
}

export function getSavedThemeId(): ThemeId {
  const savedThemeId = window.localStorage.getItem('agentArcadeTheme');
  return isThemeId(savedThemeId) ? savedThemeId : 'orange';
}

export function getSavedUiMode(): UiMode {
  const savedMode = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
  return savedMode === 'advanced' ? 'advanced' : 'beginner';
}

/** True once the user has made an explicit Simple/Advanced choice on the
   first-launch splash. Controls whether that splash is shown. */
export function hasChosenInterfaceMode(): boolean {
  return window.localStorage.getItem(MODE_SPLASH_STORAGE_KEY) != null;
}

export function getSavedTutorialSeen() {
  return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'seen';
}

export function isThemeId(value: string | null): value is ThemeId {
  return themeOptions.some((theme) => theme.id === value);
}

export function getModelProfile(model: string): ModelProfile {
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

export const TASK_CATEGORIES = [
  { id: 'coding',    label: 'Best for coding',    keywords: ['coding', 'math', 'json/tools', 'instructions'] },
  { id: 'writing',   label: 'Best for writing',   keywords: ['writing', 'summaries', 'brainstorming'] },
  { id: 'assistant', label: 'Best assistant',     keywords: ['assistant', 'daily chat', 'general help', 'chat', 'utility'] },
  { id: 'reasoning', label: 'Best for reasoning', keywords: ['reasoning', 'hard prompts', 'logic'] },
  { id: 'tiny',      label: 'Best tiny model',    keywords: ['low memory', 'small rigs', 'quick chat'] },
  { id: 'vision',    label: 'Best for image/OCR', keywords: ['image analysis', 'ocr', 'vision'] },
  { id: 'search',    label: 'Best for search',    keywords: ['embeddings', 'search', 'similarity'] },
  { id: 'speed',     label: 'Fastest on this rig', keywords: [] },
] as const;

export type TaskCategoryId = typeof TASK_CATEGORIES[number]['id'];
export type ModelTaskFilterId = TaskCategoryId | 'uncensored' | 'imagegen' | 'videogen' | 'hears' | 'videoread' | 'audiogen';

export const TASK_FILTER_CHIPS: Array<{ id: ModelTaskFilterId; label: string }> = [
  { id: 'coding',     label: 'Coding' },
  { id: 'assistant',  label: 'Chat' },
  { id: 'writing',    label: 'Writing' },
  { id: 'reasoning',  label: 'Reasoning' },
  { id: 'tiny',       label: 'Tiny' },
  { id: 'imagegen',   label: 'Makes images' },
  { id: 'videogen',   label: 'Makes video' },
  { id: 'audiogen',   label: 'Makes audio' },
  { id: 'vision',     label: 'Reads images/OCR' },
  { id: 'hears',      label: 'Hears audio' },
  { id: 'videoread',  label: 'Watches video' },
  { id: 'search',     label: 'Search' },
  { id: 'uncensored', label: 'Uncensored' },
];

/**
 * Models that read video the user sends.
 *
 * Ollama's capability vocabulary has no 'video' today and its API takes no
 * video input, so this is provider-capability first (future-proof: the moment
 * Ollama reports it, the filter lights up) with a name rule only for models
 * that exist *specifically* for video understanding. Ordinary -vl vision
 * models are deliberately not matched: they read frames as stills, and
 * claiming they "watch video" through an API that cannot send video is the
 * "Makes images: 0 models" lie with a new face. The chip row hides filters
 * with no matches, so until such a model exists this simply does not appear.
 */
export function canWatchVideo(row: CapabilityBearing): boolean {
  const capabilities = getModelCapabilities(row);
  if (capabilities?.includes('video')) return true;
  return /video-?llama|llava-?(next-?)?video|\bapollo\b|video-?chat/i
    .test(row.displayName ?? row.name ?? '');
}

/**
 * Models that produce audio — TTS and music.
 *
 * Name-only, because no local provider reports an audio-output capability and
 * none runs one yet. Same contract as the video chips: recognizable the day
 * they exist, hidden until then.
 */
export function isLikelyAudioGenerationModel(name: string): boolean {
  const lower = (name || '').toLowerCase();
  if (/whisper|transcribe/.test(lower)) return false; // hears, does not speak
  return /\btts\b|text-?to-?speech|kokoro|orpheus|\bbark\b|musicgen|stable-?audio|ace-?step|parler/.test(lower);
}

/** Models that generate video. No local backend runs these yet, so the filter
   is usually empty — it exists so such models are recognizable when they exist. */
export function isLikelyVideoGenerationModel(name: string): boolean {
  const lower = (name || '').toLowerCase();
  if (/ocr|embed/.test(lower)) return false;
  return /\bwan\b|wan2|ltx|ltxv|cogvideo|mochi|hunyuan-?video|stable-?video|\bsvd\b|animatediff|\bveo\b|\bsora\b/.test(lower)
    || (lower.startsWith('x/') && lower.includes('video'));
}

export function isUncensoredModel(name: string): boolean {
  const lower = (name || '').toLowerCase();
  return lower.includes('uncensored') || lower.includes('abliterated') ||
    lower.includes('dolphin') || lower.includes('nous-hermes') ||
    lower.includes('openhermes') || lower.includes('hermes-3') ||
    lower.includes('hermes-2');
}

export function getModelGoodForTags(row: ModelRow): string[] {
  // A checkpoint is not a chat model, and running its filename through the
  // personality profiler produced "chat, utility, experiments" on a video
  // model. What it makes is already known, so nothing needs inferring.
  if (row.generationKind) {
    return row.generationKind === 'image' ? ['makes images']
      : row.generationKind === 'video' ? ['makes video']
      : ['reads prompts for image and video models'];
  }
  const profile = getModelProfile(row.displayName);
  const tags = [
    isLikelyImageGenerationModel(row.displayName) ? 'makes images' : '',
    isLikelyVideoGenerationModel(row.displayName) ? 'makes video' : '',
    ...profile.specialties,
    row.pack,
    row.sizeGb != null && row.sizeGb <= 2.5 ? 'low memory' : '',
    row.pulls != null && row.pulls >= 500000 ? 'popular' : '',
    isUncensoredModel(row.displayName) ? 'unrestricted' : '',
  ];
  const seen = new Set<string>();

  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .map((tag) => tag
      .replace(/^balanced$/, 'balanced')
      .replace(/^lightweight$/, 'low memory')
      .replace(/^quality$/, 'quality')
      .replace(/^reasoning$/, 'reasoning'))
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, 5);
}

/** Plain-language epithet for a model card in Simple Mode (no jargon). */
export function getModelEpithet(row: ModelRow): string {
  const family = getModelFamily(row.displayName);
  if (row.sizeGb != null && row.sizeGb <= 2.5) return 'small & speedy';
  switch (family) {
    case 'qwen': return 'friendly all-rounder';
    case 'mistral': return 'wordsmith';
    case 'llama': return 'quick thinker';
    case 'gemma': return 'polyglot';
    case 'phi': return 'quick thinker';
    case 'deepseek': return 'deep thinker';
    default: return 'friendly all-rounder';
  }
}

/** One plain-language "good for" line for a Simple Mode card (never specs). */
export function getModelGoodForLine(row: ModelRow): string {
  if (isLikelyImageGenerationModel(row.displayName)) return 'Turning your words into pictures';
  const family = getModelFamily(row.displayName);
  switch (family) {
    case 'qwen': return 'Everyday questions and quick writing';
    case 'mistral': return 'Creative writing and summaries';
    case 'llama': return 'Fast everyday help and chat';
    case 'gemma': return 'Chatting and light writing';
    case 'phi': return 'Quick answers on a modest PC';
    case 'deepseek': return 'Working through tricky problems';
    default: return 'Everyday questions and chat';
  }
}

/** Which Simple Mode "dream" filters a model matches. */
export function getModelDreamTags(row: ModelRow): Array<'talk' | 'write' | 'code' | 'image' | 'video'> {
  const tags: Array<'talk' | 'write' | 'code' | 'image' | 'video'> = [];
  if (modelMatchesTask(row, 'assistant')) tags.push('talk');
  if (modelMatchesTask(row, 'writing')) tags.push('write');
  if (modelMatchesTask(row, 'coding')) tags.push('code');
  if (isLikelyImageGenerationModel(row.displayName)) tags.push('image');
  if (isLikelyVideoGenerationModel(row.displayName)) tags.push('video');
  return tags;
}

/**
 * The Models filter that shows a goal's candidates.
 *
 * The splash asks what someone wants to do; this is how that answer reaches
 * the Models screen without inventing a second filter system. Goals with no
 * chip yet return undefined and simply apply no lens — never a wrong one.
 */
export function taskFilterForGoal(goalId: string | undefined): ModelTaskFilterId | undefined {
  switch (goalId) {
    case 'talk': return 'assistant';
    case 'write': return 'writing';
    case 'code': return 'coding';
    case 'transcribe-file': return 'hears';
    case 'describe-image': return 'vision';
    case 'make-images': return 'imagegen';
    // Image-to-video and text-to-video draw from the same checkpoint pool.
    case 'animate-image': return 'videogen';
    case 'make-video': return 'videogen';
    case 'make-audio': return 'audiogen';
    // use-tools has no capability chip yet; json-scored, so Matches can rank
    // it, but the Models screen cannot filter for it until tools capability
    // reporting lands. transcribe-live and ask-documents have no lens either.
    default: return undefined;
  }
}

export function modelMatchesTask(row: ModelRow, task: ModelTaskFilterId): boolean {
  // A generation model says outright what it makes, so nothing here has to
  // infer it from a filename. "sd15.safetensors" matches no image-model name
  // rule, and inferring is what made these filters read zero.
  if (row.generationKind) {
    if (task === 'imagegen') return row.generationKind === 'image';
    if (task === 'videogen') return row.generationKind === 'video';
    // A checkpoint is not a chat model; it matches none of the text tasks.
    return false;
  }
  if (task === 'uncensored') return isUncensoredModel(row.displayName);
  if (task === 'imagegen') return isImageGenerationModel(row);
  if (task === 'videogen') return isLikelyVideoGenerationModel(row.displayName);
  // Provider-reported only, no name fallback: nothing in a name reliably says
  // a model can hear, and matching one that cannot guarantees the "Failed to
  // load image or audio file" error on its scorecard.
  if (task === 'hears') return canHearAudio(row);
  if (task === 'videoread') return canWatchVideo(row);
  if (task === 'audiogen') return isLikelyAudioGenerationModel(row.displayName);
  const category = TASK_CATEGORIES.find((c) => c.id === task);
  if (!category || category.keywords.length === 0) return true;
  const specialties = getModelGoodForTags(row).map((s) => s.toLowerCase());
  return category.keywords.some((kw) => specialties.some((sp) => sp.includes(kw)));
}

export type TaskPick = {
  id: TaskCategoryId;
  label: string;
  model: string;
  score: TestedModelScore;
  /**
   * True when this pick came from questions of that kind actually being asked
   * on this machine, rather than from the catalogue's description of what the
   * model is generally for.
   */
  measured?: boolean;
  /** The measured score for that kind of question, when there is one. */
  taskScore?: number;
};

export function getTaskTopPicks(
  modelScores: Record<string, TestedModelScore>,
  /**
   * True when a score has drifted from the current setup (hardware changed,
   * or the tag now points at different weights). Drifted scores are excluded
   * for the same reason legacy ones are: stale calibration must not crown a
   * winner.
   */
  isDrifted?: (score: TestedModelScore) => boolean,
): TaskPick[] {
  const scored = Object.values(modelScores).filter(
    (s) => !isCloudModel(s.model) && !isLegacyScore(s) && !(isDrifted?.(s) ?? false),
  );
  if (scored.length === 0) return [];

  const picks: TaskPick[] = [];

  // The benchmark asks coding and assistant questions and scores each answer,
  // so for those two categories there is a real result to use. The rest still
  // come from the catalogue's keywords, which describe the model rather than
  // its behaviour here.
  const byModel = Object.fromEntries(scored.map((s) => [s.model, s.taskScores]));
  const measuredFor: Partial<Record<TaskCategoryId, TaskGroupId>> = {
    coding: 'coding',
    assistant: 'chat',
  };

  for (const category of TASK_CATEGORIES) {
    let best: TestedModelScore | null = null;
    let measured: { model: string; score: number } | null = null;

    const measuredTask = measuredFor[category.id];
    if (measuredTask) {
      measured = bestModelForTask(byModel, measuredTask, scored.map((s) => s.model));
      if (measured) {
        best = scored.find((s) => s.model === measured!.model) ?? null;
      }
    }

    if (best) {
      // Already settled by measurement.
    } else if (category.id === 'speed') {
      best = [...scored].sort((a, b) => b.speed - a.speed || compareTestedModelScores(a, b))[0] ?? null;
    } else {
      const matching = scored.filter((s) => {
        const specialties = getModelProfile(s.model).specialties.map((x) => x.toLowerCase());
        return category.keywords.some((kw) => specialties.some((sp) => sp.includes(kw)));
      });
      best = matching.length > 0 ? [...matching].sort(compareTestedModelScores)[0] : null;
    }

    if (best) {
      // Avoid duplicate model entries (keep the first matching category)
      if (!picks.some((p) => p.model === best!.model)) {
        picks.push({
          id: category.id,
          label: category.label,
          model: best.model,
          score: best,
          ...(measured ? { measured: true, taskScore: measured.score } : {}),
        });
      }
    }
  }

  return picks;
}

export function getDiskGuard(rows: ModelRow[], queuedRows: ModelRow[], freeGb: number) {
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

export function getModelQuickFilters(
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
    { id: 'good-score', label: 'B or better', count: rows.filter((row) => isGoodScore(getModelScore(row, scores))).length },
    { id: 'low-score', label: 'Below B', count: rows.filter((row) => isLowScore(getModelScore(row, scores))).length },
    { id: 'huge', label: 'Too Big', count: rows.filter((row) => getHardwareFit(row, vramGb).tone === 'out-of-league').length },
  ];
}

export function modelMatchesQuickFilter(
  row: ModelRow,
  filter: ModelQuickFilterId,
  score: TestedModelScore | undefined,
  vramGb: number,
) {
  if (filter === 'installed') return row.installed;
  if (filter === 'fits-vram') return modelFitsVram(row, vramGb);
  if (filter === 'scored') return Boolean(score);
  if (filter === 'unscored') return row.installed && !score;
  if (filter === 'good-score') return isGoodScore(score);
  if (filter === 'low-score') return isLowScore(score);
  if (filter === 'huge') return getHardwareFit(row, vramGb).tone === 'out-of-league';
  return true;
}

/**
 * The line between a good score and a poor one is where a B begins, taken
 * from MATCH_GRADE_BANDS rather than restated — if the grading ever shifts,
 * these filters shift with it instead of quietly disagreeing.
 */
const GOOD_SCORE_MIN = MATCH_GRADE_BANDS.find((band) => band.grade === 'B')?.min ?? 72;

export function isGoodScore(score: TestedModelScore | undefined): boolean {
  return Boolean(score && score.total >= GOOD_SCORE_MIN);
}

/** Scored, and badly — distinct from unscored, which is not a verdict at all. */
export function isLowScore(score: TestedModelScore | undefined): boolean {
  return Boolean(score && score.total < GOOD_SCORE_MIN);
}

export function modelFitsVram(row: ModelRow, vramGb: number) {
  return getHardwareFit(row, vramGb).recommend;
}

export function getPlatformFit(displayName: string, platform: string): { compatible: boolean; reason: string } {
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

export function getHardwareFit(row: Pick<ModelRow, 'params' | 'sizeGb'>, vramGb: number): HardwareFit {
  const sizeGb = row.sizeGb ?? null;
  const paramsB = getParamSortValue(row.params);
  const vramLabel = vramGb > 0 ? formatGb(vramGb) : 'detected VRAM';

  if (!sizeGb) {
    const looksHuge = paramsB >= 32 && (vramGb <= 0 || vramGb < 24);
    return looksHuge
      ? {
        tone: 'out-of-league',
        label: 'Too big',
        detail: `${row.params} models are too large for ${vramLabel} without a much larger GPU.`,
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
      label: 'Too big',
      detail: `${row.params} is too large for this computer. ${vramLabel} VRAM should stay with smaller models.`,
      recommend: false,
    };
  }

  if (paramsB >= 32 && vramGb < 24) {
    return {
      tone: 'out-of-league',
      label: 'Too big',
      detail: `${row.params} is a heavyweight model for ${vramLabel}. Try a 3B-14B model first.`,
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
    label: `Too big · ${formatGb(sizeGb)}`,
    detail: `${formatGb(sizeGb)} is too much model for ${vramLabel}. Pick a smaller model for this computer.`,
    recommend: false,
  };
}

export function sumQueuedGb(rows: ModelRow[], queuedIds: Set<string>) {
  return rows
    .filter((row) => queuedIds.has(row.displayName))
    .reduce((sum, row) => sum + (row.sizeGb || 0), 0);
}

export function getSizeRisk(sizeGb: number | null) {
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

export function getShortModelName(model: string) {
  return model.replace(':latest', '').replace(/-instruct/gi, '').slice(0, 12);
}

/**
 * A human-friendly display name for beginner surfaces: drops the namespace and
 * size tag and capitalizes. "lmstudio-community/qwen2.5-coder-7b-instruct" and
 * "qwen2.5:7b" both become "Qwen2.5". Raw tags stay available as subtext — a
 * newcomer can't pronounce, remember, or choose between `ollama pull` strings.
 */
export function getFriendlyModelName(model: string): string {
  const base = String(model || '')
    .split('/').pop()!            // drop provider namespace
    .split(':')[0]                // drop the size/quant tag
    .replace(/-instruct$/i, '')
    .replace(/-\d+(\.\d+)?b$/i, ''); // trailing "-7b" style size
  if (!base) return model;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function getQueueChipModelName(model: string) {
  return model.replace(':latest', '').replace(/-instruct/gi, '');
}

export function createQueuedPullProgress(model: string, baseUrl?: string): PullProgressUpdate {
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

export function removePullProgress(
  current: Record<string, PullProgressUpdate>,
  model: string,
) {
  const next = { ...current };
  delete next[model];
  return next;
}

export function removePullProgressForModels(
  current: Record<string, PullProgressUpdate>,
  models: Set<string>,
) {
  const next = { ...current };
  models.forEach((model) => {
    delete next[model];
  });
  return next;
}

export function isVisiblePullProgress(progress?: PullProgressUpdate) {
  return Boolean(progress && progress.phase !== 'queued');
}

export function getPullProgressPercent(progress: PullProgressUpdate | undefined, queued: boolean) {
  if (progress?.phase === 'complete') return 100;
  if (typeof progress?.percent === 'number') return Math.max(0, Math.min(100, progress.percent));
  return queued ? 0 : 0;
}

/**
 * How wide to draw a download's progress bar.
 *
 * The models-table row and the ticker dock both render a bar for the same
 * download, side by side, and used to compute this separately — so a finished
 * pull with no numeric percent drew 100% in one and 28% in the other, and a
 * paused one drew 12% and 28%. One function, one answer.
 *
 * The non-numeric values are deliberate placeholders, not measurements: a
 * sliver for queued, a little more for paused, and enough to look underway
 * while Ollama is still reporting layer-level progress.
 */
export function getPullTrackPercent(
  progress: PullProgressUpdate | undefined,
  { queued, paused }: { queued: boolean; paused: boolean },
) {
  const hasMeasuredPercent = typeof progress?.percent === 'number';
  if (hasMeasuredPercent || progress?.phase === 'complete') {
    return Math.max(3, Math.min(100, getPullProgressPercent(progress, queued)));
  }
  if (paused) return 12;
  if (queued) return 6;
  return 28;
}

export function getPullProgressStatusLabel(
  model: string,
  phase: PullProgressUpdate['phase'],
  queued: boolean,
  isActive: boolean,
  isStopping: boolean,
  progress?: PullProgressUpdate,
) {
  if (phase === 'failed') return 'Download failed';
  if (phase === 'complete') return 'Download complete';
  if (phase === 'paused') return 'Download paused';
  if (isStopping) return 'Stopping after current pull';
  if (isActive) return progress?.status || `Downloading ${getQueueChipModelName(model)}`;
  if (queued) return 'Queued for download';
  return progress?.status || 'Waiting for download';
}

export function getPullProgressDetailLabel(
  phase: PullProgressUpdate['phase'],
  queued: boolean,
  progress?: PullProgressUpdate,
) {
  if (phase === 'failed') return progress?.error || 'Ollama reported an error.';
  if (phase === 'complete') return '100% complete.';
  if (phase === 'paused') {
    const sizeLabel = progress?.completedBytes && progress?.totalBytes
      ? `${formatBytes(progress.completedBytes)} / ${formatBytes(progress.totalBytes)}`
      : progress?.completedBytes
        ? formatBytes(progress.completedBytes)
        : '';
    return sizeLabel ? `${sizeLabel} · paused. Resume Download continues.` : 'Paused. Resume Download continues through Ollama.';
  }
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


export function buildDiagnosticsText(system: SystemProfile, ollama: OllamaStatus, logPath: string): string {
  const lines = [
    `RigMatch v${APP_VERSION}`,
    `OS: ${system.os.distro} ${system.os.release} (${system.platform} ${system.arch})`,
    `CPU: ${system.cpu.brand} · ${system.cpu.physicalCores} cores`,
    `RAM: ${Math.round(system.memory.totalGb)} GB`,
    `GPU: ${system.gpu.model} · ${system.gpu.vramGb} GB VRAM`,
    `Ollama: ${ollama.version ? `v${ollama.version}` : 'not detected'}`,
    `Log: ${logPath || 'unknown'}`,
  ];
  return lines.join('\n');
}

export function buildBugReportUrl(system: SystemProfile, ollama: OllamaStatus, logPath: string): string {
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


export function sumModelRowGb(rows: ModelRow[]) {
  return rows.reduce((sum, row) => sum + (row.sizeGb ?? row.installedModel?.sizeGb ?? 0), 0);
}


export function formatLogTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatHistoryTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getScoreTimelineNote(score: TestedModelScore) {
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

export function formatLogDetails(details: unknown) {
  if (details == null) return '';
  if (typeof details === 'string') return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export function formatLogsForClipboard(logs: AppLogEntry[]) {
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


export function playDoneJingle() {
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

/**
 * Filters that match on a provider-reported capability and nothing else.
 *
 * Their counts are honest but partial: a model that is not installed cannot be
 * asked what it can do. Named here so the note stays attached if more such
 * filters are added.
 */
export const CAPABILITY_ONLY_FILTERS = ['hears', 'videoread'];

/**
 * Filters whose results are ComfyUI models rather than Ollama ones.
 *
 * Listed so the "you will need ComfyUI" note appears exactly where those
 * Download buttons are, rather than being something to discover in Settings
 * after clicking one.
 */
export const GENERATION_FILTERS = ['imagegen', 'videogen'];
