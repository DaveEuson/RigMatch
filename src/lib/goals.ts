/**
 * What someone wants the AI to DO — the one taxonomy the whole app organizes by.
 *
 * Three vocabularies had grown for this single idea. The Simple Mode wizard
 * asked about "dreams" (talk, write, code, image, video), the Models screen
 * filtered by "tasks" (coding, assistant, imagegen, videogen, vision,
 * hears...), and scoring grouped questions into yet another set (coding, chat,
 * facts, instructions). "Talk", "assistant" and "chat" were the same goal
 * wearing three names, so a filter, a wizard chip and a scorecard could not
 * refer to each other even when they meant exactly the same thing.
 *
 * The list itself is Dave's, phrased the way a person would say it ("I would
 * like to..."). A goal is what the user is trying to produce — deliberately
 * narrower than the old chip row, which mixed goals with attributes ("Tiny",
 * "Uncensored" describe a model, not an ambition) and with scored qualities
 * ("sticking to facts" is how well a model chats, not why you opened the app).
 *
 * Every goal also says how it is GRADED, because that differs and pretending
 * otherwise produced fabricated numbers before:
 *   'questions' — ranked by benchmark questions of the listed types.
 *   'lab'       — graded by a Lab test with a real artifact (a transcript
 *                 scored by word error rate, a frame checked by a judge).
 *   'none'      — nothing local can grade it yet, and the UI must say so
 *                 rather than showing a score-shaped blank.
 */

import type { BenchmarkQuestionType } from '../benchmarkSuite.ts';

export type GoalId =
  | 'talk' | 'code'
  | 'transcribe-file' | 'transcribe-live'
  | 'describe-image'
  | 'make-images' | 'animate-image' | 'make-video';

export type GoalGrading = 'questions' | 'lab' | 'none';

export type Goal = {
  id: GoalId;
  /** In the user's voice, completing "I would like to...". */
  desire: string;
  /** Plain label for filters and Matches: "Making video". */
  label: string;
  /** What a Match for this goal is called: "Best for coding". */
  matchLabel: string;
  /**
   * Which runtime does the work. 'none' means no local backend RigMatch
   * supports can do this yet — the goal is shown honestly as future, never
   * silently hidden and never offered with a Run button that must fail.
   */
  runtime: 'ollama' | 'comfyui' | 'none';
  /** Why this cannot run or cannot be graded yet, in words a user can trust. */
  unsupportedReason?: string;
  grading: GoalGrading;
  /** Question types that measure this goal, when grading is 'questions'. */
  questionTypes: readonly BenchmarkQuestionType[];
};

export const GOALS: Goal[] = [
  {
    id: 'talk',
    desire: 'Talk to a model and ask it questions',
    label: 'Everyday chat',
    matchLabel: 'Best for talking',
    runtime: 'ollama',
    grading: 'questions',
    questionTypes: ['assistant'],
  },
  {
    id: 'code',
    desire: 'Use a model to help me code',
    label: 'Coding',
    matchLabel: 'Best for coding',
    runtime: 'ollama',
    grading: 'questions',
    questionTypes: ['coding'],
  },
  {
    id: 'transcribe-file',
    desire: 'Listen to an audio file and transcribe what it says',
    label: 'Transcribing recordings',
    matchLabel: 'Best for transcription',
    runtime: 'ollama',
    // The Listening lab plays known speech and counts word errors — the one
    // grade in RigMatch with an actual right answer.
    grading: 'lab',
    questionTypes: [],
  },
  {
    id: 'transcribe-live',
    desire: 'Listen to audio in real time and transcribe as it happens',
    label: 'Live transcription',
    matchLabel: 'Best for live transcription',
    runtime: 'none',
    unsupportedReason:
      'No local backend RigMatch supports can stream audio yet — Ollama takes '
      + 'whole files per request. The moment one can, this unlocks.',
    grading: 'none',
    questionTypes: [],
  },
  {
    id: 'describe-image',
    desire: 'Look at a picture and describe what it sees',
    label: 'Reading images',
    matchLabel: 'Best for reading images',
    runtime: 'ollama',
    grading: 'lab',
    questionTypes: [],
  },
  {
    id: 'make-images',
    desire: 'Create an image from a prompt',
    label: 'Making images',
    matchLabel: 'Best for making images',
    runtime: 'comfyui',
    grading: 'lab',
    questionTypes: [],
  },
  {
    id: 'animate-image',
    desire: 'Create a video from an image',
    label: 'Animating images',
    matchLabel: 'Best for animating images',
    runtime: 'comfyui',
    // Supportable today — the LTX family has a local image-to-video template
    // and the checkpoint already in the catalogue can drive it — but the
    // Video Lab only tests text-to-video so far. Until an i2v lab exists this
    // goal browses and downloads but does not grade, and it says so instead
    // of borrowing the text-to-video grade.
    grading: 'none',
    unsupportedReason:
      'The models can do this, but RigMatch cannot grade it yet — the Video '
      + 'Lab tests text-to-video only so far.',
    questionTypes: [],
  },
  {
    id: 'make-video',
    desire: 'Create a video from a prompt',
    label: 'Making video',
    matchLabel: 'Best for making video',
    runtime: 'comfyui',
    grading: 'lab',
    questionTypes: [],
  },
];

