// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { useAchievements } from './achievements.ts';

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
  /**
   * Which stage the show plays on. The Trojan stage is earned (the Trojan
   * hero achievement, for testing Ajax) and picked here once it is; until
   * then the studio is the only stage, whatever is stored.
   */
  stage: ShowStage;
}

export type ShowStage = 'studio' | 'trojan';

export const SHOW_EXTRAS_STORAGE_KEY = 'rigmatch:show-extras:v1';
const OFF: ShowExtras = { music: false, effects: false, stage: 'studio' };

/** Anything but an explicit `true` is off. */
export function readShowExtras(raw: string | null): ShowExtras {
  if (!raw) return OFF;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof ShowExtras, unknown>> | null;
    return {
      music: parsed?.music === true,
      effects: parsed?.effects === true,
      stage: parsed?.stage === 'trojan' ? 'trojan' : 'studio',
    };
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

/** The stage to draw: the one picked, if it has been earned, else the studio. */
export function resolveStage(picked: ShowStage, trojanEarned: boolean): ShowStage {
  return picked === 'trojan' && trojanEarned ? 'trojan' : 'studio';
}

export function useShowStage(): ShowStage {
  const { stage } = useShowExtras();
  const { earned } = useAchievements();
  return resolveStage(stage, Boolean(earned['trojan-hero']));
}
