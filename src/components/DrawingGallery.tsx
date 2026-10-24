// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { drawingDataUrl, drawingSubject, noDrawingReason } from '../lib/drawings';
import type { BenchmarkPromptResult, PromptDrawing } from '../types';
import './DrawingGallery.css';

/**
 * One drawing round picture, or a plain "No drawing" in its place.
 *
 * Only ever an <img> of the cleaned SVG (lib/drawings.ts): nothing in a
 * drawing can run or load from here. Carries no model name of its own, so the
 * stage can show it while names are hidden. A span, so it can sit inside a
 * label, as the blind pick's answers do.
 */
export function DrawingTile({ drawing, alt }: { drawing: PromptDrawing | undefined; alt: string }) {
  const src = drawingDataUrl(drawing?.svg);
  if (!src) {
    // Why, in words on the tile: a 0 under a blank square says nothing.
    const reason = noDrawingReason(drawing?.note);
    return (
      <span className="drawing-tile none">
        <b>No drawing</b>
        {reason && <small>{reason}</small>}
      </span>
    );
  }
  return (
    <span className="drawing-tile">
      <img className="drawing-picture" src={src} alt={alt} draggable={false} />
    </span>
  );
}

/** A drawing question's answer in a transcript: the picture, how it was scored, and the code behind it. */
export function DrawingAnswer({ prompt, by }: { prompt: BenchmarkPromptResult; by: string }) {
  return (
    <div className="drawing-answer">
      <DrawingTile drawing={prompt.drawing} alt={`Drawing by ${by}`} />
      {prompt.drawing?.note && <p className="drawing-note">{prompt.drawing.note}</p>}
      {prompt.response.trim() && (
        <details className="drawing-code">
          <summary>See the SVG it wrote</summary>
          <pre>{prompt.response.trim()}</pre>
        </details>
      )}
    </div>
  );
}

export type GalleryEntry = { key: string; name: string; drawing: PromptDrawing | undefined; score?: number };

/** Every contestant's drawing of the same subject, side by side. */
export function DrawingGallery({ prompt, entries }: { prompt: string | undefined; entries: GalleryEntry[] }) {
  if (entries.length === 0) return null;
  const subject = drawingSubject(prompt);
  return (
    <section className="drawing-gallery" aria-label="The drawing round">
      <h3>{subject ? `The drawing round: ${subject}` : 'The drawing round'}</h3>
      <ol>
        {entries.map((entry) => (
          <li key={entry.key}>
            <figure>
              <DrawingTile drawing={entry.drawing} alt={`Drawing by ${entry.name}`} />
              <figcaption>
                <span>{entry.name}</span>
                {/* Named and out of 100: a bare number under the Match board read as a Match. */}
                {entry.score != null && <b>Drawing {entry.score}/100</b>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  );
}
