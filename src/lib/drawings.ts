// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The drawing round in the window: showing the pictures, and drawing one to a
 * PNG for a judge that can see.
 *
 * The main process finds, checks and cleans every drawing
 * (electron/drawingRound.cjs) and stores only the cleaned SVG. This side only
 * ever puts that SVG in an <img> by a data: URL, where an SVG runs no script
 * and loads nothing from outside, whatever is in it.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { agentArcadeApi } from '../api.ts';
import type { BenchmarkProgressUpdate, BenchmarkResult, PromptDrawing, ShowDrawing } from '../types.ts';

/**
 * Twice the main process's cap on what a model wrote, since cleaning spells
 * out every self-closed tag. A longer string did not come from there.
 */
const DRAWING_MAX_CHARS = 64000;

/** The drawing as an <img> source, or null when there is nothing safe to show. */
export function drawingDataUrl(svg: string | null | undefined): string | null {
  if (!svg || svg.length > DRAWING_MAX_CHARS || !svg.startsWith('<svg')) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Why there is no drawing, from its note ("No drawing: the SVG draws nothing." → "The SVG draws nothing."). */
export function noDrawingReason(note: string | undefined): string {
  const reason = (note ?? '').replace(/^No drawing:\s*/, '').trim();
  return reason ? reason[0].toUpperCase() + reason.slice(1) : '';
}

/** "a pelican riding a bicycle", from a built-in drawing question; null for any other wording. */
export function drawingSubject(prompt: string | undefined): string | null {
  return /^Generate an SVG of (.+?)\. Reply with/.exec(prompt ?? '')?.[1] ?? null;
}

/**
 * The drawing as a square PNG (base64, no data: prefix) on white paper, for a
 * judge that can see. Null when it will not draw.
 */
export async function drawingPng(svg: string, size = 512): Promise<string | null> {
  // A checked drawing's root keeps its viewBox and loses its own width and
  // height, so sizing it here fits the picture to the square, centred.
  const url = drawingDataUrl(svg.replace(/^<svg\b/, `<svg width="${size}" height="${size}"`));
  if (!url) return null;
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  // SVGs assume paper. Left transparent, the background reaches a vision
  // model as black, and dark lines on it vanish.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png').split(',')[1] ?? null;
}

/** Answers the main process when a judge that can see needs a drawing as a picture. Mounted once, in App. */
export function useDrawingPictureResponder(): void {
  useEffect(() => {
    if (!agentArcadeApi.onDrawingPictureRequest) return undefined;
    return agentArcadeApi.onDrawingPictureRequest(({ id, svg }) => {
      void drawingPng(svg)
        .catch(() => null)
        .then((png) => agentArcadeApi.reportDrawingPicture?.({ id, png }))
        .catch(() => undefined);
    });
  }, []);
}

/**
 * The show a run belongs to. runListTest numbers each contestant's run under
 * one show id (`<show>-0`, `<show>-1`, ... and `<show>-complete`).
 */
export function showIdOf(progressId: string | undefined): string | null {
  return progressId ? progressId.replace(/-(?:\d+|complete)$/, '') : null;
}

/**
 * A show's drawings so far: by model, and by seat (the contestant's place in
 * the run, from its progress id), for a stage whose rows are renamed.
 */
export type ShowDrawings = { showId: string | null; byModel: Record<string, PromptDrawing>; bySeat: Record<number, PromptDrawing> };

const NO_DRAWINGS: ShowDrawings = { showId: null, byModel: {}, bySeat: {} };

/** The drawings after one progress update; a drawing from another show starts them over. */
export function addShowDrawing(current: ShowDrawings, update: Pick<BenchmarkProgressUpdate, 'id' | 'model' | 'drawing'>): ShowDrawings {
  const showId = showIdOf(update.id);
  if (!update.drawing || !showId) return current;
  const kept = current.showId === showId ? current : NO_DRAWINGS;
  const seat = Number(update.id.slice(showId.length + 1));
  return {
    showId,
    byModel: { ...kept.byModel, [update.model]: update.drawing },
    bySeat: Number.isInteger(seat) ? { ...kept.bySeat, [seat]: update.drawing } : kept.bySeat,
  };
}

/**
 * The drawings of the latest show, kept while the app is open. Collected here
 * rather than by the stage: the stage unmounts when the show is minimized,
 * and came back from Show with no pictures.
 */
let showDrawings = NO_DRAWINGS;
const showDrawingListeners = new Set<() => void>();
const subscribeToShowDrawings = (listener: () => void) => {
  showDrawingListeners.add(listener);
  return () => { showDrawingListeners.delete(listener); };
};

/** Collects each show's drawings as they are drawn. Mounted once, in App. */
export function useShowDrawingCollector(): void {
  useEffect(() => {
    if (!agentArcadeApi.onBenchmarkProgress) return undefined;
    return agentArcadeApi.onBenchmarkProgress((update) => {
      const next = addShowDrawing(showDrawings, update);
      if (next === showDrawings) return;
      showDrawings = next;
      showDrawingListeners.forEach((listener) => listener());
    });
  }, []);
}

/**
 * Each contestant's drawing in the show a progress id belongs to, from the
 * moment it is drawn: a contestant's result arrives only after its last
 * question, and the stage shows the picture as soon as it exists.
 */
export function useShowDrawings(progressId: string | undefined): ShowDrawings {
  const drawings = useSyncExternalStore(subscribeToShowDrawings, () => showDrawings);
  return drawings.showId !== null && drawings.showId === showIdOf(progressId) ? drawings : NO_DRAWINGS;
}

/**
 * A show's drawings by model, from its results: the first drawing each gave.
 * A drawing nothing marked keeps no score: the number stored then is a
 * placeholder, and under the picture it would read as a verdict.
 */
export function showDrawingsFrom(results: BenchmarkResult[]): Record<string, ShowDrawing> | undefined {
  const entries = results.flatMap((result): Array<[string, ShowDrawing]> => {
    const prompt = result.prompts.find((entry) => entry.type === 'drawing' && entry.drawing);
    if (!prompt?.drawing) return [];
    return [[result.model, { drawing: prompt.drawing, prompt: prompt.prompt, ...(prompt.scoredBy === 'unjudged' ? {} : { score: prompt.sobrietyScore }) }]];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export type GalleryDrawing = ShowDrawing & { model: string };

/** A show's drawings in the order given; models without one are left out. */
export function galleryDrawings(models: string[], drawings: Record<string, ShowDrawing> | undefined): GalleryDrawing[] {
  return models.flatMap((model) => (drawings?.[model] ? [{ model, ...drawings[model] }] : []));
}
