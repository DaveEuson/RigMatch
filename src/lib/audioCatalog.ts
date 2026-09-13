// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The audio makers: models RigMatch can run in ComfyUI to turn a prompt into sound.
 *
 * Three families, each on nodes a stock ComfyUI ships (comfy_extras.nodes_ace
 * and nodes_audio), so nothing is added to anyone's install. Their graphs are
 * ported from ComfyUI's own workflow templates for each model, and the files
 * are the ones those templates download, into the folders they read.
 *
 * Nothing is bundled. Every model is an option, downloaded only when someone
 * picks it. The files themselves live in GENERATION_MODELS; an entry here says
 * how to run them.
 */

export type AudioFamily = 'ace-step-1.5' | 'ace-step-1' | 'stable-audio';

/** Which part a file plays in its family's graph. */
export type AudioFileRole = 'checkpoint' | 'clip';

export type AudioModelSpec = {
  /** Also the GENERATION_MODELS id of the model's main file. */
  key: string;
  name: string;
  publisher: string;
  family: AudioFamily;
  /** What it is good at, in the words someone choosing would use. */
  makes: string;
  /** Sampling steps, as ComfyUI's template for the model runs it. */
  steps: number;
  /** GENERATION_MODELS ids, by the part each plays in the graph. */
  files: Partial<Record<AudioFileRole, string>>;
};

/**
 * How long every clip is.
 *
 * One length for every model, so a comparison is between models and not
 * between durations. Thirty seconds is long enough to hear what a model made
 * and short enough to render in seconds on the models that are quick, and it
 * sits inside Stable Audio Open's 47-second limit.
 */
export const AUDIO_CLIP_SECONDS = 30;

export const AUDIO_MODEL_SPECS: AudioModelSpec[] = [
  {
    key: 'ace-step-1.5-turbo',
    name: 'ACE-Step 1.5 Turbo',
    publisher: 'ACE-Step',
    family: 'ace-step-1.5',
    makes: 'songs and instrumentals',
    steps: 8,
    files: { checkpoint: 'ace-step-1.5-turbo' },
  },
  {
    key: 'ace-step-v1-3.5b',
    name: 'ACE-Step v1 3.5B',
    publisher: 'ACE-Step',
    family: 'ace-step-1',
    makes: 'music from a list of styles',
    steps: 50,
    files: { checkpoint: 'ace-step-v1-3.5b' },
  },
  {
    key: 'stable-audio-open-1.0',
    name: 'Stable Audio Open 1.0',
    publisher: 'Stability AI',
    family: 'stable-audio',
    makes: 'sound effects, textures and short music',
    steps: 50,
    files: { checkpoint: 'stable-audio-open-1.0', clip: 't5-base' },
  },
];

export function audioModelSpec(key: string): AudioModelSpec | undefined {
  return AUDIO_MODEL_SPECS.find((spec) => spec.key === key);
}

/** Every GENERATION_MODELS id this model needs on disk. */
export function audioModelFileIds(spec: AudioModelSpec): string[] {
  return Object.values(spec.files).filter((id): id is string => Boolean(id));
}
