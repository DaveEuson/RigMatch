// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The video lineup in flight, held outside any component.
 *
 * A lineup can run for hours, and the Lab is one screen among several. Held in
 * component state it lived only while the Activity screen was open: leaving it
 * lost the Stop button while ComfyUI carried on rendering, and coming back
 * offered to start a second lineup on top of the first. Held here it survives
 * navigation, and every screen that shows it reads the same state.
 *
 * The last lineup is kept in storage too, so its leaderboard is still there
 * after a restart. The clips are not — only ComfyUI's references to them, and
 * the judged frames, which the Lab results already hold.
 */

import { describeComfyBusy } from './comfyTransport.ts';
import { getErrorMessage } from './format.ts';
import { imagePromptById } from './imageGenChallenge.ts';
import { readAdvancedLabResults, writeAdvancedLabResults } from './labResults.ts';
import { batchSeed } from './videoGen.ts';
import { toVideoLabResult } from './videoGenChallenge.ts';
import { runVideoLineupLive } from './videoGenRunner.ts';
import { readVideoCalibration, saveVideoCalibration } from './videoCalibrationStore.ts';
import { formatVideoDuration } from './videoFit.ts';
import {
  calibrationFrom,
  lineupRecordEntry,
  type LineupExpectation,
  type LineupOutcome,
  type LineupRecord,
  type LineupRecordEntry,
  type VideoLineupEntry,
} from './videoLineup.ts';

export const VIDEO_LINEUP_STORAGE_KEY = 'rigmatch:video-lineup:v1';

export type LineupSession = {
  running: boolean;
  /** The lineup in flight, or the last one to finish. Never a model tested on its own. */
  record: LineupRecord | null;
  /** The model rendering now, and since when. */
  current: { key: string; name: string; index: number; total: number; startedAt: number } | null;
  message: string;
  failed: boolean;
  /**
   * A model tested on its own from its row on the Models screen, while it
   * renders and after, until the next start. Kept out of `record`: one model is
   * not a race, and its test must not replace the last race's leaderboard.
   */
  solo: { key: string; name: string } | null;
};

