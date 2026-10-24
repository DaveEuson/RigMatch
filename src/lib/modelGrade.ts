// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One fit grade per model, before any show is run.
 *
 * The Models list knew four things about a model nobody had tested yet — does
 * it fit, roughly how fast it will be, how much room it leaves for a long
 * chat, and how much model it is — and showed them as a size, a fit pill and
 * "Not tested". A newcomer had to combine those in their head. This does it
 * once, here, so the list, the model page and the command-line fit check
 * (cli/) all say the same thing.
 *
 * It is called the Fit grade, on its own A–F scale, and deliberately not a
 * forecast of the Match Score. The Match Score is mostly answer quality and
 * reliability measured in a show, which nothing can predict from a file size;
 * its speed part rewards tiny models, and its fit part reads the parameter
 * count without looking at this PC. The Fit grade answers the question asked
 * before a show: how good a pick is this model for this computer. Different
 * letters (no S, no B+) keep the two from being read as one number.
 *
 * Every number here is a rule of thumb unless a test on this PC replaced it,
 * and the explanation says which, on the same rule as runEstimates.ts.
 */

import type { BenchmarkResult, ModelRow, TestedModelScore } from '../types';
import {
  canGenerateText, getHardwareFit, getModelScore, getParamSortValue, isEmbeddingModel, type CapabilityBearing, type HardwareFit,
} from './modelCatalog.ts';

export type FitGradeLetter = 'A' | 'B' | 'C' | 'D' | 'F' | '?';

export type FitGrade = {
  letter: FitGradeLetter;
  /** 0–100, for ranking. Null when the model cannot be graded. */
  points: number | null;
  /** The fit it is built on, exactly as the Size column shows it. */
  fit: HardwareFit;
  /** llmfit's three-way answer, for scripts. */
  verdict: 'runs-well' | 'barely-runs' | 'wont-fit' | 'unknown';
  /** Graphics memory left after the model loads, in GB. */
  spareGb: number | null;
  tokensPerSecond: number | null;
  speedSource: 'measured' | 'this-pc' | 'estimate' | null;
  /** Each part of the explanation, in order: fit, speed, answers, chat room. */
  reasons: string[];
  /** The reasons as one line: "Fits in your graphics memory with 3 GB spare · about 40 words a second · strong for its size". */
  summary: string;
};

export type GradeHardware = {
  vramGb: number;
  /** Apple Silicon or a Jetson: the graphics memory is system memory. */
  unifiedMemory?: boolean;
};

export type GradeEvidence = {
  /** This model's own saved score on this computer. */
  score?: Pick<TestedModelScore, 'sobriety' | 'tokensPerSecond'>;
  /** Measured speed from a benchmark, when there is no saved score. */
  tokensPerSecond?: number | null;
  /** How fast this PC reads model weights, from rigBandwidth(). */
  bandwidthGbps?: number | null;
};

export type GradeRow = Pick<ModelRow, 'params' | 'sizeGb' | 'fitOverride'> & CapabilityBearing & {
  name: string;
  generationKind?: ModelRow['generationKind'];
};

/**
 * Effective memory speed, in GB of weights read per second, by kind of GPU.
 *
 * Generating a word means reading the whole model once, so speed is about
 * memory bandwidth divided by model size. These are roughly 60% of each
 * class's rated bandwidth (an RTX 4070 is rated 504 GB/s and runs an 8B
 * model at 60-70 words a second). Bigger cards have faster memory, which is
 * the only reason VRAM stands in for the card here: the name is not parsed.
 */
const GPU_BANDWIDTH_GBPS: Array<{ minVramGb: number; gbps: number }> = [
  { minVramGb: 20, gbps: 600 },
  { minVramGb: 14, gbps: 420 },
  { minVramGb: 10, gbps: 300 },
  { minVramGb: 6, gbps: 220 },
  { minVramGb: 2, gbps: 120 },
  // Under 2 GB is an integrated GPU's carve-out, which is system memory.
  { minVramGb: 0, gbps: 35 },
];
/** Apple Silicon base chips and Jetsons; Pro and Max chips are faster, which a test on this PC picks up. */
const UNIFIED_BANDWIDTH_GBPS = 90;
/** Dual-channel DDR4/DDR5, for whatever spills out of graphics memory or runs on the processor. */
const SYSTEM_RAM_GBPS = 35;
/** The share of a Mac's memory a model can use, as videoFit.ts sizes it. */
const UNIFIED_USABLE_SHARE = 0.7;
const TOKENS_PER_WORD = 4 / 3;
/**
 * Past this, a small model is held back by the work per word rather than by
 * memory: qwen3:0.6b does not run at the 600 a second its size implies.
 */
