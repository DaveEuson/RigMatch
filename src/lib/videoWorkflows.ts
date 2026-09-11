// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One ComfyUI graph builder per video model family.
 *
 * Ported from videobench's export and held to it by a test: for every model in
 * the catalogue, building with the export's placeholder prompt and seed
 * reproduces the exported graph exactly, and every graph passes a check against
 * /object_info from the ComfyUI build those graphs were validated on. A porting
 * mistake fails a test, not a 50 GB download.
 *
 * The export is what is ported, not videobench's own builders. Those reach for
 * the GGUF loaders — a custom node — where the export swapped in core
 * equivalents, and RigMatch runs on the user's own ComfyUI and adds nothing
 * to it.
 *
 * Everything a clip is — size, length, frame rate, steps — comes from the
 * model's spec, because those are the settings its reference time was measured
 * at. Change one and the estimate stops describing the run.
 */

import { generationModelById } from './generationCatalog.ts';
import { middleFrameIndex } from './videoGen.ts';
import type { VideoFamily, VideoFileRole, VideoModelSpec } from './videoCatalog.ts';

export type ComfyNode = { class_type: string; inputs: Record<string, unknown> };
export type ComfyGraph = Record<string, ComfyNode>;
type Link = [string, number];

export type VideoRunInput = {
  prompt: string;
  seed: number;
  /** Where SaveVideo writes, under ComfyUI's output folder. */
  prefix?: string;
};

const node = (classType: string, inputs: Record<string, unknown>): ComfyNode =>
  ({ class_type: classType, inputs });

/** The tiled decode every family shares: small enough to decode five seconds on 12 GB. */
const TILES = { tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 };

const LTX_NEGATIVE = 'low quality, worst quality, deformed, distorted, disfigured, blurry, watermark, '
  + 'text, jpeg artifacts, static, motionless';
const LTX2_NEGATIVE = 'pc game, console game, video game, cartoon, childish, ugly';
/**
 * Wan's own negative prompt, in the Chinese it was trained on. ComfyUI's Wan
 * templates ship it verbatim, and a translation would be a different prompt.
 */
const WAN_NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，'
  + 'JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，'
  + '手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';
/** LTX-2's eight distilled steps, given as sigmas rather than left to a scheduler. */
const LTX2_SIGMAS = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0';

/** Every family decodes its frames into this node, which is where the judge looks. */
export const VIDEO_DECODE_NODE = '9';
/** Where every family saves its clip. */
export const VIDEO_SAVE_NODE = '91';
/** RigMatch's two additions: the middle frame, pulled out and saved for the judge. */
export const JUDGED_FRAME_NODE = 'jf';
export const SAVE_JUDGED_FRAME_NODE = 'js';

function file(spec: VideoModelSpec, role: VideoFileRole): string {
  const id = spec.files[role];
  const model = id ? generationModelById(id) : undefined;
  if (!model) throw new Error(`${spec.key} has no ${role} file.`);
  return model.filename;
}

function withTail(graph: ComfyGraph, fps: number, prefix: string, audio?: Link): ComfyGraph {
  graph['90'] = node('CreateVideo', { images: [VIDEO_DECODE_NODE, 0], fps, ...(audio ? { audio } : {}) });
  graph[VIDEO_SAVE_NODE] = node('SaveVideo', { video: ['90', 0], filename_prefix: prefix, format: 'mp4', codec: 'h264' });
  return graph;
}

type Builder = (spec: VideoModelSpec, run: VideoRunInput, prefix: string) => ComfyGraph;

/** LTX-Video 0.9.8, 2B and 13B: a distilled model, eight steps, no guidance. */
const ltxv: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: spec.settings?.weightDtype ?? 'default' }),
    2: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'ltxv', device: 'default' }),
    3: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    4: node('CLIPTextEncode', { clip: ['2', 0], text: LTX_NEGATIVE }),
    5: node('VAELoader', { vae_name: file(spec, 'vae') }),
    6: node('EmptyLTXVLatentVideo', { width, height, length: frames, batch_size: 1 }),
    7: node('LTXVConditioning', { positive: ['3', 0], negative: ['4', 0], frame_rate: fps }),
    8: node('KSampler', {
      model: ['1', 0], positive: ['7', 0], negative: ['7', 1], latent_image: ['6', 0], seed: run.seed,
      steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['5', 0], ...TILES }),
  }, fps, prefix);
};

