/**
 * Building a text-to-video graph for ComfyUI.
 *
 * Video is not "images with more frames" as far as measuring goes. Three
 * things learned from running LTX-Video on a 12 GB RTX 4070, all of which
 * shape what is built here:
 *
 * There is no VRAM cliff. Every resolution from 768x512 up to 1920x1088
 * completed; the card sat at 12.4-12.75 GB of 12.9 GB throughout, because the
 * models alone are about 11.2 GB before a single frame is sampled. ComfyUI
 * degrades into time rather than failing, so "did it fit" tells you nothing
 * about video and time is the only signal that separates one machine from
 * another.
 *
 * Time tracks pixel count almost exactly. 1920x1088 is 5.3x the pixels of
 * 768x512 and took 5.8x as long — 12.1s against 70.7s for the same four
 * seconds of footage.
 *
 * And a repeat run is free, which is a trap. ComfyUI caches node outputs by
 * their inputs, so submitting an identical graph returns the previous video in
 * about two seconds. A benchmark with a fixed seed — which is what
 * reproducibility wants — would report 2s for a 70s job on every run after the
 * first. Posting /free before each run evicts that cache, which is why the
 * runner does it and why the seed can stay fixed.
 */

/** Node ids. Arbitrary, but the wiring refers to them, so they are named. */
const CLIP = '38';
const CHECKPOINT = '44';
const POSITIVE = '6';
const NEGATIVE = '7';
const LATENT = '70';
const SAMPLER_SELECT = '73';
const SCHEDULER = '71';
const CONDITIONING = '69';
const SAMPLER = '72';
const DECODE = '8';
const FRAME = '91';
const SAVE_FRAME = '90';
const CREATE_VIDEO = '78';
const SAVE_VIDEO = '79';

/** What the distilled LTX checkpoints are trained for. */
export const LTX_DEFAULTS = {
  width: 768,
  height: 512,
  /** 97 frames at 24fps is almost exactly four seconds. */
  frames: 97,
  steps: 8,
  /**
   * The distilled model needs no classifier-free guidance. Raising this both
   * halves the speed and scorches the picture.
   */
  cfg: 1.0,
  frameRate: 25,
  fps: 24,
  seed: 12345,
} as const;

export type Txt2VideoRequest = {
  checkpoint: string;
  /** The T5 text encoder, loaded separately — LTX checkpoints do not carry one. */
  textEncoder: string;
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  frames?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  fps?: number;
};

const DEFAULT_NEGATIVE = 'low quality, worst quality, deformed, distorted, disfigured, '
  + 'motion smear, motion artifacts, bad anatomy, ugly';

