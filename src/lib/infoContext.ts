// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { createContext, useContext } from 'react';
import type { GlossaryEntry } from './glossary';

/**
 * The channel between a pointed-at term and the Host who explains it.
 *
 * Split out of InfoView.tsx so that file exports only components: a module
 * mixing components with hooks defeats fast refresh, which silently costs
 * every edit in the wizard a full reload.
 */

export type InfoState = {
  /** What is being pointed at right now, if anything. */
  entry?: GlossaryEntry;
  show: (id: string) => void;
  clear: () => void;
};

export const InfoContext = createContext<InfoState>({ show: () => {}, clear: () => {} });

/** What the Host should be saying right now, if anything is being pointed at. */
export function useExplaining(): GlossaryEntry | undefined {
  return useContext(InfoContext).entry;
}

/** Handles for a term to raise and drop itself. */
export function useInfoControls(): Pick<InfoState, 'show' | 'clear'> {
  const { show, clear } = useContext(InfoContext);
  return { show, clear };
}
