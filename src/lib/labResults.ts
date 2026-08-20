// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Advanced Lab / skill-test result layer: the shared types, localStorage
 * persistence, letter grading, and per-model artifact lookup. Extracted from
 * App.tsx so the skill-test viewers and the lab views can share one source of
 * truth. Pure + browser storage only — no React.
 */

import { ADVANCED_LAB_STORAGE_KEY } from './appConfig.ts';
import { extractHtmlDocument } from './labPreview.ts';
import { extractCodeBlock } from './codeChallenge.ts';
import { describeLabFailure } from './labScoring.ts';

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
  // Whether an LLM judge actually graded this result (vs. only structural checks).
  // Undefined for kinds that aren't judged (image). False = structure-only.
  judged?: boolean;
  grade: string;
  score: number;
};

/** True when a result carries an actual judge verdict (the "Judged …" check). */
export function wasJudged(result: AdvancedLabResult): boolean {
  return (result.checks ?? []).some((check) => check.label.startsWith('Judged'));
}

/** One pass/fail line in a skill-test rubric. */
export type AdvancedLabCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

/** A stored skill-test result for one model + challenge. */
export type AdvancedLabResult = {
  model: string;
  challenge: 'app-builder' | 'image-generation' | 'video-generation' | 'image-recognition' | 'code' | 'listening';
  score: number;
  grade: string;
  elapsedMs: number;
  response: string;
  checks: AdvancedLabCheck[];
  completedAt: string;
  imageDataUrl?: string;
  /**
   * Where ComfyUI wrote the video, for a result that produced one. A reference
   * rather than the bytes: a few seconds of footage is megabytes and
   * localStorage would be full after a handful of runs.
   */
  videoRef?: { filename: string; subfolder: string; type: string };
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
      if (html) out.push({ model, kind: 'app', html, judged: wasJudged(result), grade: result.grade, score: result.score });
    } else if ((result.challenge === 'image-generation' || result.challenge === 'video-generation') && result.imageDataUrl) {
      // A video result's viewable artifact is its judged frame, so it rides the
      // image path; the label below still says which lab produced it.
      out.push({ model, kind: 'image', imageDataUrl: result.imageDataUrl, grade: result.grade, score: result.score });
    } else if (result.challenge === 'image-recognition') {
      // Kept even with no description: a failed vision run is exactly what a
      // user needs to inspect, and hiding it left the grade unexplained.
      out.push({ model, kind: 'vision', imageDataUrl: result.imageDataUrl, description: result.response, note: describeLabFailure(result), grade: result.grade, score: result.score });
    } else if (result.challenge === 'code') {
      const code = extractCodeBlock(result.response);
      if (code) out.push({ model, kind: 'code', code, language: result.language, note: result.checks?.[0]?.detail, judged: true, grade: result.grade, score: result.score });
    }
  }
  return out;
}

// Rubrics and grading live in labScoring.ts, a leaf module with no assets or
// storage so the grading logic stays directly testable. Re-exported so existing
// importers are unaffected.
export { describeLabFailure, getAdvancedLabGrade } from './labScoring.ts';
