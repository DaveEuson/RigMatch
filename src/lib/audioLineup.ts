// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Several audio models, one prompt, one seed, one after another, and which of
 * them can run here.
 *
 * The rules the picture and video comparisons follow. Every model gets the same
 * prompt, seed and length and, when the person has agreed to it, a ComfyUI
 * unloaded before it, so none inherits a warm model from the one before. The
 * clips are checked only once every model has made one: the listener is a
 * model in Ollama that stays in VRAM for ten minutes after it answers.
 *
 * One model failing is recorded with its reason and the rest carry on. Pure
 * apart from what it is handed, so tests drive a fake ComfyUI.
 */

import { AUDIO_CLIP_SECONDS, AUDIO_MODEL_SPECS, audioModelFileIds, audioModelSpec, type AudioModelSpec } from './audioCatalog.ts';
import {
  audioRunFailure,
  judgeAudioResult,
  runAudioGeneration,
  type AudioDecoder,
  type AudioRunResult,
  type ListenFn,
} from './audioGenRun.ts';
import type { AudioPrompt } from './audioGenScoring.ts';
import { buildAudioWorkflow } from './audioWorkflows.ts';
import { generationModelById, isListed, type ComfyFolderListing } from './generationCatalog.ts';
import type { ComfyTransport } from './imageGenRun.ts';

export type AudioLineupEntry = { key: string; name: string };

export type AudioLineupOutcome = { entry: AudioLineupEntry; result: AudioRunResult };

// One member per phase that carries no result, as in the other comparisons.
export type AudioLineupProgress =
  | { index: number; total: number; entry: AudioLineupEntry; phase: 'rendering' }
  | { index: number; total: number; entry: AudioLineupEntry; phase: 'judging' }
  | { index: number; total: number; entry: AudioLineupEntry; phase: 'done' | 'failed' | 'judged'; result: AudioRunResult };

/** Whether ComfyUI lists every file this model loads, each where its loader reads it. */
export function audioModelInstalled(spec: AudioModelSpec, installed: ComfyFolderListing): boolean {
  return audioModelFileIds(spec).every((id) => {
    const model = generationModelById(id);
    return Boolean(model && isListed(model, installed));
  });
}

/** The audio models that can run here, in catalog order. */
export function installedAudioEntries(installed: ComfyFolderListing): AudioLineupEntry[] {
  return AUDIO_MODEL_SPECS
    .filter((spec) => audioModelInstalled(spec, installed))
    .map((spec) => ({ key: spec.key, name: spec.name }));
}

export async function runAudioLineup({
  entries,
  transport,
  listen,
  decode,
  audioPrompt,
  seed,
  seconds = AUDIO_CLIP_SECONDS,
  unloadBetweenRuns,
  signal,
  onProgress,
  sleep,
  now,
}: {
  entries: AudioLineupEntry[];
  transport: ComfyTransport;
  listen?: ListenFn;
  decode: AudioDecoder;
  audioPrompt: AudioPrompt;
  /** One for the whole comparison, so the models are the only difference. */
  seed: number;
  seconds?: number;
  /** Only when the person was told a comparison unloads ComfyUI, or it is RigMatch's own. */
  unloadBetweenRuns: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: AudioLineupProgress) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<AudioLineupOutcome[]> {
  const outcomes: AudioLineupOutcome[] = [];
  for (const [index, entry] of entries.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ index, total: entries.length, entry, phase: 'rendering' });
    const spec = audioModelSpec(entry.key);
    const result = spec
      ? await runAudioGeneration({
        transport,
        decode,
        graph: buildAudioWorkflow(spec, { prompt: audioPrompt.prompt, seed, seconds, bpm: audioPrompt.bpm }),
        model: entry.name,
        seconds,
        audioPrompt,
        dedicated: unloadBetweenRuns,
        signal,
        sleep,
        now,
      })
      : audioRunFailure(entry.name, seconds, 'RigMatch has no graph for this model.');
    outcomes.push({ entry, result });
    onProgress?.({ index, total: entries.length, entry, phase: result.error ? 'failed' : 'done', result });
  }

  // A prompt someone typed has no questions to ask, so there is nothing to check.
  const toCheck = outcomes.some((outcome) => !outcome.result.error && outcome.result.clip);
  if (!listen || audioPrompt.propositions.length === 0 || signal?.aborted || !toCheck) return outcomes;

  // The listener needs the graphics card, and the last model is still sitting
  // on it. Unloaded only where the person agreed to unloading at all.
  if (unloadBetweenRuns) await transport.free?.().catch(() => undefined);
  for (const [index, outcome] of outcomes.entries()) {
    if (signal?.aborted) break;
    if (outcome.result.error || !outcome.result.clip) continue;
    onProgress?.({ index, total: entries.length, entry: outcome.entry, phase: 'judging' });
    const judged = await judgeAudioResult(outcome.result, listen, audioPrompt);
    outcomes[index] = { entry: outcome.entry, result: judged };
    onProgress?.({ index, total: entries.length, entry: outcome.entry, phase: 'judged', result: judged });
  }
  return outcomes;
}
