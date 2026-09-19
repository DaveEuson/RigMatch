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
import { NOT_IN_ANY_PICTURE, PICTURE_PASS, checkDescription, listThings, type PictureCheck } from './pictureContents.ts';
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

type VisionScored = Scored & {
  /**
   * How much of the test picture the description named, 0 to 1, or null for a
   * picture RigMatch did not choose and so cannot check.
   */
  adherence: number | null;
};

/** What the "Named what is in the picture" line says. */
function describeNamed(check: PictureCheck): string {
  const total = check.things.length;
  if (check.named.length === 0) return `Named none of the ${total} things in it: ${listThings(check.things)}.`;
  const said = check.named.length === total
    ? `Named all ${total}: ${listThings(check.named)}.`
    : `Named ${check.named.length} of ${total}: ${listThings(check.named)}. Missed ${listThings(check.missed)}.`;
  const made = check.madeUp.length;
  if (made === 0) return said;
  return `${said} ${made === 1 ? 'The one thing it made up takes one back.' : `The ${made} things it made up take ${made} back.`}`;
}

/**
 * Grade a vision answer.
 *
 * "Engaged with the picture" and "Completed cleanly" both passed on an empty
 * string — no refusal wording present, no truncation stop — so a model that
 * returned nothing scored 2 of 4 and was presented as "50 · D".
 *
 * Shape alone let Gemma 4 score 100 for describing Java code on a white
 * background when it was shown a wall of robots. For one of RigMatch's own test
 * pictures the score is a measurement, as listening's is: the share of the
 * picture's five things the description names, less one for anything it made
 * up (pictureContents.ts). The checks explain the number. A picture someone
 * uploaded has nothing to check against, so it keeps the shape checks and its
 * description is unjudged.
 */
export function scoreAdvancedVisionResponse(response: string, doneReason: string, picture?: string): VisionScored {
  const text = (response ?? '').trim();
  const answered = text.length > 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const returned: AdvancedLabCheck = {
    label: 'Returned an answer',
    passed: answered,
    detail: answered
      ? 'The model sent back text to grade.'
      : `Returned no text at all${doneReason ? ` (stop reason: ${doneReason})` : ''}. This model may not accept images through Ollama's vision API.`,
  };
  const engaged: AdvancedLabCheck = {
    label: 'Engaged with the picture',
    passed: answered && !/\b(can'?t|cannot|unable to|no image|don'?t see)\b/i.test(text),
    detail: 'Actually read the image rather than declining or claiming no image.',
  };
  const clean: AdvancedLabCheck = {
    label: 'Completed cleanly',
    passed: answered && doneReason !== 'length' && doneReason !== 'error',
    detail: 'Did not truncate or error mid-answer.',
  };

  const check = picture ? checkDescription(picture, text) : null;
  if (!check) {
    const shaped = tally([
      returned,
      {
        label: 'Described the image',
        passed: answered && wordCount >= 12,
        detail: 'Returned a substantive description, not a one-liner or refusal.',
      },
      {
        // `colou?r` on purpose: this reads the MODEL's answer, not our prose,
        // and a model describing a picture writes whichever spelling it was
        // trained on. The American-English sweep flattened it to `color|color`
        // and quietly stopped crediting every model that writes "colour".
        label: 'Concrete visual detail',
        passed: answered && /\b(colou?r|robot|text|background|left|right|top|bottom|blue|green|orange|red|yellow|character|shape|screen|button|face|eye|logo)\b/i.test(text),
        detail: 'Names specific objects, colors, or layout instead of staying vague.',
      },
      engaged,
      clean,
    ]);
    return {
      ...shaped,
      checks: [...shaped.checks, {
        label: 'Named what is in the picture',
        passed: false,
        unchecked: true,
        detail: 'RigMatch knows what is in its own test pictures, not in one you chose, so it cannot say whether this description is right.',
      }],
      adherence: null,
    };
  }

  const share = answered ? check.share : 0;
  const score = Math.round(share * 100);
  return {
    score,
    grade: getAdvancedLabGrade(score),
    adherence: share,
    checks: [
      returned,
      {
        label: 'Named what is in the picture',
        passed: answered && share >= PICTURE_PASS,
        detail: answered ? describeNamed(check) : 'There was no description to check.',
      },
      {
        label: 'Said nothing that is not there',
        passed: answered && check.madeUp.length === 0,
        detail: !answered
          ? 'There was no description to check.'
          : check.madeUp.length > 0
            ? `Described ${listThings(check.madeUp)}, which the picture does not have.`
            : `Mentioned none of the things these pictures never show: ${listThings(NOT_IN_ANY_PICTURE, 'or')}.`,
      },
      engaged,
      clean,
    ],
  };
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
  const failed = (result?.checks ?? []).find((check) => checkState(check) === 'failed');
  return failed ? failed.detail : undefined;
}

