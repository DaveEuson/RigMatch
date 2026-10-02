// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { getModelFamily } from './modelOrigins.ts';
import { normalizeModelKey } from './modelKey.ts';

/**
 * Achievements: small badges for using the parts of RigMatch people miss.
 *
 * Each one names something worth trying, so a locked badge doubles as a hint:
 * "Fair judge: run a show with a judge model" is the judge feature, found.
 *
 * They are read from what RigMatch already keeps — run history, the latest
 * answers, the Lab's saved results, the computer's platform — so nothing new
 * is tracked and nothing leaves this PC. Someone upgrading gets credit for
 * what they have already done.
 *
 * Once earned, a badge is stored with its date and never taken back. The
 * evidence it came from does not last: run history keeps 200 runs, the
 * latest answers keep one result per model, and a badge that vanished when a
 * model was retested on a different set would be worse than none.
 */

export type AchievementId =
  | 'first-date'
  | 'speed-dater'
  | 'second-date'
  | 'fair-judge'
  | 'hands-on'
  | 'thick-skin'
  | 'picture-this'
  | 'say-it'
  | 'penguin'
  | 'trojan-hero';

export type Achievement = {
  id: AchievementId;
  title: string;
  /** How to earn it, written as the thing to try. */
  how: string;
  /** What earning it took, said once it has been: "You finished your first show." */
  done: string;
  /** Shown as "???" until earned, with `hint` in place of `how`. */
  hidden?: boolean;
  hint?: string;
  /** What earning it unlocks, if anything beyond the badge. */
  reward?: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-date', title: 'First date', how: 'Finish your first show.', done: 'You finished your first show.' },
  { id: 'speed-dater', title: 'Speed dater', how: 'Test five different models.', done: 'You tested five different models.' },
  { id: 'second-date', title: 'Second date', how: 'Test a model again and see what changed.', done: 'You tested a model again to see what changed.' },
  { id: 'fair-judge', title: 'Fair judge', how: 'Run a show with a judge model marking the answers.', done: 'You ran a show with a judge model marking the answers.' },
  { id: 'hands-on', title: 'Hands on', how: 'Run the Tools & Automations questions.', done: 'You ran the Tools & Automations questions.' },
  { id: 'thick-skin', title: 'Thick skin', how: 'Run Harmless but Edgy or Difficult Subjects.', done: 'You ran Harmless but Edgy or Difficult Subjects.' },
  { id: 'picture-this', title: 'Picture this', how: 'Make a picture with ComfyUI.', done: 'You made a picture with ComfyUI.' },
  { id: 'say-it', title: 'Say it out loud', how: 'Make a sound or a song with ComfyUI.', done: 'You made a sound or a song with ComfyUI.' },
  { id: 'penguin', title: 'Penguin', how: 'Run RigMatch on Linux.', done: 'You ran RigMatch on Linux.' },
  {
    id: 'trojan-hero',
    title: 'Trojan hero',
    how: 'Test Ajax, the agent model made for Odysseus.',
    done: 'You tested Ajax, the agent model made for Odysseus.',
    hidden: true,
    hint: 'Hidden. It has something to do with a hero of Troy.',
    reward: 'Unlocks the Trojan stage.',
  },
];

/** Five is the size of a lineup that has really been shopping around. */
export const SPEED_DATER_MODELS = 5;

/** What the badges are read from. Each part is optional: any one can be missing. */
export type AchievementEvidence = {
  /** Every model with a finished run, once per run. */
  runs?: Array<{ model: string }>;
  /** The latest answers kept per model. */
  results?: Array<{ prompts?: Array<{ type?: string; scoredBy?: string }> }>;
  /** The Lab challenges with a saved result, e.g. "image-generation". */
  labChallenges?: string[];
  /** The computer's platform, as the system scan reports it. */
  platform?: string;
};

