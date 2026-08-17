/**
 * Scoring a generated image.
 *
 * Transcription was the first thing RigMatch measured that had a right answer:
 * play known speech, count the words that came back wrong. Image generation
 * has no such ground truth. There is no correct picture of "a red lighthouse
 * at sunset", so nothing here can be as solid as word error rate, and this
 * module should not pretend otherwise.
 *
 * What it does instead is refuse to ask the unanswerable question. Handing a
 * 4B vision model an image and asking it to rate the quality out of ten
 * produces a number that moves with the phrasing of the request rather than
 * with the picture. So the benchmark prompts are written as a list of
 * *checkable propositions* — a lighthouse is present, it is red, there are
 * exactly two birds — and the judge answers each one yes or no. That measures
 * prompt adherence, which is a real property of the image, and it is reported
 * under that name rather than as "quality".
 *
 * The rest of the score is not a proxy at all: whether an image appeared, how
 * long it took, and whether the run stayed inside VRAM. Those are the numbers
 * that actually answer RigMatch's question, which is whether this computer can
 * do this work — not whether the picture is beautiful.
 */

import { getAdvancedLabGrade } from './labScoring.ts';

export type Proposition = { id: string; question: string; expected: boolean };

export type ImagePrompt = {
  id: string;
  /** What the model is asked to draw. */
  prompt: string;
  /** Kept short and concrete; a long scene gives the judge too much to miss. */
  propositions: Proposition[];
};

/**
 * The benchmark prompts.
 *
 * Each proposition has to be answerable from the picture alone by a small
 * vision model. "Is the composition balanced?" is not; "Is there a lighthouse?"
 * is. A few propositions are deliberately expected to be false, so a judge that
 * simply answers yes to everything scores near chance rather than full marks.
 */
export const IMAGE_BENCHMARK_PROMPTS: ImagePrompt[] = [
  {
    id: 'lighthouse',
    prompt: 'A red lighthouse on a rocky cliff at sunset, two seagulls in the sky',
    propositions: [
      { id: 'lighthouse', question: 'Is there a lighthouse or tower in this image?', expected: true },
      { id: 'red', question: 'Is the lighthouse or tower mainly red?', expected: true },
      { id: 'cliff', question: 'Is there rock or a cliff in this image?', expected: true },
      { id: 'birds', question: 'Are there birds in the sky in this image?', expected: true },
      { id: 'indoors', question: 'Is this an indoor scene?', expected: false },
    ],
  },
  {
    id: 'kitchen',
    prompt: 'A yellow teapot on a wooden kitchen table next to three green apples',
    propositions: [
      { id: 'teapot', question: 'Is there a teapot in this image?', expected: true },
      { id: 'yellow', question: 'Is the teapot mainly yellow?', expected: true },
      { id: 'apples', question: 'Are there apples in this image?', expected: true },
      { id: 'green', question: 'Are the apples green?', expected: true },
      { id: 'people', question: 'Are there any people in this image?', expected: false },
    ],
  },
  {
    id: 'astronaut',
    prompt: 'An astronaut riding a horse across a desert, no buildings',
    propositions: [
      { id: 'astronaut', question: 'Is there an astronaut or person in a spacesuit in this image?', expected: true },
      { id: 'horse', question: 'Is there a horse in this image?', expected: true },
      { id: 'riding', question: 'Is the person sitting on the horse?', expected: true },
      { id: 'desert', question: 'Is the ground sandy or desert-like?', expected: true },
      { id: 'buildings', question: 'Are there buildings in this image?', expected: false },
    ],
  },
];

/** Asks for one word, which most vision models still wrap in a sentence. */
export function buildJudgePrompt(question: string): string {
  return `${question} Answer with only the word Yes or the word No.`;
}

/**
 * Read a yes/no out of whatever the judge actually wrote.
 *
 * Returns null when the answer cannot be read. That is deliberately distinct
 * from "no": a judge that cannot tell is not evidence the image is wrong, and
 * folding the two together would mark a model down for its judge's weakness.
 */
