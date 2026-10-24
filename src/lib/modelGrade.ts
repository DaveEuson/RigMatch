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
  USABLE_VRAM_MIN_GB, canGenerateText, getHardwareFit, getModelCapabilities, getModelScore, getParamSortValue, isEmbeddingModel,
  type CapabilityBearing, type HardwareFit,
} from './modelCatalog.ts';
import { formatGb } from './format.ts';
import { scoreDrift } from './scoring.ts';

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
  /** The graphics card or chip's name, which sets a Mac's memory speed ("Apple M3 Max"). */
  gpu?: string;
  /** System memory, which decides whether a mixture of experts can spill into it. */
  ramGb?: number;
  /** There is no graphics card (--vram 0), rather than none found: only the wording differs. */
  noGpu?: boolean;
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
  { minVramGb: 0, gbps: 120 },
];
/**
 * The same for shared memory, by chip: about 70% of each one's rated memory
 * speed. A base M-series chip is rated 100–120 GB/s, a Pro 150–275, a Max
 * 300–550 and an Ultra 800, so one figure for every Mac made a Max look four
 * times slower than it is. Jetsons and DGX Spark are named the same way.
 */
const UNIFIED_BANDWIDTH_GBPS: Array<{ chip: RegExp; gbps: number }> = [
  { chip: /\bultra\b/i, gbps: 650 },
  { chip: /\bmax\b/i, gbps: 330 },
  { chip: /\bpro\b/i, gbps: 180 },
  { chip: /\bgb10\b|dgx spark/i, gbps: 200 },
  { chip: /\bagx\b/i, gbps: 140 },
];
/** A base Apple chip, a Jetson Orin Nano or NX, or a chip with no name. */
const UNIFIED_BASE_GBPS = 90;
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
 * Billions of parameters each word runs on, for mixture-of-experts models
 * whose Ollama tag is a plain size. qwen3:30b is Qwen3-30B-A3B under its
 * library name, gpt-oss:20b runs 3.6B of its 21B, and so on: the tag says
 * nothing, so a table does. Keyed by family:tag, or by family alone for a
 * family with one size. From each model's own card.
 */
const MIXTURE_ACTIVE_B: Record<string, number> = {
  'qwen3:30b': 3.3, 'qwen3:235b': 22, 'qwen3-coder:30b': 3.3, 'qwen3-coder:480b': 35,
  'qwen3-vl:30b': 3, 'qwen3-vl:235b': 22, 'qwen3-next:80b': 3,
  'gpt-oss:20b': 3.6, 'gpt-oss:120b': 5.1, 'gpt-oss-safeguard:20b': 3.6, 'gpt-oss-safeguard:120b': 5.1,
  'deepseek-v2:16b': 2.4, 'deepseek-v2:236b': 21, 'deepseek-coder-v2:16b': 2.4, 'deepseek-coder-v2:236b': 21,
  'deepseek-v2.5:236b': 21, 'deepseek-v3:671b': 37, 'deepseek-v3.1:671b': 37, 'deepseek-r1:671b': 37,
  'granite3-moe:1b': 0.4, 'granite3-moe:3b': 0.8, 'granite3.1-moe:1b': 0.4, 'granite3.1-moe:3b': 0.8,
  'dbrx:132b': 36, 'glm-4.7-flash': 3,
};

/**
 * "with 3B active parameters", "activating just 12B parameters", "118B-A8B":
 * how newer family pages describe a mixture. Read only when the description
 * names a total within 15% of the model's own, since one page can cover a
 * dense size and a mixture (nemotron-3-nano has both).
 */
function describedActiveB(description: string | undefined, totalB: number): number | null {
  const text = description ?? '';
  const match = text.match(/(\d+(?:\.\d+)?)B-A(\d+(?:\.\d+)?)B\b/i)
    ?? text.match(/(\d+(?:\.\d+)?)B\b[^.]{0,60}?\b(?:with|activating)(?: just)? (\d+(?:\.\d+)?)B (?:active|activated|param)/i);
  if (!match) return null;
  const [described, active] = [Number.parseFloat(match[1]), Number.parseFloat(match[2])];
  return Math.abs(described - totalB) <= totalB * 0.15 && active < described ? active : null;
}

/**
 * The share of the model read for each word. A mixture-of-experts model runs
 * a few experts per word: qwen3:30b-a3b reads 3B of its 30B, and Mixtral's
 * "8x7b" runs two of eight experts plus the layers they share. It still has
 * to fit whole, so this changes the speed and nothing about the fit.
 */
