import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { findGlossaryTerms, glossaryEntry } from '../lib/glossary';
import { InfoContext, useInfoControls } from '../lib/infoContext';

/**
 * What the Host is currently explaining.
 *
 * Modelled on Ableton Live's Info View — an explanation you have to ask for is
 * one a beginner never asks for, because they do not know which words they do
 * not know. So it is always on screen and fills in as the pointer moves.
 *
 * Rather than adding a panel for it, this feeds the Host: he is already the
 * voice of Simple Mode, already has a speech bubble, and is already at the top
 * of every step. He simply stops narrating and answers the question instead,
 * which costs no new furniture and reads as the character doing his job.
 *
 * Nothing here can move the layout — the bubble is a fixed slot, and a term
 * never changes size when pointed at.
 */

export function InfoViewProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | undefined>();
  const show = useCallback((next: string) => setId(next), []);
  const clear = useCallback(() => setId(undefined), []);
  const value = useMemo(
    () => ({ entry: id ? glossaryEntry(id) : undefined, show, clear }),
    [id, show, clear],
  );
  return <InfoContext.Provider value={value}>{children}</InfoContext.Provider>;
}

/**
 * A term the Host will explain when it is pointed at or tabbed to.
 *
 * A real button, so a keyboard reaches it and a screen reader announces it,
 * but styled as part of the sentence — a control that looks like a form field
 * mid-paragraph reads as something you are meant to type into.
 */
export function Explain({ id, children }: { id: string; children?: ReactNode }) {
  const { show, clear } = useInfoControls();
  const entry = glossaryEntry(id);
  if (!entry) return <>{children}</>;
  return (
    <button
      type="button"
      className="sw-explain-term"
      onMouseEnter={() => show(id)}
      onMouseLeave={clear}
      onFocus={() => show(id)}
      onBlur={clear}
      // Tapping is the touch equivalent of hovering, and pins the entry until
      // something else takes it.
      onClick={() => show(id)}
      aria-label={`${entry.term} — the host explains this above`}
    >
      {children ?? entry.term}
    </button>
  );
}

/**
 * Explain whatever glossary terms happen to appear in a runtime-built string.
 *
 * For copy the app assembles rather than the JSX spells out — a per-model fit
 * line, a formatted size, an error the main process worded. Text with no known
 * term renders exactly as it was passed in.
 */
export function ExplainText({ text }: { text: string }) {
  const hits = findGlossaryTerms(text);
  if (hits.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) parts.push(text.slice(cursor, hit.start));
    parts.push(<Explain key={hit.id} id={hit.id}>{text.slice(hit.start, hit.end)}</Explain>);
    cursor = hit.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
