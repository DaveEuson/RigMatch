// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The video lineup: several video models, one prompt, one seed, one after another.
 *
 * What makes it a comparison rather than a list of separate runs is that every
 * model gets identical input and starts from the same state. The same prompt
 * and seed go to each, and — when the user has been told it will — ComfyUI is
 * unloaded before every run, so no model inherits a warm text encoder from the
 * one before it and looks faster than it is. The reference times it is compared
 * with were all cold starts too.
 *
 * One model failing — out of memory, a missing file, a graph this ComfyUI
 * refuses — is recorded with its reason and the rest carry on. A lineup of five
 * that stops at the second failure is a lineup of one.
 */

import {
  downloadPlan,
  generationModelById,
  isCatalogFile,
  isListed,
  type ComfyFolderListing,
} from './generationCatalog.ts';
import { VIDEO_MODEL_SPECS, videoModelFileIds, type VideoModelSpec } from './videoCatalog.ts';
import { buildVideoWorkflow, withJudgedFrame } from './videoWorkflows.ts';
import { buildTxt2VideoWorkflow } from './videoGen.ts';
import {
  CALIBRATION_MODEL,
  estimateVideoSeconds,
  recordCalibration,
  videoFit,
  type VideoCalibration,
  type VideoEstimate,
  type VideoFit,
  type VideoMachine,
  type VideoSizing,
} from './videoFit.ts';
import {
  DEFAULT_VIDEO_TIMEOUT_MS,
  judgeVideoResult,
  runVideoGeneration,
  type VideoRunResult,
  type VideoTransport,
} from './videoGenRun.ts';
import type { ImagePrompt } from './imageGenScoring.ts';
import type { JudgeFn } from './imageGenRun.ts';
import type { AdvancedLabResult } from './labResults.ts';
import type { HardwareFit } from './modelCatalog.ts';
import { JUDGE_PASS, rankByBalance, type Contender } from './balance.ts';

export type VideoLineupEntry = {
  /** The GENERATION_MODELS id of the model's main file, or `file:` and its name for one found on disk. */
  key: string;
  name: string;
  publisher: string;
  sizing: VideoSizing;
  refMeasured: boolean;
  output: VideoModelSpec['output'];
  /** A catalog model, built by its family's graph. */
  spec?: VideoModelSpec;
  /** An LTX-Video 0.9 checkpoint, built by the graph RigMatch shipped in 0.6. */
  legacy?: { checkpoint: string; textEncoder: string };
  /** Found in ComfyUI rather than downloaded from the catalog, so on disk by definition. */
  found?: boolean;
};

const fromSpec = (spec: VideoModelSpec): VideoLineupEntry => ({
  key: spec.key,
  name: spec.name,
  publisher: spec.publisher,
  sizing: { ditGb: spec.ditGb, teGb: spec.teGb, refSeconds: spec.refSeconds, gated: spec.gated },
  refMeasured: spec.refMeasured,
  output: spec.output,
  spec,
});

const catalogFilename = (id: string) => generationModelById(id)?.filename ?? '';

/**
 * The LTX-Video 0.9.6 checkpoint from 0.6, still runnable.
 *
 * People downloaded it, it was proven, and dropping it from the Lab would take
 * away a model they already have. Its numbers are RigMatch's own, measured on
 * the reference 4070 when it shipped: four seconds at 768x512 in 12.1 s (see
 * videoGen.ts). The checkpoint carries its own VAE, so all 6.3 GB is resident.
 */
const LEGACY_LTX: VideoLineupEntry = {
  key: 'ltxv-distilled',
  name: 'LTX-Video 2B 0.9.6 (the 0.6 checkpoint)',
  publisher: 'Lightricks',
  sizing: { ditGb: 6.3, teGb: 4.9, refSeconds: 12.1 },
  refMeasured: true,
  output: { width: 768, height: 512, frames: 97, fps: 24, seconds: 4.04, steps: 8, sound: false },
  legacy: { checkpoint: catalogFilename('ltxv-distilled'), textEncoder: catalogFilename('t5xxl-fp8') },
};

export const VIDEO_LINEUP: VideoLineupEntry[] = [...VIDEO_MODEL_SPECS.map(fromSpec), LEGACY_LTX];

export function lineupEntry(key: string): VideoLineupEntry | undefined {
  return VIDEO_LINEUP.find((entry) => entry.key === key);
}