export function goalById(id: string | undefined): Goal | undefined {
  return GOALS.find((goal) => goal.id === id);
}

/** Goals ranked by benchmark questions — what question-based Matches can cover. */
export function questionScoredGoals(): Goal[] {
  return GOALS.filter((goal) => goal.grading === 'questions');
}

/**
 * Qualities the benchmark measures that are not goals in themselves.
 *
 * Nobody sits down meaning to "do a sticking-to-facts". These describe how
 * well a model holds up while pursuing a goal, and they stay as scored
 * dimensions rather than becoming things the goal picker offers. Listed here
 * so the question types they own are not mistaken for unclaimed.
 */
export const SCORED_QUALITIES = [
  { id: 'facts', label: 'Sticking to facts', questionTypes: ['truth'] },
  { id: 'instructions', label: 'Following instructions', questionTypes: ['json', 'format'] },
] as const;

/**
 * Attributes are not goals.
 *
 * These stay as filters because they describe a model rather than an ambition:
 * nobody sets out to "do a tiny". Keeping them out of the goal list is what
 * stops the goal picker offering "Tiny" as a desire.
 */
export const MODEL_ATTRIBUTES = [
  { id: 'tiny', label: 'Tiny' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'search', label: 'Search' },
  { id: 'uncensored', label: 'Uncensored' },
] as const;

export type ModelAttributeId = (typeof MODEL_ATTRIBUTES)[number]['id'];

/**
 * How much of a goal a benchmark actually measured.
 *
 * Questions split across every scored bucket — the question-graded goals plus
 * the qualities — and findTaskWinners refuses to name a winner on fewer than
 * three answers. So a short run's honest report is "not enough questions to
 * say", not a ranking built on one answer.
 */
export const MIN_QUESTIONS_PER_GOAL = 3;

export function goalCoverage(questionCount: number): {
  perGoal: number;
  enough: boolean;
  suggestion: number;
} {
  const buckets = questionScoredGoals().length + SCORED_QUALITIES.length;
  const perGoal = Math.floor(questionCount / Math.max(1, buckets));
  return {
    perGoal,
    enough: perGoal >= MIN_QUESTIONS_PER_GOAL,
    suggestion: buckets * MIN_QUESTIONS_PER_GOAL <= 20 ? 20 : 50,
  };
}

/**
 * What this hardware should expect from a goal, before any test runs.
 *
 * Dave's rule: suggest from hardware, warn when the card is likely to
 * struggle, and say plainly that the test is the real determination. Every
 * entry declares its source — 'measured' notes come from actual runs this
 * project recorded on a 12 GB RTX 4070; 'heuristic' notes are rules of thumb
 * and must be presented as such, never as findings.
 */
export type GoalExpectation = {
  tone: 'ready' | 'tight' | 'unlikely';
  note: string;
  source: 'measured' | 'heuristic';
};

export function goalHardwareExpectation(goal: Goal, vramGb: number): GoalExpectation {
  if (goal.runtime === 'none' || goal.grading === 'none') {
    return {
      tone: 'unlikely',
      note: goal.unsupportedReason ?? 'Not supported locally yet.',
      source: 'measured',
    };
  }

  switch (goal.id) {
    case 'make-video':
      // Measured: 4s of 768x512 in 12.1s with the card at ~12.4 GB of 12.9 —
      // the video models alone are ~11.2 GB before a frame is sampled.
      if (vramGb >= 12) {
        return { tone: 'ready', note: 'Measured on a 12 GB card: about 12 seconds of work for 4 seconds of 768p video.', source: 'measured' };
      }
      if (vramGb >= 8) {
        return { tone: 'tight', note: 'The video models alone want about 11 GB. On this card they will spill into system memory and slow down — the test will show how much.', source: 'measured' };
      }
      return { tone: 'unlikely', note: 'Video models want about 11 GB of VRAM. Expect minutes rather than seconds here — the test will give the real number.', source: 'measured' };
    case 'make-images':
      // Measured: SD 1.5 rendered 512px in ~4s on 12 GB, and it is famously
      // light; the floor below is a rule of thumb.
      if (vramGb >= 6) {
        return { tone: 'ready', note: 'Stable Diffusion 1.5 renders in seconds on this class of card.', source: 'measured' };
      }
      return { tone: 'tight', note: 'Small image models should run; larger ones will be slow. The test shows the real speed.', source: 'heuristic' };
    case 'code':
      // Rule of thumb, and labelled as one: small models write plausible-
      // looking code that often does not run. VRAM decides which sizes fit.
      if (vramGb >= 12) {
        return { tone: 'ready', note: 'Fits 7B–14B coding models, which is where genuinely useful code starts. Rule of thumb — the test decides.', source: 'heuristic' };
      }
      if (vramGb >= 6) {
        return { tone: 'tight', note: 'Fits models up to about 7B. Smaller coding models write plausible-looking code that often does not run — the test decides.', source: 'heuristic' };
      }
      return { tone: 'unlikely', note: 'Only tiny models fit here, and tiny models write weak code. Rule of thumb — run the test if curious.', source: 'heuristic' };
    default:
      if (vramGb >= 6) {
        return { tone: 'ready', note: 'This computer should handle it comfortably. The test makes it certain.', source: 'heuristic' };
      }
      return { tone: 'tight', note: 'Smaller models only on this card. The test will show what that costs.', source: 'heuristic' };
  }
}
