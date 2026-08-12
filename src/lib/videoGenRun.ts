/**
 * Running one video benchmark end to end.
 *
 * Structurally the image run with three differences, each of which came out of
 * measuring rather than from the design:
 *
 * It frees first. Without that, resubmitting an identical graph returns the
 * previous video in about two seconds and the benchmark reports that as the
 * generation time. Freeing also makes the VRAM reading attributable to this
 * run instead of to whatever was left resident.
 *
 * It judges one frame rather than the output. A video has no still to look at,
 * and the middle frame is the part with a right answer.
 *
 * It scores on cost per second of footage, not wall time, so eight seconds of
 * video is not penalised against four for being twice the work.
 */

import { extractImages, readStatus, type ComfyImageRef } from './comfyui.ts';
import { buildTxt2VideoWorkflow, LTX_DEFAULTS, VIDEO_FRAME_NODE, VIDEO_OUTPUT_NODE } from './videoGen.ts';
import { scoreVideoGeneration } from './videoGenScoring.ts';
import { buildJudgePrompt, readJudgeVerdict, scoreAdherence, type ImagePrompt } from './imageGenScoring.ts';
import type { JudgeFn } from './imageGenRun.ts';

const POLL_INTERVAL_MS = 1500;
/** Full HD took 71s on a 4070; a slower card doing more frames needs room. */
export const DEFAULT_VIDEO_TIMEOUT_MS = 1800000;

export type VideoTransport = {
  free: () => Promise<unknown>;
  submit: (graph: Record<string, unknown>) => Promise<{ promptId: string }>;
  history: (promptId: string) => Promise<unknown>;
  image: (ref: ComfyImageRef) => Promise<string>;
  interrupt: (promptId: string) => Promise<unknown>;
};

export type VideoRunOptions = {
  transport: VideoTransport;
  judge?: JudgeFn;
  checkpoint: string;
  textEncoder: string;
  imagePrompt: ImagePrompt;
  settings?: { width?: number; height?: number; frames?: number; steps?: number; fps?: number; seed?: number };
  /**
   * Whether RigMatch owns this ComfyUI.
   *
   * False by default, and the default matters. ComfyUI's /free unloads every
   * resident model, and the people most likely to have ComfyUI already
   * installed are the people using it for their own work — evicting their
   * working set before each benchmark run, silently, is not a reasonable thing
   * for a benchmark to do. So a shared instance is left alone and the cache is
   * defeated by varying the seed instead, which was measured to work: the same
   * seed twice returns in 1.5s where a new seed takes 9-11s.
   *
   * Set true only for an instance started for RigMatch, where freeing buys a
   * VRAM reading attributable to this run.
   */
  dedicated?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type VideoRunResult = {
  checkpoint: string;
  promptId?: string;
  /** The judged frame, as a data URL. */
  frameDataUrl?: string;
  /** Where the video sits on the ComfyUI server; too large to inline. */
  videoRef?: ComfyImageRef;
  score: number;
  grade: string;
  judged: boolean;
  adherence: number | null;
  realtimeCost: number;
  elapsedMs: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
  checks: { label: string; passed: boolean; detail: string }[];
  error?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runVideoGeneration(options: VideoRunOptions): Promise<VideoRunResult> {
  const {
    transport, judge, checkpoint, textEncoder, imagePrompt, settings = {},
    dedicated = false,
    signal, timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS, sleep = defaultSleep, now = () => Date.now(),
  } = options;

  const width = settings.width ?? LTX_DEFAULTS.width;
  const height = settings.height ?? LTX_DEFAULTS.height;
  const frames = settings.frames ?? LTX_DEFAULTS.frames;
  const fps = settings.fps ?? LTX_DEFAULTS.fps;

  const base = {
    checkpoint, frames, fps, width, height,
    adherence: null as number | null, realtimeCost: 0, elapsedMs: 0,
  };

  let promptId: string | undefined;
  try {
    // Only on an instance RigMatch owns, and before the clock starts either
    // way, since freeing is not part of what is being measured.
    if (dedicated) await transport.free().catch(() => undefined);

    const graph = buildTxt2VideoWorkflow({
      checkpoint,
      textEncoder,
      prompt: imagePrompt.prompt,
      width, height, frames, fps,
      steps: settings.steps ?? LTX_DEFAULTS.steps,
      seed: settings.seed ?? LTX_DEFAULTS.seed,
    });

    const startedAt = now();
    ({ promptId } = await transport.submit(graph));
    const outputs = await waitForOutputs({ transport, promptId, signal, timeoutMs, sleep, now, startedAt });
    // Stopped before judging: a slow judge is not a slow renderer.
    const elapsedMs = now() - startedAt;

    const frameRefs = extractImages(outputs, promptId).filter((r) => r.filename.includes('RigMatchFrame'));
    const videoRef = extractImages(outputs, promptId).find((r) => /\.(mp4|webm)$/i.test(r.filename));

    if (!frameRefs.length && !videoRef) {
      return failed({ ...base, elapsedMs }, promptId, 'The run finished but produced no video.');
    }

    const frameDataUrl = frameRefs.length ? await transport.image(frameRefs[0]) : undefined;
    const adherence = judge && frameDataUrl
      ? (await judgeFrame(judge, frameDataUrl, imagePrompt)).adherence
      : null;

    const scored = scoreVideoGeneration({
      produced: true, elapsedMs, frames, fps, width, height, adherence,
    });

    return { ...base, promptId, frameDataUrl, videoRef, adherence, elapsedMs, ...scored };
  } catch (error) {
    if (promptId) await transport.interrupt(promptId).catch(() => undefined);
    const message = error instanceof Error ? error.message : 'Video generation failed.';
    return failed(base, promptId, message);
  }
}

function failed(
  base: Omit<VideoRunResult, 'score' | 'grade' | 'judged' | 'checks' | 'promptId'>,
  promptId: string | undefined,
  error: string,
): VideoRunResult {
  const scored = scoreVideoGeneration({
    produced: false, elapsedMs: base.elapsedMs, frames: base.frames,
    fps: base.fps, width: base.width, height: base.height, adherence: null,
  });
  return { ...base, promptId, ...scored, error };
}

async function waitForOutputs({
  transport, promptId, signal, timeoutMs, sleep, now, startedAt,
}: {
  transport: VideoTransport; promptId: string; signal?: AbortSignal; timeoutMs: number;
  sleep: (ms: number) => Promise<void>; now: () => number; startedAt: number;
}): Promise<unknown> {
  for (;;) {
    if (signal?.aborted) throw new Error('Video generation was stopped.');
    if (now() - startedAt > timeoutMs) {
      throw new Error(`ComfyUI did not finish within ${Math.round(timeoutMs / 60000)} minutes.`);
    }

    const history = await transport.history(promptId);
    const status = readStatus(history, promptId);
    if (status.failed) throw new Error(status.error ?? 'ComfyUI reported the run failed.');
    if (status.done) return history;

    await sleep(POLL_INTERVAL_MS);
  }
}

async function judgeFrame(judge: JudgeFn, frameDataUrl: string, imagePrompt: ImagePrompt) {
  const verdicts: (boolean | null)[] = [];
  for (const proposition of imagePrompt.propositions) {
    try {
      verdicts.push(readJudgeVerdict(await judge(frameDataUrl, buildJudgePrompt(proposition.question))));
    } catch {
      verdicts.push(null);
    }
  }
  return scoreAdherence(imagePrompt.propositions, verdicts);
}

/** Node ids the graph saves to, exported so callers can reason about outputs. */
export { VIDEO_FRAME_NODE, VIDEO_OUTPUT_NODE };