const LTX_09_NAME = /ltxv|ltx-video/i;
/** ltx-2-19b-…, ltx-2.3-22b-…: a different architecture, whatever the prefix shares. */
const LTX_2_NAME = /ltx-?2(?:\.\d+)?[-_.]/i;
const T5_XXL_NAME = /t5xxl/i;

/**
 * The file said the way a person would say it.
 *
 * "ltx-video-2b-v0.9.5.safetensors" is a filename, and every screen that
 * offered the model showed it as though it were the model's name — the maker
 * card in Chat worst of all, where it sat under "Video maker" as the thing
 * about to make your clip. Where the name carries neither a size nor a version
 * there is nothing to improve on, so the file keeps its own name, minus the
 * extension.
 */
export function strayLtxName(file: string): string {
  const size = file.match(/(\d+(?:\.\d+)?)b\b/i)?.[1];
  const version = file.match(/0\.9(?:\.\d+)?/)?.[0];
  if (!size && !version) return file.replace(/\.[^.]+$/, '');
  return `LTX-Video${size ? ` ${size}B` : ''}${version ? ` ${version}` : ''} (your own file)`;
}

/**
 * LTX-Video 0.9 checkpoints ComfyUI lists that did not come from the catalog.
 *
 * Until 0.9 the Lab ran any LTX checkpoint in models/checkpoints and told people
 * to put one there, so some have files RigMatch never downloaded. Those still
 * run the graph they always ran, beside a T5-XXL encoder. Only LTX-Video 0.9
 * names qualify: LTX-2 and every other family need graphs of their own, and a
 * Wan file run through the LTX graph fails inside the sampler.
 *
 * Their size is read from the name — 13B or 2B — because nothing else says it,
 * and their times stay rough until this machine has rendered them.
 */
export function strayLtxEntries(installed: ComfyFolderListing): VideoLineupEntry[] {
  const encoder = (installed.text_encoders ?? []).find((name) => T5_XXL_NAME.test(name));
  if (!encoder) return [];
  const big = lineupEntry('ltxv-13b');
  return (installed.checkpoints ?? [])
    .filter((name) => LTX_09_NAME.test(name) && !LTX_2_NAME.test(name) && !isCatalogFile(name))
    .map((name) => ({
      key: `file:${name}`,
      name: strayLtxName(name),
      publisher: LEGACY_LTX.publisher,
      sizing: /13b/i.test(name) && big ? big.sizing : LEGACY_LTX.sizing,
      refMeasured: false,
      output: LEGACY_LTX.output,
      legacy: { checkpoint: name, textEncoder: encoder },
      found: true,
    }));
}

/** The catalog lineup, and whatever LTX-Video 0.9 checkpoints ComfyUI already has. */
export function allLineupEntries(installed: ComfyFolderListing): VideoLineupEntry[] {
  return [...VIDEO_LINEUP, ...strayLtxEntries(installed)];
}

/** What ComfyUI lists, from a status that may predate the five-folder listing. */
export function comfyListing(
  status: { checkpoints?: string[]; textEncoders?: string[]; folders?: ComfyFolderListing } | null | undefined,
): ComfyFolderListing {
  if (!status) return {};
  return status.folders ?? { checkpoints: status.checkpoints ?? [], text_encoders: status.textEncoders ?? [] };
}

/** This machine, as far as fit and time are concerned. A SystemProfile will do. */
export function videoMachineFrom(system: {
  platform: string;
  memory: { totalGb: number };
  gpu: { vramGb: number; model: string; isUnifiedMemory?: boolean };
}): VideoMachine {
  return {
    vramGb: system.gpu.vramGb || 0,
    ramGb: system.memory.totalGb || 0,
    unifiedMemory: Boolean(system.gpu.isUnifiedMemory),
    platform: system.platform,
    gpuName: system.gpu.model || undefined,
  };
}

/** Every GENERATION_MODELS id this model needs on disk. */
export function lineupFileIds(entry: VideoLineupEntry): string[] {
  if (entry.found) return [];
  if (entry.spec) return videoModelFileIds(entry.spec);
  return [entry.key, ...(generationModelById(entry.key)?.requires ?? [])];
}

/** On disk and loadable: every file listed in the folder its loader reads. */
export function isLineupInstalled(entry: VideoLineupEntry, installed: ComfyFolderListing): boolean {
  if (entry.found) return true;
  return lineupFileIds(entry).every((id) => {
    const model = generationModelById(id);
    return Boolean(model) && isListed(model!, installed);
  });
}

