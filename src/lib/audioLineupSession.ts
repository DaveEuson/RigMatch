// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Audio being made, held outside any component.
 *
 * The picture comparison's arrangement: a run survives navigation and keeps its
 * Stop button, and every screen that must not start a second render while it
 * runs can see it. A model tested on its own from its row runs through here
 * too, as a run of one, so one place says the graphics card is busy making
 * audio. Results go where every test's go, the saved Lab results, which is
 * what the side-by-side board and the in-row result read.
 */

import { AUDIO_CLIP_SECONDS } from './audioCatalog.ts';
import { toAudioLabResult } from './audioGenChallenge.ts';
import type { AudioRunResult } from './audioGenRun.ts';
import { createOllamaListener } from './audioGenRunner.ts';
import { audioPromptById, type AudioPrompt } from './audioGenScoring.ts';
import { runAudioLineup, type AudioLineupEntry, type AudioLineupOutcome } from './audioLineup.ts';
import { decodeAudio } from './browserAudio.ts';
import { createVideoTransport, describeComfyBusy } from './comfyTransport.ts';
import { readComfySettings } from './comfySettings.ts';
import { getErrorMessage } from './format.ts';
import { imageLineupSnapshot } from './imageLineupSession.ts';
import { readAdvancedLabResults, writeAdvancedLabResults } from './labResults.ts';
import { formatVideoDuration } from './videoFit.ts';
import { batchSeed } from './videoGen.ts';
import { lineupSessionSnapshot } from './videoLineupSession.ts';

export type AudioLineupStage = 'waiting' | 'making' | 'made' | 'checking' | 'checked' | 'failed';

export type AudioLineupSession = {
  running: boolean;
  /** What is being made now, or the last thing made this session. */
  run: {
    id: string;
    prompt: string;
    seed: number;
    planned: AudioLineupEntry[];
    stopped: boolean;
    finished: boolean;
  } | null;
  /** How far each model has got, by key. */
  stages: Record<string, AudioLineupStage>;
  /** Why a model failed, by key. */
  errors: Record<string, string>;
  /** The model making its clip now, and since when. */
  current: { key: string; name: string; startedAt: number } | null;
  message: string;
  failed: boolean;
  /** When the last run ended, which tells its outcome from an older one's. */
  endedAt: number | null;
  /**
   * A model tested on its own from its row, from the moment it is started until
   * the next start. Its message is the row's to show; a comparison is not.
   */
  solo: { key: string; name: string } | null;
};