const MAX_ESTIMATED_TOKENS_PER_SECOND = 200;
/** Picking experts for every word costs time, so a mixture runs slower than its active size alone suggests. */
const EXPERT_ROUTING_COST = 1.6;

/**
 * Families first released in 2023 or earlier, before the Llama 3 generation.
 *
 * Size is the only quality signal for a model nobody has tested, and it says
 * nothing about age: llama2:13b is bigger than qwen3:8b and answers worse. A
 * family on this list is graded as a smaller model than it is. Exact family
 * names only, so llama3 and mistral-small are not caught by llama2 or mistral.
 */
const OLDER_FAMILIES = new Set([
  'alfred', 'bakllava', 'codebooga', 'codellama', 'codeup', 'deepseek-coder', 'deepseek-llm', 'dolphin-mistral',
  'dolphin-mixtral', 'dolphin-phi', 'dolphincoder', 'everythinglm', 'falcon', 'goliath', 'llama-pro', 'llama2',
  'llama2-chinese', 'llama2-uncensored', 'llava', 'magicoder', 'meditron', 'medllama2', 'megadolphin',
  'mistral-openorca', 'mistrallite', 'mixtral', 'neural-chat', 'notus', 'notux', 'nous-hermes', 'nous-hermes2',
  'nous-hermes2-mixtral', 'open-orca-platypus2', 'openchat', 'openhermes', 'orca-mini', 'orca2', 'phi',
  'phind-codellama', 'qwen', 'samantha-mistral', 'solar', 'sqlcoder', 'stable-beluga', 'stable-code',
  'stablelm-zephyr', 'starcoder', 'starling-lm', 'tinydolphin', 'tinyllama', 'vicuna', 'wizard-math',
  'wizard-vicuna', 'wizard-vicuna-uncensored', 'wizardcoder', 'wizardlm', 'wizardlm-uncensored', 'xwinlm',
  'yarn-llama2', 'yarn-mistral', 'zephyr',
]);

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

/** "qwen3:30b-a3b": a Models row keeps the family in name and the whole tag in displayName. */
const fullName = (row: { name: string; displayName?: string }) => row.displayName ?? row.name;

function familyOf(name: string): string {
  return name.toLowerCase().split(':')[0].split('/').pop() ?? '';
}

/** Billions of parameters: the label when it has one, else guessed from a 4-bit download. */
function paramsBillions(row: Pick<GradeRow, 'params' | 'sizeGb'>): number | null {
  const labelled = getParamSortValue(row.params ?? '');
  if (labelled > 0) return labelled;
  return row.sizeGb ? row.sizeGb / 0.6 : null;
}

/**
 * The share of the model read for each word. A mixture-of-experts model runs
 * a few experts per word: qwen3:30b-a3b reads 3B of its 30B, and Mixtral's
 * "8x7b" runs two of eight experts plus the layers they share. It still has
 * to fit whole, so this changes the speed and nothing about the fit.
 */
export function activeShare(name: string, totalB: number | null): number {
  const lower = name.toLowerCase();
  const active = lower.match(/(?<![\d.a-z])a(\d+(?:\.\d+)?)b\b/);
  if (active && totalB && totalB > 0) return clamp(Number.parseFloat(active[1]) / totalB, 0.02, 1);
  const experts = lower.match(/(?<![\d.])(\d+)x\d+(?:\.\d+)?b\b/);
  if (experts) return clamp(2 / Number.parseInt(experts[1], 10) + 0.03, 0.02, 1);
  return 1;
}

