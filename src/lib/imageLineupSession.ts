// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The picture comparison in flight, held outside any component.
 *
 * Several checkpoints can take minutes between them, and Comparison is one
 * screen among several. Held here, a comparison survives navigation and keeps
 * its Stop button, and every screen that must not start a second render while
 * it runs can see it. The pictures go where every image test goes, the saved
 * Lab results, which is what the side-by-side board reads.
 */

import { createVideoTransport, describeComfyBusy } from './comfyTransport.ts';
import { readComfySettings } from './comfySettings.ts';
import { getErrorMessage } from './format.ts';
import { IMAGE_RUN_SETTINGS, imagePromptById, toLabResult } from './imageGenChallenge.ts';
import { createOllamaJudge } from './imageGenRunner.ts';
import { runImageLineup, type ImageLineupEntry, type ImageLineupOutcome } from './imageLineup.ts';
import { readAdvancedLabResults, writeAdvancedLabResults } from './labResults.ts';
import { batchSeed } from './videoGen.ts';
import { lineupSessionSnapshot } from './videoLineupSession.ts';

export type ImageLineupStage = 'waiting' | 'drawing' | 'drawn' | 'checking' | 'checked' | 'failed';

export type ImageLineupSession = {
  running: boolean;
  /** The comparison in flight, or the last one this session. */
  run: { id: string; prompt: string; seed: number; planned: ImageLineupEntry[]; stopped: boolean; finished: boolean } | null;
  /** How far each model has got, by checkpoint. */
  stages: Record<string, ImageLineupStage>;
  /** Why a model failed, by checkpoint. */
  errors: Record<string, string>;
  /** The model drawing now, and since when. */
  current: { checkpoint: string; name: string; startedAt: number } | null;
  message: string;
  failed: boolean;
  /** When the last comparison ended, which tells its outcome from an older one's. */
  endedAt: number | null;
};

let session: ImageLineupSession = {
  running: false,
  run: null,
  stages: {},
  errors: {},
  current: null,
  message: '',
  failed: false,
  endedAt: null,
};
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function update(patch: Partial<ImageLineupSession>): void {
  session = { ...session, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeImageLineup(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function imageLineupSnapshot(): ImageLineupSession {
  return session;
}

export type StartImageLineupOptions = {
  /** In the order they should draw. */
  entries: ImageLineupEntry[];
  promptId: string;
  customPrompt: string;
  judgeModel?: string;
  ollamaBaseUrl: string;
  /** Unload ComfyUI before every model. The person agreed in Settings, or in the warning. */
  unloadBetweenRuns: boolean;
  /** Where the Balance fader stood when the comparison started. */
  balance?: number;
};

export async function startImageLineup(options: StartImageLineupOptions): Promise<void> {
  if (session.running || options.entries.length === 0) return;
  const { entries, promptId, customPrompt } = options;
  // Claimed before the first await, so a second click cannot start a second comparison.
  update({
    running: true,
    run: null,
    stages: Object.fromEntries(entries.map((entry) => [entry.checkpoint, 'waiting'])),
    errors: {},
    current: null,
    failed: false,
    message: 'Checking that ComfyUI is free…',
  });

  // One render at a time on one graphics card, and a video race shares it.
  if (lineupSessionSnapshot().running) {
    update({ running: false, failed: true, message: 'A video is rendering. Compare pictures when it finishes.', endedAt: Date.now() });
    return;
  }
  // Asked before anything is submitted: queuing behind someone else's render
  // produces times that measure the queue.
  const busy = await describeComfyBusy().catch(() => null);
  if (busy) {
    update({ running: false, failed: true, message: busy, endedAt: Date.now() });
    return;
  }

  const imagePrompt = imagePromptById(promptId, customPrompt);
  const seed = batchSeed();
  const run = {
    id: `images-${Date.now()}`,
    prompt: imagePrompt.prompt,
    seed,
    planned: entries,
    stopped: false,
    finished: false,
  };
  const abort = new AbortController();
  controller = abort;
  update({ run, message: `Drawing ${entries.length} pictures of the same prompt, one after another.` });

  const stage = (checkpoint: string, value: ImageLineupStage) => ({ ...session.stages, [checkpoint]: value });
  let outcomes: ImageLineupOutcome[];
  try {
    outcomes = await runImageLineup({
      entries,
      transport: createVideoTransport(readComfySettings().baseUrl),
      // No vision model is not a failure: the pictures are still drawn and
      // timed, and say they are unchecked rather than scoring as wrong.
      judge: options.judgeModel ? createOllamaJudge(options.judgeModel, options.ollamaBaseUrl) : undefined,
      imagePrompt,
      seed,
      settings: IMAGE_RUN_SETTINGS,
      unloadBetweenRuns: options.unloadBetweenRuns,
      signal: abort.signal,
      onProgress: (progress) => {
        const { checkpoint, name } = progress.entry;
        if (progress.phase === 'rendering') {
          update({
            stages: stage(checkpoint, 'drawing'),
            current: { checkpoint, name, startedAt: Date.now() },
            message: `Drawing ${progress.index + 1} of ${progress.total}: ${name}.`,
          });
          return;
        }
        if (progress.phase === 'judging') {
          update({
            stages: stage(checkpoint, 'checking'),
            current: null,
            message: `Every model has drawn. Checking ${name}’s picture`
              + `${options.judgeModel ? ` with ${options.judgeModel}` : ''}.`,
          });
          return;
        }
        if (progress.result.error) {
          update({
            stages: stage(checkpoint, 'failed'),
            errors: { ...session.errors, [checkpoint]: progress.result.error },
            current: null,
          });
          return;
        }
        // Saved as each one finishes, like every image test, so a comparison
        // stopped halfway keeps what it drew. A checked result then replaces
        // its unchecked one in place.
        const result = {
          ...toLabResult(progress.result, promptId, customPrompt),
          lineupId: run.id,
          ...(typeof options.balance === 'number' ? { balance: options.balance } : {}),
        };
        writeAdvancedLabResults({ ...readAdvancedLabResults(), [`image:${checkpoint}`]: result });
        update({ stages: stage(checkpoint, progress.phase === 'judged' ? 'checked' : 'drawn'), current: null });
      },
    });
  } catch (error) {
    controller = null;
    update({ running: false, current: null, failed: true, message: getErrorMessage(error), endedAt: Date.now() });
    return;
  }

  const stopped = abort.signal.aborted;
  controller = null;
  const drawn = outcomes.filter((outcome) => !outcome.result.error).length;
  const failedCount = outcomes.length - drawn;
  update({
    running: false,
    current: null,
    run: { ...run, stopped, finished: true },
    failed: false,
    endedAt: Date.now(),
    message: stopped
      ? `Stopped. ${drawn} of ${entries.length} drawn.`
      : `Compared ${drawn} picture${drawn === 1 ? '' : 's'}${failedCount ? `; ${failedCount} failed` : ''}. They are side by side below.`,
  });
}

/** Ends the comparison now: ComfyUI is told to cancel the picture in flight. */
export function stopImageLineup(): void {
  if (!controller) return;
  controller.abort();
  update({ message: 'Stopping — ComfyUI is canceling the picture in flight.' });
}
