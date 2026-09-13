// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
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

/** The model folders RigMatch downloads into, by ComfyUI's own names for them. */
export type ComfyModelFolder = 'checkpoints' | 'text_encoders' | 'diffusion_models' | 'vae' | 'loras';

/** What ComfyUI is listing, folder by folder. */
export type ComfyFolderListing = Partial<Record<ComfyModelFolder, string[]>>;

/**
 * What a file is. Image and video files are models someone picks; the rest are
 * parts a model cannot run without, and appear only in its download plan. An
 * expert is half of a two-model video model — Wan 2.2 A14B's low-noise stage —
 * and renders nothing alone.
 */
export type GenerationModelKind = 'image' | 'video' | 'audio' | 'text-encoder' | 'vae' | 'lora' | 'expert';

export type GenerationModel = {
  id: string;
  label: string;
  kind: GenerationModelKind;
  /** Where ComfyUI expects it, relative to its models folder. */
  folder: ComfyModelFolder;
  filename: string;
  url: string;
  bytes: number;
  /**
   * SHA-256 of the file, from the Hugging Face tree it comes from. A download
   * that does not match is discarded rather than handed to ComfyUI, which would
   * list it and then fail deep inside the loader.
   */
  sha256?: string;
  /** One line on what it is for, in the terms someone choosing would use. */
  note: string;
  /** Ids of models this cannot run without — an LTX file alone renders nothing. */
  requires?: string[];
  /** True when this exact file has been downloaded and run by RigMatch. */
  proven?: boolean;
  /** The repository is gated: downloading it needs the user's own Hugging Face token. */
  gated?: boolean;
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
    id: 't5xxl-fp8',
    label: 'T5-XXL text encoder (fp8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 't5xxl_fp8_e4m3fn.safetensors',
    url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors',
    bytes: 4893934904,
    sha256: '7d330da4816157540d6bb7838bf63a0f02f573fc48ca4d8de34bb0cbfd514f09',
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
    sha256: 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68',
    note: 'What the WAN video models read prompts with. Not interchangeable with T5.',
    publisher: 'Google',
  },
  // ── Video lineup: one entry per model, named for the model ─────────────────
  // Generated from videobench's catalogue (tests/fixtures/rigmatch-video-catalog.json).
  // Bytes, URLs and SHA-256 come from each repository's tree at export time.
  {
    id: 'minimax-h3',
    label: 'MiniMax H3 (turbo, +sound)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    bytes: 20970379616,
    sha256: 'e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a',
    note: 'Fast video with sound. Its 21 GB model streams from system memory on a 12 GB card, and a clip still finished in under two minutes on an RTX 4070.',
    requires: ['lora-minimax-h3-turbo', 'qwen3vl-32b-minimax', 'vae-minimax-h3-video', 'vae-minimax-h3-audio'],
    publisher: 'MiniMax',
  },
  {
    id: 'ltx-2.5',
    label: 'LTX-2.5 22B distilled (+sound)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
    bytes: 21504034224,
    note: 'The newest LTX, with sound. Gated on Hugging Face, so downloading it needs your own access token.',
    requires: ['gemma4-12b-ltx25', 'vae-ltx25-video', 'vae-ltx25-audio'],
    gated: true,
    publisher: 'Lightricks',
  },
  {
    id: 'ltx-2.3',
    label: 'LTX-2.3 22B distilled (+sound)',
    kind: 'video',
    folder: 'checkpoints',
    filename: 'ltx-2.3-22b-dev-fp8.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-dev-fp8.safetensors',
    bytes: 29145431166,
    sha256: '28606c5b5a06ce56f896d4dfcb20f212739e07a68fbe48e53638188449d26450',
    note: 'Video with sound in about a minute on an RTX 4070. A distilled LoRA at half strength makes its dev checkpoint finish in eight steps.',
    requires: ['lora-ltx23-distilled', 'gemma3-12b-fp8'],
    publisher: 'Lightricks',
  },
  {
    id: 'ltx-2',
    label: 'LTX-2 19B distilled (+sound)',
    kind: 'video',
    folder: 'checkpoints',
    filename: 'ltx-2-19b-distilled-fp8.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-2/resolve/main/ltx-2-19b-distilled-fp8.safetensors',
    bytes: 27078716346,
    sha256: '8ae14327130c6ffdc87705b02c8e7654aa5c6d9a7f28a52d0acc1c30cb0d2932',
    note: 'The first LTX with sound, already distilled to eight steps.',
    requires: ['gemma3-12b-fp8'],
    publisher: 'Lightricks',
  },
  {
    id: 'hunyuan-1.5',
    label: 'HunyuanVideo 1.5 480p (4-step)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'hunyuanvideo1.5_480p_t2v_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/diffusion_models/hunyuanvideo1.5_480p_t2v_fp16.safetensors',
    bytes: 16653368128,
    sha256: '6889f79cf053812e22afa8095cec77c4ad913b43f112dd10a425845f44e3234b',
    note: 'HunyuanVideo 1.5 at 480p, sped up to four steps with a LoRA.',
    requires: ['lora-hunyuan15-4step', 'qwen25-vl-7b-fp8', 'byt5-glyphxl', 'vae-hunyuan15'],
    publisher: 'Tencent',
  },
  {
    id: 'kandinsky-5',
    label: 'Kandinsky 5.0 Lite 2B',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'kandinsky5lite_t2v_sft_5s.safetensors',
    url: 'https://huggingface.co/kandinskylab/Kandinsky-5.0-T2V-Lite-sft-5s/resolve/main/model/kandinsky5lite_t2v_sft_5s.safetensors',
    bytes: 4573130528,
    sha256: '9bd1cb1e67d07de19458b9ad288b906815411c68dad7910d042ceb66f61f9f44',
    note: 'The most lifelike footage in this list, and the longest wait: about twenty minutes on an RTX 4070.',
    requires: ['qwen25-vl-7b-fp8', 'clip-l', 'vae-hunyuan'],
    publisher: 'Kandinsky Lab (Sber AI)',
  },
  {
    id: 'kandinsky-5-nocfg',
    label: 'Kandinsky 5.0 Lite 2B (no-CFG)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'kandinsky5lite_t2v_nocfg_5s.safetensors',
    url: 'https://huggingface.co/kandinskylab/Kandinsky-5.0-T2V-Lite-nocfg-5s/resolve/main/model/kandinsky5lite_t2v_nocfg_5s.safetensors',
    bytes: 4573130528,
    sha256: 'cddd41bc86c1ef1b086065aeb6ccc2de7ceb8053874fda054813af8965404f40',
    note: 'Kandinsky 5 trained to run without classifier-free guidance, roughly halving the time. Its settings are a best guess until a run has been watched.',
    requires: ['qwen25-vl-7b-fp8', 'clip-l', 'vae-hunyuan'],
    publisher: 'Kandinsky Lab (Sber AI)',
  },
  {
    id: 'kandinsky-5-16step',
    label: 'Kandinsky 5.0 Lite 2B (16-step)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'kandinsky5lite_t2v_distilled16steps_5s.safetensors',
    url: 'https://huggingface.co/kandinskylab/Kandinsky-5.0-T2V-Lite-distilled16steps-5s/resolve/main/model/kandinsky5lite_t2v_distilled16steps_5s.safetensors',
    bytes: 4573130528,
    sha256: '7e67a1b8521a8ef7b4b946fff726b8919eb677774d024a03694d0009fac1ee57',
    note: 'Kandinsky 5 distilled to 16 steps, for most of the look in a fraction of the time. Its settings are a best guess until a run has been watched.',
    requires: ['qwen25-vl-7b-fp8', 'clip-l', 'vae-hunyuan'],
    publisher: 'Kandinsky Lab (Sber AI)',
  },
  {
    id: 'kandinsky-5-pro',
    label: 'Kandinsky 5.0 Pro 19B (slow!)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'kandinsky5pro_t2v_sft_5s.safetensors',
    url: 'https://huggingface.co/kandinskylab/Kandinsky-5.0-T2V-Pro-sft-5s/resolve/main/model/kandinsky5pro_t2v_sft_5s.safetensors',
    bytes: 43385935392,
    sha256: '3135593162b648331e5c38cbc16310414cb8f29cbbb206c5b8b07e6cc301bb70',
    note: 'Kandinsky 5 Pro, 19B. Its 43 GB of weights load as fp8, and a clip takes around three hours on an RTX 4070.',
    requires: ['qwen25-vl-7b-fp8', 'clip-l', 'vae-hunyuan'],
    publisher: 'Kandinsky Lab (Sber AI)',
  },
  {
    id: 'wan-2.2-14b',
    label: 'Wan 2.2 A14B (4-step)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
    bytes: 14293923632,
    sha256: 'cad711ae211c8b23455ec68cd6a190a33a3d874234a77eb57266d73f8f0e6c9f',
    note: 'Wan 2.2 as two 14B experts, one shaping the scene and one finishing the detail, sped up to four steps with LoRAs.',
    requires: ['wan-2.2-14b-low-noise', 'lora-wan22-4step-high', 'lora-wan22-4step-low', 'umt5-fp8', 'vae-wan21'],
    publisher: 'Alibaba',
  },
  {
    id: 'wan-2.2-5b-official',
    label: 'Wan 2.2 TI2V 5B (official)',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'wan2.2_ti2v_5B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
    bytes: 9999658848,
    sha256: '456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e',
    note: 'Wan 2.2’s 5B model at the official 20 steps.',
    requires: ['umt5-fp8', 'vae-wan22'],
    publisher: 'Alibaba',
  },
  {
    id: 'ltxv-13b',
    label: 'LTX-Video 13B 0.9.8 distilled',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'ltxv-13b-0.9.8-distilled-fp8.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-13b-0.9.8-distilled-fp8.safetensors',
    bytes: 15694280140,
    sha256: '111a3d07baa17f520e98b571e7916139ae0865c9a24b7534529d6b9e74264db3',
    note: 'LTX-Video’s 13B sibling. Its time estimate comes from a smaller build, so treat it as rough until RigMatch has timed it here.',
    requires: ['t5xxl-fp8', 'vae-ltxv-098'],
    publisher: 'Lightricks',
  },
  {
    id: 'ltxv-2b',
    label: 'LTX-Video 2B 0.9.8 distilled',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'ltxv-2b-0.9.8-distilled-fp8.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-2b-0.9.8-distilled-fp8.safetensors',
    bytes: 4461695684,
    sha256: 'd6d8fa8ed3a98346787c2503ac80fb5d7cebcf80e356b79a2ba361fbadf97e15',
    note: 'The fastest model here: about 17 seconds for five seconds of footage on an RTX 4070. RigMatch times it first to calibrate every other estimate.',
    requires: ['t5xxl-fp8', 'vae-ltxv-098'],
    publisher: 'Lightricks',
  },
  {
    id: 'wan-2.1-14b',
    label: 'Wan 2.1 14B',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'wan2.1_t2v_14B_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors',
    bytes: 14293896178,
    sha256: '2e39adde59c5e0e90edbb35873126b0d67928b5c11c501e384e976d6dc597cce',
    note: 'Wan 2.1 at 14B and 30 steps, among the slowest here.',
    requires: ['umt5-fp8', 'vae-wan21'],
    publisher: 'Alibaba',
  },
  {
    id: 'wan-2.1-1.3b',
    label: 'Wan 2.1 1.3B',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'wan2.1_t2v_1.3B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors',
    bytes: 2838303560,
    sha256: 'be531024cd9018cb5b48c40cfbb6a6191645b1c792eb8bf4f8c1c6e10f924dc5',
    note: 'The smallest Wan, under 3 GB of model: about six minutes for five seconds of footage on an RTX 4070.',
    requires: ['umt5-fp8', 'vae-wan21'],
    publisher: 'Alibaba',
  },
  {
    id: 'hunyuan-1.0',
    label: 'HunyuanVideo 1.0 13B',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors',
    url: 'https://huggingface.co/Kijai/HunyuanVideo_comfy/resolve/main/hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors',
    bytes: 13185035336,
    sha256: '9fddff62992c8e2d8e4848217cbb71de795e82f54590c157a01ea009639877f9',
    note: 'Tencent’s first HunyuanVideo, run the way its own template runs it.',
    requires: ['llava-llama3-fp8', 'clip-l', 'vae-hunyuan'],
    publisher: 'Tencent',
  },
  {
    id: 'mochi-1',
    label: 'Mochi 1 10B',
    kind: 'video',
    folder: 'diffusion_models',
    filename: 'mochi_preview_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/mochi_preview_repackaged/resolve/main/split_files/diffusion_models/mochi_preview_fp8_scaled.safetensors',
    bytes: 10028084160,
    sha256: '8a6475b5380c90461a40d5c08ad574a5ad5ac4e6047e5f5f3f294df363f50705',
    note: 'Genmo’s Mochi at its native 30 fps. Its settings are a best guess until a run has been watched.',
    requires: ['t5xxl-fp8', 'vae-mochi'],
    publisher: 'Genmo',
  },
  // ── Files the video lineup needs alongside its models ───────────────────────
  {
    id: 'gemma3-12b-fp8',
    label: 'Gemma 3 12B text encoder (fp8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'gemma_3_12B_it_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp8_scaled.safetensors',
    bytes: 13205434827,
    sha256: '60216ce97c01c3a8753c2dfd0a89fc76e16fbe446d1a32ef8f1b528ac8bae466',
    note: 'What LTX-2 and LTX-2.3 read prompts with.',
    publisher: 'Google',
  },
  {
    id: 'gemma4-12b-ltx25',
    label: 'Gemma 4 12B text encoder for LTX-2.5 (int8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
    bytes: 15372969374,
    note: 'What LTX-2.5 reads prompts with. Published with LTX-2.5, so it is gated the same way.',
    gated: true,
    publisher: 'Google',
  },
  {
    id: 'qwen25-vl-7b-fp8',
    label: 'Qwen2.5-VL 7B text encoder (fp8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
    bytes: 9384670680,
    sha256: 'cb5636d852a0ea6a9075ab1bef496c0db7aef13c02350571e388aea959c5c0b4',
    note: 'What Kandinsky 5 and HunyuanVideo 1.5 read prompts with.',
    publisher: 'Alibaba',
  },
  {
    id: 'clip-l',
    label: 'CLIP-L text encoder',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'clip_l.safetensors',
    url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors',
    bytes: 246144152,
    sha256: '660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd',
    note: 'A small second encoder that Kandinsky 5 and HunyuanVideo 1.0 pair with their main one.',
    publisher: 'OpenAI',
  },
  {
    id: 'byt5-glyphxl',
    label: 'ByT5 glyph text encoder',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'byt5_small_glyphxl_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors',
    bytes: 438643184,
    sha256: '516910bb4c9b225370290e40585d1b0e6c8cd3583690f7eec2f7fb593990fb48',
    note: 'HunyuanVideo 1.5 uses it to render text that appears inside the picture.',
    publisher: 'Google',
  },
  {
    id: 'llava-llama3-fp8',
    label: 'LLaVA Llama 3 text encoder (fp8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'llava_llama3_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/text_encoders/llava_llama3_fp8_scaled.safetensors',
    bytes: 9091392483,
    sha256: '2f0c3ad255c282cead3f078753af37d19099cafcfc8265bbbd511f133e7af250',
    note: 'What HunyuanVideo 1.0 reads prompts with.',
    publisher: 'Tencent',
  },
  {
    id: 'qwen3vl-32b-minimax',
    label: 'Qwen3-VL 32B text encoder for MiniMax H3 (int8)',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
    bytes: 27141342152,
    sha256: 'bc2ced0fbea64757fa9acddccfc0b3f4819d1dcf1da6c124d690d368be283923',
    note: 'What MiniMax H3 reads prompts with. At 27 GB it is bigger than the video model itself.',
    publisher: 'MiniMax',
  },
  {
    id: 'vae-ltxv-098',
    label: 'LTX-Video 0.9.8 VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'LTXV-13B-0.9.8-distilled-VAE.safetensors',
    url: 'https://huggingface.co/QuantStack/LTXV-13B-0.9.8-distilled-GGUF/resolve/main/vae/LTXV-13B-0.9.8-distilled-VAE.safetensors',
    bytes: 2493859452,
    sha256: '5bbe6f857ede5e9b262e4a294c26a1df5dc33a817f229a777cbf3adfab5ba61e',
    note: 'Turns LTX-Video 0.9.8 latents into frames.',
    publisher: 'Lightricks',
  },
  {
    id: 'vae-wan21',
    label: 'Wan 2.1 VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'wan_2.1_vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
    bytes: 253815318,
    sha256: '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',
    note: 'Turns Wan 2.1 and Wan 2.2 A14B latents into frames.',
    publisher: 'Alibaba',
  },
  {
    id: 'vae-wan22',
    label: 'Wan 2.2 VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'wan2.2_vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors',
    bytes: 1409400960,
    sha256: 'e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156',
    note: 'Turns Wan 2.2 5B latents into frames.',
    publisher: 'Alibaba',
  },
  {
    id: 'vae-hunyuan',
    label: 'HunyuanVideo VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'hunyuan_video_vae_bf16.safetensors',
    url: 'https://huggingface.co/Kijai/HunyuanVideo_comfy/resolve/main/hunyuan_video_vae_bf16.safetensors',
    bytes: 492986478,
    sha256: '4ffef191d47b661d48f356ed9ed7cf391509af5f4c000ba07a75dcdc4c03c501',
    note: 'Turns HunyuanVideo 1.0 and Kandinsky 5 latents into frames.',
    publisher: 'Tencent',
  },
  {
    id: 'vae-hunyuan15',
    label: 'HunyuanVideo 1.5 VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'hunyuanvideo15_vae_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/vae/hunyuanvideo15_vae_fp16.safetensors',
    bytes: 2521292758,
    sha256: 'e7c3091949c27e2d55ae6d5df917b99dadfebbf308e5a50d0ade0d16c90297ae',
    note: 'Turns HunyuanVideo 1.5 latents into frames.',
    publisher: 'Tencent',
  },
  {
    id: 'vae-mochi',
    label: 'Mochi VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'mochi_vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/mochi_preview_repackaged/resolve/main/split_files/vae/mochi_vae.safetensors',
    bytes: 919544702,
    sha256: '1be451cec94b911980406169286babc5269e7cf6a94bbbbdf45e8d3f2c961083',
    note: 'Turns Mochi latents into frames.',
    publisher: 'Genmo',
  },
  {
    id: 'vae-ltx25-video',
    label: 'LTX-2.5 video VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'ltx-2.5-video-vae-bf16.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-video-vae-bf16.safetensors',
    bytes: 1472223346,
    note: 'Turns LTX-2.5 latents into frames.',
    gated: true,
    publisher: 'Lightricks',
  },
  {
    id: 'vae-ltx25-audio',
    label: 'LTX-2.5 audio VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'ltx-2.5-audio-vae-bf16.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-audio-vae-bf16.safetensors',
    bytes: 364866540,
    note: 'Turns LTX-2.5 latents into sound.',
    gated: true,
    publisher: 'Lightricks',
  },
  {
    id: 'vae-minimax-h3-video',
    label: 'MiniMax H3 video VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'minimax_h3_video_vae_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors',
    bytes: 5207808496,
    sha256: '7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522',
    note: 'Turns MiniMax H3 latents into frames.',
    publisher: 'MiniMax',
  },
  {
    id: 'vae-minimax-h3-audio',
    label: 'MiniMax H3 audio VAE',
    kind: 'vae',
    folder: 'vae',
    filename: 'minimax_h3_audio_vae_fp32.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors',
    bytes: 605254808,
    sha256: '8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48',
    note: 'Turns MiniMax H3 latents into sound.',
    publisher: 'MiniMax',
  },
  {
    id: 'lora-ltx23-distilled',
    label: 'LTX-2.3 distilled LoRA',
    kind: 'lora',
    folder: 'loras',
    filename: 'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/ltx-2.3/resolve/main/split_files/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
    bytes: 2741024390,
    sha256: '31e0c0195fb841bf31af78e8b60858f489e87ddcea4a5239abc80943da65e3ac',
    note: 'Loaded at half strength, it makes the LTX-2.3 dev checkpoint finish in eight steps.',
    publisher: 'Lightricks',
  },
  {
    id: 'lora-minimax-h3-turbo',
    label: 'MiniMax H3 turbo LoRA',
    kind: 'lora',
    folder: 'loras',
    filename: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
    bytes: 1956193000,
    sha256: '2339acdf19bfe123f46b971ea35d367a84adb85de43627e1eceafa5a5b2b111e',
    note: 'Cuts MiniMax H3 to six steps.',
    publisher: 'MiniMax',
  },
  {
    id: 'lora-hunyuan15-4step',
    label: 'HunyuanVideo 1.5 4-step LoRA',
    kind: 'lora',
    folder: 'loras',
    filename: 'hunyuanvideo1.5_t2v_480p_lightx2v_4step_lora_rank_32_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/loras/hunyuanvideo1.5_t2v_480p_lightx2v_4step_lora_rank_32_bf16.safetensors',
    bytes: 341065682,
    sha256: '8fef6f9b9f2f6aa5259166e78b10a022485391dababc6a8c68585fddd31d5d62',
    note: 'Cuts HunyuanVideo 1.5 to four steps.',
    publisher: 'LightX2V',
  },
  {
    id: 'lora-wan22-4step-high',
    label: 'Wan 2.2 4-step LoRA (high noise)',
    kind: 'lora',
    folder: 'loras',
    filename: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
    bytes: 1226977424,
    sha256: '698321cb86bd30c4af06c9b84e656a1048c8cb54e06d50694536fb5de37fde41',
    note: 'Speeds up the Wan 2.2 A14B expert that shapes the scene.',
    publisher: 'LightX2V',
  },
  {
    id: 'lora-wan22-4step-low',
    label: 'Wan 2.2 4-step LoRA (low noise)',
    kind: 'lora',
    folder: 'loras',
    filename: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
    bytes: 1226977424,
    sha256: 'ec95216e614b3c132c11bfb387b11feedf62163150ccc9068bca8a189771e75a',
    note: 'Speeds up the Wan 2.2 A14B expert that finishes the detail.',
    publisher: 'LightX2V',
  },
  {
    id: 'wan-2.2-14b-low-noise',
    label: 'Wan 2.2 A14B low-noise expert',
    kind: 'expert',
    folder: 'diffusion_models',
    filename: 'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
    bytes: 14293923632,
    sha256: 'e71b96d7c82e638694c5e7fb98fac4bfb0e4ddc5fbbb4b1df40da8f0f1278a97',
    note: 'The second half of Wan 2.2 A14B. It finishes what the high-noise model starts, and renders nothing alone.',
    publisher: 'Alibaba',
  },
  // Audio. The files ComfyUI's own templates for these models download, into
  // the folders those templates read. Sizes and checksums fetched from each
  // repository's tree in September 2026; see audioCatalog.ts for how they run.
  {
    id: 'ace-step-1.5-turbo',
    label: 'ACE-Step 1.5 Turbo',
    kind: 'audio',
    folder: 'checkpoints',
    filename: 'ace_step_1.5_turbo_aio.safetensors',
    url: 'https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/resolve/main/checkpoints/ace_step_1.5_turbo_aio.safetensors',
    bytes: 10025478736,
    sha256: '67b0f43aa5c51c840bd0228e6a935d8ff416ec87e5df2fc0637da17a561252bc',
    note: 'Songs and instrumentals from a description, in eight steps. One file carries everything it needs.',
    publisher: 'ACE-Step',
  },
  {
    id: 'ace-step-v1-3.5b',
    label: 'ACE-Step v1 3.5B',
    kind: 'audio',
    folder: 'checkpoints',
    filename: 'ace_step_v1_3.5b.safetensors',
    url: 'https://huggingface.co/Comfy-Org/ACE-Step_ComfyUI_repackaged/resolve/main/all_in_one/ace_step_v1_3.5b.safetensors',
    bytes: 7699743341,
    sha256: 'f07cad74c4adce52ca14ca1bdf74cf3c14cbafb0823b95eca4459467fa369f40',
    note: 'The first ACE-Step: music from a list of styles, in fifty steps. A smaller download than 1.5.',
    publisher: 'ACE-Step',
  },
  {
    id: 'stable-audio-open-1.0',
    label: 'Stable Audio Open 1.0',
    kind: 'audio',
    folder: 'checkpoints',
    filename: 'stable-audio-open-1.0.safetensors',
    url: 'https://huggingface.co/Comfy-Org/stable-audio-open-1.0_repackaged/resolve/main/stable-audio-open-1.0.safetensors',
    bytes: 4853889016,
    sha256: '7b20458a071231aaf32613b6fbc7945f28f34dbba4f295bb49bad56f5f66b57e',
    note: 'Sound effects, textures and short pieces of music, up to 47 seconds.',
    requires: ['t5-base'],
    publisher: 'Stability AI',
  },
  {
    id: 't5-base',
    label: 'T5-Base text encoder',
    kind: 'text-encoder',
    folder: 'text_encoders',
    filename: 't5-base.safetensors',
    url: 'https://huggingface.co/ComfyUI-Wiki/t5-base/resolve/main/t5-base.safetensors',
    bytes: 891646390,
    sha256: 'a90903540cc02cbeb7ff9f823f1a80eb778c7e22426a0e620b01c77a5ec8f5b4',
    note: 'Reads the prompt for Stable Audio Open.',
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
 * Whether ComfyUI is listing this file in the folder it belongs in.
 *
 * By folder, not by name alone: the loader that reads a file reads one folder,
 * so a diffusion model sitting in checkpoints/ is on disk and loadable by
 * nothing. Case-insensitive, because ComfyUI lists whatever the filesystem
 * gives it and Windows does not care about case.
 */
export function isListed(model: GenerationModel, installed: ComfyFolderListing): boolean {
  const wanted = model.filename.toLowerCase();
  return (installed[model.folder] ?? []).some((name) => name.toLowerCase() === wanted);
}

/**
 * Everything that must be downloaded for this model to actually render.
 *
 * A video checkpoint on its own produces nothing — the graph fails inside
 * CLIPLoader, which reads as a broken model rather than a missing file. So a
 * download offer covers the encoder too, and the total says what the evening
 * really costs.
 */
export function downloadPlan(model: GenerationModel, installed: ComfyFolderListing): {
  needed: GenerationModel[];
  totalBytes: number;
} {
  const wanted = [model, ...(model.requires ?? []).map(generationModelById).filter(Boolean) as GenerationModel[]];
  const needed = wanted.filter((m) => !isListed(m, installed));
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
 * `installed` is decided by whether ComfyUI is listing every file the model
 * needs, each in the folder its loader reads. That is the only definition that
 * matters: a file on disk the running server cannot see may as well not exist,
 * and a video model missing its VAE renders nothing.
 */
export function generationCatalogRows(installed: ComfyFolderListing): Array<{
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
  generationKind: 'image' | 'video' | 'audio';
  installedFile: boolean;
}> {
  return GENERATION_MODELS
    // Encoders, VAEs and LoRAs are parts, not models anyone picks. Two encoder
    // rows were tolerable; twenty-five parts would bury the seventeen models
    // they exist to serve. Each appears in its model's download plan instead.
    .filter((model): model is GenerationModel & { kind: 'image' | 'video' | 'audio' } =>
      model.kind === 'image' || model.kind === 'video' || model.kind === 'audio')
    .map((model) => {
      const plan = downloadPlan(model, installed);
      const parts = [model, ...(model.requires ?? []).map(generationModelById).filter(Boolean) as GenerationModel[]];
      // What the download costs while anything is missing, and what the model
      // occupies once nothing is. The main file alone left out everything it
      // cannot run without — a second expert, an encoder, a VAE.
      const bytes = plan.needed.length > 0 ? plan.totalBytes : parts.reduce((sum, part) => sum + part.bytes, 0);
      return {
        id: `comfyui/${model.id}`,
        name: model.label,
        tag: model.kind,
        params: model.kind === 'video' ? 'Video model' : model.kind === 'audio' ? 'Audio model' : 'Image model',
        sizeGb: Number((bytes / 1e9).toFixed(2)),
        pack: 'Generation',
        source: 'Hugging Face',
        live: true,
        runtime: 'comfyui' as const,
        publisher: model.publisher,
        generationId: model.id,
        generationKind: model.kind,
        installedFile: plan.needed.length === 0,
      };
    });
}
