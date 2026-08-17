/**
 * Image and video models, which do not come from Ollama.
 *
 * The Models screen is a view of Ollama's registry: everything in it is
 * scraped from ollama.com and fetched with `ollama pull`. Generation models
 * are none of those things — they are raw .safetensors files from Hugging
 * Face that have to land in a folder ComfyUI reads. That is the whole reason
 * they were missing from a screen called "Models", which is not a good enough
 * reason for a user to have to go and find them by hand.
 *
 * The list is curated rather than scraped, and deliberately short. Hugging
 * Face has no registry of "models ComfyUI can run": the file has to be the
 * right architecture, in the right folder, with its matching text encoder, or
 * the graph fails somewhere deep in the sampler with an error nobody can act
 * on. Every entry here has had its URL and size checked, and the three marked
 * `proven` have actually been downloaded and run on this machine.
 *
 * Sizes are the real content-length in bytes, not marketing numbers, because
 * they are shown to someone deciding whether to spend their evening on a
 * download — and because comfyModels.cjs deletes a download whose byte count
 * falls short of this one. A number rounded UP therefore destroys a perfectly
 * good file whenever the server omits content-length. Four of these six were
 * wrong until they were fetched and checked; scripts/check-model-sizes.mjs
 * re-checks them against the server on demand.
 */

export type GenerationModelKind = 'image' | 'video' | 'text-encoder';

export type GenerationModel = {
  id: string;
  label: string;
  kind: GenerationModelKind;
  /** Where ComfyUI expects it, relative to its models folder. */
  folder: 'checkpoints' | 'text_encoders';
  filename: string;
  url: string;
  bytes: number;
  /** One line on what it is for, in the terms someone choosing would use. */
  note: string;
  /** Ids of models this cannot run without — an LTX file alone renders nothing. */
  requires?: string[];
  /** True when this exact file has been downloaded and run by RigMatch. */
  proven?: boolean;
  /** Who published it, taken from the Hugging Face repo the file comes from. */
  publisher: string;
};

export const GENERATION_MODELS: GenerationModel[] = [
  {
    id: 'sd15',
    label: 'Stable Diffusion 1.5',
    kind: 'image',
    folder: 'checkpoints',
    filename: 'sd15.safetensors',
    url: 'https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/resolve/main/v1-5-pruned-emaonly-fp16.safetensors',
    bytes: 2132696762,
    note: 'The small, fast baseline. Runs on almost anything and carries its own text encoder.',
    proven: true,
    publisher: 'Stability AI',
  },
  {
    id: 'sdxl-turbo',
    label: 'SDXL Turbo',
    kind: 'image',
    folder: 'checkpoints',
    filename: 'sdxl-turbo.safetensors',
    url: 'https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors',
    bytes: 6938081905,
    note: 'Much better pictures than 1.5, and distilled so it still runs in a few steps. Bigger download.',
    publisher: 'Stability AI',
  },
  {
    id: 'ltxv-distilled',
    label: 'LTX-Video 2B (distilled)',
    kind: 'video',
    folder: 'checkpoints',
    filename: 'ltxv-2b-distilled.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-2b-0.9.6-distilled-04-25.safetensors',
    bytes: 6340744028,
    note: 'Four seconds of video in about twelve seconds on a 12 GB card. The lightest video model worth running.',
    requires: ['t5xxl-fp8'],
    proven: true,
    publisher: 'Lightricks',
  },
  {
    id: 'wan21-t2v-1_3b',
    label: 'WAN 2.1 text-to-video 1.3B',
    kind: 'video',
    folder: 'checkpoints',
    filename: 'wan2.1_t2v_1.3B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors',
    bytes: 2838303560,
    note: 'A smaller video model with a different look. Needs the UMT5 encoder rather than T5.',
    requires: ['umt5-fp8'],
    publisher: 'Alibaba',
  },
  {
    id: 't5xxl-fp8',
    label: 'T5-XXL text encoder (fp8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 't5xxl_fp8_e4m3fn.safetensors',
    url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors',
    bytes: 4893934904,
    note: 'What LTX-Video reads prompts with. The fp8 build is half the size of fp16 and the sensible one for a consumer card.',
    proven: true,
    publisher: 'Google',
  },
  {
    id: 'umt5-fp8',
    label: 'UMT5-XXL text encoder (fp8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    bytes: 6735906897,
    note: 'What the WAN video models read prompts with. Not interchangeable with T5.',
    publisher: 'Google',
  },
];

export function generationModelById(id: string): GenerationModel | undefined {
  return GENERATION_MODELS.find((m) => m.id === id);
}

/** Human-sized, for a number someone is deciding to spend an evening on. */
export function formatBytesGb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

/**
 * Everything that must be downloaded for this model to actually render.
 *
 * A video checkpoint on its own produces nothing — the graph fails inside
 * CLIPLoader, which reads as a broken model rather than a missing file. So a
 * download offer covers the encoder too, and the total says what the evening
 * really costs.
 */
export function downloadPlan(model: GenerationModel, installed: string[]): {
  needed: GenerationModel[];
  totalBytes: number;
} {
  const have = new Set(installed.map((n) => n.toLowerCase()));
  const wanted = [model, ...(model.requires ?? []).map(generationModelById).filter(Boolean) as GenerationModel[]];
  const needed = wanted.filter((m) => !have.has(m.filename.toLowerCase()));
  return { needed, totalBytes: needed.reduce((sum, m) => sum + m.bytes, 0) };
}

/**
 * Whether a file already sitting in ComfyUI is one of ours.
 *
 * Matched on filename, which is what both sides have: the catalogue names the
 * file it writes, and ComfyUI lists what it can see. A user who renamed a file
 * or downloaded it themselves simply shows as not-installed, which offers a
 * redundant download rather than claiming something false.
 */
export function isCatalogFile(filename: string): boolean {
  return GENERATION_MODELS.some((m) => m.filename.toLowerCase() === filename.toLowerCase());
}

/**
 * The generation catalogue as catalogue rows, so these models appear in the
 * Models screen beside everything else.
 *
 * They are not Ollama models and never will be, but that is a fact about how
 * RigMatch fetches them, not a fact the user should have to hold. A row here
 * carries `runtime: 'comfyui'` and the screen explains what that needs.
 *
 * `installed` is decided by whether ComfyUI is listing the file, which is the
 * only definition that matters: a file on disk that the running server cannot
 * see may as well not exist.
 */
export function generationCatalogRows(comfyFiles: string[]): Array<{
  id: string;
  name: string;
  tag: string;
  params: string;
  sizeGb: number;
  pack: string;
  source: string;
  live: boolean;
  runtime: 'comfyui';
  publisher: string;
  generationId: string;
  generationKind: GenerationModelKind;
  installedFile: boolean;
}> {
  const present = new Set((comfyFiles ?? []).map((n) => n.toLowerCase()));
  return GENERATION_MODELS.map((model) => ({
    id: `comfyui/${model.id}`,
    name: model.label,
    tag: model.kind === 'text-encoder' ? 'encoder' : model.kind,
    params: model.kind === 'text-encoder' ? 'Text encoder' : model.kind === 'video' ? 'Video model' : 'Image model',
    sizeGb: Number((model.bytes / 1e9).toFixed(2)),
    pack: 'Generation',
    source: 'Hugging Face',
    live: true,
    runtime: 'comfyui' as const,
    publisher: model.publisher,
    generationId: model.id,
    generationKind: model.kind,
    installedFile: present.has(model.filename.toLowerCase()),
  }));
}
