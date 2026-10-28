// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Each model's latest context check on this PC, kept in this computer's
 * storage under the app's namespace, so Clear Data removes them with
 * everything else. One per model: a newer check replaces an older one, since
 * where a model gives out moves with the driver, the Ollama version and what
 * else was using the card, and an older reading would only mislead.
 */
import type { EnduranceResult } from './contextEndurance.ts';
import { writeLocalJson } from './safeStorage.ts';

export const ENDURANCE_KEY = 'rigmatch:context-endurance:v1';
/** Models with a saved check; the oldest go first. */
export const ENDURANCE_LIMIT = 12;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isStage(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string'
    && isNumber(value.numCtx) && isNumber(value.targetTokens) && isNumber(value.promptTokens) && isNumber(value.loadSeconds)
    && typeof value.passkeyKept === 'boolean' && typeof value.sizeOk === 'boolean';
}

/** One saved entry, checked: a bad one is dropped, never the whole list. */
export function isEnduranceResult(value: unknown): value is EnduranceResult {
  return isRecord(value) && typeof value.id === 'string' && typeof value.completedAt === 'string' && typeof value.model === 'string'
    && Array.isArray(value.stages) && value.stages.length > 0 && value.stages.every(isStage)
    && isRecord(value.verdict) && typeof value.verdict.headline === 'string' && typeof value.verdict.detail === 'string' && Array.isArray(value.verdict.notes)
    && isRecord(value.stamp) && typeof value.stamp.appVersion === 'string';
}

const newestFirst = (a: EnduranceResult, b: EnduranceResult) => b.completedAt.localeCompare(a.completedAt);

export function parseEnduranceResults(raw: unknown): EnduranceResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(isEnduranceResult).sort(newestFirst).filter((result) => !seen.has(result.model) && Boolean(seen.add(result.model)));
}

/** The list with a new check at the top, replacing the same model's older one, capped. */
export function addEnduranceResult(results: EnduranceResult[], result: EnduranceResult, limit = ENDURANCE_LIMIT): EnduranceResult[] {
  return [result, ...results.filter((entry) => entry.model !== result.model)].sort(newestFirst).slice(0, limit);
}

export function readEnduranceResults(): EnduranceResult[] {
  try {
    const text = window.localStorage.getItem(ENDURANCE_KEY);
    return text ? parseEnduranceResults(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function saveEnduranceResults(results: EnduranceResult[]): boolean {
  return writeLocalJson(ENDURANCE_KEY, results);
}
