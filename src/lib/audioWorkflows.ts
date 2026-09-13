// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One ComfyUI graph per audio model family.
 *
 * Each is ComfyUI's own template for the model (audio_ace_step_1_5_checkpoint,
 * audio_ace_step_1_t2a_instrumentals and audio_stable_audio_example), run at
 * that template's settings. Only what a comparison must hold equal changes:
 * the prompt and seed are the run's, every clip is the same length, and
 * ACE-Step is asked for an instrumental, since a benchmark prompt describes a
 * sound and has no words to sing.
 *
 * A test holds every graph to /object_info from a stock ComfyUI build, so a
 * porting mistake fails a test rather than a ten-gigabyte download.
 */

import { generationModelById } from './generationCatalog.ts';
import type { AudioFamily, AudioFileRole, AudioModelSpec } from './audioCatalog.ts';
import type { ComfyGraph, ComfyNode } from './videoWorkflows.ts';

export type AudioRunInput = {
  prompt: string;
  seed: number;
  /** Seconds of audio, the same for every model in a comparison. */
  seconds: number;
  /** A tempo, for the model that takes one; ACE-Step 1.5's template sets it. */
  bpm?: number;
  /** Where the clip is written, under ComfyUI's output folder. */
  prefix?: string;
};

const node = (classType: string, inputs: Record<string, unknown>): ComfyNode =>
  ({ class_type: classType, inputs });

/** Every family decodes its audio into this node, and saves it from here. */
export const AUDIO_DECODE_NODE = 'dec';
export const AUDIO_SAVE_NODE = 'save';

/** The lyrics that ask ACE-Step for an instrumental, as its v1 template writes them. */
export const INSTRUMENTAL = '[instrumental]';

/** ACE-Step 1.5's own default, for a prompt that names no tempo. */
const DEFAULT_BPM = 120;

function file(spec: AudioModelSpec, role: AudioFileRole): string {
  const id = spec.files[role];
  const model = id ? generationModelById(id) : undefined;
  if (!model) throw new Error(`${spec.key} has no ${role} file.`);
  return model.filename;
}

/**
 * Decode and save, the same for every family.
 *
 * MP3 at V0 is what the templates save: near transparent, and a fraction of
 * the size of a WAV on its way back through the bridge.
 */
function withTail(graph: ComfyGraph, samples: [string, number], vae: [string, number], prefix: string): ComfyGraph {
  graph[AUDIO_DECODE_NODE] = node('VAEDecodeAudio', { samples, vae });
  graph[AUDIO_SAVE_NODE] = node('SaveAudioMP3', { audio: [AUDIO_DECODE_NODE, 0], filename_prefix: prefix, quality: 'V0' });
  return graph;
}

type Builder = (spec: AudioModelSpec, run: AudioRunInput, prefix: string) => ComfyGraph;

/**
 * ACE-Step 1.5 Turbo: eight steps with no guidance, after a language model has
 * planned the music. The key and time signature are the template's.
 */
const aceStep15: Builder = (spec, run, prefix) => withTail({
  ck: node('CheckpointLoaderSimple', { ckpt_name: file(spec, 'checkpoint') }),
  ms: node('ModelSamplingAuraFlow', { model: ['ck', 0], shift: 3 }),
  pos: node('TextEncodeAceStepAudio1.5', {
    clip: ['ck', 1],
    tags: run.prompt,
    lyrics: INSTRUMENTAL,
    seed: run.seed,
    bpm: run.bpm ?? DEFAULT_BPM,
    duration: run.seconds,
    timesignature: '4',
    language: 'en',
    keyscale: 'E minor',
    generate_audio_codes: true,
    cfg_scale: 2,
    temperature: 0.85,
    top_p: 0.9,
    top_k: 0,
    min_p: 0,
  }),
  neg: node('ConditioningZeroOut', { conditioning: ['pos', 0] }),
  lat: node('EmptyAceStep1.5LatentAudio', { seconds: run.seconds, batch_size: 1 }),
  ks: node('KSampler', {
    model: ['ms', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['lat', 0], seed: run.seed,
    steps: spec.steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
  }),
}, ['ks', 0], ['ck', 2], prefix);

/**
 * ACE-Step v1: fifty steps at CFG 5, with the tonemap its template uses to keep
 * that much guidance from clipping.
 */
const aceStep1: Builder = (spec, run, prefix) => withTail({
  ck: node('CheckpointLoaderSimple', { ckpt_name: file(spec, 'checkpoint') }),
  ms: node('ModelSamplingSD3', { model: ['ck', 0], shift: 5 }),
  tm: node('LatentOperationTonemapReinhard', { multiplier: 1 }),
  op: node('LatentApplyOperationCFG', { model: ['ms', 0], operation: ['tm', 0] }),
  pos: node('TextEncodeAceStepAudio', { clip: ['ck', 1], tags: run.prompt, lyrics: INSTRUMENTAL, lyrics_strength: 0.99 }),
  neg: node('ConditioningZeroOut', { conditioning: ['pos', 0] }),
  lat: node('EmptyAceStepLatentAudio', { seconds: run.seconds, batch_size: 1 }),
  ks: node('KSampler', {
    model: ['op', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['lat', 0], seed: run.seed,
    steps: spec.steps, cfg: 5, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
  }),
}, ['ks', 0], ['ck', 2], prefix);

/**
 * Stable Audio Open 1.0: T5-Base reads the prompt, and the model takes the
 * clip's length from the latent, which is how its template leaves it.
 */
const stableAudio: Builder = (spec, run, prefix) => withTail({
  ck: node('CheckpointLoaderSimple', { ckpt_name: file(spec, 'checkpoint') }),
  te: node('CLIPLoader', { clip_name: file(spec, 'clip'), type: 'stable_audio', device: 'default' }),
  pos: node('CLIPTextEncode', { clip: ['te', 0], text: run.prompt }),
  neg: node('CLIPTextEncode', { clip: ['te', 0], text: '' }),
  lat: node('EmptyLatentAudio', { seconds: run.seconds, batch_size: 1 }),
  ks: node('KSampler', {
    model: ['ck', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['lat', 0], seed: run.seed,
    steps: spec.steps, cfg: 4.98, sampler_name: 'dpmpp_3m_sde_gpu', scheduler: 'exponential', denoise: 1,
  }),
}, ['ks', 0], ['ck', 2], prefix);

const BUILDERS: Record<AudioFamily, Builder> = {
  'ace-step-1.5': aceStep15,
  'ace-step-1': aceStep1,
  'stable-audio': stableAudio,
};

/** The graph for one clip from this model, with this prompt, seed and length. */
export function buildAudioWorkflow(spec: AudioModelSpec, run: AudioRunInput): ComfyGraph {
  return BUILDERS[spec.family](spec, run, run.prefix ?? `rigmatch/${spec.key}`);
}

/** Whether a family's graph asks for an instrumental, which the test panel says. */
export function asksForInstrumental(spec: AudioModelSpec): boolean {
  return spec.family === 'ace-step-1.5' || spec.family === 'ace-step-1';
}
