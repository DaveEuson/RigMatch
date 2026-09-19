// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Whether a video model can run on this machine, and how long one clip will
 * take — said on its card before anything is downloaded.
 *
 * The lineup's models run from 9.8 GB to 55.9 GB of download, and from 17
 * seconds to three hours a clip. Someone deciding whether to spend an evening
 * fetching one needs both answers first, and neither can be read off a model
 * card on Hugging Face, because both depend on the machine.
 *
 * Ported from videobench's fit() and estimate(). The reference times were taken
 * on an RTX 4070 with 12 GB, cold start included. videobench scales them by
 * this GPU's measured fp16 speed; RigMatch cannot run that probe from inside
 * Electron, so it calibrates instead. The first time the Lab renders LTX-Video
 * 2B — 17 seconds on the reference card — the ratio becomes this machine's
 * factor. Until then an estimate is the reference card's own, and says so.
 */

import { videoModelSpec, type VideoModelSpec } from './videoCatalog.ts';

/** What fit and time are worked out from — a catalog spec has it, and so does any other model sized by hand. */
export type VideoSizing = Pick<VideoModelSpec, 'ditGb' | 'teGb' | 'refSeconds' | 'gated'>;

export type VideoMachine = {
  vramGb: number;
  ramGb: number;
  /** One memory pool for CPU and GPU: a Jetson, or Apple silicon. */
  unifiedMemory?: boolean;
  /** 'darwin' runs ComfyUI on Metal, which is sized against system memory. */
  platform?: string;
  /** The calibration belongs to one GPU; a different card forgets it. */
  gpuName?: string;
};

export type VideoFit =
  | { status: 'fits'; label: string; detail: string }
  | { status: 'offload'; label: string; detail: string }
  | { status: 'too-big'; label: string; detail: string }
  | { status: 'needs-token'; label: string; detail: string };

/** The model whose run calibrates this machine against the reference card. */
export const CALIBRATION_MODEL = 'ltxv-2b';
/** VRAM on the card the reference times were taken on. */
const REFERENCE_VRAM_GB = 12;
/** VRAM already spoken for by ComfyUI and the desktop before a model loads. */
const VRAM_HEADROOM_GB = 1.5;
/** Below this, nothing in the lineup runs at a useful speed. */
const MIN_VRAM_GB = 6;

const gb = (value: number) => (Math.round(value * 10) / 10).toString();

/**
 * Where a model stands on this machine.
 *
 * "Fits with offloading" is a real answer, not a softer "no": ComfyUI streams
 * weights that do not fit from system memory, and MiniMax H3's 21 GB model
 * finished a clip in under two minutes that way on a 12 GB card.
 */
export function videoFit(
  spec: VideoSizing,
  machine: VideoMachine,
  { hasToken = false }: { hasToken?: boolean } = {},
): VideoFit {
  if (spec.gated && !hasToken) {
    return {
      status: 'needs-token',
      label: 'Needs a token',
      detail: 'Its publisher gates the download on Hugging Face. Add your own access token in Settings, '
        + 'and accept the model’s terms on its Hugging Face page.',
    };
  }

  const apple = machine.platform === 'darwin';
  if (machine.unifiedMemory && !apple) {
    // videobench runs video on a Jetson only from GGUF builds split into
    // encode, sample and decode. Those need a custom node, and RigMatch adds
    // nothing to the user's ComfyUI, so none of the lineup fits here.
    return {
      status: 'too-big',
      label: 'Too big for shared memory',
      detail: 'On a Jetson, video runs only from low-memory GGUF builds, which need a custom node '
        + 'RigMatch does not install.',
    };
  }

  if (apple) {
    const needed = spec.ditGb + spec.teGb;
    const usable = machine.ramGb * 0.7;
    return needed <= usable
      ? { status: 'fits', label: 'Fits', detail: `Needs about ${gb(needed)} GB of this Mac’s ${gb(machine.ramGb)} GB.` }
      : { status: 'too-big', label: 'Too big', detail: `Needs about ${gb(needed)} GB, and about ${gb(usable)} GB of this Mac’s memory is usable for it.` };
  }

  if (machine.vramGb < MIN_VRAM_GB) {
    return {
      status: 'too-big',
      label: 'Needs a bigger GPU',
      detail: `Video models need a graphics card with ${MIN_VRAM_GB} GB or more, and this one has ${gb(machine.vramGb)} GB.`,
    };
  }

  if (spec.ditGb <= machine.vramGb - VRAM_HEADROOM_GB) {
    return { status: 'fits', label: 'Fits in VRAM', detail: `Its ${gb(spec.ditGb)} GB model fits in ${gb(machine.vramGb)} GB of VRAM.` };
  }

  const toOffload = Math.max(spec.ditGb, spec.teGb) + 4;
  if (toOffload <= machine.ramGb * 0.85) {
    return {
      status: 'offload',
      label: 'Fits with offloading',
      detail: `Its ${gb(spec.ditGb)} GB model is bigger than this card’s VRAM, so ComfyUI streams it from system memory. It runs, just slower.`,
    };
  }
  return {
    status: 'too-big',
    label: 'Too big',
    detail: `Offloading it needs about ${gb(toOffload)} GB of system memory, and this machine has ${gb(machine.ramGb)} GB.`,
  };
}

