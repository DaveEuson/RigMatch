/**
 * Guarded localStorage writes.
 *
 * localStorage.setItem throws — QuotaExceededError when the ~5MB budget is
 * spent, SecurityError when storage is blocked. Most of these writes happen
 * inside useEffect, where an uncaught throw takes the render down.
 *
 * The dangerous part is the cascade: the saved history holds every prompt and
 * full response for every tested model, so it is what fills the quota, and once
 * it is full every *other* write fails too — the tutorial flag, the theme, the
 * UI mode. One oversized transcript could take down unrelated state.
 *
 * Pure + browser storage only, no React.
 */

/** Everything RigMatch stores is namespaced, which is what makes a full wipe possible. */
export const APP_STORAGE_PREFIX = 'rigmatch:';

/**
 * Keys that survive "Clear Data", each needing a reason to be here — and each
 * needing the dialog to say so, because "cleared" must not quietly mean
 * "mostly cleared".
 *
 * Both entries are the same reason: which interface you use is not data about
 * your models, it is how you drive the app. Clearing your scores should not
 * demote an Advanced user to Simple Mode, and it should not re-ask a question
 * they already answered.
 */
const KEEP_ON_CLEAR = new Set<string>([
  // getSavedUiMode() falls back to 'beginner' when this is missing, so removing
  // it silently demotes the user on the next launch even if nothing resets the
  // mode in memory.
  'rigmatch:ui-mode:v1',
  // hasChosenInterfaceMode() is a bare presence check, so removing it brings the
  // first-launch Simple/Advanced splash back to ask again.
  'rigmatch:mode-splash:v1',
]);

/**
 * Remove every key this app has stored.
 *
 * "Clear Data" used to remove a hand-written list of six keys while the app
 * wrote twenty-four, and then reported "RigMatch app data cleared." Left behind
 * were the user's model notes, their run history, their goals, their ComfyUI
 * paths — and their OpenRouter API key, which is the one that matters: someone
 * clearing their data before passing the laptop on would reasonably expect a
 * stored credential to go with it.
 *
 * A hand-written list is how that happened, so this does not keep one. Anything
 * under the namespace goes, which means a key added tomorrow is covered without
 * anyone remembering to come back here.
 *
 * Keys are collected before any removal: localStorage.key(i) re-indexes as
 * entries disappear, so removing inside the loop skips every other key.
 */
export function clearAppStorage(): string[] {
  const doomed: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(APP_STORAGE_PREFIX) && !KEEP_ON_CLEAR.has(key)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Storage blocked entirely — nothing was stored, so nothing needs removing.
  }
  return doomed;
}

/** Write a string, returning false instead of throwing. */
export function writeLocal(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** JSON-serialize and write, returning false instead of throwing. */
export function writeLocalJson(key: string, value: unknown): boolean {
  try {
    return writeLocal(key, JSON.stringify(value));
  } catch {
    // Circular structures and BigInt throw in stringify, before storage.
    return false;
  }
}

/**
 * Write the first candidate that fits, smallest-effort first.
 *
 * `candidates` must be ordered most-complete first; each later entry should be a
 * lossier version of the same data. Returns the index that was written, or -1 if
 * even the last one failed. Building each candidate is deferred so the expensive
 * trims are only computed when actually needed.
 */
export function writeLocalJsonWithFallback(key: string, candidates: Array<() => unknown>): number {
  for (let i = 0; i < candidates.length; i += 1) {
    let payload: unknown;
    try {
      payload = candidates[i]();
    } catch {
      continue;
    }
    if (writeLocalJson(key, payload)) return i;
  }
  return -1;
}

/** The shape safeStorage needs to shrink a saved history; App owns the full type. */
type TrimmableHistory = {
  benchmark?: unknown;
  benchmarkByModel?: Record<string, { prompts?: Array<Record<string, unknown>> }> | undefined;
  chatMessagesByModel?: Record<string, unknown[]>;
  [key: string]: unknown;
};

/**
 * Drop saved answer text while keeping every score, timing and label.
 *
 * Transcripts are by far the largest part of a saved history and the least
 * costly to lose — the scores, grades and per-question numbers all survive, so
 * the app still renders a complete picture; only the verbatim answers go.
 */
export function dropTranscripts<T extends TrimmableHistory>(history: T): T {
  const byModel = history.benchmarkByModel;
  if (!byModel) return history;

  const trimmed: Record<string, unknown> = {};
  for (const [model, result] of Object.entries(byModel)) {
    const prompts = Array.isArray(result?.prompts) ? result.prompts : [];
    trimmed[model] = {
      ...result,
      prompts: prompts.map((prompt) => ({ ...prompt, prompt: '', response: '' })),
    };
  }
  return { ...history, benchmarkByModel: trimmed };
}

/** Drop saved chat transcripts, which are user-replaceable and often large. */
export function dropChat<T extends TrimmableHistory>(history: T): T {
  return { ...history, chatMessagesByModel: {} };
}