export function earnedFrom(evidence: AchievementEvidence): AchievementId[] {
  const earned = new Set<AchievementId>();
  const runs = evidence.runs ?? [];
  const perModel = new Map<string, number>();
  for (const run of runs) {
    const key = normalizeModelKey(run.model);
    if (!key) continue;
    perModel.set(key, (perModel.get(key) ?? 0) + 1);
    if (getModelFamily(run.model) === 'ajax') earned.add('trojan-hero');
  }
  if (perModel.size > 0) earned.add('first-date');
  if (perModel.size >= SPEED_DATER_MODELS) earned.add('speed-dater');
  if ([...perModel.values()].some((count) => count >= 2)) earned.add('second-date');

  for (const result of evidence.results ?? []) {
    for (const prompt of result.prompts ?? []) {
      if (prompt.scoredBy === 'judge') earned.add('fair-judge');
      if (prompt.type === 'tools') earned.add('hands-on');
      if (prompt.type === 'edgy' || prompt.type === 'candour') earned.add('thick-skin');
    }
  }

  const lab = new Set(evidence.labChallenges ?? []);
  if (lab.has('image-generation')) earned.add('picture-this');
  if (lab.has('audio-generation')) earned.add('say-it');
  if (/linux/i.test(evidence.platform ?? '')) earned.add('penguin');

  return ACHIEVEMENTS.map((a) => a.id).filter((id) => earned.has(id));
}

export const ACHIEVEMENTS_STORAGE_KEY = 'rigmatch:achievements:v1';

export type AchievementState = {
  /** When each badge was earned. */
  earned: Partial<Record<AchievementId, string>>;
  /** Badges already announced, so each "unlocked" note shows once. */
  seen: AchievementId[];
};

const EMPTY: AchievementState = { earned: {}, seen: [] };
const KNOWN = new Set<string>(ACHIEVEMENTS.map((a) => a.id));

/** Unknown ids and malformed entries are dropped, never trusted. */
export function readAchievementState(raw: string | null): AchievementState {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as { earned?: unknown; seen?: unknown } | null;
    const earned: AchievementState['earned'] = {};
    if (parsed?.earned && typeof parsed.earned === 'object') {
      for (const [id, at] of Object.entries(parsed.earned as Record<string, unknown>)) {
        if (KNOWN.has(id) && typeof at === 'string') earned[id as AchievementId] = at;
      }
    }
    const seen = Array.isArray(parsed?.seen)
      ? (parsed.seen as unknown[]).filter((id): id is AchievementId => typeof id === 'string' && KNOWN.has(id))
      : [];
    return { earned, seen };
  } catch {
    return EMPTY;
  }
}

/** Adds newly earned badges, keeping the first date of any already held. */
export function withEarned(state: AchievementState, ids: AchievementId[], at: string): AchievementState {
  const fresh = ids.filter((id) => !state.earned[id]);
  if (fresh.length === 0) return state;
  const earned = { ...state.earned };
  for (const id of fresh) earned[id] = at;
  return { ...state, earned };
}

/** Earned and not yet announced, in shelf order. */
export function unannounced(state: AchievementState): Achievement[] {
  return ACHIEVEMENTS.filter((a) => state.earned[a.id] && !state.seen.includes(a.id));
}

function load(): AchievementState {
  try { return readAchievementState(localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY)); } catch { return EMPTY; }
}

let current: AchievementState = load();
const listeners = new Set<() => void>();

function commit(next: AchievementState) {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}

/**
 * Records whatever the evidence shows.
 *
 * `quiet` is for the look the app takes as it opens: anything found then was
 * earned before this launch, so it goes on the shelf without an "Achievement
 * unlocked" note. Someone upgrading with fifty runs behind them should not be
 * congratulated for last month.
 */
export function recordAchievements(
  evidence: AchievementEvidence,
  options: { quiet?: boolean; at?: string } = {},
) {
  const next = withEarned(current, earnedFrom(evidence), options.at ?? new Date().toISOString());
  if (next === current) return;
  const fresh = (Object.keys(next.earned) as AchievementId[]).filter((id) => !current.earned[id]);
  commit(options.quiet ? { ...next, seen: [...new Set([...next.seen, ...fresh])] } : next);
}

export function markAchievementsSeen(ids: AchievementId[]) {
  const seen = [...new Set([...current.seen, ...ids])];
  if (seen.length === current.seen.length) return;
  commit({ ...current, seen });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAchievements(): AchievementState {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY);
}

export function achievementSnapshot(): AchievementState {
  return current;
}
