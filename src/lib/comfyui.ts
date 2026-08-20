// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Talking to ComfyUI, the second runtime.
 *
 * Everything RigMatch measures so far goes through Ollama, which is a single
 * process exposing one flat API. Image generation cannot: Ollama hosts no
 * image models and its runtime rejects the ones that exist, answering a pull
 * with "image generation models are not currently supported". The Image Lab
 * has been calling `/api/generate` with `width`/`height`/`steps` — an Ollama
 * request shape that can only ever error.
 *
 * ComfyUI is a different animal. There is no "generate" call: you submit a
 * node graph, it queues, and an image appears in history some seconds later
 * under a filename you then fetch separately. Three round trips where Ollama
 * has one, and no part of it is shaped like a chat completion.
 *
 * This module is the part that can be tested without a GPU — building the
 * graph and reading the replies. The HTTP itself lives in the main process,
 * because the renderer's origin is not one ComfyUI's CORS policy accepts.
 */

export const COMFY_DEFAULT_URL = 'http://127.0.0.1:8188';

/** Node ids in the graph below. Arbitrary, but referenced by wiring, so named. */
const CHECKPOINT = '4';
const LATENT = '5';
const POSITIVE = '6';
const NEGATIVE = '7';
const SAMPLER = '3';
const DECODE = '8';
const SAVE = '9';

export type Txt2ImgRequest = {
  checkpoint: string;
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  sampler?: string;
  scheduler?: string;
};

/**
 * The standard text-to-image graph, wired the way ComfyUI's own default
 * workflow wires it.
 *
 * The seed is a required input, and leaving it to chance would make a
 * benchmark unreproducible — two runs of the same model would differ for
 * reasons that have nothing to do with the machine. Callers pass a fixed one.
 */
export function buildTxt2ImgWorkflow(req: Txt2ImgRequest): Record<string, unknown> {
  const {
    checkpoint,
    prompt,
    negative = '',
    width = 512,
    height = 512,
    steps = 20,
    cfg = 7,
    seed = 0,
    sampler = 'euler',
    scheduler = 'normal',
  } = req;

  return {
    [CHECKPOINT]: {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
    },
    [LATENT]: {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    [POSITIVE]: {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: [CHECKPOINT, 1] },
    },
    [NEGATIVE]: {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: [CHECKPOINT, 1] },
    },
    [SAMPLER]: {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise: 1,
        model: [CHECKPOINT, 0],
        positive: [POSITIVE, 0],
        negative: [NEGATIVE, 0],
        latent_image: [LATENT, 0],
      },
    },
    [DECODE]: {
      class_type: 'VAEDecode',
      inputs: { samples: [SAMPLER, 0], vae: [CHECKPOINT, 2] },
    },
    [SAVE]: {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'RigMatch', images: [DECODE, 0] },
    },
  };
}

export type ComfyImageRef = { filename: string; subfolder: string; type: string };

/**
 * Pull the produced images out of a history entry.
 *
 * The shape is `{<prompt_id>: {outputs: {<node_id>: {images: [...]}}}}`, and
 * which node id carries the images depends on the graph, so every node is
 * searched rather than assuming the SaveImage id above. A workflow with two
 * save nodes returns both, in node order.
 */
export function extractImages(history: unknown, promptId: string): ComfyImageRef[] {
  const entry = (history as Record<string, unknown> | null)?.[promptId];
  const outputs = (entry as { outputs?: Record<string, unknown> } | undefined)?.outputs;
  if (!outputs) return [];

  const found: ComfyImageRef[] = [];
  for (const nodeId of Object.keys(outputs).sort()) {
    const images = (outputs[nodeId] as { images?: unknown[] } | undefined)?.images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      const ref = image as Partial<ComfyImageRef>;
      if (typeof ref?.filename !== 'string') continue;
      found.push({
        filename: ref.filename,
        subfolder: typeof ref.subfolder === 'string' ? ref.subfolder : '',
        type: typeof ref.type === 'string' ? ref.type : 'output',
      });
    }
  }
  return found;
}

/**
 * Whether a queued prompt has finished.
 *
 * A history entry appears only once execution ends, so its presence is the
 * completion signal. `status.completed` is checked too, because a run that
 * failed mid-graph still lands in history — with no images and an error in
 * its messages.
 */
export function readStatus(history: unknown, promptId: string): {
  done: boolean;
  failed: boolean;
  error?: string;
} {
  const entry = (history as Record<string, unknown> | null)?.[promptId] as
    | { status?: { completed?: boolean; status_str?: string; messages?: unknown[] } }
    | undefined;
  if (!entry) return { done: false, failed: false };

  const status = entry.status;
  if (!status) return { done: true, failed: false };

  const failed = status.completed === false || status.status_str === 'error';
  return { done: true, failed, error: failed ? describeFailure(status.messages) : undefined };
}

/** ComfyUI reports failures as a list of ['execution_error', {...}] pairs. */
function describeFailure(messages: unknown[] | undefined): string {
  if (!Array.isArray(messages)) return 'ComfyUI reported the run failed but said no more.';
  for (const message of messages) {
    if (!Array.isArray(message) || message[0] !== 'execution_error') continue;
    const detail = message[1] as { exception_message?: string; node_type?: string } | undefined;
    if (detail?.exception_message) {
      return detail.node_type
        ? `${detail.node_type}: ${detail.exception_message}`
        : detail.exception_message;
    }
  }
  return 'ComfyUI reported the run failed but said no more.';
}

/** The URL that fetches a produced image. */
export function viewUrl(baseUrl: string, ref: ComfyImageRef): string {
  const query = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return `${baseUrl.replace(/\/$/, '')}/view?${query.toString()}`;
}

export type ComfyDevice = { name: string; type: string; vramTotal: number; vramFree: number };

/**
 * What ComfyUI says it is running on.
 *
 * The field names differ across versions and some builds omit the VRAM
 * figures entirely, so everything is optional and missing numbers become 0
 * rather than NaN — a fit calculation that divides by NaN silently poisons a
 * whole scorecard.
 */
export function parseSystemStats(stats: unknown): ComfyDevice[] {
  const devices = (stats as { devices?: unknown[] } | null)?.devices;
  if (!Array.isArray(devices)) return [];
  return devices.map((raw) => {
    const device = raw as Record<string, unknown>;
    return {
      name: typeof device.name === 'string' ? device.name : 'unknown',
      type: typeof device.type === 'string' ? device.type : 'unknown',
      vramTotal: numberOr(device.vram_total, 0),
      vramFree: numberOr(device.vram_free, 0),
    };
  });
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
