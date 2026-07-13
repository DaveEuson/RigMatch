/**
 * Advanced Lab / skill-test result layer: the shared types, localStorage
 * persistence, letter grading, and per-model artifact lookup. Extracted from
 * App.tsx so the skill-test viewers and the lab views can share one source of
 * truth. Pure + browser storage only — no React.
 */

import { ADVANCED_LAB_STORAGE_KEY } from './appConfig';
import { extractHtmlDocument } from './labPreview';
import { extractCodeBlock } from './codeChallenge';

/** A viewable thing a model produced during a skill test. */
export type DemoArtifact = {
  model: string;
  kind: 'app' | 'image' | 'vision' | 'code';
  html?: string | null;
  imageDataUrl?: string;
  description?: string;
  code?: string;
  language?: string;
  note?: string;
  grade: string;
  score: number;
};

/** One pass/fail line in a skill-test rubric. */
export type AdvancedLabCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

/** A stored skill-test result for one model + challenge. */
export type AdvancedLabResult = {
  model: string;
  challenge: 'app-builder' | 'image-generation' | 'image-recognition' | 'code';
  score: number;
  grade: string;
  elapsedMs: number;
  response: string;
  checks: AdvancedLabCheck[];
  completedAt: string;
  imageDataUrl?: string;
  width?: number;
  height?: number;
  language?: string;
  error?: string;
};

export function readAdvancedLabResults(): Record<string, AdvancedLabResult> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ADVANCED_LAB_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AdvancedLabResult>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeAdvancedLabResults(results: Record<string, AdvancedLabResult>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADVANCED_LAB_STORAGE_KEY, JSON.stringify(results));
  } catch {
    // local storage may be unavailable in preview contexts
  }
}

/**
 * Saved skill-test artifacts (built app, generated image, …) for one model, so
 * "what this model made" can be surfaced anywhere the model appears — Top Pick,
 * Scorecards, the models table, etc. Matches on result.model so it works
 * regardless of how each result was keyed in storage.
 */
export function getModelDemoArtifacts(model: string): DemoArtifact[] {
  if (!model) return [];
  const out: DemoArtifact[] = [];
  for (const result of Object.values(readAdvancedLabResults())) {
    if (!result || result.error || result.model !== model) continue;
    if (result.challenge === 'app-builder') {
      const html = extractHtmlDocument(result.response);
      if (html) out.push({ model, kind: 'app', html, grade: result.grade, score: result.score });
    } else if (result.challenge === 'image-generation' && result.imageDataUrl) {
      out.push({ model, kind: 'image', imageDataUrl: result.imageDataUrl, grade: result.grade, score: result.score });
    } else if (result.challenge === 'image-recognition' && result.response) {
      out.push({ model, kind: 'vision', imageDataUrl: result.imageDataUrl, description: result.response, grade: result.grade, score: result.score });
    } else if (result.challenge === 'code') {
      const code = extractCodeBlock(result.response);
      if (code) out.push({ model, kind: 'code', code, language: result.language, note: result.checks[0]?.detail, grade: result.grade, score: result.score });
    }
  }
  return out;
}

export function getAdvancedLabGrade(score: number) {
  if (score >= 92) return 'S';
  if (score >= 82) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
