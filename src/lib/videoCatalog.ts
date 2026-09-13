// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The video lineup: seventeen text-to-video models RigMatch can run side by side.
 *
 * Generated from videobench's export (tests/fixtures/rigmatch-video-catalog.json)
 * by a script, so no number here was typed by hand. The files themselves live in
 * GENERATION_MODELS; an entry here says how to run them — which family's graph,
 * which file plays which part in it, and what one clip costs on the reference
 * machine.
 *
 * Nothing is bundled. Every model is an option, downloaded only when someone
 * picks it, the same as everything else in RigMatch.
 *
 * Reference times were taken on an NVIDIA GeForce RTX 4070 (12 GB), AMD Ryzen 9 9900X,
 * 61.6 GB of RAM: five seconds of footage, cold start included, so each
 * includes loading the models from disk. `refMeasured` separates the six that
 * were timed from the estimates, which videobench made from steps, size and
 * those six runs.
 */

export type VideoFamily =
  | 'ltxv'
  | 'ltx2'
  | 'wan21'
  | 'wan22-14b'
  | 'wan22-5b'
  | 'kandinsky5'
  | 'hunyuan10'
  | 'hunyuan15'
  | 'mochi'
  | 'minimax-h3';

/**
 * Which part a file plays in its family's graph. A role names a loader input,
 * so the builders never have to guess which of a model's files goes where.
 */
export type VideoFileRole =
  | 'unet'
  | 'unetLow'
  | 'checkpoint'
  | 'clip'
  | 'clip1'
  | 'clip2'
  | 'vae'
  | 'audioVae'
  | 'lora'
  | 'loraLow';

export type VideoModelSpec = {
  /** Also the GENERATION_MODELS id of the model's main file. */
  key: string;
  name: string;
  publisher: string;
  /** Year and month of release. */
  released: string;
  family: VideoFamily;
  /** What one clip is: the settings the reference times were measured at. */
  output: { width: number; height: number; frames: number; fps: number; seconds: number; steps: number; sound: boolean };
  /** Weights resident while sampling, in GB. Decides whether it fits in VRAM. */
  ditGb: number;
  /** The text encoder, in GB. Decides whether offloading can work at all. */
  teGb: number;
  /** Seconds for one clip on the reference RTX 4070, cold start included. */
  refSeconds: number;
  /** True when refSeconds was measured rather than estimated. */
  refMeasured: boolean;
  /** Downloading its files needs a Hugging Face token. */
  gated?: boolean;
  /** GENERATION_MODELS ids, by the part each plays in the graph. */
  files: Partial<Record<VideoFileRole, string>>;
  /** What differs between members of one family. */
  settings?: { variant?: '2' | '2.3' | '2.5'; cfg?: number; weightDtype?: string };
};

