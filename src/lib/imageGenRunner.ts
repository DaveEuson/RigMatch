/**
 * The half of the Image Lab that needs the Electron bridge.
 *
 * Kept apart from imageGenChallenge.ts on purpose. That module holds the
 * decisions worth testing — which model is fit to judge, which prompt was
 * asked, what gets credited with the picture — and importing the bridge into it
 * would drag `window` and the whole api module chain into every test that
 * touches them.
 */

import { agentArcadeApi } from '../api.ts';
import { COMFY_DEFAULT_URL } from './comfyui.ts';
import { createVideoTransport } from './comfyTransport.ts';
import { readComfySettings } from './comfySettings.ts';
import { batchSeed } from './videoGen.ts';
import { runImageGeneration, type ImageRunResult, type JudgeFn } from './imageGenRun.ts';
import { IMAGE_RUN_SETTINGS, imagePromptById } from './imageGenChallenge.ts';

/**
 * Ask a local vision model one yes/no question about the generated image.
 *
 * `num_predict` is deliberately tiny. The question asks for a single word and
 * a long answer is a worse answer — more text is more room to hedge into
 * something unreadable, which costs the proposition rather than failing it.
 */
export function createOllamaJudge(model: string, baseUrl: string): JudgeFn {
  return async (imageDataUrl, question) => {
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt: question,
      images: [imageDataUrl],
      keep_alive: '10m',
      timeoutMs: 120000,
      options: { temperature: 0, num_ctx: 4096, num_predict: 24 },
    });
    if (data.error) throw new Error(data.error);
    return data.response ?? '';
  };
}

export type ImageChallengeOptions = {
  checkpoint: string;
  /** One per batch, so checkpoints compare fairly and reruns are not cached. */
  seed?: number;
  promptId?: string;
  judgeModel?: string;
  ollamaBaseUrl: string;
  comfyBaseUrl?: string;
  signal?: AbortSignal;
};

export async function runImageLabChallenge(options: ImageChallengeOptions): Promise<ImageRunResult> {
  const {
    checkpoint, promptId, judgeModel, ollamaBaseUrl, seed,
    comfyBaseUrl = COMFY_DEFAULT_URL, signal,
  } = options;
  const { dedicated } = readComfySettings();

  return runImageGeneration({
    // The video transport, because it carries free() — needed when this
    // ComfyUI belongs to RigMatch and a clean VRAM reading is possible.
    transport: createVideoTransport(comfyBaseUrl),
    dedicated,
    // No vision model installed is not a failure. The run still measures
    // whether the machine can produce the image and how fast; it is reported
    // unjudged rather than scored as if the picture were wrong.
    judge: judgeModel ? createOllamaJudge(judgeModel, ollamaBaseUrl) : undefined,
    checkpoint,
    imagePrompt: imagePromptById(promptId),
    settings: { ...IMAGE_RUN_SETTINGS, seed: seed ?? batchSeed() },
    signal,
  });
}