let session: AudioLineupSession = {
  running: false,
  run: null,
  stages: {},
  errors: {},
  current: null,
  message: '',
  failed: false,
  endedAt: null,
  solo: null,
};
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function update(patch: Partial<AudioLineupSession>): void {
  session = { ...session, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeAudioLineup(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function audioLineupSnapshot(): AudioLineupSession {
  return session;
}

export type StartAudioLineupOptions = {
  /** In the order they should run. */
  entries: AudioLineupEntry[];
  promptId: string;
  customPrompt: string;
  /** The model that listens to the clips. Without one they are made and timed, unjudged. */
  listenerModel?: string;
  ollamaBaseUrl: string;
  /** Unload ComfyUI before every model. The person agreed in Settings, or in the warning. */
  unloadBetweenRuns: boolean;
  /** Where the Balance fader stood when this started. */
  balance?: number;
  /** One model tested on its own from its row. */
  solo?: boolean;
};

/** Why a clip that was made carries no accuracy. */
function unjudgedReason(audioPrompt: AudioPrompt, listener: string | undefined, result: AudioRunResult): string {
  if (audioPrompt.propositions.length === 0) return 'Your own prompt has nothing to check it against, so it is unjudged.';
  if (!listener) return 'Nothing installed can listen to it, so it is unjudged.';
  if (result.unjudgedReason) {
    return `${listener} gave every question the same answer, so it could not tell what is in the clip. Unjudged.`;
  }
  return `${listener} could not answer enough questions about it, so it is unjudged.`;
}

/** How a test of one model reads when it ends. */
function soloVerdict(
  name: string,
  result: AudioRunResult | undefined,
  stopped: boolean,
  audioPrompt: AudioPrompt,
  listener: string | undefined,
): string {
  // Stopping mid-render leaves an error behind, but it is not a failure of the model's.
  if (!result || (stopped && result.error)) return stopped ? `Stopped before ${name} finished.` : `${name} made nothing.`;
  if (result.error) return `${name} failed: ${result.error}`;
  const made = `${name} made ${Math.round(result.seconds)} s of audio in ${formatVideoDuration(result.elapsedMs / 1000)}`;
  if (typeof result.adherence === 'number') {
    return `${made}, and ${listener} heard ${Math.round(result.adherence * 100)}% of the prompt in it.`;
  }
  return stopped
    ? `${made}. Stopped before the clip was checked.`
    : `${made}. ${unjudgedReason(audioPrompt, listener, result)} Listen to it, and say whether it sounds right.`;
}

export async function startAudioLineup(options: StartAudioLineupOptions): Promise<void> {
  if (session.running || options.entries.length === 0) return;
  const { entries, promptId, customPrompt } = options;
  const solo = options.solo && entries.length === 1 ? { key: entries[0].key, name: entries[0].name } : null;
  // Claimed before the first await, so a second click cannot start a second run.
  update({
    running: true,
    run: null,
    stages: Object.fromEntries(entries.map((entry) => [entry.key, 'waiting'])),
    errors: {},
    current: null,
    failed: false,
    solo,
    message: 'Checking that ComfyUI is free…',
  });

  // One render at a time on one graphics card.
  if (lineupSessionSnapshot().running || imageLineupSnapshot().running) {
    update({ running: false, failed: true, message: 'Another model is rendering. Make audio when it finishes.', endedAt: Date.now() });
    return;
  }
  // Asked before anything is submitted: queuing behind someone else's render
  // produces times that measure the queue.
  const busy = await describeComfyBusy().catch(() => null);
  if (busy) {
    update({ running: false, failed: true, message: busy, endedAt: Date.now() });
    return;
  }

  const audioPrompt = audioPromptById(promptId, customPrompt);
  const listener = options.listenerModel || undefined;
  const seed = batchSeed();
  const run = {
    id: `audio-${Date.now()}`,
    prompt: audioPrompt.prompt,
    seed,
    planned: entries,
    stopped: false,
    finished: false,
  };
  const abort = new AbortController();
  controller = abort;
  update({
    run,
    message: solo
      ? `Making ${AUDIO_CLIP_SECONDS} seconds of audio with ${entries[0].name}.`
      : `Making ${entries.length} clips of the same prompt, one after another.`,
  });

  const stage = (key: string, value: AudioLineupStage) => ({ ...session.stages, [key]: value });
  let outcomes: AudioLineupOutcome[];
  try {
    outcomes = await runAudioLineup({
      entries,
      transport: createVideoTransport(readComfySettings().baseUrl),
      // Nothing that can hear is not a failure: the clips are still made and
      // timed, and say they are unchecked rather than scoring as wrong.
      listen: listener ? createOllamaListener(listener, options.ollamaBaseUrl) : undefined,
      decode: decodeAudio,
      audioPrompt,
      seed,
      seconds: AUDIO_CLIP_SECONDS,
      unloadBetweenRuns: options.unloadBetweenRuns,
      signal: abort.signal,
      onProgress: (progress) => {
        const { key, name } = progress.entry;
        if (progress.phase === 'rendering') {
          update({
            stages: stage(key, 'making'),
            current: { key, name, startedAt: Date.now() },
            message: solo ? `Making ${name}’s clip.` : `Making ${progress.index + 1} of ${progress.total}: ${name}.`,
          });
          return;
        }
        if (progress.phase === 'judging') {
          const by = listener ? ` with ${listener}` : '';
          update({
            stages: stage(key, 'checking'),
            current: null,
            message: solo
              ? `${name} made its clip. Listening to it${by}.`
              : `Every model has made its clip. Listening to ${name}’s${by}.`,
          });
          return;
        }
        if (progress.result.error) {
          update({
            stages: stage(key, 'failed'),
            errors: { ...session.errors, [key]: progress.result.error },
            current: null,
          });
          return;
        }
        // Saved as each one finishes, so a comparison stopped halfway keeps what
        // it made. A checked result then replaces its unchecked one in place.
        const result = toAudioLabResult(progress.result, audioPrompt, { lineupId: run.id, balance: options.balance });
        writeAdvancedLabResults({ ...readAdvancedLabResults(), [`audio:${key}`]: result });
        update({ stages: stage(key, progress.phase === 'judged' ? 'checked' : 'made'), current: null });
      },
    });
  } catch (error) {
    controller = null;
    update({ running: false, current: null, failed: true, message: getErrorMessage(error), endedAt: Date.now() });
    return;
  }

  const stopped = abort.signal.aborted;
  controller = null;
  const made = outcomes.filter((outcome) => !outcome.result.error).length;
  const failedCount = outcomes.length - made;
  const judgedCount = outcomes.filter((outcome) => typeof outcome.result.adherence === 'number').length;
  update({
    running: false,
    current: null,
    run: { ...run, stopped, finished: true },
    failed: Boolean(solo && !stopped && outcomes[0]?.result.error),
    endedAt: Date.now(),
    message: solo
      ? soloVerdict(entries[0].name, outcomes[0]?.result, stopped, audioPrompt, listener)
      : stopped
        ? `Stopped. ${made} of ${entries.length} made.`
        : `Compared ${made} clip${made === 1 ? '' : 's'}${failedCount ? `; ${failedCount} failed` : ''}. `
          + (made > 0 && judgedCount === 0
            ? 'They are side by side below: listen to each, and say whether it sounds right.'
            : 'They are side by side below.'),
  });
}

/** Ends the run now: ComfyUI is told to cancel the clip in flight. */
export function stopAudioLineup(): void {
  if (!controller) return;
  controller.abort();
  update({ message: 'Stopping — ComfyUI is cancelling the clip in flight.' });
}