export function activeShare(name: string, totalB: number | null, description?: string): number {
  const lower = name.toLowerCase();
  const active = lower.match(/(?<![\d.a-z])a(\d+(?:\.\d+)?)b\b/);
  if (active && totalB && totalB > 0) return clamp(Number.parseFloat(active[1]) / totalB, 0.02, 1);
  const [family, tag = ''] = lower.split(':');
  const known = MIXTURE_ACTIVE_B[`${family}:${tag}`] ?? MIXTURE_ACTIVE_B[family];
  if (known && totalB && totalB > 0) return clamp(known / totalB, 0.02, 1);
  const experts = lower.match(/(?<![\d.])(\d+)x\d+(?:\.\d+)?b\b/);
  if (experts) return clamp(2 / Number.parseInt(experts[1], 10) + 0.03, 0.02, 1);
  const described = totalB ? describedActiveB(description, totalB) : null;
  return described && totalB ? clamp(described / totalB, 0.02, 1) : 1;
}

type SizedRow = { name: string; displayName?: string; params: string; sizeGb: number | null; description?: string };

function shareOf(row: SizedRow): number {
  return activeShare(fullName(row), paramsBillions(row), row.description);
}

function readGbPerToken(row: SizedRow, sizeGb: number): number {
  const share = shareOf(row);
  return sizeGb * (share < 1 ? Math.min(1, share * EXPERT_ROUTING_COST) : 1);
}

/** Graphics memory a model can be held in: none when it is only a carve-out (USABLE_VRAM_MIN_GB). */
function usableVram(hardware: GradeHardware): number {
  return !hardware.unifiedMemory && hardware.vramGb < USABLE_VRAM_MIN_GB ? 0 : hardware.vramGb;
}

/**
 * How fast this PC reads weights, from models measured on it: tokens a
 * second times the GB read per token, the median over every tested model that
 * ran wholly in graphics memory. Null with nothing measured. This is what
 * lets one test make every other estimate on the list a real one.
 */
export function rigBandwidth(
  samples: Array<SizedRow & { tokensPerSecond?: number | null }>,
  vramGb: number,
): number | null {
  // On the processor every model reads from system memory, so any run counts.
  const pool = vramGb < USABLE_VRAM_MIN_GB ? 0 : vramGb;
  const rates = samples
    .filter((sample) => (sample.tokensPerSecond ?? 0) > 0 && (sample.sizeGb ?? 0) > 0)
    .filter((sample) => pool <= 0 || (sample.sizeGb ?? 0) <= pool)
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
  // A measured figure is this PC's own speed, processor or GPU, so it wins.
  if (hardware.vramGb <= 0) return Math.min((bandwidthGbps ?? SYSTEM_RAM_GBPS) / readGb, MAX_ESTIMATED_TOKENS_PER_SECOND);
  const gpu = bandwidthGbps
    ?? (hardware.unifiedMemory
      ? UNIFIED_BANDWIDTH_GBPS.find((band) => band.chip.test(hardware.gpu ?? ''))?.gbps ?? UNIFIED_BASE_GBPS
      : GPU_BANDWIDTH_GBPS.find((band) => hardware.vramGb >= band.minVramGb)?.gbps ?? SYSTEM_RAM_GBPS);
  // What a model can be held in before it spills: all of a card, or the
  // share of a Mac's memory macOS leaves it.
  const holds = hardware.unifiedMemory ? hardware.vramGb * UNIFIED_USABLE_SHARE : hardware.vramGb;
  if (row.sizeGb <= holds) return Math.min(gpu / readGb, MAX_ESTIMATED_TOKENS_PER_SECOND);
  // Part of it spills into system memory (or, on a Mac, gets squeezed and
  // swapped), and that part sets the pace.
  const onGpu = Math.min(1, (holds * 0.9) / row.sizeGb);
  const rate = 1 / ((readGb * onGpu) / gpu + (readGb * (1 - onGpu)) / SYSTEM_RAM_GBPS);
  return Math.min(rate, MAX_ESTIMATED_TOKENS_PER_SECOND);
}

/** What a model can do beyond text, in Ollama's words (getModelCapabilities). */
const ABILITIES = ['tools', 'thinking', 'vision', 'audio'];

/** Slower than this and a chat feels broken, so a spill that cannot keep it up stays "Too big". */
const MIN_SPILL_TOKENS_PER_SECOND = 10;
/** System memory left for the system and other apps when a model spills into it. */
const SPILL_RESERVED_RAM_GB = 6;

