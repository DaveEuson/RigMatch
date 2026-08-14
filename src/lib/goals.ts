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
  | 'talk' | 'write' | 'code' | 'use-tools'
  | 'transcribe-file' | 'transcribe-live'
  | 'describe-image'
  | 'make-images' | 'animate-image' | 'make-video' | 'make-audio'
  | 'ask-documents';

export type GoalGrading = 'questions' | 'lab' | 'none';

/**
 * Dave's five shelves for the goal picker: "Chat, work, image, audio, video".
 *
 * Chat and Work split on his own earlier distinction — a private companion
 * you feel safe talking to is not the same person as "help me write this
 * email", so talking lives under Chat while writing, coding, automations and
 * documents are Work. Media goals shelve by what they produce or consume.
 */
export const GOAL_CATEGORIES = [
  { id: 'chat', label: 'Chat' },
  { id: 'work', label: 'Work' },
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
] as const;

export type GoalCategoryId = (typeof GOAL_CATEGORIES)[number]['id'];

export type Goal = {
  id: GoalId;
  /** In the user's voice, completing "I would like to...". */
  desire: string;
  /** Plain label for filters and Matches: "Making video". */
  label: string;
  /** What a Match for this goal is called: "Best for coding". */
  matchLabel: string;
  /** Which shelf of the goal picker this sits on. */
  category: GoalCategoryId;
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
    category: 'chat',
    desire: 'Talk to a model and ask it questions',
    label: 'Everyday chat',
    matchLabel: 'Best for talking',
    runtime: 'ollama',
    grading: 'questions',
    questionTypes: ['assistant'],
  },
  {
    id: 'write',
    category: 'work',
    desire: 'Help me write emails, documents, and ideas',
    label: 'Writing',
    matchLabel: 'Best for writing',
    runtime: 'ollama',
    // Distinct from talk on Dave's read: many people want a private companion
    // they feel safe with, which is not the same person as "help me write
    // this email". The Writing preset's six writing questions were typed
    // 'assistant' and so counted as chat; typed honestly, they crown this.
    // Note the heuristic cannot mark prose — a writing crown needs the judge,
    // which isVerdictWorthy enforces rather than crowning on a length proxy.
    grading: 'questions',
    questionTypes: ['writing'],
  },
  {
    id: 'code',
    category: 'work',
    desire: 'Use a model to help me code',
    label: 'Coding',
    matchLabel: 'Best for coding',
    runtime: 'ollama',
    grading: 'questions',
    questionTypes: ['coding'],
  },
  {
    id: 'transcribe-file',
    category: 'audio',
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
    category: 'audio',
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
    category: 'image',
    desire: 'Look at a picture and describe what it sees',
    label: 'Reading images',
    matchLabel: 'Best for reading images',
    runtime: 'ollama',
    grading: 'lab',
    questionTypes: [],
  },
  {
    id: 'make-images',
    category: 'image',
    desire: 'Create an image from a prompt',
    label: 'Making images',
    matchLabel: 'Best for making images',
    runtime: 'comfyui',
    grading: 'lab',
    questionTypes: [],
  },
  {
    id: 'animate-image',
    category: 'video',
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
    category: 'video',
    desire: 'Create a video from a prompt',
    label: 'Making video',
    matchLabel: 'Best for making video',
    runtime: 'comfyui',
    grading: 'lab',
    questionTypes: [],
  },
  {
    id: 'use-tools',
    category: 'work',
    desire: 'Power my tools and automations',
    // The Home Assistant crowd's whole reason for local AI, and scoreable on
    // day one: the suite already asks JSON/tool-output questions.
    label: 'Tools & automations',
    matchLabel: 'Best for automations',
    runtime: 'ollama',
    grading: 'questions',
    questionTypes: ['json'],
  },
  {
    id: 'make-audio',
    category: 'audio',
    desire: 'Create speech or music from text',
    label: 'Making audio',
    matchLabel: 'Best for making audio',
    runtime: 'comfyui',
    // The nodes exist — ACE-Step and Stable Audio were verified present in
    // ComfyUI 0.32 — but no audio lab exists to grade the output yet.
    grading: 'none',
    unsupportedReason:
      'ComfyUI can run audio models, but RigMatch has no listening-back test '
      + 'to grade them with yet.',
    questionTypes: [],
  },
  {
    id: 'ask-documents',
    category: 'work',
    desire: 'Ask questions about my documents',
    label: 'Your documents',
    matchLabel: 'Best for your documents',
    runtime: 'none',
    // Not a backend gap so much as an app gap: chatting over documents needs
    // indexing RigMatch does not have. Honest future rather than hidden.
    unsupportedReason:
      'RigMatch cannot feed your documents to a model yet — that needs '
      + 'document indexing planned for a future release.',
    grading: 'none',
    questionTypes: [],
  },
];

export function goalById(id: string | undefined): Goal | undefined {
  return GOALS.find((goal) => goal.id === id);
}

/** The goal list arranged on its five shelves, in Dave's stated order. */
export function goalsByCategory(): Array<{
  category: (typeof GOAL_CATEGORIES)[number];
  goals: Goal[];
}> {
  return GOAL_CATEGORIES
    .map((category) => ({ category, goals: GOALS.filter((goal) => goal.category === category.id) }))
    .filter((group) => group.goals.length > 0);
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
  // json moved to the use-tools goal, which is what those questions actually
  // measure ("Return only valid JSON for this local assistant request...").
  { id: 'instructions', label: 'Following instructions', questionTypes: ['format'] },
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

/**
 * The expectation, in the show's voice.
 *
 * "Out of your league" was already this codebase's internal tone name for a
 * model too big for the card (getHardwareFit); it just never reached the
 * screen. Efficiency before theme: the themed label headlines, and the plain
 * note underneath carries the facts and the "the test decides" promise.
 */
export function leagueLabel(tone: GoalExpectation['tone']): string {
  if (tone === 'ready') return 'A good match for your rig';
  if (tone === 'tight') return 'Punching above its weight';
  return 'Might be out of your league';
}

export function goalHardwareExpectation(goal: Goal, vramGb: number): GoalExpectation {
  // Only a missing BACKEND is a hard stop. A goal that runs but cannot be
  // graded yet (writing, animating an image) must not read as "out of your
  // league" — that blames the hardware for RigMatch's own gap, and the
  // splash showed exactly that mislabel the first time it rendered.
  if (goal.runtime === 'none') {
    return {
      tone: 'unlikely',
      note: goal.unsupportedReason ?? 'Not supported locally yet.',
      source: 'measured',
    };
  }

  switch (goal.id) {
    case 'animate-image':
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
