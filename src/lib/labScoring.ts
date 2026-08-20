// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Skill-test rubrics and grading — pure functions, no assets, no React, no
 * storage. Split out of labChallenges.ts (which imports .webp art and the IPC
 * api) so the grading logic can be tested directly in Node.
 *
 * The rule these rubrics learned the hard way: a check that tests for the
 * ABSENCE of a bad signal passes trivially when the model returned nothing. Any
 * such check must be gated on the model having produced something first, or a
 * blank response collects free points.
 */

import type { AdvancedLabCheck, AdvancedLabResult } from './labResults.ts';
import { extractTranscript, scoreTranscription } from './transcription.ts';

export function getAdvancedLabGrade(score: number) {
  if (score >= 92) return 'S';
  if (score >= 82) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

type Scored = Pick<AdvancedLabResult, 'score' | 'grade' | 'checks'>;

function tally(checks: AdvancedLabCheck[]): Scored {
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { score, grade: getAdvancedLabGrade(score), checks };
}

/**
 * Grade a vision answer.
 *
 * "Engaged with the picture" and "Completed cleanly" both passed on an empty
 * string — no refusal wording present, no truncation stop — so a model that
 * returned nothing scored 2 of 4 and was presented as "50 · D".
 */
export function scoreAdvancedVisionResponse(response: string, doneReason: string): Scored {
  const text = (response ?? '').trim();
  const answered = text.length > 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return tally([
    {
      label: 'Returned an answer',
      passed: answered,
      detail: answered
        ? 'The model sent back text to grade.'
        : `Returned no text at all${doneReason ? ` (stop reason: ${doneReason})` : ''}. This model may not accept images through Ollama's vision API.`,
    },
    {
      label: 'Described the image',
      passed: answered && wordCount >= 12,
      detail: 'Returned a substantive description, not a one-liner or refusal.',
    },
    {
      label: 'Concrete visual detail',
      passed: answered && /\b(color|colour|robot|text|background|left|right|top|bottom|blue|green|orange|red|yellow|character|shape|screen|button|face|eye|logo)\b/i.test(text),
      detail: 'Names specific objects, colors, or layout instead of staying vague.',
    },
    {
      label: 'Engaged with the picture',
      passed: answered && !/\b(can'?t|cannot|unable to|no image|don'?t see)\b/i.test(text),
      detail: 'Actually read the image rather than declining or claiming no image.',
    },
    {
      label: 'Completed cleanly',
      passed: answered && doneReason !== 'length' && doneReason !== 'error',
      detail: 'Did not truncate or error mid-answer.',
    },
  ]);
}

// Image generation is scored in imageGenScoring.ts now. What stood here only
// ever asked whether a payload came back and whether it was valid base64 —
// three checks about the transport, none about the picture. It could not have
// been more, because Ollama never returned an image to look at.

/**
 * Why a skill test produced nothing to look at, in one line.
 *
 * A run can "succeed" — nothing thrown, a clean stop reason — and still return
 * an empty answer, which surfaced as a blank panel under a confident grade with
 * no way to tell whether the model refused, timed out, or simply cannot do the
 * task. Prefer the explicit error, then the first failed check's detail.
 */
export function describeLabFailure(result: Partial<AdvancedLabResult>): string | undefined {
  if (result?.error) return result.error;
  const failed = (result?.checks ?? []).find((check) => !check.passed);
  return failed ? failed.detail : undefined;
}

/**
 * Grade a transcription against the words that were actually spoken.
 *
 * Unlike every other scorer here, this one does not tally pass/fail checks into
 * a percentage — it reports a measurement. The reference speech is known, so
 * accuracy is the share of it the model got right, and a model that hears 90%
 * of a passage scores 90 rather than landing in whichever bucket a checklist
 * puts it. That is the reason the challenge exists: it is the only quality
 * number in RigMatch that is not a proxy.
 *
 * The checks are kept as explanation rather than as the score.
 */
export function scoreAdvancedListeningResponse(
  response: string,
  reference: string,
  doneReason: string,
): Scored {
  const heard = extractTranscript(response ?? '');
  const answered = heard.trim().length > 0;
  const accuracy = scoreTranscription(reference, heard);

  const checks: AdvancedLabCheck[] = [
    {
      label: 'Returned an answer',
      passed: answered,
      detail: answered
        ? 'The model sent back a transcript to compare.'
        : `Returned no text at all${doneReason ? ` (stop reason: ${doneReason})` : ''}. This model may not accept audio through Ollama.`,
    },
    {
      label: 'Heard the passage',
      passed: accuracy.score >= 50,
      detail: `${accuracy.errors} word${accuracy.errors === 1 ? '' : 's'} wrong out of ${accuracy.referenceWords}.`,
    },
    {
      label: 'Accurate transcription',
      passed: accuracy.score >= 85,
      detail: 'Within the variation you would expect between two people typing up the same recording.',
    },
  ];

  return { score: accuracy.score, grade: getAdvancedLabGrade(accuracy.score), checks };
}
