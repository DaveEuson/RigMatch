// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Each model's latest pal check on this PC, kept in this computer's storage
 * under the app's namespace, so Clear Data removes them with everything else.
 * One per model: a newer chat replaces an older one.
 */
import type { PalResult } from './palCheck.ts';
import { writeLocalJson } from './safeStorage.ts';

export const PAL_KEY = 'rigmatch:pal-check:v1';
/** Models with a saved check; the oldest go first. */
export const PAL_LIMIT = 12;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function isTurn(value: unknown): boolean {
  return isRecord(value) && typeof value.kind === 'string' && typeof value.you === 'string' && typeof value.reply === 'string'
    && Array.isArray(value.tells) && value.tells.every((tell) => typeof tell === 'string');
}

/** One saved entry, checked: a bad one is dropped, never the whole list. */
export function isPalResult(value: unknown): value is PalResult {
  return isRecord(value) && typeof value.id === 'string' && typeof value.completedAt === 'string' && typeof value.model === 'string'
    && Array.isArray(value.turns) && value.turns.length > 0 && value.turns.every(isTurn)
    && isRecord(value.verdict) && typeof value.verdict.kind === 'string' && typeof value.verdict.headline === 'string'
    && typeof value.verdict.detail === 'string' && Array.isArray(value.verdict.notes)
    && isRecord(value.stamp) && typeof value.stamp.appVersion === 'string';
}

const newestFirst = (a: PalResult, b: PalResult) => b.completedAt.localeCompare(a.completedAt);

export function parsePalResults(raw: unknown): PalResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(isPalResult).sort(newestFirst).filter((result) => !seen.has(result.model) && Boolean(seen.add(result.model)));
}

/** The list with a new check at the top, replacing the same model's older one, capped. */
export function addPalResult(results: PalResult[], result: PalResult, limit = PAL_LIMIT): PalResult[] {
  return [result, ...results.filter((entry) => entry.model !== result.model)].sort(newestFirst).slice(0, limit);
}

export function readPalResults(): PalResult[] {
  try {
    const text = window.localStorage.getItem(PAL_KEY);
    return text ? parsePalResults(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function savePalResults(results: PalResult[]): boolean {
  return writeLocalJson(PAL_KEY, results);
}