/**
 * LTX-2, 2.3 and 2.5: sound and picture from one latent, split apart after
 * sampling. LTX-2's checkpoint is already distilled and goes straight to the
 * guider; LTX-2.3's is a dev model, and its distilled LoRA at half strength is
 * what makes the eight manual sigmas right. LTX-2.5 ships as separate files.
 */
const ltx2: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps } = spec.output;
  const variant = spec.settings?.variant ?? '2';
  const graph: ComfyGraph = {};
  let vae: Link;
  if (variant === '2.5') {
    graph.dit = node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' });
    graph.te = node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'ltxv', device: 'default' });
    graph.vv = node('VAELoader', { vae_name: file(spec, 'vae') });
    graph.av = node('VAELoader', { vae_name: file(spec, 'audioVae') });
    vae = ['vv', 0];
  } else {
    const checkpoint = file(spec, 'checkpoint');
    graph.ck = node('CheckpointLoaderSimple', { ckpt_name: checkpoint });
    graph.te = node('LTXAVTextEncoderLoader', { text_encoder: file(spec, 'clip'), ckpt_name: checkpoint, device: 'default' });
    graph.av = node('LTXVAudioVAELoader', { ckpt_name: checkpoint });
    if (variant === '2.3') {
      graph.dit = node('LoraLoaderModelOnly', { model: ['ck', 0], lora_name: file(spec, 'lora'), strength_model: 0.5 });
    }
    vae = ['ck', 2];
  }
  const model: Link = graph.dit ? ['dit', 0] : ['ck', 0];
  Object.assign(graph, {
    pos: node('CLIPTextEncode', { clip: ['te', 0], text: run.prompt }),
    neg: node('CLIPTextEncode', { clip: ['te', 0], text: LTX2_NEGATIVE }),
    cond: node('LTXVConditioning', { positive: ['pos', 0], negative: ['neg', 0], frame_rate: fps }),
    vl: node('EmptyLTXVLatentVideo', { width, height, length: frames, batch_size: 1 }),
    al: node('LTXVEmptyLatentAudio', { frames_number: frames, frame_rate: fps, batch_size: 1, audio_vae: ['av', 0] }),
    cat: node('LTXVConcatAVLatent', { video_latent: ['vl', 0], audio_latent: ['al', 0] }),
    gd: node('CFGGuider', { model, positive: ['cond', 0], negative: ['cond', 1], cfg: 1 }),
    ss: node('KSamplerSelect', { sampler_name: variant === '2.3' ? 'euler' : 'euler_ancestral' }),
    sg: node('ManualSigmas', { sigmas: LTX2_SIGMAS }),
    nz: node('RandomNoise', { noise_seed: run.seed }),
    8: node('SamplerCustomAdvanced', {
      noise: ['nz', 0], guider: ['gd', 0], sampler: ['ss', 0], sigmas: ['sg', 0], latent_image: ['cat', 0],
    }),
    sep: node('LTXVSeparateAVLatent', { av_latent: ['8', 0] }),
    9: node('VAEDecodeTiled', { samples: ['sep', 0], vae, ...TILES }),
    au: node('LTXVAudioVAEDecode', { samples: ['sep', 1], audio_vae: ['av', 0] }),
  });
  return withTail(graph, fps, prefix, ['au', 0]);
};

