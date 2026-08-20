// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Scripts for the listening test, and where a reference transcript comes from.
 *
 * The listening test is the only measurement in RigMatch with a right answer.
 * Sobriety is a heuristic, image adherence is a judge's opinion; this one plays
 * known speech and counts the words that came back wrong. That only works while
 * the script is known in advance, which is what decides how each audio source
 * behaves:
 *
 *   sample  — the bundled recording, script known, scored.
 *   record  — the user reads one of these aloud, so the script is known and
 *             the run is scored exactly like the sample.
 *   upload  — arbitrary audio with no reference. Scored only if the user says
 *             what it contains; otherwise the transcript is shown and the
 *             accuracy is reported as unavailable rather than invented.
 *
 * Guessing a reference by asking a second model what the audio said would make
 * the test measure agreement between two models, which is not what it claims
 * to measure.
 */

/** Below this, ordinary transcription variance reads as failure. */
export const MIN_SCRIPT_WORDS = 30;

export type ListeningScript = { id: string; label: string; text: string };

/**
 * Read-aloud scripts, in the voice of the show.
 *
 * Digits are written as separate words because the scorer treats "77" as
 * "seven seven" and deliberately does not understand quantities — "seventy
 * seven" would never match. Each script is comfortably over thirty words, for
 * the same reason the bundled passage is forty-two: against eight words, a
 * model that hears perfectly but writes "pass code" for "passcode" scores 75.
 */
export const LISTENING_SCRIPTS: ListeningScript[] = [
  {
    id: 'first-date',
    label: 'The first-date question',
    text: 'Bachelor number one, if we went on a date, where would you take me? '
      + 'And be honest, because I have heard every answer twice already. '
      + 'Bachelor number two, same question, but you only get seven words.',
  },
  {
    id: 'introductions',
    label: 'Contestant introductions',
    text: 'Contestants, please step forward. Tonight our host is looking for a model '
      + 'with speed, sense, and a graphics card that does not complain. '
      + 'Answer clearly, keep it short, and try not to hallucinate on live television.',
  },
  {
    id: 'table-number',
    label: 'The table number',
    text: 'Bachelor number three, your table number is eight two. Meet me at seven, '
      + 'wear something with good contrast, and bring an answer to this: '
      + 'what is the kindest thing a computer has ever done for you?',
  },
];

export const DEFAULT_LISTENING_SCRIPT_ID = LISTENING_SCRIPTS[0].id;

export function listeningScriptById(id?: string): ListeningScript {
  return LISTENING_SCRIPTS.find((s) => s.id === id) ?? LISTENING_SCRIPTS[0];
}

export type ListeningSource = 'sample' | 'record' | 'upload';

/**
 * The reference transcript for a run, or null when there is none.
 *
 * Null is not a failure — it means accuracy cannot be measured, and the caller
 * reports the transcript without a score rather than scoring it against a
 * guess.
 */
export function referenceFor(
  source: ListeningSource,
  options: { sampleReference: string; scriptId?: string; typedReference?: string },
): string | null {
  if (source === 'sample') return options.sampleReference;
  if (source === 'record') return listeningScriptById(options.scriptId).text;
  const typed = (options.typedReference ?? '').trim();
  return typed ? typed : null;
}

/** Whether a reference is long enough for word error rate to mean anything. */
export function isScriptLongEnough(text: string): boolean {
  return (text ?? '').trim().split(/\s+/).filter(Boolean).length >= MIN_SCRIPT_WORDS;
}
