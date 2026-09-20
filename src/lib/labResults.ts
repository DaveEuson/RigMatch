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
import { withEarVerdict } from './earVerdict.ts';

/** A viewable thing a model produced during a skill test. */
export type DemoArtifact = {
  model: string;
  kind: 'app' | 'image' | 'vision' | 'code' | 'audio';
  html?: string | null;
  imageDataUrl?: string;
  /** Where ComfyUI left a made clip, fetched only when someone plays it. */
  audioRef?: { filename: string; subfolder: string; type: string };
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

/** One line in a result's rubric: a pass, a miss, or not checked at all. */
export type AdvancedLabCheck = {
  label: string;
  passed: boolean;
  detail: string;
  /**
   * Nothing measured this line: no judge or listener could answer, or it is
   * stated rather than scored. It reads Not checked, never Miss, and passed
   * stays false so nothing counts it as a pass.
   */
  unchecked?: boolean;
};

/** A stored skill-test result for one model + challenge. */
export type AdvancedLabResult = {
  model: string;
  challenge: 'app-builder' | 'image-generation' | 'video-generation' | 'audio-generation' | 'image-recognition' | 'code' | 'listening';
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
  /** Where ComfyUI wrote a generated clip of audio, fetched only when it is played. */
  audioRef?: { filename: string; subfolder: string; type: string };
  /** Seconds of audio a made clip holds, which its speed is measured against. */
  seconds?: number;
  /** What you said on listening to a made clip. Once given, it is the clip's accuracy. */
  verdict?: { matches: boolean; at: string };
  /** Why a clip that was listened to is still unjudged. */
  unjudgedReason?: string;
  width?: number;
  height?: number;
  language?: string;
  error?: string;
  /**
   * The GPU a video result was measured on. A lineup model's time replaces its
   * estimate on this machine only, since a time from another card is not this
   * machine's.
   */
  gpu?: string;
  /** Results from one lineup share this, so its leaderboard can be shown again. */
  lineupId?: string;
  /**
   * How much of the prompt the judge confirmed in a generated picture or a
   * video's middle frame, or how much of a test picture a description named,
   * 0 to 1; null when nothing could judge it. Kept apart from the score so the
   * Balance fader can weigh it against time directly.
   */
  adherence?: number | null;
  /**
   * Which of RigMatch's test pictures a reading test showed, so its
   * description is checked against what is in it and compared only with others
   * given the same picture. Absent for a picture you uploaded.
   */
  picture?: string;
  /** Where the Balance fader stood when this test started, 0 (speed) to 100 (accuracy). */
  balance?: number;
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
  resultsVersion += 1;
  for (const listener of resultListeners) listener();
}

/*
 * Lab results as something a screen can watch.
 *
 * Five places write results — the Lab cards, the lineup, the Run dialog's
 * skill tests — and the per-channel Top Match has to move the moment any of
 * them lands a new one. A counter bumped on every write says "changed", and the
 * parsed map is cached against it, so watching costs one parse per write rather
 * than one per render.
 */
let resultsVersion = 0;
const resultListeners = new Set<() => void>();
let resultsCache: { version: number; results: Record<string, AdvancedLabResult> } | null = null;

export function subscribeLabResults(listener: () => void): () => void {
  resultListeners.add(listener);
  return () => { resultListeners.delete(listener); };
}

/** The same object until the next write, as useSyncExternalStore requires. */
export function labResultsSnapshot(): Record<string, AdvancedLabResult> {
  if (!resultsCache || resultsCache.version !== resultsVersion) {
    resultsCache = { version: resultsVersion, results: readAdvancedLabResults() };
  }
  return resultsCache.results;
}

/**
 * Everything every model has made here, newest first.
 *
 * The artifacts existed per model and could only be found if you already knew
 * which model to look at — the app a contestant built was one click away from
 * a row nobody had a reason to open. This is the gallery's source: one list,
 * every app, picture, reading and program, with the model that made it.
 */
export function getAllDemoArtifacts(): Array<DemoArtifact & { at: string; challenge: AdvancedLabResult['challenge'] }> {
  const out: Array<DemoArtifact & { at: string; challenge: AdvancedLabResult['challenge'] }> = [];
  for (const result of Object.values(readAdvancedLabResults())) {
    if (!result || result.error) continue;
    for (const artifact of demoArtifactsFor(result)) {
      out.push({ ...artifact, at: result.completedAt, challenge: result.challenge });
    }
  }
  return out.sort((left, right) => right.at.localeCompare(left.at));
}

/** One result's viewable artifacts, if it produced any. */
function demoArtifactsFor(result: AdvancedLabResult): DemoArtifact[] {
  const model = result.model;
  if (result.challenge === 'app-builder') {
    const html = extractHtmlDocument(result.response);
    return html ? [{ model, kind: 'app', html, judged: wasJudged(result), grade: result.grade, score: result.score }] : [];
  }
  if ((result.challenge === 'image-generation' || result.challenge === 'video-generation') && result.imageDataUrl) {
    return [{ model, kind: 'image', imageDataUrl: result.imageDataUrl, grade: result.grade, score: result.score }];
  }
  if (result.challenge === 'image-recognition') {
    return [{
      model,
      kind: 'vision',
      imageDataUrl: result.imageDataUrl,
      description: result.response,
      note: describeLabFailure(result),
      grade: result.grade,
      score: result.score,
    }];
  }
  if (result.challenge === 'code') {
    const code = extractCodeBlock(result.response);
    return code
      ? [{ model, kind: 'code', code, language: result.language, note: result.checks?.[0]?.detail, judged: true, grade: result.grade, score: result.score }]
      : [];
  }
  // Sound was the one thing a model could make here that the gallery did not
  // hold, so "everything they made" quietly meant everything but the clips.
  if (result.challenge === 'audio-generation' && result.audioRef) {
    return [{ model, kind: 'audio', audioRef: result.audioRef, grade: result.grade, score: result.score }];
  }
  return [];
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
    // One extractor, not two. This was a line-for-line copy of demoArtifactsFor
    // and had already drifted: the gallery learned about made clips and the
    // per-model chips did not, so the same run was visible in one place and
    // missing from the other.
    out.push(...demoArtifactsFor(result));
  }
  return out;
}

/**
 * Record what you heard in a made clip, or take it back with null, on the saved
 * result it belongs to. Found by what identifies one run rather than by a key,
 * which the boards that show results do not have.
 */
export function recordEarVerdict(target: AdvancedLabResult, matches: boolean | null): void {
  if (target.challenge !== 'audio-generation') return;
  const results = readAdvancedLabResults();
  const key = Object.keys(results).find((candidate) => {
    const result = results[candidate];
    return result?.challenge === target.challenge
      && result.model === target.model
      && result.completedAt === target.completedAt;
  });
  if (!key) return;
  writeAdvancedLabResults({ ...results, [key]: withEarVerdict(results[key], matches) });
}

// Rubrics and grading live in labScoring.ts, a leaf module with no assets or
// storage so the grading logic stays directly testable. Re-exported so existing
// importers are unaffected.
export { checkState, describeLabFailure, getAdvancedLabGrade } from './labScoring.ts';