/**
 * Whether a check passed, missed, or was never checked. A line nothing could
 * judge read Miss beside a board that called the same result unjudged, and it
 * is neither: nobody looked.
 */
export function checkState(check: AdvancedLabCheck): 'passed' | 'failed' | 'unchecked' {
  if (check.unchecked) return 'unchecked';
  return check.passed ? 'passed' : 'failed';
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
/**
 * Whether a "transcript" is really one token stuck on repeat.
 *
 * Gemma 4 e4b, handed the listening audio, returns "le le le le le" thirty
 * times over — and the panel called that PASS, "returned an answer", because
 * text had arrived. Text had arrived; an answer had not. A model that emits a
 * single syllable until it runs out of budget has failed in a way worth naming,
 * and calling it an answer sends people looking for a transcription problem
 * when the model never transcribed anything.
 *
 * Deliberately narrow. Real speech repeats — "very, very good", a stammer, a
 * list of the same word — so this only fires when almost the whole output is
 * one short token, over a length no genuine passage would sustain.
 */
export function isDegenerateTranscript(text: string): boolean {
  const words = (text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;

  const unique = new Set(words);
  // One or two distinct short tokens filling a long output is not language.
  if (unique.size > 2) return false;
  return [...unique].every((word) => word.length <= 4);
}

/**
 * Whether a clean transcript is simply of something else.
 *
 * The listening score compares what the model wrote against the script, so
 * reading a different sentence scores near zero — correctly, and for a reason
 * that looks exactly like the model failing. It has now caught the same person
 * twice: a flawless transcript of "My name is Dave and I am in San Diego"
 * scored 6/100, and every visible signal said the model had failed.
 *
 * Sharing almost no words with the script, while still being fluent language,
 * is the signature. A genuine mishearing keeps most of the words and gets some
 * wrong; a different sentence has nothing in common with the passage at all.
 */
export function looksOffScript(reference: string, heard: string): boolean {
  const words = (text: string) => (text ?? '').toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const referenceWords = words(reference);
  const heardWords = words(heard);
  // Too little of either to draw a conclusion from.
  if (referenceWords.length < 6 || heardWords.length < 4) return false;

  const referenceSet = new Set(referenceWords);
  const shared = heardWords.filter((word: string) => referenceSet.has(word)).length;
  // Even a badly misheard passage keeps a good share of its words. Below a
  // fifth, the model was almost certainly given something else to hear.
  return shared / heardWords.length < 0.2;
}

export function scoreAdvancedListeningResponse(
  response: string,
  reference: string,
  doneReason: string,
): Scored {
  const heard = extractTranscript(response ?? '');
  const degenerate = isDegenerateTranscript(heard);
  const answered = heard.trim().length > 0 && !degenerate;
  const accuracy = scoreTranscription(reference, heard);

  const checks: AdvancedLabCheck[] = [
    {
      label: 'Returned an answer',
      passed: answered,
      detail: answered
        ? 'The model sent back a transcript to compare.'
        : degenerate
          ? 'Returned the same short token over and over rather than a transcript. '
            + 'That is this model failing to handle the audio at all, not a mishearing — try another model that reports it can listen.'
          : `Returned no text at all${doneReason ? ` (stop reason: ${doneReason})` : ''}. This model may not accept audio through Ollama.`,
    },
    {
      label: 'Heard the passage',
      passed: accuracy.score >= 50,
      // A transcript of something else is not a mishearing, and saying so
      // spares people hunting a fault in a model that heard them perfectly.
      detail: answered && looksOffScript(reference, heard)
        ? `${accuracy.errors} word${accuracy.errors === 1 ? '' : 's'} wrong out of ${accuracy.referenceWords} — `
          + 'but this transcript shares almost nothing with the script, which usually means something '
          + 'else was said. If that is what you read, the model heard you correctly and the score is '
          + 'measuring the difference rather than the model. Read the script word for word to score it.'
        : `${accuracy.errors} word${accuracy.errors === 1 ? '' : 's'} wrong out of ${accuracy.referenceWords}.`,
    },
    {
      label: 'Accurate transcription',
      passed: accuracy.score >= 85,
      detail: 'Within the variation you would expect between two people typing up the same recording.',
    },
  ];

  return { score: accuracy.score, grade: getAdvancedLabGrade(accuracy.score), checks };
}
