// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { MATCH_GRADE_BANDS } from './scoring.ts';

/**
 * The reference tables behind "how we score".
 *
 * Data, not markup, so the explainer that renders it lives in its own
 * component. GRADE_ROWS used to sit beside MATCH_GRADE_BAND_ROWS as a plain
 * alias — two names for one table, each used exactly once — and has been
 * collapsed into the one name.
 */

export const SCORE_WEIGHTS = [
  { label: 'Quality', pct: 34, detail: 'Average per-prompt answer quality score (0–100). Fixed rules check what can be checked: does the JSON parse, does the truth-trap get a humble answer, does the format match. Open-ended answers are marked by a judge model, a local one unless you chose a cloud judge. Answers nothing can mark, like everyday chat with no judge, are left out of the average.' },
  { label: 'Speed', pct: 32, detail: 'Average generation speed across the answers, scaled so 5 tokens a second scores 0 and 100 or more scores 100. This reflects your machine, not some cloud baseline.' },
  { label: 'Reliability', pct: 18, detail: 'The share of answers that finished cleanly: not empty, not failed, and not cut off at the token limit. A model that crashes, stalls or rambles past the limit hurts here. A drawing that ran out of time is not counted either way.' },
  { label: 'Computer Fit', pct: 16, detail: 'How big the model is, read from its name: up to 3B scores 96, up to 9B 88, up to 15B 74, up to 34B 58, larger 38, and 82 when the name has no size. It does not look at your graphics memory; the Fit grade on the Models list does.' },
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