export function readJudgeVerdict(answer: string): boolean | null {
  const text = (answer ?? '').toLowerCase().trim();
  if (!text) return null;

  // "I can't tell" must not be read as the "can" inside it, so hedges are
  // checked before anything else.
  if (/\b(cannot|can't|can not|unable|unclear|not sure|hard to tell|difficult to)\b/.test(text)) {
    return null;
  }

  // A leading yes/no is the common case and the most reliable signal.
  const leading = text.match(/^[^a-z]*\b(yes|no)\b/);
  if (leading) return leading[1] === 'yes';

  // Otherwise look for a negation of existence — "there is no horse", "there
  // are no buildings" — before falling back to a bare yes/no anywhere.
  if (/\bthere (?:is|are) no\b|\bno .{0,20}\b(?:is|are) (?:present|visible)\b|\bdoes not (?:appear|contain|show)\b|\bis not\b/.test(text)) {
    return false;
  }
  const anywhere = text.match(/\b(yes|no)\b/);
  if (anywhere) return anywhere[1] === 'yes';

  return null;
}

/**
 * Share of propositions the judge confirmed, or null when it could not answer
 * enough of them to mean anything.
 *
 * A summariser picked on the wrong metric once produced a summary that lost a
 * fact, and the lesson generalises: a weak judge does not yield a low score,
 * it yields no score. Reporting 30/100 when the judge shrugged at four
 * questions out of five would be a fabricated measurement.
 */
export const MIN_ANSWERED_SHARE = 2 / 3;

export function scoreAdherence(
  propositions: Proposition[],
  verdicts: (boolean | null)[],
): { adherence: number | null; answered: number; correct: number } {
  const answered = verdicts.filter((v) => v !== null).length;
  const correct = propositions.reduce(
    (total, prop, i) => total + (verdicts[i] !== null && verdicts[i] === prop.expected ? 1 : 0),
    0,
  );

  if (!propositions.length || answered / propositions.length < MIN_ANSWERED_SHARE) {
    return { adherence: null, answered, correct };
  }
  return { adherence: correct / answered, answered, correct };
}

export type ImageRunFacts = {
  /** False when nothing came back, which caps the whole run at zero. */
  produced: boolean;
  elapsedMs: number;
  steps: number;
  /** True when ComfyUI had to spill out of VRAM, the clearest "too big" signal. */
  spilledVram?: boolean;
  adherence: number | null;
};

/**
 * Seconds per step that counts as comfortable on this machine.
 *
 * Speed is scored per step rather than per image so a 50-step run is not
 * punished against a 20-step one for doing more work. Half a second a step is
 * roughly a mid-range GPU on a 512px image; four seconds a step is the point
 * where a person stops waiting and goes to make tea.
 */
export const COMFORTABLE_SECONDS_PER_STEP = 0.5;
export const PAINFUL_SECONDS_PER_STEP = 4;

export function scoreSpeed(elapsedMs: number, steps: number): number {
  if (!steps || elapsedMs <= 0) return 0;
  const perStep = elapsedMs / 1000 / steps;
  if (perStep <= COMFORTABLE_SECONDS_PER_STEP) return 1;
  if (perStep >= PAINFUL_SECONDS_PER_STEP) return 0;
  return 1 - (perStep - COMFORTABLE_SECONDS_PER_STEP)
    / (PAINFUL_SECONDS_PER_STEP - COMFORTABLE_SECONDS_PER_STEP);
}

/**
 * Weights, and what happens when adherence is unavailable.
 *
 * When the judge could not answer, its share is not silently redistributed —
 * that would let a fast machine score 100 on an image nobody checked. The
 * run is scored out of the remaining weight and reported as unjudged, so the
 * number is visibly incomplete rather than quietly flattering.
 */
const WEIGHT_ADHERENCE = 0.5;
const WEIGHT_SPEED = 0.35;
const WEIGHT_FIT = 0.15;

export function scoreImageGeneration(facts: ImageRunFacts): {
  score: number;
  grade: string;
  judged: boolean;
  checks: { label: string; passed: boolean; detail: string }[];
} {
  const speed = scoreSpeed(facts.elapsedMs, facts.steps);
  const fit = facts.spilledVram ? 0 : 1;
  const judged = facts.adherence !== null;

  const perStep = facts.steps ? facts.elapsedMs / 1000 / facts.steps : 0;
  const checks = [
    {
      label: 'Image produced',
      passed: facts.produced,
      detail: facts.produced
        ? 'ComfyUI returned a decoded image.'
        : 'The graph ran but produced no image.',
    },
    {
      label: 'Prompt followed',
      passed: judged && (facts.adherence ?? 0) >= 0.8,
      detail: judged
        ? `The judge confirmed ${Math.round((facts.adherence ?? 0) * 100)}% of what the prompt asked for.`
        : 'The judge could not answer enough questions to score adherence, so this run is unjudged.',
    },
    {
      label: 'Usable speed',
      passed: speed >= 0.5,
      detail: `${perStep.toFixed(2)}s per step.`,
    },
    {
      label: 'Fits in VRAM',
      passed: !facts.spilledVram,
      detail: facts.spilledVram
        ? 'The run spilled out of VRAM into system memory, which is why it was slow.'
        : 'The run stayed inside VRAM.',
    },
  ];

  if (!facts.produced) {
    return { score: 0, grade: getAdvancedLabGrade(0), judged: false, checks };
  }

  const earned = (judged ? (facts.adherence ?? 0) * WEIGHT_ADHERENCE : 0)
    + speed * WEIGHT_SPEED
    + fit * WEIGHT_FIT;
  const score = Math.round(earned * 100);

  return { score, grade: getAdvancedLabGrade(score), judged, checks };
}
