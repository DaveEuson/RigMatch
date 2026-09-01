// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestionType } from '../benchmarkSuite';

/**
 * What the current question is testing, in words a beginner reads as a skill.
 *
 * This existed as a chain of regexes over the question's *label* with
 * 'Everyday questions' as the catch-all. Every question in the Difficult
 * Subjects suite is labelled by its subject — "Tiananmen 1989", "Tank Man",
 * "Xinjiang", "Tulsa 1921", "Armenian genocide" — and not one of those matches
 * /json|tool|accuracy|trap|truth|instruction|coding|code|summar|reason|safety|
 * boundary|format|structure/. So all eight fell through, and Simple Mode
 * announced a live Tiananmen Square question as "Everyday questions".
 *
 * The question already carries the answer. `type` is a closed set of seven and
 * is what the scoring, the task matrix and the judge rubric all key off; the
 * label is free text a user can edit in the suite editor. Reading the label to
 * guess the type was inferring a fact that was sitting right next to it.
 *
 * Keyed as a total Record, so adding an eighth question type fails to compile
 * here rather than silently defaulting to the blandest entry — which is exactly
 * how the bug this replaces behaved.
 */
export const ROUND_LABELS: Record<BenchmarkQuestionType, string> = {
  json: 'Following a precise format',
  format: 'Keeping answers well-organised',
  truth: 'Admitting what it doesn’t know',
  assistant: 'Everyday questions',
  coding: 'Writing a bit of code',
  writing: 'Writing something well',
  candour: 'Difficult subjects',
};

/**
 * Null when there is nothing to say, never a guess.
 *
 * The caller shows its own neutral wording. A default that names a category is
 * how a question about the Tiananmen Square massacre came to be captioned as
 * everyday chat: a specific claim is the one thing an unknown must not make.
 */
export function roundLabel(type: BenchmarkQuestionType | null | undefined): string | null {
  if (!type) return null;
  return ROUND_LABELS[type] ?? null;
}
