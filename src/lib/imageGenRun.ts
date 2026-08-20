// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Running one image-generation benchmark end to end.
 *
 * Ollama answers a generate call with the finished text. ComfyUI does not: the
 * submit returns immediately with a queue id and the image turns up later, so
 * this has to poll. That difference is the whole reason this file exists
 * rather than another branch inside labChallenges.
 *
 * The polling deserves a note. ComfyUI writes a history entry only once
 * execution ends, which makes the entry appearing the completion signal — but
 * a graph that died halfway also writes one, with no images and an error in
 * its messages. Treating presence as success would score a model zero for a
 * missing checkpoint, which is the machine's problem and not the model's.
 */

import {
  buildTxt2ImgWorkflow,
  extractImages,
  readStatus,
  type ComfyImageRef,
  type Txt2ImgRequest,
} from './comfyui.ts';
import { getErrorMessage } from './format.ts';
import {
  buildJudgePrompt,
  readJudgeVerdict,
  scoreAdherence,
  scoreImageGeneration,
  type ImagePrompt,
} from './imageGenScoring.ts';

/** How often to ask whether the image is ready. */
const POLL_INTERVAL_MS = 750;
/** A 512px image on a slow card is minutes, not seconds; this is the ceiling. */
export const DEFAULT_RUN_TIMEOUT_MS = 300000;

export type ComfyTransport = {
  /**
   * Unload models and evict cached node outputs. Optional: an older preload
   * has no such call, and not being able to free must not stop a render.
   */
  free?: () => Promise<unknown>;
  submit: (graph: Record<string, unknown>) => Promise<{ promptId: string }>;
  history: (promptId: string) => Promise<unknown>;
  image: (ref: ComfyImageRef) => Promise<string>;
  interrupt: (promptId: string) => Promise<unknown>;
};

/** Asks a vision model a yes/no question about an image. */
export type JudgeFn = (imageDataUrl: string, question: string) => Promise<string>;

export type ImageRunOptions = {
  transport: ComfyTransport;
  judge?: JudgeFn;
  checkpoint: string;
  imagePrompt: ImagePrompt;
  settings?: Partial<Omit<Txt2ImgRequest, 'checkpoint' | 'prompt'>>;
  /**
   * Whether RigMatch owns this ComfyUI, exactly as for video. Freeing gives a
   * VRAM reading attributable to this run, but unloads every resident model —
   * unacceptable on an instance someone else is working in.
   */
  dedicated?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Injected so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type ImageRunResult = {
  checkpoint: string;
  promptId?: string;
  imageDataUrl?: string;
  score: number;
  grade: string;
  judged: boolean;
  adherence: number | null;
  elapsedMs: number;
  steps: number;
  checks: { label: string; passed: boolean; detail: string }[];
  error?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runImageGeneration(options: ImageRunOptions): Promise<ImageRunResult> {
  const {
    transport,
    judge,
    checkpoint,
    imagePrompt,
    settings = {},
    dedicated = false,
    signal,
    timeoutMs = DEFAULT_RUN_TIMEOUT_MS,
    sleep = defaultSleep,
    now = () => Date.now(),
  } = options;

  const steps = settings.steps ?? 20;
  const graph = buildTxt2ImgWorkflow({ checkpoint, prompt: imagePrompt.prompt, ...settings });

  let promptId: string | undefined;
  let startedAt = now();
  try {
    // Only on an instance RigMatch owns, and the clock restarts after it:
    // unloading eleven gigabytes is not this model rendering slowly. The seed
    // varying per batch is what actually defeats the cache — see the caller.
    if (dedicated) await transport.free?.().catch(() => undefined);
    startedAt = now();

    ({ promptId } = await transport.submit(graph));

    const images = await waitForImages({
      transport, promptId, signal, timeoutMs, sleep, now, startedAt,
    });
    // Elapsed is stopped here, before judging. A slow judge is not the
    // generator being slow, and folding the two together would make the speed
    // score depend on which vision model happened to be installed.
    const elapsedMs = now() - startedAt;

    if (!images.length) {
      return failed(checkpoint, promptId, elapsedMs, steps, 'The run finished but produced no image.');
    }

    const imageDataUrl = await transport.image(images[0]);
    const adherence = judge
      ? await judgeAdherence(judge, imageDataUrl, imagePrompt)
      : { adherence: null as number | null };

    const scored = scoreImageGeneration({
      produced: true,
      elapsedMs,
      steps,
      adherence: adherence.adherence,
    });

    return {
      checkpoint,
      promptId,
      imageDataUrl,
      adherence: adherence.adherence,
      elapsedMs,
      steps,
      ...scored,
    };
  } catch (error) {
    // A cancelled run must not leave ComfyUI generating an image nobody will
    // see; the GPU stays pinned for the rest of the job otherwise.
    if (promptId) await transport.interrupt(promptId).catch(() => undefined);
    // getErrorMessage, not error.message: the raw form leaks the Electron IPC
    // wrapper, so a ComfyUI that died between the status probe and the run
    // showed "Error invoking remote method 'comfy:submit': TypeError: fetch
    // failed" as the headline of the failure card.
    const message = error ? getErrorMessage(error) : 'Image generation failed.';
    return failed(checkpoint, promptId, now() - startedAt, steps, message);
  }
}

function failed(
  checkpoint: string,
  promptId: string | undefined,
  elapsedMs: number,
  steps: number,
  error: string,
): ImageRunResult {
  const scored = scoreImageGeneration({ produced: false, elapsedMs, steps, adherence: null });
  return { checkpoint, promptId, adherence: null, elapsedMs, steps, ...scored, error };
}

async function waitForImages({
  transport, promptId, signal, timeoutMs, sleep, now, startedAt,
}: {
  transport: ComfyTransport;
  promptId: string;
  signal?: AbortSignal;
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  startedAt: number;
}): Promise<ComfyImageRef[]> {
  for (;;) {
    if (signal?.aborted) throw new Error('Image generation was stopped.');
    if (now() - startedAt > timeoutMs) {
      throw new Error(`ComfyUI did not finish within ${Math.round(timeoutMs / 1000)}s.`);
    }

    const history = await transport.history(promptId);
    const status = readStatus(history, promptId);
    if (status.failed) throw new Error(status.error ?? 'ComfyUI reported the run failed.');
    if (status.done) return extractImages(history, promptId);

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Ask the judge every proposition and total the verdicts.
 *
 * A judge that throws on one question does not sink the run — that answer
 * becomes unreadable, and if enough of them are unreadable the adherence score
 * reports as unavailable rather than as a low number.
 */
async function judgeAdherence(judge: JudgeFn, imageDataUrl: string, imagePrompt: ImagePrompt) {
  const verdicts: (boolean | null)[] = [];
  for (const proposition of imagePrompt.propositions) {
    try {
      const answer = await judge(imageDataUrl, buildJudgePrompt(proposition.question));
      verdicts.push(readJudgeVerdict(answer));
    } catch {
      verdicts.push(null);
    }
  }
  return scoreAdherence(imagePrompt.propositions, verdicts);
}