/** Wan 2.1, 1.3B and 14B: the template's 30 steps at CFG 6. */
const wan21: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' }),
    2: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'wan', device: 'default' }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    4: node('ModelSamplingSD3', { model: ['1', 0], shift: 8 }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    6: node('CLIPTextEncode', { clip: ['2', 0], text: WAN_NEGATIVE }),
    7: node('EmptyHunyuanLatentVideo', { width, height, length: frames, batch_size: 1 }),
    8: node('KSampler', {
      model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed: run.seed,
      steps, cfg: 6, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1,
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/**
 * Wan 2.2 A14B: two experts. The high-noise model takes the first half of the
 * steps and hands its latent on with the leftover noise still in it; the
 * low-noise model finishes with none added.
 */
const wan22A14b: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  const half = steps / 2;
  const expert = (model: Link, latent: Link, first: boolean) => node('KSamplerAdvanced', {
    model,
    add_noise: first ? 'enable' : 'disable',
    noise_seed: first ? run.seed : 0,
    steps,
    cfg: 1,
    sampler_name: 'euler',
    scheduler: 'simple',
    positive: ['5', 0],
    negative: ['6', 0],
    latent_image: latent,
    start_at_step: first ? 0 : half,
    end_at_step: first ? half : steps,
    return_with_leftover_noise: first ? 'enable' : 'disable',
  });
  return withTail({
    hi: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' }),
    lo: node('UNETLoader', { unet_name: file(spec, 'unetLow'), weight_dtype: 'default' }),
    lh: node('LoraLoaderModelOnly', { model: ['hi', 0], lora_name: file(spec, 'lora'), strength_model: 1 }),
    ll: node('LoraLoaderModelOnly', { model: ['lo', 0], lora_name: file(spec, 'loraLow'), strength_model: 1 }),
    mh: node('ModelSamplingSD3', { model: ['lh', 0], shift: 5 }),
    ml: node('ModelSamplingSD3', { model: ['ll', 0], shift: 5 }),
    2: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'wan', device: 'default' }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    6: node('CLIPTextEncode', { clip: ['2', 0], text: WAN_NEGATIVE }),
    7: node('EmptyHunyuanLatentVideo', { width, height, length: frames, batch_size: 1 }),
    k1: expert(['mh', 0], ['7', 0], true),
    8: expert(['ml', 0], ['k1', 0], false),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/** Wan 2.2 TI2V 5B at the official 20 steps and CFG 5. */
const wan22Ti5b: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' }),
    2: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'wan', device: 'default' }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    4: node('ModelSamplingSD3', { model: ['1', 0], shift: 8 }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    6: node('CLIPTextEncode', { clip: ['2', 0], text: WAN_NEGATIVE }),
    7: node('Wan22ImageToVideoLatent', { vae: ['3', 0], width, height, length: frames, batch_size: 1 }),
    8: node('KSampler', {
      model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed: run.seed,
      steps, cfg: 5, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1,
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/**
 * Kandinsky 5, per its template's sampler. The Lite variants differ only in
 * steps and guidance; Pro's 43 GB of bf16 weights load as fp8.
 */
const kandinsky5: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: spec.settings?.weightDtype ?? 'default' }),
    2: node('DualCLIPLoader', {
      clip_name1: file(spec, 'clip1'), clip_name2: file(spec, 'clip2'), type: 'kandinsky5', device: 'default',
    }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    4: node('ModelSamplingSD3', { model: ['1', 0], shift: 5 }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    6: node('CLIPTextEncode', { clip: ['2', 0], text: '' }),
    7: node('Kandinsky5ImageToVideo', {
      positive: ['5', 0], negative: ['6', 0], vae: ['3', 0], width, height, length: frames, batch_size: 1,
    }),
    8: node('KSampler', {
      model: ['4', 0], positive: ['7', 0], negative: ['7', 1], latent_image: ['7', 2], seed: run.seed,
      steps, cfg: spec.settings?.cfg ?? 5, sampler_name: 'euler_ancestral', scheduler: 'beta', denoise: 1,
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/**
 * HunyuanVideo 1.0, per its template: guidance embedded with FluxGuidance 6,
 * sigmas from the unshifted model, and the shift-7 model doing the denoising.
 */
const hunyuan10: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' }),
    2: node('DualCLIPLoader', {
      clip_name1: file(spec, 'clip1'), clip_name2: file(spec, 'clip2'), type: 'hunyuan_video', device: 'default',
    }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    4: node('ModelSamplingSD3', { model: ['1', 0], shift: 7 }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    fg: node('FluxGuidance', { conditioning: ['5', 0], guidance: 6 }),
    7: node('EmptyHunyuanLatentVideo', { width, height, length: frames, batch_size: 1 }),
    gd: node('BasicGuider', { model: ['4', 0], conditioning: ['fg', 0] }),
    sc: node('BasicScheduler', { model: ['1', 0], scheduler: 'simple', steps, denoise: 1 }),
    ss: node('KSamplerSelect', { sampler_name: 'euler' }),
    nz: node('RandomNoise', { noise_seed: run.seed }),
    8: node('SamplerCustomAdvanced', {
      noise: ['nz', 0], guider: ['gd', 0], sampler: ['ss', 0], sigmas: ['sc', 0], latent_image: ['7', 0],
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/** HunyuanVideo 1.5 at 480p, with the 4-step LoRA and no guidance. */
const hunyuan15: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'fp8_e4m3fn' }),
    l: node('LoraLoaderModelOnly', { model: ['1', 0], lora_name: file(spec, 'lora'), strength_model: 1 }),
    m: node('ModelSamplingSD3', { model: ['l', 0], shift: 7 }),
    2: node('DualCLIPLoader', {
      clip_name1: file(spec, 'clip1'), clip_name2: file(spec, 'clip2'), type: 'hunyuan_video_15', device: 'default',
    }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    6: node('ConditioningZeroOut', { conditioning: ['5', 0] }),
    7: node('EmptyHunyuanVideo15Latent', { width, height, length: frames, batch_size: 1 }),
    8: node('KSampler', {
      model: ['m', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed: run.seed,
      steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/** Mochi 1 with ComfyUI's example settings, at its native 30 fps. */
const mochi: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    1: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' }),
    2: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'mochi', device: 'default' }),
    3: node('VAELoader', { vae_name: file(spec, 'vae') }),
    5: node('CLIPTextEncode', { clip: ['2', 0], text: run.prompt }),
    6: node('CLIPTextEncode', { clip: ['2', 0], text: '' }),
    7: node('EmptyMochiLatentVideo', { width, height, length: frames, batch_size: 1 }),
    8: node('KSampler', {
      model: ['1', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed: run.seed,
      steps, cfg: 4.5, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
    }),
    9: node('VAEDecodeTiled', { samples: ['8', 0], vae: ['3', 0], ...TILES }),
  }, fps, prefix);
};

/**
 * MiniMax H3 with its turbo LoRA: the prompt goes into the image-to-video node
 * itself, and sound is decoded from the same latent as the picture.
 */
const minimaxH3: Builder = (spec, run, prefix) => {
  const { width, height, frames, fps, steps } = spec.output;
  return withTail({
    dit: node('UNETLoader', { unet_name: file(spec, 'unet'), weight_dtype: 'default' }),
    lo: node('LoraLoaderModelOnly', { model: ['dit', 0], lora_name: file(spec, 'lora'), strength_model: 1 }),
    te: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'minimax', device: 'default' }),
    vv: node('VAELoader', { vae_name: file(spec, 'vae') }),
    va: node('VAELoader', { vae_name: file(spec, 'audioVae') }),
    i2v: node('MiniMaxH3ImageToVideo', { clip: ['te', 0], vae: ['vv', 0], prompt: run.prompt, width, height, length: frames }),
    gd: node('BasicGuider', { model: ['lo', 0], conditioning: ['i2v', 0] }),
    sc: node('BasicScheduler', { model: ['lo', 0], scheduler: 'simple', steps, denoise: 1 }),
    ss: node('KSamplerSelect', { sampler_name: 'res_multistep' }),
    nz: node('RandomNoise', { noise_seed: run.seed }),
    8: node('SamplerCustomAdvanced', {
      noise: ['nz', 0], guider: ['gd', 0], sampler: ['ss', 0], sigmas: ['sc', 0], latent_image: ['i2v', 1],
    }),
    9: node('VAEDecode', { samples: ['8', 0], vae: ['vv', 0] }),
    au: node('VAEDecodeAudio', { samples: ['8', 0], vae: ['va', 0] }),
  }, fps, prefix, ['au', 0]);
};

const BUILDERS: Record<VideoFamily, Builder> = {
  ltxv,
  ltx2,
  wan21,
  'wan22-14b': wan22A14b,
  'wan22-5b': wan22Ti5b,
  kandinsky5,
  hunyuan10,
  hunyuan15,
  mochi,
  'minimax-h3': minimaxH3,
};

/** The graph for one clip from this model, with this prompt and seed. */
export function buildVideoWorkflow(spec: VideoModelSpec, run: VideoRunInput): ComfyGraph {
  return BUILDERS[spec.family](spec, run, run.prefix ?? `rigmatch/${spec.key}`);
}

/**
 * The same graph, plus the one frame the judge looks at.
 *
 * Kept out of the builders so each still reproduces the exported graph exactly:
 * the frame is RigMatch's addition, not part of how the model runs. It is the
 * middle frame because the first is closest to a still image and says least
 * about whether the model held the scene together.
 */
export function withJudgedFrame(graph: ComfyGraph, frames: number): ComfyGraph {
  return {
    ...graph,
    [JUDGED_FRAME_NODE]: node('ImageFromBatch', {
      image: [VIDEO_DECODE_NODE, 0], batch_index: middleFrameIndex(frames), length: 1,
    }),
    [SAVE_JUDGED_FRAME_NODE]: node('SaveImage', { images: [JUDGED_FRAME_NODE, 0], filename_prefix: 'RigMatchFrame' }),
  };
}
