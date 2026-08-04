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
