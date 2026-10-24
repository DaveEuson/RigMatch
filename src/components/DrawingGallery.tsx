// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { drawingDataUrl, drawingSubject } from '../lib/drawings';
import type { BenchmarkPromptResult, PromptDrawing } from '../types';
import './DrawingGallery.css';

/**
 * One drawing round picture, or a plain "No drawing" in its place.
 *
 * Only ever an <img> of the cleaned SVG (lib/drawings.ts): nothing in a
 * drawing can run or load from here. Carries no model name of its own, so the
 * stage can show it while names are hidden.
 */
export function DrawingTile({ drawing, alt }: { drawing: PromptDrawing | undefined; alt: string }) {
  const src = drawingDataUrl(drawing?.svg);
  if (!src) {
    return (
      <div className="drawing-tile none" title={drawing?.note || undefined}>
        No drawing
      </div>
    );
  }
  return (
    <div className="drawing-tile">
      <img className="drawing-picture" src={src} alt={alt} draggable={false} />
    </div>
  );
}

/** A drawing question's answer in a transcript: the picture, how it was scored, and the code behind it. */
export function DrawingAnswer({ prompt }: { prompt: BenchmarkPromptResult }) {
  const subject = drawingSubject(prompt.prompt);
  return (
    <div className="drawing-answer">
      <DrawingTile drawing={prompt.drawing} alt={subject ? `Drawing of ${subject}` : 'Drawing'} />
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
              <DrawingTile drawing={entry.drawing} alt={`${entry.name}'s drawing${subject ? ` of ${subject}` : ''}`} />
              <figcaption>
                <span>{entry.name}</span>
                {entry.score != null && <b>{entry.score}</b>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  );
}
