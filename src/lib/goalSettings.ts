// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Which goals this person chose, first pick foremost.
 *
 * Stored as an ordered list because the order carries meaning: the first
 * selection becomes the primary goal — the default lens for Models and the
 * wizard — and the rest widen the field without steering it. Multi-select is
 * allowed but the splash discourages it, since one goal gets one clear
 * winner and every extra goal spreads testing time thinner.
 */

import { GOALS, type GoalId } from './goals.ts';

export const GOALS_STORAGE_KEY = 'rigmatch:goals:v1';

/**
 * That the goal question has been PUT to this person, whatever they answered.
 *
 * Separate from the answer itself, because "asked and skipped" and "never
 * asked" need different behaviour: the first must not be nagged, the second
 * must not be silently skipped.
 */
export const GOALS_OFFERED_STORAGE_KEY = 'rigmatch:goals-offered:v1';

const VALID_IDS = new Set<string>(GOALS.map((goal) => goal.id));

export function readSelectedGoals(): GoalId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GOALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Order-preserving and validated: a goal renamed in a future release
    // simply drops out rather than crashing the splash or the filters.
    return parsed.filter((id): id is GoalId => typeof id === 'string' && VALID_IDS.has(id));
  } catch {
    return [];
  }
}

export function writeSelectedGoals(ids: readonly GoalId[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage disabled; the choice simply does not persist across launches.
  }
}

/**
 * What the app owes this person on launch.
 *
 * 'goals-and-mode' is a true first run: ask what they want, then how to show
 * it. 'goals-only' is the upgrade case and the reason this function exists —
 * someone arriving from a version before goals existed already answered the
 * mode question, so the old gate (`has a mode been chosen?`) said "nothing to
 * ask" and skipped the goal step entirely. Every existing user would have
 * upgraded into 0.6 with its headline feature switched off, reachable only by
 * finding Settings on their own.
 */
export type FirstRunStep = 'goals-and-mode' | 'goals-only' | 'none';

export function firstRunStep(store: {
  modeChosen: boolean;
  goalsOffered: boolean;
}): FirstRunStep {
  if (!store.modeChosen) return 'goals-and-mode';
  if (!store.goalsOffered) return 'goals-only';
  return 'none';
}

export function hasBeenOfferedGoals(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(GOALS_OFFERED_STORAGE_KEY) != null; }
  catch { return true; }
}

export function markGoalsOffered(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(GOALS_OFFERED_STORAGE_KEY, 'yes'); }
  catch { /* storage disabled; the question simply gets asked again */ }
}

/** The default lens: the first goal picked, or none. */
export function primaryGoalId(): GoalId | undefined {
  return readSelectedGoals()[0];
}