export const VIDEO_MODEL_SPECS: VideoModelSpec[] = [
  {
    key: 'minimax-h3',
    name: 'MiniMax H3 (turbo, +sound)',
    publisher: 'MiniMax',
    released: '2026-08',
    family: 'minimax-h3',
    output: { width: 832, height: 480, frames: 124, fps: 24, seconds: 5.17, steps: 6, sound: true },
    ditGb: 21,
    teGb: 27.1,
    refSeconds: 110,
    refMeasured: true,
    files: { unet: 'minimax-h3', lora: 'lora-minimax-h3-turbo', clip: 'qwen3vl-32b-minimax', vae: 'vae-minimax-h3-video', audioVae: 'vae-minimax-h3-audio' },
  },
  {
    key: 'ltx-2.5',
    name: 'LTX-2.5 22B distilled (+sound)',
    publisher: 'Lightricks',
    released: '2026-07',
    family: 'ltx2',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 8, sound: true },
    ditGb: 21.5,
    teGb: 15.4,
    refSeconds: 70,
    refMeasured: false,
    gated: true,
    files: { unet: 'ltx-2.5', clip: 'gemma4-12b-ltx25', vae: 'vae-ltx25-video', audioVae: 'vae-ltx25-audio' },
    settings: { variant: '2.5' },
  },
  {
    key: 'ltx-2.3',
    name: 'LTX-2.3 22B distilled (+sound)',
    publisher: 'Lightricks',
    released: '2026-03',
    family: 'ltx2',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 8, sound: true },
    ditGb: 22,
    teGb: 13.2,
    refSeconds: 65,
    refMeasured: true,
    files: { checkpoint: 'ltx-2.3', lora: 'lora-ltx23-distilled', clip: 'gemma3-12b-fp8' },
    settings: { variant: '2.3' },
  },
  {
    key: 'ltx-2',
    name: 'LTX-2 19B distilled (+sound)',
    publisher: 'Lightricks',
    released: '2026-01',
    family: 'ltx2',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 8, sound: true },
    ditGb: 19,
    teGb: 13.2,
    refSeconds: 60,
    refMeasured: false,
    files: { checkpoint: 'ltx-2', clip: 'gemma3-12b-fp8' },
    settings: { variant: '2' },
  },
  {
    key: 'hunyuan-1.5',
    name: 'HunyuanVideo 1.5 480p (4-step)',
    publisher: 'Tencent',
    released: '2025-11',
    family: 'hunyuan15',
    output: { width: 848, height: 480, frames: 121, fps: 24, seconds: 5.04, steps: 4, sound: false },
    ditGb: 8.4,
    teGb: 9.4,
    refSeconds: 420,
    refMeasured: false,
    files: { unet: 'hunyuan-1.5', lora: 'lora-hunyuan15-4step', clip1: 'qwen25-vl-7b-fp8', clip2: 'byt5-glyphxl', vae: 'vae-hunyuan15' },
  },
  {
    key: 'kandinsky-5',
    name: 'Kandinsky 5.0 Lite 2B',
    publisher: 'Kandinsky Lab (Sber AI)',
    released: '2025-11',
    family: 'kandinsky5',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 50, sound: false },
    ditGb: 4.6,
    teGb: 9.4,
    refSeconds: 1280,
    refMeasured: true,
    files: { unet: 'kandinsky-5', clip1: 'qwen25-vl-7b-fp8', clip2: 'clip-l', vae: 'vae-hunyuan' },
    settings: { cfg: 5, weightDtype: 'default' },
  },
  {
    key: 'kandinsky-5-nocfg',
    name: 'Kandinsky 5.0 Lite 2B (no-CFG)',
    publisher: 'Kandinsky Lab (Sber AI)',
    released: '2025-11',
    family: 'kandinsky5',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 50, sound: false },
    ditGb: 4.6,
    teGb: 9.4,
    refSeconds: 650,
    refMeasured: false,
    files: { unet: 'kandinsky-5-nocfg', clip1: 'qwen25-vl-7b-fp8', clip2: 'clip-l', vae: 'vae-hunyuan' },
    settings: { cfg: 1, weightDtype: 'default' },
  },
  {
    key: 'kandinsky-5-16step',
    name: 'Kandinsky 5.0 Lite 2B (16-step)',
    publisher: 'Kandinsky Lab (Sber AI)',
    released: '2025-11',
    family: 'kandinsky5',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 16, sound: false },
    ditGb: 4.6,
    teGb: 9.4,
    refSeconds: 240,
    refMeasured: false,
    files: { unet: 'kandinsky-5-16step', clip1: 'qwen25-vl-7b-fp8', clip2: 'clip-l', vae: 'vae-hunyuan' },
    settings: { cfg: 1, weightDtype: 'default' },
  },
  {
    key: 'kandinsky-5-pro',
    name: 'Kandinsky 5.0 Pro 19B (slow!)',
    publisher: 'Kandinsky Lab (Sber AI)',
    released: '2025-11',
    family: 'kandinsky5',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 50, sound: false },
    ditGb: 21.7,
    teGb: 9.4,
    refSeconds: 10800,
    refMeasured: false,
    files: { unet: 'kandinsky-5-pro', clip1: 'qwen25-vl-7b-fp8', clip2: 'clip-l', vae: 'vae-hunyuan' },
    settings: { cfg: 5, weightDtype: 'fp8_e4m3fn' },
  },
  {
    key: 'wan-2.2-14b',
    name: 'Wan 2.2 A14B (4-step)',
    publisher: 'Alibaba',
    released: '2025-07',
    family: 'wan22-14b',
    output: { width: 832, height: 480, frames: 81, fps: 16, seconds: 5.06, steps: 4, sound: false },
    ditGb: 14.3,
    teGb: 3.7,
    refSeconds: 480,
    refMeasured: false,
    files: { unet: 'wan-2.2-14b', unetLow: 'wan-2.2-14b-low-noise', lora: 'lora-wan22-4step-high', loraLow: 'lora-wan22-4step-low', clip: 'umt5-fp8', vae: 'vae-wan21' },
  },
  {
    key: 'wan-2.2-5b-official',
    name: 'Wan 2.2 TI2V 5B (official)',
    publisher: 'Alibaba',
    released: '2025-07',
    family: 'wan22-5b',
    output: { width: 832, height: 480, frames: 121, fps: 24, seconds: 5.04, steps: 20, sound: false },
    ditGb: 10,
    teGb: 3.7,
    refSeconds: 240,
    refMeasured: false,
    files: { unet: 'wan-2.2-5b-official', clip: 'umt5-fp8', vae: 'vae-wan22' },
  },
  {
    key: 'ltxv-13b',
    name: 'LTX-Video 13B 0.9.8 distilled',
    publisher: 'Lightricks',
    released: '2025-07',
    family: 'ltxv',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 8, sound: false },
    ditGb: 6.5,
    teGb: 3.4,
    refSeconds: 50,
    refMeasured: true,
    files: { unet: 'ltxv-13b', clip: 't5xxl-fp8', vae: 'vae-ltxv-098' },
    settings: { weightDtype: 'default' },
  },
  {
    key: 'ltxv-2b',
    name: 'LTX-Video 2B 0.9.8 distilled',
    publisher: 'Lightricks',
    released: '2025-07',
    family: 'ltxv',
    output: { width: 768, height: 512, frames: 121, fps: 24, seconds: 5.04, steps: 8, sound: false },
    ditGb: 2.3,
    teGb: 3.4,
    refSeconds: 17,
    refMeasured: true,
    files: { unet: 'ltxv-2b', clip: 't5xxl-fp8', vae: 'vae-ltxv-098' },
    settings: { weightDtype: 'fp8_e4m3fn' },
  },
  {
    key: 'wan-2.1-14b',
    name: 'Wan 2.1 14B',
    publisher: 'Alibaba',
    released: '2025-02',
    family: 'wan21',
    output: { width: 832, height: 480, frames: 81, fps: 16, seconds: 5.06, steps: 30, sound: false },
    ditGb: 14.3,
    teGb: 3.7,
    refSeconds: 1200,
    refMeasured: false,
    files: { unet: 'wan-2.1-14b', clip: 'umt5-fp8', vae: 'vae-wan21' },
  },
  {
    key: 'wan-2.1-1.3b',
    name: 'Wan 2.1 1.3B',
    publisher: 'Alibaba',
    released: '2025-02',
    family: 'wan21',
    output: { width: 832, height: 480, frames: 81, fps: 16, seconds: 5.06, steps: 30, sound: false },
    ditGb: 2.8,
    teGb: 3.7,
    refSeconds: 370,
    refMeasured: true,
    files: { unet: 'wan-2.1-1.3b', clip: 'umt5-fp8', vae: 'vae-wan21' },
  },
  {
    key: 'hunyuan-1.0',
    name: 'HunyuanVideo 1.0 13B',
    publisher: 'Tencent',
    released: '2024-12',
    family: 'hunyuan10',
    output: { width: 848, height: 480, frames: 121, fps: 24, seconds: 5.04, steps: 20, sound: false },
    ditGb: 13.2,
    teGb: 9.1,
    refSeconds: 800,
    refMeasured: false,
    files: { unet: 'hunyuan-1.0', clip2: 'llava-llama3-fp8', clip1: 'clip-l', vae: 'vae-hunyuan' },
  },
  {
    key: 'mochi-1',
    name: 'Mochi 1 10B',
    publisher: 'Genmo',
    released: '2024-10',
    family: 'mochi',
    output: { width: 848, height: 480, frames: 151, fps: 30, seconds: 5.03, steps: 30, sound: false },
    ditGb: 10,
    teGb: 3.4,
    refSeconds: 1400,
    refMeasured: false,
    files: { unet: 'mochi-1', clip: 't5xxl-fp8', vae: 'vae-mochi' },
  },
];

export function videoModelSpec(key: string): VideoModelSpec | undefined {
  return VIDEO_MODEL_SPECS.find((spec) => spec.key === key);
}

/** Every GENERATION_MODELS id a model needs on disk before it can render. */
export function videoModelFileIds(spec: VideoModelSpec): string[] {
  return Object.values(spec.files).filter((id): id is string => Boolean(id));
}
