// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Scoring how well a model heard something.
 *
 * This is the first quality measure in RigMatch that is not a proxy. Text
 * answers are graded by regex heuristics or by another model — the scoring
 * module says so itself, calling sobriety "a directional proxy, not a
 * ground-truth quality measurement". Transcription has a right answer: play
 * known speech, compare what came back, count the errors.
 *
 * The comparison has to be fair, though, or it measures formatting rather than
 * hearing. Feeding one synthesised sentence to gemma4:e2b produced:
 *
 *   native /api/chat  ->  "the pass code is zebra seven seven remember it"
 *   OpenAI /v1        ->  "The passcode is zebra 77 remember it"
 *
 * Both heard it perfectly. One spelled the digits, one wrote them; one split a
 * compound word. Word error rate over the raw strings would mark both down for
 * things that are not mistakes.
 */

/** Digits spoken one at a time, which is how a passcode is read aloud. */
const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const HOMOPHONES: Record<string, string> = {
  // Written out by some models, symbolised by others.
  percent: '%',
  and: '&',
  // "oh" for zero when reading digits aloud.
  oh: 'zero',
  nought: 'zero',
};

/**
 * Reduce a transcript to what was actually heard, discarding how it was
 * written down.
 *
 * Digit runs are expanded to individual words — "77" becomes "seven seven" —
 * because a spoken passcode is a sequence of digits and either rendering is
 * correct. This deliberately does not understand quantities: "seventy-seven"
 * stays two words and will not match "77". Benchmark scripts should read digits
 * out individually rather than as numbers, which is how the reference speech is
 * written.
 */
export function normalizeTranscript(text: string): string[] {
  return (text || '')
    .toLowerCase()
    // Strip anything that is not a letter, digit or space — punctuation,
    // markdown a model wrapped the answer in, quotes around the transcript.
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (/^\d+$/.test(word)
      ? [...word].map((digit) => DIGIT_WORDS[Number(digit)])
      : [HOMOPHONES[word] ?? word]))
    .filter(Boolean);
}

/** Levenshtein distance over words, which is what word error rate counts. */
function wordDistance(expected: string[], actual: string[]): number {
  // Only the previous row is ever needed, and a long transcript against a long
  // answer would otherwise allocate a full matrix.
  let previous = Array.from({ length: actual.length + 1 }, (_, i) => i);
  for (let i = 1; i <= expected.length; i++) {
    const current = [i];
    for (let j = 1; j <= actual.length; j++) {
      current[j] = expected[i - 1] === actual[j - 1]
        ? previous[j - 1]
        : 1 + Math.min(previous[j - 1], previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[actual.length];
}

export type TranscriptionAccuracy = {
  /** 0-100. The share of the reference the model got right. */
  score: number;
  /** Word error rate, 0-1 and uncapped in principle. */
  wordErrorRate: number;
  errors: number;
  referenceWords: number;
};

/**
 * How much of the reference the model actually heard.
 *
 * A model can produce more words than were spoken — padding the answer with
 * "the audio says:" — and word error rate counts those insertions, so the rate
 * can exceed 1. The score is clamped at zero rather than going negative.
 */
export function scoreTranscription(expected: string, actual: string): TranscriptionAccuracy {
  const reference = normalizeTranscript(expected);
  const heard = normalizeTranscript(actual);

  if (reference.length === 0) {
    return { score: 0, wordErrorRate: 1, errors: 0, referenceWords: 0 };
  }

  const errors = wordDistance(reference, heard);
  const wordErrorRate = errors / reference.length;
  return {
    score: Math.max(0, Math.round((1 - wordErrorRate) * 100)),
    wordErrorRate,
    errors,
    referenceWords: reference.length,
  };
}

/**
 * Models are asked to write down what they hear and often wrap it in a sentence
 * anyway. Pulling the quoted part out when there is one keeps the framing from
 * counting as errors, without requiring the model to obey perfectly.
 */
export function extractTranscript(response: string): string {
  const text = (response || '').trim();
  const quoted = text.match(/["“”']([^"“”']{4,})["“”']/);
  if (quoted) return quoted[1];

  // A short opening line is a preamble — "Sure!", "The audio says:" — and the
  // answer follows it. Anything else is left alone: a trailing "Hope that
  // helps" after a real answer must not be mistaken for the transcript, which
  // is what a plain last-line rule does.
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 2 && lines[0].split(/\s+/).length <= 4) return lines[1];
  return text;
}

/**
 * Shortest reference worth scoring.
 *
 * Word error rate is granular on a short sentence: against eight words, a model
 * that hears perfectly but writes "pass code" for "passcode" costs a
 * substitution and an insertion, and scores 75. The same slip against forty
 * words is 5. The reference has to be long enough that ordinary transcription
 * variance does not read as failure.
 */
export const MIN_REFERENCE_WORDS = 30;

export function isReferenceLongEnough(expected: string): boolean {
  return normalizeTranscript(expected).length >= MIN_REFERENCE_WORDS;
}