/** What a download would fetch now: only the files still missing. */
export function lineupDownloadBytes(entry: VideoLineupEntry, installed: ComfyFolderListing): number {
  if (entry.found) return 0;
  const main = generationModelById(entry.key);
  return main ? downloadPlan(main, installed).totalBytes : 0;
}

/** The graph for one clip, with the judged frame already in it. */
export function lineupGraph(entry: VideoLineupEntry, run: { prompt: string; seed: number }): Record<string, unknown> {
  if (entry.spec) return withJudgedFrame(buildVideoWorkflow(entry.spec, run), entry.spec.output.frames);
  if (entry.legacy) {
    return buildTxt2VideoWorkflow({
      checkpoint: entry.legacy.checkpoint,
      textEncoder: entry.legacy.textEncoder,
      prompt: run.prompt,
      seed: run.seed,
    });
  }
  throw new Error(`${entry.key} has no graph to run.`);
}

export type LineupCardFacts = {
  fit: VideoFit;
  estimate: VideoEstimate;
  installed: boolean;
  /** Zero once everything is on disk. */
  downloadBytes: number;
  /** Can join a lineup now: on disk, and this machine can run it. */
  runnable: boolean;
  /** Why it cannot join yet, in a sentence; null when it can. */
  blocked: string | null;
};

/** Everything a model's card says, worked out before anything is downloaded. */
export function lineupCardFacts(
  entry: VideoLineupEntry,
  {
    machine,
    installed,
    hasToken = false,
    calibration,
    measuredSeconds,
  }: {
    machine: VideoMachine;
    installed: ComfyFolderListing;
    hasToken?: boolean;
    calibration?: VideoCalibration | null;
    measuredSeconds?: number | null;
  },
): LineupCardFacts {
  const onDisk = isLineupInstalled(entry, installed);
  // A token opens the download. A model already on disk runs without one.
  const fit = videoFit(entry.sizing, machine, { hasToken: hasToken || onDisk });
  const estimate = estimateVideoSeconds(entry.sizing, machine, { calibration, measuredSeconds });
  const fitsHere = fit.status === 'fits' || fit.status === 'offload';
  return {
    fit,
    estimate,
    installed: onDisk,
    downloadBytes: onDisk ? 0 : lineupDownloadBytes(entry, installed),
    runnable: fitsHere && onDisk,
    blocked: !fitsHere ? fit.detail : !onDisk ? 'Download it first.' : null,
  };
}

/**
 * A video model's fit, in the shape the Models screen reads.
 *
 * The Models screen sized every row against VRAM alone, which is right for a
 * chat model and wrong for a video model: ComfyUI streams what does not fit
 * from system memory. So Wan 2.2 14B read "Too big" there and "Fits with
 * offloading" in the Lab, and the download queue refused a model the Lab could
 * run. A missing token does not block the queue — the download itself says
 * what to do, with the model's page in the message.
 */
export function asHardwareFit(fit: VideoFit): HardwareFit {
  switch (fit.status) {
    case 'fits':
      return { tone: 'good', label: fit.label, detail: fit.detail, recommend: true };
    case 'offload':
      return { tone: 'tight', label: fit.label, detail: fit.detail, recommend: true };
    case 'needs-token':
      return { tone: 'unknown', label: fit.label, detail: fit.detail, recommend: true };
    default:
      return { tone: 'out-of-league', label: fit.label, detail: fit.detail, recommend: false };
  }
}

/**
 * A time this machine measured for the model, if it was measured on this GPU.
 * A time from another card is somebody else's, and says nothing about this one.
 */
export function measuredSecondsFor(
  entry: VideoLineupEntry,
  saved: Record<string, AdvancedLabResult>,
  gpuName: string | undefined,
): number | null {
  const result = saved[`video:${entry.key}`];
  if (!result || result.error || !result.elapsedMs || !gpuName || result.gpu !== gpuName) return null;
  return result.elapsedMs / 1000;
}

type EstimateOptions = { calibration?: VideoCalibration | null; saved?: Record<string, AdvancedLabResult> };

const estimateFor = (entry: VideoLineupEntry, machine: VideoMachine, options: EstimateOptions) =>
  estimateVideoSeconds(entry.sizing, machine, {
    calibration: options.calibration,
    measuredSeconds: options.saved ? measuredSecondsFor(entry, options.saved, machine.gpuName) : null,
  });

