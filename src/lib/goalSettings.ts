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

/** The default lens: the first goal picked, or none. */
export function primaryGoalId(): GoalId | undefined {
  return readSelectedGoals()[0];
}
