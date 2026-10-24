// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The names a blind show is hiding, for any component that draws a model.
 *
 * null when no blind show is on, which is every show unless the switch is set:
 * then every hook below hands names back untouched, so a default show renders
 * exactly as it did before blind mode existed.
 */
import { createContext, useCallback, useContext } from 'react';
import { maskName } from './blindMode.ts';

export type BlindMasking = {
  /** Model → "Contestant N", from blindNames(). */
  names: Map<string, string>;
};

export const BlindShowContext = createContext<BlindMasking | null>(null);

export function useBlindMasking(): BlindMasking | null {
  return useContext(BlindShowContext);
}

/** A model's name as the screen may show it right now. */
export function useBlindName(): (model: string) => string {
  const show = useContext(BlindShowContext);
  return useCallback((model: string) => (show ? maskName(model, show.names) : model), [show]);
}