function readGbPerToken(row: { name: string; displayName?: string; params: string; sizeGb: number | null }, sizeGb: number): number {
  const share = activeShare(fullName(row), paramsBillions(row));
  return sizeGb * (share < 1 ? Math.min(1, share * EXPERT_ROUTING_COST) : 1);
}

/**
 * How fast this PC reads weights, from models measured on it: tokens a
 * second times the GB read per token, the median over every tested model that
 * ran wholly in graphics memory. Null with nothing measured. This is what
 * lets one test make every other estimate on the list a real one.
 */
export function rigBandwidth(
  samples: Array<{ name: string; displayName?: string; params: string; sizeGb: number | null; tokensPerSecond?: number | null }>,
  vramGb: number,
): number | null {
  const rates = samples
    .filter((sample) => (sample.tokensPerSecond ?? 0) > 0 && (sample.sizeGb ?? 0) > 0)
    .filter((sample) => vramGb <= 0 || (sample.sizeGb ?? 0) <= vramGb)
    .map((sample) => (sample.tokensPerSecond ?? 0) * readGbPerToken(sample, sample.sizeGb ?? 0))
    .sort((a, b) => a - b);
  if (rates.length === 0) return null;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

function estimateTokensPerSecond(
  row: GradeRow,
  hardware: GradeHardware,
  bandwidthGbps: number | null | undefined,
): number | null {
  if (!row.sizeGb) return null;
  const readGb = readGbPerToken(row, row.sizeGb);
  const gpu = bandwidthGbps
    ?? (hardware.unifiedMemory ? UNIFIED_BANDWIDTH_GBPS : GPU_BANDWIDTH_GBPS.find((band) => hardware.vramGb >= band.minVramGb)?.gbps ?? SYSTEM_RAM_GBPS);
  let rate: number;
  if (hardware.vramGb <= 0) rate = SYSTEM_RAM_GBPS / readGb;
  else if (hardware.unifiedMemory || row.sizeGb <= hardware.vramGb) rate = gpu / readGb;
  else {
    // Part of it spills into system memory, and that part sets the pace.
    const onGpu = Math.min(1, (hardware.vramGb * 0.9) / row.sizeGb);
    rate = 1 / ((readGb * onGpu) / gpu + (readGb * (1 - onGpu)) / SYSTEM_RAM_GBPS);
  }
  return Math.min(rate, MAX_ESTIMATED_TOKENS_PER_SECOND);
}

/** 2 tokens a second scores 0 and 40 scores 100: past reading speed, faster stops mattering much. */
function speedPoints(tokensPerSecond: number): number {
  return clamp((100 * Math.log(tokensPerSecond / 2)) / Math.log(20));
}

/**
 * Answer quality, 0–100: the score from a test on this PC when there is one,
 * otherwise a curve on size (1B 40, 4B 70, 8B 85, 14B and up near 100), with
 * a mixture-of-experts model counted at the geometric mean of its total and
 * active size, and an older family counted 20 points lower.
 */
function qualityPoints(row: GradeRow, evidence: GradeEvidence): { points: number; reason: string } {
  if (evidence.score && Number.isFinite(evidence.score.sobriety)) {
    return { points: clamp(evidence.score.sobriety), reason: `answers scored ${Math.round(evidence.score.sobriety)} in its test here` };
  }
  const totalB = paramsBillions(row) ?? 1;
  const effectiveB = Math.sqrt(totalB * totalB * activeShare(fullName(row), totalB));
  const older = OLDER_FAMILIES.has(familyOf(fullName(row)));
  const points = clamp(40 + 15 * Math.log2(Math.max(effectiveB, 0.05)) - (older ? 20 : 0));
  const reason = older
    ? 'an older model: newer ones this size answer better'
    : effectiveB < 2 ? 'tiny, so expect simple answers'
      : effectiveB < 7 ? 'small but capable'
        : effectiveB < 20 ? 'strong for its size'
          : 'large and capable';
  return { points, reason };
}

/**
 * How much conversation fits in what the model leaves free. The memory a
 * chat needs grows with every word in it (the KV cache), about 140 KB a token
 * for an 8B model and less than linearly with size. 32,000 tokens or more
 * scores 100; 2,000 or fewer scores 0.
 */
function contextPoints(spareGb: number, totalB: number): number {
  const kbPerToken = 40 * Math.max(totalB, 0.1) ** 0.6;
  const tokens = (Math.max(0, spareGb) * 1024 * 1024) / kbPerToken;
  return tokens <= 2048 ? 0 : clamp((100 * Math.log2(tokens / 2048)) / 4);
}

function letterFor(points: number): FitGradeLetter {
  if (points >= 85) return 'A';
  if (points >= 70) return 'B';
  if (points >= 55) return 'C';
  if (points >= 40) return 'D';
  return 'F';
}

/** "about 45 words a second": rounded to fives above ten, because these are forecasts. */
export function describeSpeed(tokensPerSecond: number): string {
  const words = tokensPerSecond / TOKENS_PER_WORD;
  const shown = words >= 10 ? Math.round(words / 5) * 5 : Math.max(1, Math.round(words));
  return `${shown} word${shown === 1 ? '' : 's'} a second`;
}

function fitReason(row: GradeRow, fit: HardwareFit, hardware: GradeHardware, spareGb: number | null): string {
  if (row.fitOverride) return fit.detail;
  if (fit.tone === 'unknown') {
    return row.sizeGb ? 'Graphics memory unknown, so RigMatch cannot grade it yet' : 'Download size unknown, so RigMatch cannot grade it yet';
  }
  const memory = `${round1(hardware.vramGb)} GB of ${hardware.unifiedMemory ? 'shared' : 'graphics'} memory`;
  if (fit.tone === 'out-of-league') {
    return hardware.vramGb > 0 ? `Too big for your ${memory}` : 'Too big to run without a graphics card';
  }
  if (hardware.vramGb <= 0) return 'No graphics memory found, so it runs on the processor';
  if (hardware.unifiedMemory) {
    // The fit is sized against all of a Mac's memory, but macOS and the open
    // apps need their share of it too.
    if ((row.sizeGb ?? 0) > hardware.vramGb) return `Bigger than your ${memory}, so it will be slow`;
    return fit.tone === 'tight' || (spareGb ?? 0) < 1
      ? `Fits, but leaves little of your ${memory} for other apps`
      : `Fits in your shared memory with ${round1(spareGb ?? 0)} GB spare`;
  }
  if (fit.tone === 'tight') {
    return (row.sizeGb ?? 0) > hardware.vramGb
      ? 'Spills past your graphics memory into system memory, which is slower'
      : `Only just fits your ${memory}`;
  }
  return `Fits in your graphics memory with ${round1(spareGb ?? 0)} GB spare`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Grade one model for this computer.
 *
 * The fit decides first, through getHardwareFit, so the grade can never
 * disagree with the fit pill beside it: "Too big" is an F, an unknown size is
 * "?", and a tight fit is a C at best however good the model is. The rest is
 * answer quality 50%, speed 25%, fit 15% and room to chat 10%. A model that
 * cannot hold a chat (an embedding, image or video model) is graded on its
 * fit alone, since words a second mean nothing for it.
 */
export function gradeModel(row: GradeRow, hardware: GradeHardware, evidence: GradeEvidence = {}): FitGrade {
  const fit = getHardwareFit(row, hardware.vramGb);
  const pool = hardware.unifiedMemory ? hardware.vramGb * UNIFIED_USABLE_SHARE : hardware.vramGb;
  const spareGb = row.sizeGb && pool > 0 ? round1(Math.max(0, pool - row.sizeGb)) : null;
  const verdict: FitGrade['verdict'] = fit.tone === 'unknown' ? 'unknown'
    : fit.tone === 'out-of-league' ? 'wont-fit'
      : fit.tone === 'tight' ? 'barely-runs' : 'runs-well';
  const base: Pick<FitGrade, 'fit' | 'verdict' | 'spareGb' | 'tokensPerSecond' | 'speedSource'> = {
    fit, verdict, spareGb, tokensPerSecond: null, speedSource: null,
  };
  const firstReason = fitReason(row, fit, hardware, spareGb);

  if (fit.tone === 'unknown') {
    return { ...base, letter: '?', points: null, reasons: [firstReason], summary: firstReason };
  }
  if (fit.tone === 'out-of-league') {
    return { ...base, letter: 'F', points: 0, reasons: [firstReason], summary: firstReason };
  }
  const fitPts = fit.tone === 'sweet-spot' ? 100 : fit.tone === 'good' ? 75 : 35;
  const textModel = canGenerateText({ ...row, displayName: fullName(row) }) && !isEmbeddingModel(fullName(row));
  if (!textModel) {
    // The fit's own tier, as a letter: A, B, or C for a tight one.
    const points = fit.tone === 'sweet-spot' ? 100 : fit.tone === 'good' ? 78 : 60;
    return { ...base, letter: letterFor(points), points, reasons: [firstReason], summary: firstReason };
  }

  const measured = evidence.score?.tokensPerSecond ?? evidence.tokensPerSecond ?? null;
  const tokensPerSecond = measured && measured > 0 ? measured : estimateTokensPerSecond(row, hardware, evidence.bandwidthGbps);
  const speedSource = measured && measured > 0 ? 'measured' : evidence.bandwidthGbps ? 'this-pc' : 'estimate';
  const quality = qualityPoints(row, evidence);
  // On the processor a chat's memory comes out of system RAM, which nothing
  // here measures, so room to chat neither helps nor hurts.
  const context = hardware.vramGb <= 0 ? 50 : contextPoints(spareGb ?? 0, paramsBillions(row) ?? 1);
  const raw = quality.points * 0.5 + speedPoints(tokensPerSecond ?? 0) * 0.25 + fitPts * 0.15 + context * 0.1;
  const points = Math.round(fit.tone === 'tight' ? Math.min(raw, 69) : raw);

  const reasons = [firstReason];
  if (tokensPerSecond) {
    const speed = describeSpeed(tokensPerSecond);
    reasons.push(speedSource === 'measured' ? `${speed} when tested here`
      : speedSource === 'this-pc' ? `about ${speed}, going by models tested here`
        : `about ${speed}`);
  }
  reasons.push(quality.reason);
  if (context < 50) reasons.push('little room left for long chats');
  return {
    ...base,
    letter: letterFor(points),
    points,
    tokensPerSecond: tokensPerSecond ? round1(tokensPerSecond) : null,
    speedSource,
    reasons,
    summary: capitalize(reasons.join(' · ')),
  };
}

/**
 * rigBandwidth over the Models list: every row with a saved score that
 * recorded its speed. Saved scores rather than benchmarks, because the model
 * page has the scores and only its own model's benchmark, and the two screens
 * have to land on the same letter.
 */
export function measuredBandwidth(rows: ModelRow[], scores: Record<string, TestedModelScore>, vramGb: number): number | null {
  return rigBandwidth(
    rows.map((row) => ({ ...row, tokensPerSecond: getModelScore(row, scores)?.tokensPerSecond })),
    vramGb,
  );
}

/**
 * One Models row's grade, with what this PC has measured: its own saved
 * score, its last benchmark's speed when there is no score, and the speed
 * measuredBandwidth reads off the rest. The list and the model page call
 * this, not gradeModel, so they cannot show different letters.
 */
export function gradeRow(
  row: ModelRow,
  hardware: GradeHardware,
  { score, benchmark, bandwidthGbps }: { score?: TestedModelScore; benchmark?: BenchmarkResult | null; bandwidthGbps?: number | null },
): FitGrade {
  return gradeModel(row, hardware, { score, tokensPerSecond: benchmark?.avgTokensPerSecond, bandwidthGbps });
}

/**
 * The command that downloads a model, for whichever app it belongs to.
 *
 * LM Studio names its catalog differently from Ollama, so an Ollama name is
 * turned into the search `lms get` expects ("qwen3:8b" becomes "qwen3-8b"),
 * and LM Studio shows its matches before downloading anything. A model that
 * is already LM Studio's keeps its own key.
 */
export function pullCommand(model: string, provider: 'ollama' | 'lm-studio' = 'ollama'): string {
  if (provider === 'lm-studio') return `lms get ${model.replace(/:latest$/, '').replace(':', '-')}`;
  return `ollama pull ${model}`;
}
