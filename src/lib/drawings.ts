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

import { useEffect, useState } from 'react';
import { agentArcadeApi } from '../api.ts';
import type { BenchmarkPromptResult, BenchmarkResult, PromptDrawing } from '../types.ts';
import { getBenchmarkForModel } from './modelCatalog.ts';

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
 * The show's drawings so far: by model, and by seat (the contestant's place in
 * the run, from its progress id), for a stage whose rows are renamed.
 */
export type ShowDrawings = { byModel: Record<string, PromptDrawing>; bySeat: Record<number, PromptDrawing> };

const NO_DRAWINGS: ShowDrawings = { byModel: {}, bySeat: {} };

/**
 * Each contestant's drawing in the show that is on, as it is drawn.
 *
 * From the progress updates rather than the results, because a contestant's
 * result arrives only after its last question and the stage should show the
 * picture the moment it exists.
 */
export function useShowDrawings(progressId: string | undefined): ShowDrawings {
  const showId = showIdOf(progressId);
  const [drawings, setDrawings] = useState<{ showId: string | null } & ShowDrawings>({ showId: null, ...NO_DRAWINGS });
  useEffect(() => {
    if (!showId || !agentArcadeApi.onBenchmarkProgress) return undefined;
    return agentArcadeApi.onBenchmarkProgress((update) => {
      const drawing = update.drawing;
      if (!drawing || !update.id?.startsWith(`${showId}-`)) return;
      const seat = Number(update.id.slice(showId.length + 1));
      setDrawings((current) => {
        const kept = current.showId === showId ? current : NO_DRAWINGS;
        return {
          showId,
          byModel: { ...kept.byModel, [update.model]: drawing },
          bySeat: Number.isInteger(seat) ? { ...kept.bySeat, [seat]: drawing } : kept.bySeat,
        };
      });
    });
  }, [showId]);
  return drawings.showId === showId ? drawings : NO_DRAWINGS;
}

export type LineupDrawing = { model: string; drawing: PromptDrawing; prompt: BenchmarkPromptResult };

/** Each model's first drawing in its latest result, in the order given; models with none are left out. */
export function lineupDrawings(models: string[], results: Record<string, BenchmarkResult>): LineupDrawing[] {
  return models.flatMap((model) => {
    const prompt = getBenchmarkForModel(results, model)?.prompts.find((entry) => entry.type === 'drawing' && entry.drawing);
    return prompt?.drawing ? [{ model, drawing: prompt.drawing, prompt }] : [];
  });
}