/**
 * "RAM assist" for a mixture of experts that is too big for graphics memory.
 *
 * getHardwareFit calls anything past 1.15× VRAM too big, which is right for a
 * dense model: every word reads all of it, and the part in system memory sets
 * a crawling pace. A mixture reads a few experts per word, so gpt-oss:20b on a
 * 12 GB card spills 2 GB and still runs at about 27 tokens a second. This
 * returns the fit to use instead (applied as the row's fitOverride, so the
 * fit pill, the download button and the grade agree), or null to keep the
 * usual one: when it is not a mixture, would not fit in system memory beside
 * the system, or would run under MIN_SPILL_TOKENS_PER_SECOND. Not on a Mac,
 * where past its share of memory a model is swapped, not spilled.
 */
export function mixtureSpillFit(row: GradeRow, hardware: GradeHardware): HardwareFit | null {
  if (row.fitOverride || !row.sizeGb || hardware.unifiedMemory || !hardware.ramGb) return null;
  if (hardware.vramGb < USABLE_VRAM_MIN_GB || shareOf(row) >= 1) return null;
  if (getHardwareFit({ ...row, fitOverride: undefined }, hardware.vramGb).tone !== 'out-of-league') return null;
  const spilled = row.sizeGb - hardware.vramGb * 0.9;
  if (spilled > hardware.ramGb - SPILL_RESERVED_RAM_GB) return null;
  const speed = estimateTokensPerSecond(row, hardware, null);
  if (!speed || speed < MIN_SPILL_TOKENS_PER_SECOND) return null;
  return {
    tone: 'tight',
    label: `RAM assist · ${formatGb(row.sizeGb)}`,
    detail: `Bigger than your ${formatGb(hardware.vramGb)} of graphics memory, but it runs only part of itself per word, so the ${formatGb(Math.max(0, spilled))} that does not fit can wait in system memory`,
    recommend: true,
  };
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
 *
 * Each thing the model can do beyond text (call tools, think before
 * answering, read images, hear) adds 5. Nothing else in the catalog says how
 * current a model is (there are no pull counts or release dates), and size
 * alone ranked 2024's falcon2:11b and yi:9b above qwen3.5:9b and gemma4.
 */
function qualityPoints(row: GradeRow, evidence: GradeEvidence): { points: number; reason: string } {
  if (evidence.score && Number.isFinite(evidence.score.sobriety)) {
    return { points: clamp(evidence.score.sobriety), reason: `answers scored ${Math.round(evidence.score.sobriety)} in its test here` };
  }
  const totalB = paramsBillions(row) ?? 1;
  const effectiveB = Math.sqrt(totalB * totalB * shareOf(row));
  const older = OLDER_FAMILIES.has(familyOf(fullName(row)));
  const abilities = (getModelCapabilities(row) ?? []).filter((ability) => ABILITIES.includes(ability)).length;
  const points = clamp(40 + 15 * Math.log2(Math.max(effectiveB, 0.05)) - (older ? 20 : 0) + abilities * 5);
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
    return 'Download size unknown, so RigMatch cannot grade it yet';
  }
  const memory = `${round1(hardware.vramGb)} GB of ${hardware.unifiedMemory ? 'shared' : 'graphics'} memory`;
  const carveOut = usableVram(hardware) <= 0 && hardware.vramGb > 0;
  if (fit.tone === 'out-of-league') {
    return carveOut ? `Too big for the processor alone, and your ${memory} is too little to help`
      : hardware.vramGb > 0 ? `Too big for your ${memory}` : 'Too big to run without a graphics card';
  }
  if (carveOut) return `Your ${memory} is too little to hold a model, so it runs on the processor`;
  if (hardware.vramGb <= 0) {
    return hardware.noGpu ? 'No graphics card, so it runs on the processor' : 'No graphics memory found, so it runs on the processor';
  }
  if (hardware.unifiedMemory) {
    // The fit is sized against all of a Mac's memory, but macOS and the open
    // apps need their share of it too.
    const size = row.sizeGb ?? 0;
    if (size > hardware.vramGb) return `Bigger than your ${memory}, so it will be slow`;
    if (size > hardware.vramGb * UNIFIED_USABLE_SHARE) {
      return `Needs more of your ${memory} than a model can have beside the system, so it will be slow`;
    }
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
 * "?", and a tight fit is a C at best however good the model is. So is a
 * model past the share of a Mac's memory it can have. The rest is answer
 * quality 50%, speed 25%, fit 15% and room to chat 10%. A model that cannot
 * hold a chat (an embedding, image or video model) is graded on its fit
 * alone, since words a second mean nothing for it.
 */
export function gradeModel(row: GradeRow, hardware: GradeHardware, evidence: GradeEvidence = {}): FitGrade {
  const vramGb = usableVram(hardware);
  const fit = getHardwareFit(row, hardware.vramGb);
  const usable = { ...hardware, vramGb };
  const pool = hardware.unifiedMemory ? vramGb * UNIFIED_USABLE_SHARE : vramGb;
  const spareGb = row.sizeGb && pool > 0 ? round1(Math.max(0, pool - row.sizeGb)) : null;
  const pastSharedLimit = Boolean(hardware.unifiedMemory && row.sizeGb && row.sizeGb > pool);
  const verdict: FitGrade['verdict'] = fit.tone === 'unknown' ? 'unknown'
    : fit.tone === 'out-of-league' ? 'wont-fit'
      : fit.tone === 'tight' || pastSharedLimit ? 'barely-runs' : 'runs-well';
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
  const squeezed = fit.tone === 'tight' || pastSharedLimit;
  const fitPts = squeezed ? 35 : fit.tone === 'sweet-spot' ? 100 : 75;
  const textModel = canGenerateText({ ...row, displayName: fullName(row) }) && !isEmbeddingModel(fullName(row));
  if (!textModel) {
    // The fit's own tier, as a letter: A, B, or C for a tight one.
    const points = squeezed ? 60 : fit.tone === 'sweet-spot' ? 100 : 78;
    return { ...base, letter: letterFor(points), points, reasons: [firstReason], summary: firstReason };
  }

  const measured = evidence.score?.tokensPerSecond ?? evidence.tokensPerSecond ?? null;
  const tokensPerSecond = measured && measured > 0 ? measured : estimateTokensPerSecond(row, usable, evidence.bandwidthGbps);
  const speedSource = measured && measured > 0 ? 'measured' : evidence.bandwidthGbps ? 'this-pc' : 'estimate';
  const quality = qualityPoints(row, evidence);
  // On the processor a chat's memory comes out of system RAM, which nothing
  // here measures, so room to chat neither helps nor hurts.
  const context = vramGb <= 0 ? 50 : contextPoints(spareGb ?? 0, paramsBillions(row) ?? 1);
  const raw = quality.points * 0.5 + speedPoints(tokensPerSecond ?? 0) * 0.25 + fitPts * 0.15 + context * 0.1;
  const points = Math.round(squeezed ? Math.min(raw, 69) : raw);

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
 * A saved score only says something about this computer if it was measured
 * on it. One from a networked computer, or from before a GPU swap, gave every
 * grade the other machine's speed and answers as "when tested here", beside
 * the Models list's own "Measured on another computer — retest here" badge.
 * A new build of the same model on the same card still counts.
 */
function measuredHere(score: TestedModelScore | undefined, hardware: GradeHardware): TestedModelScore | undefined {
  if (!score) return undefined;
  const drift = scoreDrift(score, { gpuModel: hardware.gpu, vramGb: hardware.vramGb });
  return drift === 'measured-elsewhere' || drift === 'hardware-changed' ? undefined : score;
}

/**
 * rigBandwidth over the Models list: every row with a saved score from this
 * computer that recorded its speed. Saved scores rather than benchmarks,
 * because the model page has the scores and only its own model's benchmark,
 * and the two screens have to land on the same letter.
 */
export function measuredBandwidth(rows: ModelRow[], scores: Record<string, TestedModelScore>, hardware: GradeHardware): number | null {
  return rigBandwidth(
    rows.map((row) => ({ ...row, tokensPerSecond: measuredHere(getModelScore(row, scores), hardware)?.tokensPerSecond })),
    hardware.vramGb,
  );
}

/**
 * One Models row's grade, with what this computer has measured: its own
 * saved score, its last benchmark's speed when there is no score, and the
 * speed measuredBandwidth reads off the rest. A score from elsewhere counts
 * for nothing, and neither does the benchmark it came from. The list and the
 * model page call this, not gradeModel, so they cannot show different letters.
 */
export function gradeRow(
  row: ModelRow,
  hardware: GradeHardware,
  { score, benchmark, bandwidthGbps }: { score?: TestedModelScore; benchmark?: BenchmarkResult | null; bandwidthGbps?: number | null },
): FitGrade {
  const here = measuredHere(score, hardware);
  const benchmarkHere = score && !here ? null : benchmark?.avgTokensPerSecond;
  return gradeModel(row, hardware, { score: here, tokensPerSecond: benchmarkHere, bandwidthGbps });
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
