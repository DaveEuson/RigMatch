import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { glossaryEntry, type GlossaryEntry } from '../lib/glossary';

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

type InfoState = {
  entry?: GlossaryEntry;
  show: (id: string) => void;
  clear: () => void;
};

const InfoContext = createContext<InfoState>({ show: () => {}, clear: () => {} });

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

/** What the Host should be saying right now, if anything is being pointed at. */
export function useExplaining(): GlossaryEntry | undefined {
  return useContext(InfoContext).entry;
}

/**
 * A term the Host will explain when it is pointed at or tabbed to.
 *
 * A real button, so a keyboard reaches it and a screen reader announces it,
 * but styled as part of the sentence — a control that looks like a form field
 * mid-paragraph reads as something you are meant to type into.
 */
export function Explain({ id, children }: { id: string; children?: ReactNode }) {
  const { show, clear } = useContext(InfoContext);
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