/** Everything that can race now — on disk, and able to run here — fastest first. */
export function runnableLineup(
  installed: ComfyFolderListing,
  machine: VideoMachine,
  options: EstimateOptions = {},
): VideoLineupEntry[] {
  return allLineupEntries(installed)
    .filter((entry) => lineupCardFacts(entry, { machine, installed }).runnable)
    .map((entry) => ({ entry, seconds: estimateFor(entry, machine, options).seconds }))
    .sort((a, b) => a.seconds - b.seconds)
    .map(({ entry }) => entry);
}

/**
 * How long a whole lineup should take.
 *
 * A sum is a forecast even when every part was measured, so it never reads as
 * measured: "Took … here" would describe a run that has not happened.
 */
export function estimateLineup(
  entries: VideoLineupEntry[],
  machine: VideoMachine,
  options: EstimateOptions = {},
): VideoEstimate {
  let seconds = 0;
  let low = 0;
  let high = 0;
  let rough = false;
  for (const entry of entries) {
    const estimate = estimateFor(entry, machine, options);
    seconds += estimate.seconds;
    low += estimate.low;
    high += estimate.high;
    if (estimate.basis === 'rough') rough = true;
  }
  return { seconds, low, high, basis: rough ? 'rough' : 'calibrated' };
}

/**
 * How long to wait for one clip before calling it stuck.
 *
 * A flat 30 minutes was right for LTX and would have killed Kandinsky 5 Pro,
 * which takes about three hours on the reference card. Six times the reference
 * time leaves room for a machine several times slower, and the floor keeps the
 * fast models from being cut off by a slow cold start.
 */
export function lineupTimeoutMs(entry: VideoLineupEntry): number {
  return Math.max(DEFAULT_VIDEO_TIMEOUT_MS, Math.ceil(entry.sizing.refSeconds * 6 * 1000));
}

export type LineupOutcome = { entry: VideoLineupEntry; result: VideoRunResult };

// One member per phase that carries no result, so a handler that returns on
// 'rendering' and then on 'judging' is left holding one with a result.
export type LineupProgress =
  | { index: number; total: number; entry: VideoLineupEntry; phase: 'rendering' }
  | { index: number; total: number; entry: VideoLineupEntry; phase: 'judging' }
  | { index: number; total: number; entry: VideoLineupEntry; phase: 'done' | 'failed' | 'judged'; result: VideoRunResult };

/**
 * Run each model in turn with the same prompt and seed, then judge the frames.
 *
 * Failures are results, not exceptions: runVideoGeneration returns one with
 * its reason, and the lineup moves on. Stop ends it with the model in flight,
 * and skips the judging.
 *
 * The frames are judged only once every model has rendered. The judge is a
 * vision model in Ollama, which keeps it in VRAM for ten minutes after it
 * answers, and ComfyUI's unload cannot reach it: judged between renders, every
 * model after the first was timed with several gigabytes of the card taken.
 */
export async function runVideoLineup({
  entries,
  transport,
  judge,
  imagePrompt,
  seed,
  unloadBetweenRuns,
  signal,
  onProgress,
  timeoutFor = lineupTimeoutMs,
  sleep,
  now,
}: {
  entries: VideoLineupEntry[];
  transport: VideoTransport;
  judge?: JudgeFn;
  imagePrompt: ImagePrompt;
  seed: number;
  /** Only when the user was told a lineup unloads ComfyUI, or it is RigMatch's own. */
  unloadBetweenRuns: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LineupProgress) => void;
  timeoutFor?: (entry: VideoLineupEntry) => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<LineupOutcome[]> {
  const outcomes: LineupOutcome[] = [];
  for (const [index, entry] of entries.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ index, total: entries.length, entry, phase: 'rendering' });
    const result = await runVideoGeneration({
      transport,
      imagePrompt,
      graph: lineupGraph(entry, { prompt: imagePrompt.prompt, seed }),
      model: entry.key,
      output: { width: entry.output.width, height: entry.output.height, frames: entry.output.frames, fps: entry.output.fps },
      dedicated: unloadBetweenRuns,
      signal,
      timeoutMs: timeoutFor(entry),
      sleep,
      now,
    });
    outcomes.push({ entry, result });
    onProgress?.({ index, total: entries.length, entry, phase: result.error ? 'failed' : 'done', result });
  }

  if (judge && !signal?.aborted) {
    for (const [index, outcome] of outcomes.entries()) {
      if (signal?.aborted) break;
      if (outcome.result.error || !outcome.result.frameDataUrl) continue;
      onProgress?.({ index, total: entries.length, entry: outcome.entry, phase: 'judging' });
      const judged = await judgeVideoResult(outcome.result, judge, imagePrompt);
      outcomes[index] = { entry: outcome.entry, result: judged };
      onProgress?.({ index, total: entries.length, entry: outcome.entry, phase: 'judged', result: judged });
    }
  }
  return outcomes;
}