export function buildTxt2VideoWorkflow(req: Txt2VideoRequest): Record<string, unknown> {
  const {
    checkpoint,
    textEncoder,
    prompt,
    negative = DEFAULT_NEGATIVE,
    width = LTX_DEFAULTS.width,
    height = LTX_DEFAULTS.height,
    frames = LTX_DEFAULTS.frames,
    steps = LTX_DEFAULTS.steps,
    cfg = LTX_DEFAULTS.cfg,
    seed = LTX_DEFAULTS.seed,
    fps = LTX_DEFAULTS.fps,
  } = req;

  return {
    [CLIP]: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: textEncoder, type: 'ltxv', device: 'default' },
    },
    [CHECKPOINT]: {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
    },
    [POSITIVE]: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: [CLIP, 0] } },
    [NEGATIVE]: { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: [CLIP, 0] } },
    [LATENT]: {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: { width, height, length: frames, batch_size: 1 },
    },
    [SAMPLER_SELECT]: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    [SCHEDULER]: {
      class_type: 'LTXVScheduler',
      inputs: { steps, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: [LATENT, 0] },
    },
    [CONDITIONING]: {
      class_type: 'LTXVConditioning',
      inputs: { positive: [POSITIVE, 0], negative: [NEGATIVE, 0], frame_rate: LTX_DEFAULTS.frameRate },
    },
    [SAMPLER]: {
      class_type: 'SamplerCustom',
      inputs: {
        model: [CHECKPOINT, 0],
        add_noise: true,
        noise_seed: seed,
        cfg,
        positive: [CONDITIONING, 0],
        negative: [CONDITIONING, 1],
        sampler: [SAMPLER_SELECT, 0],
        sigmas: [SCHEDULER, 0],
        latent_image: [LATENT, 0],
      },
    },
    [DECODE]: { class_type: 'VAEDecode', inputs: { samples: [SAMPLER, 0], vae: [CHECKPOINT, 2] } },
    // One frame is pulled out and saved rather than all of them. Saving the
    // whole batch wrote 97 PNGs per run and filled 1.5 GB during the spike,
    // and only one frame is ever judged.
    [FRAME]: {
      class_type: 'ImageFromBatch',
      inputs: { image: [DECODE, 0], batch_index: middleFrameIndex(frames), length: 1 },
    },
    [SAVE_FRAME]: {
      class_type: 'SaveImage',
      inputs: { images: [FRAME, 0], filename_prefix: 'RigMatchFrame' },
    },
    [CREATE_VIDEO]: { class_type: 'CreateVideo', inputs: { images: [DECODE, 0], fps } },
    [SAVE_VIDEO]: {
      class_type: 'SaveVideo',
      inputs: { video: [CREATE_VIDEO, 0], filename_prefix: 'video/RigMatch', format: 'auto', codec: 'auto' },
    },
  };
}

/**
 * Which frame to judge.
 *
 * The first frame of a video model is the easiest one — it is closest to a
 * still image and says least about whether the model held the scene together.
 * The middle is the fairer test.
 */
export function middleFrameIndex(frames: number): number {
  return Math.max(0, Math.floor(Math.max(1, frames) / 2));
}

/** The node that carries the judged frame, and the one that carries the video. */
export const VIDEO_FRAME_NODE = SAVE_FRAME;
export const VIDEO_OUTPUT_NODE = SAVE_VIDEO;

/**
 * Whether a checkpoint looks like a video model.
 *
 * Named rather than reported: ComfyUI lists checkpoints as filenames and says
 * nothing about what they are, so a name rule is the only thing available.
 * It errs toward missing a video model rather than offering an image
 * checkpoint to a video graph, which fails deep inside the sampler with a
 * shape error no user could act on.
 */
export function isVideoCheckpoint(name: string): boolean {
  return /ltxv|ltx-video|\bwan\b|wan2|hunyuanvideo|mochi|cogvideo|svd|stable-video/i
    .test(name || '');
}

/** T5 text encoders, which an LTX graph needs and cannot run without. */
export function isTextEncoder(name: string): boolean {
  return /t5|umt5|text_encoder/i.test(name || '');
}

/**
 * One seed per batch of runs, not one per run.
 *
 * Two things pull in opposite directions. ComfyUI caches by graph inputs, so
 * reusing a seed returns the previous video in about 1.5 seconds and the
 * benchmark reports that as the render time. But comparing two checkpoints
 * fairly means giving them the same seed, or the difference between them is
 * partly just noise.
 *
 * Both hold if the seed is fixed within a batch and different between batches:
 * every model in a comparison gets identical input, and re-running the
 * comparison tomorrow does real work rather than replaying yesterday's cache.
 */
export function batchSeed(now: number = Date.now()): number {
  // Kept inside 32 bits; ComfyUI rejects seeds beyond its integer range.
  return Math.floor(now / 1000) % 2147483647;
}

/**
 * Whether this ComfyUI is busy with someone else's work.
 *
 * Submitting alongside a render already in flight does not fail — it queues,
 * and then both jobs share a GPU. The resulting time says nothing about the
 * machine, which is worse than refusing, because it looks like a measurement.
 */
export function comfyBusyCount(execInfo: unknown): number {
  const remaining = (execInfo as { exec_info?: { queue_remaining?: unknown } } | null)
    ?.exec_info?.queue_remaining;
  return typeof remaining === 'number' && Number.isFinite(remaining) ? remaining : 0;
}
