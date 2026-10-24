// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Blind mode: the show with the names hidden, and the taste ranking it builds.
 *
 * With blind mode on, contestants are "Contestant 1, 2, 3…" until the show
 * ends, the viewer picks the answers they liked best, and only then are the
 * names and scores revealed. Each pick counts as the picked model beating
 * every other contestant in that show, and those wins add up into an Elo
 * rating per model: the viewer's own ranking, next to the judge's.
 *
 * Only blind picks count. A pick made with the names showing measures which
 * name the viewer already liked, which is the thing blind mode exists to
 * take out.
 *
 * Pure + browser storage only, no React.
 */
import { writeLocal, writeLocalJson } from './safeStorage.ts';
import { normalizeModelKey } from './modelKey.ts';
import { getFriendlyModelName } from './modelCatalog.ts';

/** The switch on the lineup screen, remembered between runs. Off unless set. */
export const BLIND_MODE_STORAGE_KEY = 'rigmatch:blind-mode:v1';
/** Every blind pick, so ratings can be recomputed after a model is cleared. */
export const BLIND_TASTE_STORAGE_KEY = 'rigmatch:blind-taste:v1';
export const BLIND_TASTE_SCHEMA_VERSION = 1;

/** Where every model starts, and how far one pick moves it. Standard chess Elo. */
export const ELO_START = 1000;
export const ELO_K = 32;
/** Oldest picks go first past this; a ranking needs recent taste, not all of it. */
export const MAX_BLIND_PICKS = 500;

/** Fired on window after the saved picks change, so open rankings re-read them. */
export const BLIND_TASTE_EVENT = 'rigmatch:blind-taste-changed';

export type BlindPick = {
  /** ISO time the pick was made. */
  at: string;
  /** The model the viewer picked. */
  picked: string;
  /** Every contestant in that show, the picked one included. */
  contestants: string[];
};

export type BlindTaste = {
  version: number;
  picks: BlindPick[];
};

export type TasteRow = {
  model: string;
  rating: number;
  /** Shows where the viewer picked this model. */
  wins: number;
  /** Blind shows this model was in. */
  shows: number;
};

export function emptyBlindTaste(): BlindTaste {
  return { version: BLIND_TASTE_SCHEMA_VERSION, picks: [] };
}

/** The name shown in place of a model's, by its place in the lineup. */
export function blindLabel(index: number): string {
  return `Contestant ${index + 1}`;
}

/**
 * Model name → "Contestant N", keyed by every spelling the show uses for it.
 *
 * The show passes names around both as typed ("qwen3:8b") and normalized, so
 * both go in; a lookup that misses one spelling would leak the name.
 */
export function blindNames(lineup: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  lineup.forEach((model, index) => {
    const label = blindLabel(index);
    names.set(model, label);
    names.set(normalizeModelKey(model), label);
  });
  return names;
}