export function readLastLineup(): LineupRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIDEO_LINEUP_STORAGE_KEY) ?? 'null') as LineupRecord | null;
    return parsed && typeof parsed.id === 'string' && Array.isArray(parsed.planned) && Array.isArray(parsed.entries)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function saveLastLineup(record: LineupRecord): void {
  try {
    localStorage.setItem(VIDEO_LINEUP_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage full or unavailable: the leaderboard lasts until the app closes.
  }
}

let session: LineupSession = {
  running: false,
  record: readLastLineup(),
  current: null,
  message: '',
  failed: false,
  solo: null,
};
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function update(patch: Partial<LineupSession>): void {
  session = { ...session, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeLineupSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function lineupSessionSnapshot(): LineupSession {
  return session;
}

export type StartLineupOptions = {
  /** In the order they should run. */
  entries: VideoLineupEntry[];
  /** Each model's estimate as its card showed it, by key. */
  expected: Record<string, LineupExpectation>;
  promptId: string;
  customPrompt: string;
  judgeModel?: string;
  ollamaBaseUrl: string;
  unloadBetweenRuns: boolean;
  gpuName?: string;
  /** A sentence about anything else holding the GPU, for the first status line. */
  note?: string;
  /** Where the Balance fader stood when the race was started. */
  balance?: number;
  /**
   * One model tested on its own, from its row on the Models screen. It renders
   * exactly as in a lineup and its result is saved the same way, but the last
   * race keeps its place on the leaderboard.
   */
  solo?: boolean;
};

/** How a test of one model reads when it ends. */
function soloVerdict(name: string, entry: LineupRecordEntry | undefined, stopped: boolean): string {
  if (!entry) return stopped ? `Stopped before ${name} finished.` : `${name} did not render.`;
  if (entry.error) return `${name} failed: ${entry.error}`;
  const time = formatVideoDuration(entry.elapsedMs / 1000);
  if (typeof entry.adherence === 'number') {
    return `${name} rendered in ${time}, and its middle frame matched ${Math.round(entry.adherence * 100)}% of the prompt.`;
  }
  return stopped
    ? `${name} rendered in ${time}. Stopped before the clip was checked.`
    : `${name} rendered in ${time}. Nothing checked the clip, so it is unjudged.`;
}

export async function startVideoLineup(options: StartLineupOptions): Promise<void> {
  if (session.running || options.entries.length === 0) return;
  const solo = options.solo && options.entries.length === 1
    ? { key: options.entries[0].key, name: options.entries[0].name }
    : null;
  // Claimed before the first await, so a second click cannot start a second lineup.
  update({ running: true, current: null, failed: false, solo, message: 'Checking that ComfyUI is free…' });

  // Asked before anything is submitted: queuing behind someone else's render
  // produces times that measure the queue.
  const busy = await describeComfyBusy().catch(() => null);
  if (busy) {
    update({ running: false, failed: true, message: busy });
    return;
  }

  const { entries, expected, promptId, customPrompt, gpuName = '' } = options;
  const seed = batchSeed();
  let record: LineupRecord = {
    id: `lineup-${Date.now()}`,
    prompt: imagePromptById(promptId, customPrompt).prompt,
    seed,
    gpu: gpuName,
    unloaded: options.unloadBetweenRuns,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stopped: false,
    planned: entries.map((entry) => ({ key: entry.key, name: entry.name })),
    entries: [],
    ...(typeof options.balance === 'number' ? { balance: options.balance } : {}),
  };
  const abort = new AbortController();
  controller = abort;
  // A test of one shows where it was started, and in its model's saved result.
  // The leaderboard keeps the last race.
  const show = (next: LineupRecord): Partial<LineupSession> => (solo ? {} : { record: next });
  update({
    ...show(record),
    message: solo
      ? `Starting ${solo.name}.${options.note ?? ''}`
      : `Starting ${entries.length} model${entries.length === 1 ? '' : 's'}.${options.note ?? ''}`,
  });

  let outcomes: LineupOutcome[];
  try {
    outcomes = await runVideoLineupLive({
      entries,
      promptId,
      customPrompt,
      judgeModel: options.judgeModel,
      ollamaBaseUrl: options.ollamaBaseUrl,
      seed,
      unloadBetweenRuns: options.unloadBetweenRuns,
      signal: abort.signal,
      onProgress: (progress) => {
        if (progress.phase === 'rendering') {
          update({
            current: {
              key: progress.entry.key,
              name: progress.entry.name,
              index: progress.index,
              total: progress.total,
              startedAt: Date.now(),
            },
            message: solo
              ? `Rendering ${progress.entry.name} on its own.`
              : `Rendering ${progress.index + 1} of ${progress.total}: ${progress.entry.name}.`,
          });
          return;
        }
        if (progress.phase === 'judging') {
          const judge = options.judgeModel ? ` with ${options.judgeModel}` : '';
          update({
            current: null,
            message: solo
              ? `${progress.entry.name} rendered. Checking its middle frame${judge}.`
              : `Every model has rendered. Checking the middle frame of ${progress.entry.name}${judge}.`,
          });
          return;
        }
        // Saved as each model finishes, not at the end: a lineup stopped or
        // crashed at hour two keeps what it had already rendered. A judged
        // result then replaces its unjudged one in place.
        if (!progress.result.error) {
          const result = toVideoLabResult(progress.result, promptId, customPrompt, {
            model: progress.entry.name,
            gpu: gpuName || undefined,
            lineupId: record.id,
          });
          writeAdvancedLabResults({ ...readAdvancedLabResults(), [`video:${progress.entry.key}`]: result });
        }
        const entry = lineupRecordEntry(progress.entry, progress.result, expected[progress.entry.key]);
        record = {
          ...record,
          entries: progress.phase === 'judged'
            ? record.entries.map((item) => (item.key === entry.key ? entry : item))
            : [...record.entries, entry],
        };
        if (!solo) saveLastLineup(record);
        update({ ...show(record), current: null });
      },
    });
  } catch (error) {
    controller = null;
    update({ running: false, current: null, failed: true, message: getErrorMessage(error) });
    return;
  }

  const before = readVideoCalibration();
  const calibration = calibrationFrom(outcomes, gpuName || undefined, before);
  if (calibration && calibration !== before) saveVideoCalibration(calibration);

  const stopped = abort.signal.aborted;
  record = { ...record, finishedAt: new Date().toISOString(), stopped };
  controller = null;
  if (solo) {
    const entry = record.entries[0];
    update({
      running: false,
      current: null,
      failed: Boolean(entry?.error),
      message: soloVerdict(solo.name, entry, stopped),
    });
    return;
  }
  saveLastLineup(record);
  const rendered = record.entries.filter((entry) => !entry.error).length;
  const failedCount = record.entries.length - rendered;
  update({
    running: false,
    current: null,
    record,
    failed: false,
    message: stopped
      ? `Stopped. ${rendered} of ${record.planned.length} rendered.`
      : `Lineup finished: ${rendered} rendered${failedCount ? `, ${failedCount} failed` : ''}.`,
  });
}

/** Ends the lineup now: ComfyUI is told to cancel the model in flight. */
export function stopVideoLineup(): void {
  if (!controller) return;
  controller.abort();
  update({ message: 'Stopping — ComfyUI is cancelling the model in flight.' });
}
