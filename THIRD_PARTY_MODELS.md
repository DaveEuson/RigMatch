# Third-Party Model Notice

RigMatch benchmarks local models through the user's Ollama installation, and image and video models through the user's own ComfyUI.
RigMatch does not bundle third-party model weights, sell model access, or claim endorsement from model providers. Every model below is an option the user downloads on request, after a consent dialog that links its license. None ships inside RigMatch.

Model downloads, model weights, model outputs, and model names may be governed by separate provider licenses, terms, acceptable-use policies, or prohibited-use policies. Users should review the applicable terms before downloading, using, sharing, or redistributing any model.

Benchmark prompts and generated outputs are test artifacts. They may be inaccurate, incomplete, or unsafe, and they are not legal, medical, financial, safety, or professional advice.

Useful provider links:

- Ollama model library: https://ollama.com/library
- Ollama terms: https://ollama.com/terms
- Google Gemma terms: https://ai.google.dev/gemma/terms
- Google Gemma prohibited use policy: https://ai.google.dev/gemma/prohibited_use_policy
- Google Gemma 4 license information: https://ai.google.dev/gemma/apache_2
- Hugging Face terms: https://huggingface.co/terms-of-service

## Image and video models

These download from Hugging Face into the user's ComfyUI models folder. Each license below is the one the file's Hugging Face repository declares, read from its model card and, where the card names one, from the license file itself, in September 2026. The model's own page is the authority, and licenses change.

A model and the encoder or VAE it needs are often published separately, under different licenses, so both are listed. RigMatch does not know where anyone is and does not guess: where a license limits who may use a model, by country or by the size of the business using it, the download dialog quotes the condition and leaves the decision to the person it applies to.

### Models

| Model | Publisher | License | Worth knowing before downloading |
|---|---|---|---|
| LTX-Video 2B 0.9.6, 2B 0.9.8, 13B 0.9.8 | Lightricks | LTXV Open Weights License | Attribution notices must be kept. |
| LTX-2 19B, LTX-2.3 22B | Lightricks | LTX-2 Community License Agreement | Read its commercial terms before commercial use. |
| LTX-2.5 22B | Lightricks | LTX-2.x Community License Agreement | Gated: accept its terms on Hugging Face and download with your own token. A business with annual revenue of US$10 million or more needs a paid commercial license. |
| Wan 2.1 1.3B, Wan 2.1 14B, Wan 2.2 TI2V 5B, Wan 2.2 A14B | Alibaba | Apache 2.0 | |
| HunyuanVideo 1.0 13B, HunyuanVideo 1.5 480p | Tencent | Tencent Hunyuan Community License | Does not apply in the European Union, the United Kingdom or South Korea. A service with over 100 million monthly active users must ask Tencent for a license. |
| Kandinsky 5.0 Lite 2B (three variants), Kandinsky 5.0 Pro 19B | Kandinsky Lab (Sber AI) | MIT | The VAE and the Qwen2.5-VL text encoder these download come from repositories under Tencent's Hunyuan license, whose territory limits apply to them. |
| Mochi 1 10B | Genmo | Apache 2.0 | |
| MiniMax H3 | MiniMax | MiniMax H3 Community License Agreement | Does not cover use in the European Union, the United Kingdom, South Korea or the United States. A business earning over US$20 million a year needs MiniMax's written permission. |
| Stable Diffusion 1.5 | Runway / Stability AI | CreativeML OpenRAIL-M | Use-based restrictions are set out in the license. |
| SDXL-Turbo | Stability AI | Stability AI Community License | Commercial use requires registering with Stability AI, and a business earning over US$1 million a year needs an enterprise license. |

### Parts the models download

| Part | Used by | Repository | License |
|---|---|---|---|
| T5-XXL text encoder (fp8), CLIP-L | LTX-Video 0.9, Mochi, Kandinsky 5, HunyuanVideo 1.0 | comfyanonymous/flux_text_encoders | Apache 2.0 |
| UMT5-XXL text encoder (fp8) | Wan | Comfy-Org/Wan_2.1_ComfyUI_repackaged | Apache 2.0 |
| Wan VAEs, the Wan 2.2 low-noise expert, 4-step LoRAs | Wan | Comfy-Org/Wan_2.2_ComfyUI_Repackaged | Apache 2.0 |
| LTX-Video 0.9.8 VAE | LTX-Video 2B and 13B 0.9.8 | QuantStack/LTXV-13B-0.9.8-distilled-GGUF | LTXV Open Weights License |
| Gemma 3 12B text encoder (fp8) | LTX-2, LTX-2.3 | Comfy-Org/ltx-2 | LTX-2 Community License. Built from Google's Gemma 3, so Google's Gemma terms apply to it as well. |
| LTX-2.3 distilled LoRA | LTX-2.3 | Comfy-Org/ltx-2.3 | LTX-2 Community License |
| LTX-2.5 text encoder and VAEs | LTX-2.5 | Lightricks/LTX-2.5 | LTX-2.x Community License |
| Qwen2.5-VL 7B text encoder, ByT5 glyph encoder, HunyuanVideo 1.5 VAE and 4-step LoRA | HunyuanVideo 1.5, Kandinsky 5 | Comfy-Org/HunyuanVideo_1.5_repackaged | Tencent Hunyuan Community License |
| HunyuanVideo VAE | HunyuanVideo 1.0, Kandinsky 5 | Kijai/HunyuanVideo_comfy | Tencent Hunyuan Community License |
| LLaVA-Llama-3 text encoder (fp8) | HunyuanVideo 1.0 | Comfy-Org/HunyuanVideo_repackaged | Tencent Hunyuan Community License |
| MiniMax H3 text encoder, VAEs and turbo LoRA | MiniMax H3 | Comfy-Org/MiniMax-H3 | MiniMax H3 Community License |
| Mochi VAE | Mochi 1 | Comfy-Org/mochi_preview_repackaged | Apache 2.0 |

Release checklist:

- Do not ship third-party model weights inside the RigMatch installer unless the required license, notice, attribution, and use-restriction files are included.
- If a release adds bundled model weights, review that model's current license before publishing.
- Keep third-party model notices visible in the app and in public project/release materials.
- When a model joins the image or video catalog, add it here with the license of every file it downloads, and add any condition that limits who may use it to `REPOSITORY_CONDITIONS` in `src/lib/modelLicenses.ts`, so the download dialog says it too.