/** The label for one model, or the model itself when it is not in the lineup. */
export function maskName(model: string, names: Map<string, string>): string {
  return names.get(model) ?? names.get(normalizeModelKey(model)) ?? model;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** What a name shared by two seats becomes: either seat would be a guess, and a wrong one. */
const SHARED_NAME = 'a contestant';

/**
 * Replace every lineup name inside free text, for lines built before masking
 * could reach them: activity notes, host lines, log lines.
 *
 * Longest names first, so "qwen3:14b" is not half-replaced by "qwen3". Also
 * matches the name without its ":latest" tag, with "-" or "_" for ":", and
 * the friendly name the screens print ("Qwen3"), because that is how some
 * lines spell it. Only whole names: "phi" must not turn "philosophy" into
 * "Contestant 1losophy". Two seats can share a friendly name (qwen3:8b and
 * qwen3:14b are both "Qwen3"), and that one becomes "a contestant".
 */
export function maskText(text: string, names: Map<string, string>): string {
  if (!text || names.size === 0) return text;
  const spellings = new Map<string, string>();
  for (const [model, label] of names) {
    const bare = model.replace(/:latest$/i, '');
    for (const spelling of [model, bare, bare.replace(/:/g, '-'), bare.replace(/:/g, '_'), getFriendlyModelName(model)]) {
      if (spelling.length < 2) continue;
      const key = spelling.toLowerCase();
      const had = spellings.get(key);
      spellings.set(key, had === undefined || had === label ? label : SHARED_NAME);
    }
  }
  const ordered = [...spellings.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?<![a-z0-9])(?:${ordered.map(escapeRegExp).join('|')})(?![a-z0-9])`, 'gi');
  return text.replace(pattern, (match: string, offset: number) => {
    const label = spellings.get(match.toLowerCase()) ?? match;
    const opensSentence = offset === 0 || /[.!?]\s+$/.test(text.slice(0, offset));
    return label === SHARED_NAME && opensSentence ? 'A contestant' : label;
  });
}

/**
 * The lineup in a random order, for a blind show's seats.
 *
 * The viewer chose the lineup, so seats in the order they chose it would make
 * "Contestant 1" their first pick by name. Fisher–Yates; `random` is for tests.
 */
export function shuffleLineup<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * The lineup as a blind show draws it: in seat order, each row renamed to its
 * seat. Renaming the row itself, rather than every place that prints it, is
 * what keeps the avatar generic and the "is this the one answering?" checks
 * working, since the progress below is renamed the same way. Rows that are not
 * in the show keep their names.
 */
export function maskRows<T extends { displayName: string }>(rows: readonly T[], lineup: readonly string[], names: Map<string, string>): T[] {
  const seat = (row: T) => {
    const index = lineup.findIndex((model) => normalizeModelKey(model) === normalizeModelKey(row.displayName));
    return index < 0 ? lineup.length : index;
  };
  return [...rows]
    .sort((a, b) => seat(a) - seat(b))
    .map((row) => (names.has(row.displayName) || names.has(normalizeModelKey(row.displayName))
      ? { ...row, displayName: maskName(row.displayName, names) }
      : row));
}

/** The parts of a run's progress a blind show needs renamed or hidden. */
export type MaskableProgress = {
  currentModel: string;
  label: string;
  message: string;
  lastResult?: unknown;
  questionScores?: Record<string, number>;
  questionJudge?: string;
  failedModels?: Array<{ model: string; reason: string }>;
};

/**
 * A run's progress with the contestants renamed and the live scores gone.
 *
 * lastResult and questionScores are a contestant's score as it lands, which is
 * the judge's verdict arriving before the viewer has made theirs.
 *
 * The judge goes too. A model never marks its own answers, so on the turn of
 * the contestant who is usually the judge, the judge changes, and the Run
 * sheet has already said who the judge is: "Contestant 3 is marking it" and
 * then another name on seat 3's turn is seat 3's name.
 */
export function maskProgress<T extends MaskableProgress>(progress: T, names: Map<string, string>): T {
  const { lastResult: _lastResult, questionScores: _questionScores, questionJudge: _questionJudge, ...rest } = progress;
  return {
    ...rest,
    currentModel: maskName(progress.currentModel, names),
    label: maskText(progress.label, names),
    // The run's own lines (main.cjs) say "Coding scored 78." as each answer is
    // marked, and name the judge as they mark.
    message: maskText(progress.message, names)
      .replace(/\bscored \d+(?:\.\d+)?(?:\s*\([^)]*\))?/gi, 'has been marked')
      .replace(/^.+? is marking (.+?)'s answer\./, "$1's answer is being marked.")
      .replace(/^Judge .+? stopped answering;/, 'The judge stopped answering;'),
    ...(progress.failedModels
      ? { failedModels: progress.failedModels.map((failure) => ({ ...failure, model: maskName(failure.model, names), reason: maskText(failure.reason, names) })) }
      : {}),
  } as T;
}

/** The chance the Elo model gives `rating` of beating `opponent`. */
export function eloExpected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/**
 * Ratings from the picks, oldest first.
 *
 * Each pick is the picked model beating every other contestant once. All the
 * games in one pick are scored against the ratings from before it, so the
 * order the losers are listed in cannot change the result.
 */
export function rateTaste(picks: readonly BlindPick[]): TasteRow[] {
  const rows = new Map<string, TasteRow>();
  const row = (model: string): TasteRow => {
    const key = normalizeModelKey(model);
    let found = rows.get(key);
    if (!found) {
      found = { model, rating: ELO_START, wins: 0, shows: 0 };
      rows.set(key, found);
    }
    return found;
  };

  for (const pick of picks) {
    const winner = row(pick.picked);
    const losers = pick.contestants
      .filter((model) => normalizeModelKey(model) !== normalizeModelKey(pick.picked))
      .map(row);
    if (losers.length === 0) continue;
    const before = new Map([winner, ...losers].map((r) => [r, r.rating]));
    let gain = 0;
    for (const loser of losers) {
      const delta = ELO_K * (1 - eloExpected(before.get(winner)!, before.get(loser)!));
      gain += delta;
      loser.rating -= delta;
    }
    winner.rating += gain;
    winner.wins += 1;
    for (const r of [winner, ...losers]) r.shows += 1;
  }

  return [...rows.values()]
    .map((r) => ({ ...r, rating: Math.round(r.rating) }))
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.model.localeCompare(b.model));
}

/**
 * Add one pick. Returns the taste unchanged when the pick cannot count: fewer
 * than two distinct contestants, or a pick that was not one of them.
 */
export function recordBlindPick(taste: BlindTaste, picked: string, contestants: readonly string[], at = new Date().toISOString()): BlindTaste {
  const seen = new Set<string>();
  const lineup = contestants.filter((model) => {
    const key = normalizeModelKey(model);
    if (!model || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (lineup.length < 2 || !seen.has(normalizeModelKey(picked))) return taste;
  const picks = [...taste.picks, { at, picked, contestants: lineup }];
  return { version: BLIND_TASTE_SCHEMA_VERSION, picks: picks.slice(-MAX_BLIND_PICKS) };
}

/**
 * Take models out of every pick, for "Clear score" on one model.
 *
 * A pick the cleared model won is dropped whole: it no longer says anything
 * about the others. A pick it lost keeps counting for the rest, unless only
 * the winner would be left.
 */
export function removeModelsFromTaste(taste: BlindTaste, aliases: readonly string[]): BlindTaste {
  const gone = new Set(aliases.map(normalizeModelKey));
  let changed = false;
  const picks: BlindPick[] = [];
  for (const pick of taste.picks) {
    if (gone.has(normalizeModelKey(pick.picked))) {
      changed = true;
      continue;
    }
    const contestants = pick.contestants.filter((model) => !gone.has(normalizeModelKey(model)));
    if (contestants.length !== pick.contestants.length) changed = true;
    if (contestants.length >= 2) picks.push(contestants.length === pick.contestants.length ? pick : { ...pick, contestants });
  }
  return changed ? { version: BLIND_TASTE_SCHEMA_VERSION, picks } : taste;
}

function isBlindPick(value: unknown): value is BlindPick {
  if (!value || typeof value !== 'object') return false;
  const pick = value as Record<string, unknown>;
  return typeof pick.at === 'string'
    && typeof pick.picked === 'string'
    && Array.isArray(pick.contestants)
    && pick.contestants.every((model) => typeof model === 'string');
}

export function readBlindTaste(): BlindTaste {
  if (typeof window === 'undefined') return emptyBlindTaste();
  try {
    const raw = window.localStorage.getItem(BLIND_TASTE_STORAGE_KEY);
    if (!raw) return emptyBlindTaste();
    const parsed = JSON.parse(raw) as Partial<BlindTaste>;
    if (!parsed || parsed.version !== BLIND_TASTE_SCHEMA_VERSION || !Array.isArray(parsed.picks)) return emptyBlindTaste();
    // Per pick: one bad row should not cost the rest.
    return { version: BLIND_TASTE_SCHEMA_VERSION, picks: parsed.picks.filter(isBlindPick) };
  } catch {
    return emptyBlindTaste();
  }
}

export function writeBlindTaste(taste: BlindTaste): boolean {
  const written = writeLocalJson(BLIND_TASTE_STORAGE_KEY, taste);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BLIND_TASTE_EVENT));
  return written;
}

/**
 * Save one pick. False when it could not be: storage full or blocked, or a
 * pick that cannot count. The reveal says so rather than "saved".
 */
export function saveBlindPick(picked: string, contestants: readonly string[]): boolean {
  const taste = readBlindTaste();
  const next = recordBlindPick(taste, picked, contestants);
  return next !== taste && writeBlindTaste(next);
}

/**
 * What to say about a pick after it was saved, or not: the same promise
 * historySaveNote keeps for scores, that a failed save is never silent.
 */
export function blindPickSaveNote(saved: boolean): string {
  return saved
    ? 'Your pick is saved to Your taste on Results.'
    : 'RigMatch could not save your pick: there is no storage space left for it. Clearing old scores or chats in Settings makes room.';
}

/**
 * How many saved picks a clear would change: every pick for "Clear all
 * scores" (aliases null), or the picks a model was in for its own "Clear score".
 */
export function countBlindPicks(taste: BlindTaste, aliases: readonly string[] | null): number {
  if (!aliases) return taste.picks.length;
  const keys = new Set(aliases.map(normalizeModelKey));
  return taste.picks.filter((pick) => pick.contestants.some((model) => keys.has(normalizeModelKey(model)))).length;
}

/** For "Clear all scores" and "Clear all data": the picks go with the scores. */
export function clearBlindTaste(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(BLIND_TASTE_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was saved to clear.
  }
  window.dispatchEvent(new Event(BLIND_TASTE_EVENT));
}

/** Drop one model from the saved picks, for "Clear score". */
export function clearModelFromBlindTaste(aliases: readonly string[]): void {
  const taste = readBlindTaste();
  const next = removeModelsFromTaste(taste, aliases);
  if (next !== taste) writeBlindTaste(next);
}

export function readBlindModeOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(BLIND_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeBlindModeOn(on: boolean): void {
  writeLocal(BLIND_MODE_STORAGE_KEY, on ? '1' : '0');
}
