// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';

/**
 * The show's optional extras: a theme song during Speed Dating, and the
 * corny effects (curtains, walk-ons, the applause sign, hearts, flashing
 * bulbs). Both off unless someone turns them on — the show's look is for
 * everyone, its noise and bounce are opt-in.
 *
 * One small store rather than props: the switches live beside the host in
 * Simple Mode, in Settings, and on Advanced's live stage, and all three have
 * to agree the moment one of them changes.
 */
export interface ShowExtras {
  music: boolean;
  effects: boolean;
}

export const SHOW_EXTRAS_STORAGE_KEY = 'rigmatch:show-extras:v1';
const OFF: ShowExtras = { music: false, effects: false };

/** Anything but an explicit `true` is off. */
export function readShowExtras(raw: string | null): ShowExtras {
  if (!raw) return OFF;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof ShowExtras, unknown>> | null;
    return { music: parsed?.music === true, effects: parsed?.effects === true };
  } catch {
    return OFF;
  }
}

function load(): ShowExtras {
  try { return readShowExtras(localStorage.getItem(SHOW_EXTRAS_STORAGE_KEY)); } catch { return OFF; }
}

let current: ShowExtras = load();
const listeners = new Set<() => void>();

export function setShowExtras(patch: Partial<ShowExtras>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(SHOW_EXTRAS_STORAGE_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useShowExtras(): ShowExtras {
  return useSyncExternalStore(subscribe, () => current, () => OFF);
}