export type VideoCalibration = { gpu: string; seconds: number };

/**
 * Remember the fastest calibration run for this GPU.
 *
 * The fastest, not the latest: something else using the GPU only ever makes a
 * run read slow, never fast — videobench's first reading mid-lineup came out
 * at 22 TFLOPS on a 52 TFLOPS card. A different GPU starts again.
 */
export function recordCalibration(
  previous: VideoCalibration | null | undefined,
  gpuName: string | undefined,
  seconds: number,
): VideoCalibration {
  const gpu = gpuName ?? '';
  if (previous && previous.gpu === gpu && previous.seconds > 0 && previous.seconds <= seconds) return previous;
  return { gpu, seconds };
}

/** This machine against the reference card: above 1 is slower, below is faster. */
export function machineFactor(
  calibration: VideoCalibration | null | undefined,
  gpuName: string | undefined,
): { factor: number; calibrated: boolean } {
  const reference = videoModelSpec(CALIBRATION_MODEL)?.refSeconds ?? 0;
  if (calibration && reference > 0 && calibration.seconds > 0 && calibration.gpu === (gpuName ?? '')) {
    return { factor: calibration.seconds / reference, calibrated: true };
  }
  return { factor: 1, calibrated: false };
}

export type VideoEstimate = {
  seconds: number;
  low: number;
  high: number;
  /**
   * measured: timed on this machine, and no longer an estimate.
   * calibrated: scaled by this machine's own LTX-Video 2B run.
   * rough: the reference card's time, before this machine has been measured.
   */
  basis: 'measured' | 'calibrated' | 'rough';
};

/**
 * How long one clip should take here, as a range.
 *
 * The range is 0.6x to 1.6x, as videobench gives it: cold starts vary with the
 * disk, and a busy desktop moves a run more than the model does. A time this
 * machine has actually measured for the model replaces the estimate outright.
 */
export function estimateVideoSeconds(
  spec: VideoSizing,
  machine: VideoMachine,
  {
    calibration,
    measuredSeconds,
  }: { calibration?: VideoCalibration | null; measuredSeconds?: number | null } = {},
): VideoEstimate {
  if (measuredSeconds && measuredSeconds > 0) {
    return { seconds: measuredSeconds, low: measuredSeconds, high: measuredSeconds, basis: 'measured' };
  }

  const { factor, calibrated } = machineFactor(calibration, machine.gpuName);
  let seconds = spec.refSeconds * factor;

  const apple = machine.platform === 'darwin';
  const jetson = Boolean(machine.unifiedMemory) && !apple;
  if (!machine.unifiedMemory && !apple) {
    // The reference times already include the 4070's own offloading, so only
    // the difference counts: more VRAM than that is faster, less is slower.
    const over = (vram: number) => Math.max(0, spec.ditGb - (vram - VRAM_HEADROOM_GB)) / spec.ditGb;
    seconds *= (1 + 0.8 * over(machine.vramGb)) / (1 + 0.8 * over(REFERENCE_VRAM_GB));
  }
  if (jetson) {
    // Low-memory mode reloads between stages and decodes partly on the CPU;
    // measured on an 8 GB Orin Nano at 2.0x to 2.9x the plain scaling.
    seconds *= 2.5;
  }
  return { seconds, low: seconds * 0.6, high: seconds * 1.6, basis: calibrated ? 'calibrated' : 'rough' };
}

/** A duration a person can plan around: seconds, minutes, or hours. */
export function formatVideoDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds - minutes * 60);
    return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds - hours * 3600) / 60);
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

/**
 * The card's time line: a measured time as it was, an estimate as a range.
 *
 * `roughNote: false` drops the explanation for a list of eighteen models,
 * which says it once above the list rather than on every row.
 */
export function formatVideoEstimate(
  estimate: VideoEstimate,
  { roughNote = true }: { roughNote?: boolean } = {},
): string {
  if (estimate.basis === 'measured') return `Took ${formatVideoDuration(estimate.seconds)} here`;
  const { low, high } = estimate;
  // A lineup of measured models sums to a range with no width; "6–6 min" says it twice.
  const span = (from: string, to: string, unit: string) => (from === to ? `${from} ${unit}` : `${from}–${to} ${unit}`);
  const range = high < 90
    ? span(String(Math.round(low)), String(Math.round(high)), 's')
    : high < 5400
      ? span(String(Math.max(1, Math.round(low / 60))), String(Math.max(1, Math.round(high / 60))), 'min')
      : span((low / 3600).toFixed(1), (high / 3600).toFixed(1), 'h');
  return estimate.basis === 'rough' && roughNote
    ? `About ${range} (rough until RigMatch has timed this machine)`
    : `About ${range}`;
}