/** Fastest first, as the leaderboard reads, and every failure after the last finisher. */
export function rankLineup<T extends { elapsedMs: number; error?: string }>(items: T[]): T[] {
  const finished = items.filter((item) => !item.error).sort((a, b) => a.elapsedMs - b.elapsedMs);
  return [...finished, ...items.filter((item) => item.error)];
}

/**
 * The calibration this lineup earned, if it rendered LTX-Video 2B.
 *
 * Only a successful run counts: a failure's elapsed time is how long it took to
 * fail, not how fast this machine renders.
 */
export function calibrationFrom(
  outcomes: LineupOutcome[],
  gpuName: string | undefined,
  previous: VideoCalibration | null | undefined,
): VideoCalibration | null {
  const run = outcomes.find((o) => o.entry.key === CALIBRATION_MODEL && !o.result.error && o.result.elapsedMs > 0);
  if (!run) return previous ?? null;
  return recordCalibration(previous, gpuName, run.result.elapsedMs / 1000);
}

/** What a model's card estimated before the run, kept so the result can be read against it. */
export type LineupExpectation = { low: number; high: number; basis: VideoEstimate['basis'] };

export type LineupRecordEntry = {
  key: string;
  name: string;
  elapsedMs: number;
  realtimeCost: number;
  score: number;
  grade: string;
  judged: boolean;
  /** How much of the prompt the judge confirmed in the middle frame, 0 to 1. */
  adherence?: number | null;
  expected?: LineupExpectation;
  error?: string;
};

/** One lineup as it is kept: enough to show its leaderboard again after a restart. */
export type LineupRecord = {
  id: string;
  prompt: string;
  seed: number;
  gpu: string;
  /** Whether ComfyUI was unloaded before every model. */
  unloaded: boolean;
  startedAt: string;
  finishedAt: string | null;
  stopped: boolean;
  /** Every model picked, in the order they run. */
  planned: Array<{ key: string; name: string }>;
  /**
   * Where the Balance fader stood when the race started. The leaderboard can be
   * re-ranked afterwards; this says what the person asked for going in.
   */
  balance?: number;
  /** One per model that has finished, rendered or failed. */
  entries: LineupRecordEntry[];
};

export function lineupRecordEntry(
  entry: VideoLineupEntry,
  result: VideoRunResult,
  expected?: LineupExpectation,
): LineupRecordEntry {
  return {
    key: entry.key,
    name: entry.name,
    elapsedMs: result.elapsedMs,
    realtimeCost: result.realtimeCost,
    score: result.score,
    grade: result.grade,
    judged: result.judged,
    adherence: result.adherence,
    ...(expected ? { expected } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

/**
 * A lineup's leaderboard at a fader position.
 *
 * Accuracy is the judge's check of each clip's middle frame; a clip that fell
 * short of the pass line, or produced nothing, cannot win at any position.
 */
export function rankLineupByBalance(entries: LineupRecordEntry[], balance: number) {
  return rankByBalance(entries.map((entry): Contender<LineupRecordEntry> => ({
    item: entry,
    pace: entry.elapsedMs > 0 ? 1000 / entry.elapsedMs : 0,
    accuracy: typeof entry.adherence === 'number' ? entry.adherence : null,
    failed: Boolean(entry.error) || (typeof entry.adherence === 'number' && entry.adherence < JUDGE_PASS),
  })), balance);
}

/**
 * How a finished time reads against what its card said beforehand.
 *
 * Null when there is nothing to compare: a failure, or an estimate that was
 * already this machine's own measurement.
 */
export function againstEstimate(entry: LineupRecordEntry): 'inside' | 'faster' | 'slower' | null {
  if (entry.error || !entry.expected || entry.expected.basis === 'measured') return null;
  const seconds = entry.elapsedMs / 1000;
  if (seconds < entry.expected.low) return 'faster';
  if (seconds > entry.expected.high) return 'slower';
  return 'inside';
}
