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

/**
 * Grade an image-generation attempt.
 *
 * A "Small beta size" check used to sit here asserting the configured width was
 * <= 512 — a constant in this repo, always true. It measured our own settings,
 * not the model, and handed every result a free quarter of its score.
 */
export function scoreAdvancedImageResponse(imageDataUrl: string, doneReason: string): Scored {
  const returned = (imageDataUrl ?? '').startsWith('data:image/');

  return tally([
    {
      label: 'Image returned',
      passed: returned,
      detail: returned
        ? 'Ollama returned an image payload instead of a text-only answer.'
        : `No image payload came back${doneReason ? ` (stop reason: ${doneReason})` : ''}. This model may not generate images through Ollama.`,
    },
    {
      label: 'PNG/base64 payload',
      passed: returned && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/.test(imageDataUrl),
      detail: 'The image payload looks like a browser-renderable base64 image.',
    },
    {
      label: 'Completed cleanly',
      passed: returned && doneReason !== 'length' && doneReason !== 'error',
      detail: 'The image run did not report an obvious truncation or error stop.',
    },
  ]);
}

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
