// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What ComfyUI is rendering for RigMatch right now, wherever it was started.
 *
 * A test keeps running after the panel that started it closes, and after
 * someone moves to another screen, and nothing said so. Mochi was started from
 * its row, the panel was closed, and no screen showed that it was still
 * rendering, for how long, or how to stop it. Every render path reports here:
 * the video lineup and a video tested on its own, the picture and audio
 * comparisons and a clip made from a row, and a picture drawn from a row. The
 * status bar, the side menu, Activity and the model's own row all read it.
 *
 * Each path refuses to start while another holds the graphics card, so this is
 * one render or none.
 */

import type { AudioLineupSession } from './audioLineupSession.ts';
import type { ImageLineupSession } from './imageLineupSession.ts';
import type { LineupSession } from './videoLineupSession.ts';

export type RenderKind = 'video' | 'image' | 'audio';

export type RenderActivity = {
  kind: RenderKind;
  /** The catalogue id of a model tested from its row, so the row can say so. */
  key: string | null;
  /** The model at work now, or the one the run is about. */
  model: string | null;
  /**
   * Rendering, or checking: the judge or the listener at work, or ComfyUI
   * being asked whether it is free.
   */
  phase: 'rendering' | 'checking';
  /** Where it stands, in the words the test itself uses. */
  message: string;
  /** When the model at work started, for a running clock. */
  startedAt: number | null;
  /** Its place in a comparison, when it is one. */
  step: { index: number; total: number } | null;
  /** One model tested from its row, rather than a comparison. */
  solo: boolean;
  stop: () => void;
};

/** How the last render ended, kept until another one ends. */
export type RenderOutcome = {
  kind: RenderKind;
  message: string;
  failed: boolean;
  endedAt: number;
};

/** A picture being drawn from a model's row. The panel can close; the drawing carries on. */
export type ImageTestActivity = {
  key: string;
  name: string;
  startedAt: number;
  message: string;
  stop: () => void;
};

let imageTest: ImageTestActivity | null = null;
let imageTestOutcome: RenderOutcome | null = null;
const imageTestListeners = new Set<() => void>();

function emitImageTest(): void {
  for (const listener of imageTestListeners) listener();
}

export function subscribeImageTest(listener: () => void): () => void {
  imageTestListeners.add(listener);
  return () => { imageTestListeners.delete(listener); };
}

export function imageTestSnapshot(): ImageTestActivity | null {
  return imageTest;
}

/** The clock starts here rather than in the component that asked, which must render purely. */
export function startImageTest(test: Omit<ImageTestActivity, 'startedAt'>, startedAt: number = Date.now()): void {
  imageTest = { ...test, startedAt };
  emitImageTest();
}

/** A new line of progress, for the test still running under this key. */
export function describeImageTest(key: string, message: string): void {
  if (imageTest?.key !== key) return;
  imageTest = { ...imageTest, message };
  emitImageTest();
}

/** Only the test that started under this key can end it. How it ended is kept, when it says. */
export function endImageTest(
  key: string,
  outcome?: { message: string; failed: boolean },
  endedAt: number = Date.now(),
): void {
  if (imageTest?.key !== key) return;
  imageTest = null;
  if (outcome) imageTestOutcome = { kind: 'image', ...outcome, endedAt };
  emitImageTest();
}

export function imageTestOutcomeSnapshot(): RenderOutcome | null {
  return imageTestOutcome;
}

export type RenderSessions = {
  video: Pick<LineupSession, 'running' | 'current' | 'message' | 'solo'>;
  image: Pick<ImageLineupSession, 'running' | 'current' | 'message' | 'run'>;
  audio: Pick<AudioLineupSession, 'running' | 'current' | 'message' | 'run' | 'solo'>;
  imageTest: ImageTestActivity | null;
};

