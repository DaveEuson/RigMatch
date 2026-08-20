// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { MATCH_GRADE_BANDS } from './scoring';

/**
 * The reference tables behind "how we score".
 *
 * Data, not markup, so the explainer that renders it lives in its own
 * component. GRADE_ROWS used to sit beside MATCH_GRADE_BAND_ROWS as a plain
 * alias — two names for one table, each used exactly once — and has been
 * collapsed into the one name.
 */

export const SCORE_WEIGHTS = [
  { label: 'Quality', pct: 34, detail: 'Average per-prompt answer quality score (0–100). Measured by rule-based heuristics: does JSON parse? Does the truth-trap get a humble answer? Does the format match? No cloud AI judge — entirely local.' },
  { label: 'Speed', pct: 32, detail: 'Median tokens/sec across 3 timed runs on your hardware × 1.5, plus a bonus for responses under ~6 s. This reflects your machine, not some cloud baseline.' },
  { label: 'Reliability', pct: 18, detail: 'Percentage of prompts that returned a non-empty response. A model that crashes or stalls hurts here.' },
  { label: 'Computer Fit', pct: 16, detail: 'How well the model size matches a typical home rig. Tiny 1–3B models score highest (96); 70B+ models score lowest (38) unless you have 48 GB+ VRAM.' },
];

// Grade rows derived from the single canonical band list, so every table in the
// UI shows exactly the grades the engine assigns. Two hand-written tables used
// to disagree with each other and with gradeFor(), which let the app display a
// grade ("A-") that appeared in neither.
const GRADE_TONES: Record<string, string> = { S: 'elite', A: 'good', 'B+': 'good', B: 'good', C: 'ok', D: 'low' };
export const MATCH_GRADE_BAND_ROWS = MATCH_GRADE_BANDS.map((band, index) => {
  const upper = index === 0 ? 100 : MATCH_GRADE_BANDS[index - 1].min - 1;
  return {
    grade: band.grade,
    range: `${band.min}–${upper}`,
    tone: GRADE_TONES[band.grade] ?? 'ok',
  };
});