/** The render in flight across every path, or null when ComfyUI is idle for RigMatch. */
export function renderActivityFrom(
  { video, image, audio, imageTest: drawing }: RenderSessions,
  stops: Record<'video' | 'image' | 'audio', () => void>,
): RenderActivity | null {
  if (video.running) {
    const current = video.current;
    return {
      kind: 'video',
      key: current?.key ?? video.solo?.key ?? null,
      model: current?.name ?? video.solo?.name ?? null,
      phase: current ? 'rendering' : 'checking',
      message: video.message,
      startedAt: current?.startedAt ?? null,
      step: current && current.total > 1 ? { index: current.index, total: current.total } : null,
      solo: Boolean(video.solo),
      stop: stops.video,
    };
  }
  if (audio.running) {
    const current = audio.current;
    const planned = audio.run?.planned ?? [];
    const index = current ? planned.findIndex((entry) => entry.key === current.key) : -1;
    return {
      kind: 'audio',
      key: current?.key ?? audio.solo?.key ?? null,
      model: current?.name ?? audio.solo?.name ?? null,
      phase: current ? 'rendering' : 'checking',
      message: audio.message,
      startedAt: current?.startedAt ?? null,
      step: index >= 0 && planned.length > 1 ? { index, total: planned.length } : null,
      solo: Boolean(audio.solo),
      stop: stops.audio,
    };
  }
  if (image.running) {
    const current = image.current;
    const planned = image.run?.planned ?? [];
    const index = current ? planned.findIndex((entry) => entry.checkpoint === current.checkpoint) : -1;
    return {
      kind: 'image',
      // A comparison of pictures is keyed by file, and is no one row's test.
      key: null,
      model: current?.name ?? null,
      phase: current ? 'rendering' : 'checking',
      message: image.message,
      startedAt: current?.startedAt ?? null,
      step: index >= 0 && planned.length > 1 ? { index, total: planned.length } : null,
      solo: false,
      stop: stops.image,
    };
  }
  if (drawing) {
    return {
      kind: 'image',
      key: drawing.key,
      model: drawing.name,
      phase: 'rendering',
      message: drawing.message,
      startedAt: drawing.startedAt,
      step: null,
      solo: true,
      stop: drawing.stop,
    };
  }
  return null;
}

type Ended = { running: boolean; message: string; failed: boolean; endedAt: number | null };

/**
 * How the most recent render ended, whichever path it took.
 *
 * A render that fails twenty-five minutes in, with its panel closed, must still
 * say so somewhere. Each path stamps when it ended, so the newest verdict wins
 * and an older one never passes for it. A run in progress has no verdict yet.
 */
export function lastRenderOutcome({ video, image, audio, imageTestOutcome: drawn }: {
  video: Ended;
  image: Ended;
  audio: Ended;
  imageTestOutcome: RenderOutcome | null;
}): RenderOutcome | null {
  const ended: RenderOutcome[] = [];
  const add = (kind: RenderKind, session: Ended) => {
    if (session.running || session.endedAt === null || !session.message) return;
    ended.push({ kind, message: session.message, failed: session.failed, endedAt: session.endedAt });
  };
  add('video', video);
  add('image', image);
  add('audio', audio);
  if (drawn) ended.push(drawn);
  return ended.reduce<RenderOutcome | null>(
    (latest, outcome) => (!latest || outcome.endedAt > latest.endedAt ? outcome : latest),
    null,
  );
}

/** What the status bar calls it: Rendering, Drawing, Making audio, or Checking. */
export function renderLabel(activity: Pick<RenderActivity, 'kind' | 'phase'>): string {
  if (activity.phase === 'checking') return 'Checking';
  if (activity.kind === 'video') return 'Rendering';
  return activity.kind === 'image' ? 'Drawing' : 'Making audio';
}

/** The channel whose screens show it. */
export function renderChannel(kind: RenderKind): 'video' | 'images' | 'audio' {
  return kind === 'image' ? 'images' : kind;
}
